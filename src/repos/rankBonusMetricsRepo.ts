import type { DbConn } from "../db/pool.js";

function buildInClause(ids: string[]): { placeholders: string; params: string[] } {
  return {
    placeholders: ids.map(() => "?").join(", "),
    params: ids
  };
}

export async function getBatchRankBonusBaseDailyRewardAmounts(
  conn: DbConn,
  input: {
    policy_version_id: string;
    calculation_date: string;
    account_ids: string[];
  }
): Promise<Map<string, string>> {
  const amounts = new Map<string, string>();
  for (const account_id of input.account_ids) {
    amounts.set(account_id, "0");
  }

  if (!input.account_ids.length) {
    return amounts;
  }

  const { placeholders, params } = buildInClause(input.account_ids);
  const [rows] = await conn.query(
    `select
        e.ancestor_account_id as account_id,
        coalesce(sum(r.amount_base), 0) as base_daily_reward_amount_base
       from binary_edges e
       join accounts a
         on a.id = e.descendant_account_id
       join account_rewards r
         on r.account_id = e.descendant_account_id
       left join account_rewards original
         on original.id = r.reversal_reward_id
      where e.ancestor_account_id in (${placeholders})
        and e.depth >= 1
        and a.role = 'USER'
        and r.policy_version_id = ?
        and (
          (
            r.reward_type = 'DAILY_REWARD'
            and r.status = 'CONFIRMED'
            and r.reward_date = ?
          )
          or (
            r.reward_type = 'REVERSAL'
            and r.status = 'CONFIRMED'
            and r.reward_date = ?
            and original.reward_type = 'DAILY_REWARD'
            and original.reward_date = ?
          )
        )
      group by e.ancestor_account_id`,
    [...params, input.policy_version_id, input.calculation_date, input.calculation_date, input.calculation_date]
  );

  for (const row of rows as Array<Record<string, unknown>>) {
    amounts.set(String(row.account_id), String(row.base_daily_reward_amount_base ?? "0"));
  }

  return amounts;
}
