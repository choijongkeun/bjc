import type { DbConn } from "../db/pool.js";

export type AccountRankQualificationResultRow = {
  id: string;
  calc_run_id: string;
  account_id: string;
  policy_version_id: string;
  calculation_date: string;
  period_from: string;
  period_to: string;
  previous_rank_level: number | null;
  qualified_rank_level: number | null;
  applied_rank_level: number | null;
  result_status: "QUALIFIED" | "UNQUALIFIED" | "DEMOTION_CANDIDATE" | "NO_CHANGE";
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

export async function insertAccountRankQualificationResult(
  conn: DbConn,
  input: {
    id: string;
    calc_run_id: string;
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
    period_from: string;
    period_to: string;
    previous_rank_level: number | null;
    qualified_rank_level: number | null;
    applied_rank_level: number | null;
    result_status: "QUALIFIED" | "UNQUALIFIED" | "DEMOTION_CANDIDATE" | "NO_CHANGE";
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
    `insert into account_rank_qualification_results (
        id,
        calc_run_id,
        account_id,
        policy_version_id,
        calculation_date,
        period_from,
        period_to,
        previous_rank_level,
        qualified_rank_level,
        applied_rank_level,
        result_status,
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
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json))`,
    [
      input.id,
      input.calc_run_id,
      input.account_id,
      input.policy_version_id,
      input.calculation_date,
      input.period_from,
      input.period_to,
      input.previous_rank_level,
      input.qualified_rank_level,
      input.applied_rank_level,
      input.result_status,
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

function qualificationResultSelectSql() {
  return `select
      r.id,
      r.calc_run_id,
      r.account_id,
      r.policy_version_id,
      r.calculation_date,
      r.period_from,
      r.period_to,
      r.previous_rank_level,
      r.qualified_rank_level,
      r.applied_rank_level,
      r.result_status,
      r.personal_active_stake_amount_base,
      r.personal_cumulative_stake_amount_base,
      r.direct_referral_count,
      r.direct_active_referral_count,
      r.left_leg_volume_base,
      r.right_leg_volume_base,
      r.weak_leg_volume_base,
      r.strong_leg_volume_base,
      r.downline_daily_reward_amount_base,
      r.qualification_snapshot_json,
      r.created_at`;
}

export async function getAccountRankQualificationResultByRunAccount(
  conn: DbConn,
  input: { calc_run_id: string; account_id: string }
): Promise<AccountRankQualificationResultRow | null> {
  const [rows] = await conn.query(
    `${qualificationResultSelectSql()}
       from account_rank_qualification_results r
      where r.calc_run_id = ?
        and r.account_id = ?
      limit 1`,
    [input.calc_run_id, input.account_id]
  );
  const arr = rows as AccountRankQualificationResultRow[];
  return arr[0] ?? null;
}

export async function getLatestAccountRankQualificationResult(
  conn: DbConn,
  accountId: string
): Promise<AccountRankQualificationResultRow | null> {
  const [rows] = await conn.query(
    `${qualificationResultSelectSql()}
       from account_rank_qualification_results r
      where r.account_id = ?
      order by r.calculation_date desc, r.created_at desc, r.id desc
      limit 1`,
    [accountId]
  );
  const arr = rows as AccountRankQualificationResultRow[];
  return arr[0] ?? null;
}

export async function getAccountRankQualificationResultByDate(
  conn: DbConn,
  input: {
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }
): Promise<AccountRankQualificationResultRow | null> {
  const [rows] = await conn.query(
    `${qualificationResultSelectSql()}
       from account_rank_qualification_results r
       inner join calc_runs cr
         on cr.id = r.calc_run_id
      where r.account_id = ?
        and r.policy_version_id = ?
        and r.calculation_date = ?
        and cr.run_type = 'RANK_QUALIFICATION'
        and cr.status in ('SUCCEEDED', 'FINALIZED')
      order by r.created_at desc, r.id desc
      limit 1`,
    [input.account_id, input.policy_version_id, input.calculation_date]
  );
  const arr = rows as AccountRankQualificationResultRow[];
  return arr[0] ?? null;
}

export async function listRankQualificationResultsByDate(
  conn: DbConn,
  input: {
    policy_version_id: string;
    calculation_date: string;
  }
): Promise<AccountRankQualificationResultRow[]> {
  const [rows] = await conn.query(
    `${qualificationResultSelectSql()}
       from account_rank_qualification_results r
       inner join calc_runs cr
         on cr.id = r.calc_run_id
      where r.policy_version_id = ?
        and r.calculation_date = ?
        and cr.run_type = 'RANK_QUALIFICATION'
        and cr.status in ('SUCCEEDED', 'FINALIZED')
      order by r.created_at asc, r.id asc`,
    [input.policy_version_id, input.calculation_date]
  );
  return rows as AccountRankQualificationResultRow[];
}

export async function listRankQualificationResultsByCalcRun(
  conn: DbConn,
  input: {
    calc_run_id: string;
    page: number;
    limit: number;
  }
): Promise<{ items: AccountRankQualificationResultRow[]; total: number }> {
  const offset = (input.page - 1) * input.limit;
  const [countRows] = await conn.query(
    `select count(*) as total
       from account_rank_qualification_results
      where calc_run_id = ?`,
    [input.calc_run_id]
  );
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `${qualificationResultSelectSql()}
       from account_rank_qualification_results r
      where r.calc_run_id = ?
      order by r.created_at asc, r.id asc
      limit ? offset ?`,
    [input.calc_run_id, input.limit, offset]
  );

  return {
    items: rows as AccountRankQualificationResultRow[],
    total
  };
}

export async function summarizeRankQualificationResults(
  conn: DbConn,
  calc_run_id: string
): Promise<{
  target_count: number;
  demotion_deferred_count: number;
  unqualified_count: number;
}> {
  const [rows] = await conn.query(
    `select
        count(*) as target_count,
        cast(sum(case when result_status = 'DEMOTION_CANDIDATE' then 1 else 0 end) as unsigned) as demotion_deferred_count,
        cast(sum(case when result_status = 'UNQUALIFIED' then 1 else 0 end) as unsigned) as unqualified_count
       from account_rank_qualification_results
      where calc_run_id = ?`,
    [calc_run_id]
  );
  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    target_count: Number(row.target_count ?? 0),
    demotion_deferred_count: Number(row.demotion_deferred_count ?? 0),
    unqualified_count: Number(row.unqualified_count ?? 0)
  };
}
