import type { DbConn } from "../db/pool.js";

export type AccountRankHistoryRow = {
  id: string;
  account_id: string;
  policy_version_id: string;
  calc_run_id: string;
  qualification_result_id: string | null;
  effective_date: string;
  previous_rank_level: number | null;
  calculated_rank_level: number | null;
  final_rank_level: number | null;
  change_type: "INITIAL" | "PROMOTED" | "MAINTAINED" | "DEMOTED";
  personal_active_stake_amount_base: string;
  personal_cumulative_stake_amount_base: string;
  direct_referral_count: number;
  direct_active_referral_count: number;
  left_leg_volume_base: string;
  right_leg_volume_base: string;
  weak_leg_volume_base: string;
  strong_leg_volume_base: string;
  downline_daily_reward_amount_base: string;
  qualification_snapshot_json: unknown;
  created_at: string;
};

function rankHistorySelectSql() {
  return `select
      h.id,
      h.account_id,
      h.policy_version_id,
      h.calc_run_id,
      h.qualification_result_id,
      h.effective_date,
      h.previous_rank_level,
      h.calculated_rank_level,
      h.final_rank_level,
      h.change_type,
      h.personal_active_stake_amount_base,
      h.personal_cumulative_stake_amount_base,
      h.direct_referral_count,
      h.direct_active_referral_count,
      h.left_leg_volume_base,
      h.right_leg_volume_base,
      h.weak_leg_volume_base,
      h.strong_leg_volume_base,
      h.downline_daily_reward_amount_base,
      h.qualification_snapshot_json,
      h.created_at`;
}

export async function insertAccountRankHistory(
  conn: DbConn,
  input: {
    id: string;
    account_id: string;
    policy_version_id: string;
    calc_run_id: string;
    qualification_result_id: string | null;
    effective_date: string;
    previous_rank_level: number | null;
    calculated_rank_level: number | null;
    final_rank_level: number | null;
    change_type: "INITIAL" | "PROMOTED" | "MAINTAINED";
    personal_active_stake_amount_base: string;
    personal_cumulative_stake_amount_base: string;
    direct_referral_count: number;
    direct_active_referral_count: number;
    left_leg_volume_base: string;
    right_leg_volume_base: string;
    weak_leg_volume_base: string;
    strong_leg_volume_base: string;
    downline_daily_reward_amount_base: string;
    qualification_snapshot_json: Record<string, unknown>;
  }
): Promise<void> {
  await conn.query(
    `insert into account_rank_history (
        id,
        account_id,
        policy_version_id,
        calc_run_id,
        qualification_result_id,
        effective_date,
        previous_rank_level,
        calculated_rank_level,
        final_rank_level,
        change_type,
        personal_active_stake_amount_base,
        personal_cumulative_stake_amount_base,
        direct_referral_count,
        direct_active_referral_count,
        left_leg_volume_base,
        right_leg_volume_base,
        weak_leg_volume_base,
        strong_leg_volume_base,
        downline_daily_reward_amount_base,
        qualification_snapshot_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json))`,
    [
      input.id,
      input.account_id,
      input.policy_version_id,
      input.calc_run_id,
      input.qualification_result_id,
      input.effective_date,
      input.previous_rank_level,
      input.calculated_rank_level,
      input.final_rank_level,
      input.change_type,
      input.personal_active_stake_amount_base,
      input.personal_cumulative_stake_amount_base,
      input.direct_referral_count,
      input.direct_active_referral_count,
      input.left_leg_volume_base,
      input.right_leg_volume_base,
      input.weak_leg_volume_base,
      input.strong_leg_volume_base,
      input.downline_daily_reward_amount_base,
      JSON.stringify(input.qualification_snapshot_json ?? {})
    ]
  );
}

export async function listAccountRankHistory(
  conn: DbConn,
  input: { account_id: string; page: number; limit: number }
): Promise<{ items: AccountRankHistoryRow[]; total: number }> {
  const offset = (input.page - 1) * input.limit;
  const [countRows] = await conn.query(
    `select count(*) as total
       from account_rank_history
      where account_id = ?`,
    [input.account_id]
  );
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);
  const [rows] = await conn.query(
    `${rankHistorySelectSql()}
       from account_rank_history h
      where h.account_id = ?
      order by h.effective_date desc, h.created_at desc, h.id desc
      limit ? offset ?`,
    [input.account_id, input.limit, offset]
  );
  return {
    items: rows as AccountRankHistoryRow[],
    total
  };
}

export async function summarizeRankHistoryByCalcRun(
  conn: DbConn,
  calc_run_id: string
): Promise<{
  initial_count: number;
  promoted_count: number;
  maintained_count: number;
}> {
  const [rows] = await conn.query(
    `select
        cast(sum(case when change_type = 'INITIAL' then 1 else 0 end) as unsigned) as initial_count,
        cast(sum(case when change_type = 'PROMOTED' then 1 else 0 end) as unsigned) as promoted_count,
        cast(sum(case when change_type = 'MAINTAINED' then 1 else 0 end) as unsigned) as maintained_count
       from account_rank_history
      where calc_run_id = ?`,
    [calc_run_id]
  );
  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    initial_count: Number(row.initial_count ?? 0),
    promoted_count: Number(row.promoted_count ?? 0),
    maintained_count: Number(row.maintained_count ?? 0)
  };
}

export async function getAccountRankHistory(
  conn: DbConn,
  calc_run_id: string
): Promise<{
  initial_count: number;
  promoted_count: number;
  maintained_count: number;
}> {
  return summarizeRankHistoryByCalcRun(conn, calc_run_id);
}
