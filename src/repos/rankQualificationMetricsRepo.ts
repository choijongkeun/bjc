import type { DbConn } from "../db/pool.js";

export type RankQualificationAccountRow = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: "USER" | "READER" | "ADMIN";
  status: "ACTIVE" | "BLOCKED" | "WITHDRAWN";
};

export type RankQualificationMetricsRow = {
  account_id: string;
  personal_active_stake_amount_base: string;
  personal_cumulative_stake_amount_base: string;
  direct_referral_count: number;
  direct_active_referral_count: number;
  left_leg_volume_base: string;
  right_leg_volume_base: string;
  weak_leg_volume_base: string;
  strong_leg_volume_base: string;
  downline_daily_reward_amount_base: string;
};

function buildInClause(ids: string[]): { placeholders: string; params: string[] } {
  return {
    placeholders: ids.map(() => "?").join(", "),
    params: ids
  };
}

export async function listRankQualificationTargetAccounts(
  conn: DbConn,
  input: { policy_version_id: string; account_id?: string }
): Promise<RankQualificationAccountRow[]> {
  const where = ["role = 'USER'", "status = 'ACTIVE'"];
  const params: unknown[] = [];
  if (input.account_id) {
    where.push("id = ?");
    params.push(input.account_id);
  } else {
    where.push(
      `(
        exists (
          select 1
            from account_stakings s
           where s.account_id = accounts.id
             and s.policy_version_id = ?
        )
        or exists (
          select 1
            from account_rank_status rs
           where rs.account_id = accounts.id
             and rs.policy_version_id = ?
        )
      )`
    );
    params.push(input.policy_version_id, input.policy_version_id);
  }

  const [rows] = await conn.query(
    `select id, login_id, display_name, role, status
       from accounts
      where ${where.join(" and ")}
      order by created_at asc, id asc`,
    params
  );
  return rows as RankQualificationAccountRow[];
}

export async function getBatchRankQualificationMetrics(
  conn: DbConn,
  input: {
    policy_version_id: string;
    calculation_date: string;
    account_ids: string[];
  }
): Promise<Map<string, RankQualificationMetricsRow>> {
  const metrics = new Map<string, RankQualificationMetricsRow>();
  for (const account_id of input.account_ids) {
    metrics.set(account_id, {
      account_id,
      personal_active_stake_amount_base: "0",
      personal_cumulative_stake_amount_base: "0",
      direct_referral_count: 0,
      direct_active_referral_count: 0,
      left_leg_volume_base: "0",
      right_leg_volume_base: "0",
      weak_leg_volume_base: "0",
      strong_leg_volume_base: "0",
      downline_daily_reward_amount_base: "0"
    });
  }

  if (!input.account_ids.length) {
    return metrics;
  }

  const { placeholders, params } = buildInClause(input.account_ids);

  const [personalStakeRows] = await conn.query(
    `select
        s.account_id,
        coalesce(sum(case when s.status = 'ACTIVE' and s.cancel_requested_at is null then s.principal_amount_base else 0 end), 0) as personal_active_stake_amount_base,
        coalesce(sum(case when s.activated_at is not null and s.status in ('ACTIVE', 'CANCEL_REQUESTED', 'MATURED', 'CLOSED') then s.principal_amount_base else 0 end), 0) as personal_cumulative_stake_amount_base
       from account_stakings s
      where s.policy_version_id = ?
        and s.account_id in (${placeholders})
      group by s.account_id`,
    [input.policy_version_id, ...params]
  );

  for (const row of personalStakeRows as Array<Record<string, unknown>>) {
    const account_id = String(row.account_id);
    const current = metrics.get(account_id);
    if (!current) continue;
    current.personal_active_stake_amount_base = String(row.personal_active_stake_amount_base ?? "0");
    current.personal_cumulative_stake_amount_base = String(row.personal_cumulative_stake_amount_base ?? "0");
  }

  const [referralRows] = await conn.query(
    `select
        sponsor_account_id as account_id,
        cast(sum(case when role = 'USER' then 1 else 0 end) as unsigned) as direct_referral_count,
        cast(sum(case when role = 'USER' and status = 'ACTIVE' then 1 else 0 end) as unsigned) as direct_active_referral_count
       from accounts
      where sponsor_account_id in (${placeholders})
      group by sponsor_account_id`,
    params
  );

  for (const row of referralRows as Array<Record<string, unknown>>) {
    const account_id = String(row.account_id);
    const current = metrics.get(account_id);
    if (!current) continue;
    current.direct_referral_count = Number(row.direct_referral_count ?? 0);
    current.direct_active_referral_count = Number(row.direct_active_referral_count ?? 0);
  }

  const [legRows] = await conn.query(
    `select
        e.ancestor_account_id as account_id,
        coalesce(sum(case when e.root_leg = 'LEFT' then s.principal_amount_base else 0 end), 0) as left_leg_volume_base,
        coalesce(sum(case when e.root_leg = 'RIGHT' then s.principal_amount_base else 0 end), 0) as right_leg_volume_base
       from binary_edges e
       join accounts a
         on a.id = e.descendant_account_id
       join account_stakings s
         on s.account_id = e.descendant_account_id
      where e.ancestor_account_id in (${placeholders})
        and e.depth >= 1
        and a.role = 'USER'
        and s.policy_version_id = ?
        and s.status = 'ACTIVE'
        and s.cancel_requested_at is null
      group by e.ancestor_account_id`,
    [...params, input.policy_version_id]
  );

  for (const row of legRows as Array<Record<string, unknown>>) {
    const account_id = String(row.account_id);
    const current = metrics.get(account_id);
    if (!current) continue;
    current.left_leg_volume_base = String(row.left_leg_volume_base ?? "0");
    current.right_leg_volume_base = String(row.right_leg_volume_base ?? "0");
    const left = BigInt(current.left_leg_volume_base);
    const right = BigInt(current.right_leg_volume_base);
    current.weak_leg_volume_base = (left <= right ? left : right).toString();
    current.strong_leg_volume_base = (left >= right ? left : right).toString();
  }

  const [dailyRewardRows] = await conn.query(
    `select
        e.ancestor_account_id as account_id,
        coalesce(sum(r.amount_base), 0) as downline_daily_reward_amount_base
       from binary_edges e
       join account_rewards r
         on r.account_id = e.descendant_account_id
      where e.ancestor_account_id in (${placeholders})
        and e.depth >= 1
        and r.policy_version_id = ?
        and r.reward_type = 'DAILY_REWARD'
        and r.status = 'CONFIRMED'
        and r.reward_date = ?
      group by e.ancestor_account_id`,
    [...params, input.policy_version_id, input.calculation_date]
  );

  for (const row of dailyRewardRows as Array<Record<string, unknown>>) {
    const account_id = String(row.account_id);
    const current = metrics.get(account_id);
    if (!current) continue;
    current.downline_daily_reward_amount_base = String(row.downline_daily_reward_amount_base ?? "0");
  }

  return metrics;
}
