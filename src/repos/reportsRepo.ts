import type { DbConn } from "../db/pool.js";

export type ReportSummaryRow = {
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  total_fee_amount_base: string;
  total_accounts: string;
  total_ledger_events: string;
  total_calc_runs: string;
  finalized_calc_runs: string;
};

export async function getReportSummary(
  conn: DbConn,
  input: {
    from?: string;
    to?: string;
    policy_version_id?: string;
  }
): Promise<ReportSummaryRow> {
  const ledgerWhere: string[] = [];
  const ledgerParams: unknown[] = [];
  const calcWhere: string[] = [];
  const calcParams: unknown[] = [];

  if (input.policy_version_id) {
    ledgerWhere.push("policy_version_id = ?");
    ledgerParams.push(input.policy_version_id);
    calcWhere.push("policy_version_id = ?");
    calcParams.push(input.policy_version_id);
  }
  if (input.from) {
    ledgerWhere.push("event_time >= ?");
    ledgerParams.push(input.from);
    calcWhere.push("run_date >= date(?)");
    calcParams.push(input.from);
  }
  if (input.to) {
    ledgerWhere.push("event_time <= ?");
    ledgerParams.push(input.to);
    calcWhere.push("run_date <= date(?)");
    calcParams.push(input.to);
  }

  const ledgerWhereSql = ledgerWhere.length ? `where ${ledgerWhere.join(" and ")}` : "";
  const calcWhereSql = calcWhere.length ? `where ${calcWhere.join(" and ")}` : "";

  const [ledgerRows] = await conn.query(
    `select
        cast(coalesce(sum(case when event_type = 'STAKE' then amount_base else 0 end), 0) as char) as total_stake_amount_base,
        cast(coalesce(sum(case when event_type in ('DAILY_REWARD_ACCRUAL', 'DAILY_REWARD_PAYOUT', 'DIRECT_REFERRAL_BONUS', 'RANK_BONUS', 'CONTRIBUTION_BONUS') then amount_base else 0 end), 0) as char) as total_reward_amount_base,
        cast(coalesce(sum(case when event_type = 'WITHDRAWAL_FEE' then amount_base else 0 end), 0) as char) as total_fee_amount_base,
        cast(count(*) as char) as total_ledger_events,
        cast(count(distinct account_id) as char) as total_accounts
       from ledger_events
       ${ledgerWhereSql}`,
    ledgerParams
  );

  const [calcRows] = await conn.query(
    `select
        cast(count(*) as char) as total_calc_runs,
        cast(coalesce(sum(case when status = 'FINALIZED' then 1 else 0 end), 0) as char) as finalized_calc_runs
       from calc_runs
       ${calcWhereSql}`,
    calcParams
  );

  const ledger = (ledgerRows as ReportSummaryRow[])[0];
  const calc = (calcRows as Array<{ total_calc_runs: string; finalized_calc_runs: string }>)[0];

  return {
    total_stake_amount_base: ledger?.total_stake_amount_base ?? "0",
    total_reward_amount_base: ledger?.total_reward_amount_base ?? "0",
    total_fee_amount_base: ledger?.total_fee_amount_base ?? "0",
    total_accounts: ledger?.total_accounts ?? "0",
    total_ledger_events: ledger?.total_ledger_events ?? "0",
    total_calc_runs: calc?.total_calc_runs ?? "0",
    finalized_calc_runs: calc?.finalized_calc_runs ?? "0"
  };
}
