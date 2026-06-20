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

export type RewardSummaryReportRow = {
  reward_amount_base: string;
  reward_count: string;
  reversal_amount_base: string;
  net_reward_amount_base: string;
  reserved_withdrawal_amount_base: string;
  completed_withdrawal_amount_base: string;
  calc_run_succeeded_count: string;
  calc_run_failed_count: string;
  duplicate_skip_count: string;
  conflict_count: string;
  failed_count: string;
};

export type RewardByTypeReportRow = {
  reward_type: string;
  reward_amount_base: string;
  reward_count: string;
  reversal_amount_base: string;
  net_reward_amount_base: string;
  reserved_withdrawal_amount_base: string;
  completed_withdrawal_amount_base: string;
};

export type CalcRunSummaryReportRow = {
  run_type: string;
  total_run_count: string;
  pending_run_count: string;
  running_run_count: string;
  succeeded_run_count: string;
  failed_run_count: string;
  finalized_run_count: string;
  created_count: string;
  duplicate_skip_count: string;
  conflict_count: string;
  failed_count: string;
};

export type RewardCsvRow = {
  id: string;
  account_id: string;
  account_login_id: string | null;
  account_display_name: string | null;
  reward_type: string;
  reward_date: string;
  amount_base: string;
  status: string;
  policy_version_id: string;
  calc_run_id: string | null;
  calc_run_run_type: string | null;
  source_reference: string;
  source_ledger_event_id: string | null;
  account_staking_id: string | null;
  product_id: string | null;
  product_name: string | null;
  product_symbol: string | null;
  product_decimals: number | null;
  confirmed_at: string | null;
  available_at: string | null;
  reversed_at: string | null;
  created_at: string;
  metadata_json: unknown;
};

export type CalcRunCsvRow = {
  id: string;
  policy_version_id: string;
  run_type: string;
  run_date: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  finalized_at: string | null;
  error_message: string | null;
  created_at: string;
  created_count: string;
  duplicate_skip_count: string;
  conflict_count: string;
  failed_count: string;
  total_reward_amount_base: string;
  total_base_amount_base: string;
  total_requested_amount_base: string;
  total_release_amount_base: string;
  total_freeze_amount_base: string;
};

const CALC_RUN_AUDIT_ACTIONS = [
  "ADMIN_DAILY_REWARD_RUN",
  "ADMIN_DIRECT_REFERRAL_RUN",
  "ADMIN_RANK_QUALIFICATION_RUN",
  "ADMIN_RANK_BONUS_RUN",
  "ADMIN_CONTRIBUTION_RUN",
  "ADMIN_SIDECAR_RUN"
] as const;

function buildLedgerWhere(input: {
  from?: string;
  to?: string;
  policy_version_id?: string;
}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.policy_version_id) {
    where.push("policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (input.from) {
    where.push("event_time >= ?");
    params.push(input.from);
  }
  if (input.to) {
    where.push("event_time <= ?");
    params.push(input.to);
  }

  return {
    whereSql: where.length ? `where ${where.join(" and ")}` : "",
    params
  };
}

function buildCalcRunWhere(input: {
  from?: string;
  to?: string;
  policy_version_id?: string;
  status?: string;
  run_type?: string;
}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.policy_version_id) {
    where.push("policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (input.from) {
    where.push("run_date >= date(?)");
    params.push(input.from);
  }
  if (input.to) {
    where.push("run_date <= date(?)");
    params.push(input.to);
  }
  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.run_type) {
    where.push("run_type = ?");
    params.push(input.run_type);
  }

  return {
    whereSql: where.length ? `where ${where.join(" and ")}` : "",
    params
  };
}

function buildRewardWhere(input: {
  date_from?: string;
  date_to?: string;
  policy_version_id?: string;
  reward_type?: string;
  status?: string;
  account_id?: string;
  calc_run_id?: string;
}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.policy_version_id) {
    where.push("r.policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (input.date_from) {
    where.push("r.reward_date >= ?");
    params.push(input.date_from);
  }
  if (input.date_to) {
    where.push("r.reward_date <= ?");
    params.push(input.date_to);
  }
  if (input.reward_type) {
    where.push("r.reward_type = ?");
    params.push(input.reward_type);
  }
  if (input.status) {
    where.push("r.status = ?");
    params.push(input.status);
  }
  if (input.account_id) {
    where.push("r.account_id = ?");
    params.push(input.account_id);
  }
  if (input.calc_run_id) {
    where.push("r.calc_run_id = ?");
    params.push(input.calc_run_id);
  }

  return {
    whereSql: where.length ? `where ${where.join(" and ")}` : "",
    params
  };
}

function buildWithdrawalAllocationWhere(input: {
  date_from?: string;
  date_to?: string;
  policy_version_id?: string;
  reward_type?: string;
  status?: string;
}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.policy_version_id) {
    where.push("r.policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (input.date_from) {
    where.push("w.requested_kst_date >= ?");
    params.push(input.date_from);
  }
  if (input.date_to) {
    where.push("w.requested_kst_date <= ?");
    params.push(input.date_to);
  }
  if (input.reward_type) {
    where.push("r.reward_type = ?");
    params.push(input.reward_type);
  }
  if (input.status) {
    where.push("r.status = ?");
    params.push(input.status);
  }

  return {
    whereSql: where.length ? `where ${where.join(" and ")}` : "",
    params
  };
}

function buildAuditPlaceholders(): string {
  return CALC_RUN_AUDIT_ACTIONS.map(() => "?").join(", ");
}

export async function getReportSummary(
  conn: DbConn,
  input: {
    from?: string;
    to?: string;
    policy_version_id?: string;
  }
): Promise<ReportSummaryRow> {
  const ledgerWhere = buildLedgerWhere(input);
  const calcWhere = buildCalcRunWhere(input);

  const [ledgerRows] = await conn.query(
    `select
        cast(coalesce(sum(case when event_type = 'STAKE' then amount_base else 0 end), 0) as char) as total_stake_amount_base,
        cast(coalesce(sum(case when event_type in ('DAILY_REWARD_ACCRUAL', 'DAILY_REWARD_PAYOUT', 'DIRECT_REFERRAL_BONUS', 'RANK_BONUS', 'CONTRIBUTION_BONUS') then amount_base else 0 end), 0) as char) as total_reward_amount_base,
        cast(coalesce(sum(case when event_type = 'WITHDRAWAL_FEE' then amount_base else 0 end), 0) as char) as total_fee_amount_base,
        cast(count(*) as char) as total_ledger_events,
        cast(count(distinct account_id) as char) as total_accounts
       from ledger_events
       ${ledgerWhere.whereSql}`,
    ledgerWhere.params
  );

  const [calcRows] = await conn.query(
    `select
        cast(count(*) as char) as total_calc_runs,
        cast(coalesce(sum(case when status = 'FINALIZED' then 1 else 0 end), 0) as char) as finalized_calc_runs
       from calc_runs
       ${calcWhere.whereSql}`,
    calcWhere.params
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

export async function getRewardSummaryReport(
  conn: DbConn,
  input: {
    date_from?: string;
    date_to?: string;
    policy_version_id?: string;
    reward_type?: string;
    status?: string;
  }
): Promise<RewardSummaryReportRow> {
  const rewardWhere = buildRewardWhere({
    date_from: input.date_from,
    date_to: input.date_to,
    policy_version_id: input.policy_version_id,
    reward_type: input.reward_type,
    status: input.status
  });
  const allocationWhere = buildWithdrawalAllocationWhere(input);
  const calcWhere = buildCalcRunWhere({
    from: input.date_from,
    to: input.date_to,
    policy_version_id: input.policy_version_id
  });

  const [rewardRows] = await conn.query(
    `select
        cast(coalesce(sum(case when r.reward_type <> 'REVERSAL' and r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as char) as reward_amount_base,
        cast(coalesce(sum(case when r.reward_type = 'REVERSAL' and r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as char) as reversal_amount_base,
        cast(coalesce(sum(case when r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as char) as net_reward_amount_base,
        cast(coalesce(sum(case when r.reward_type <> 'REVERSAL' then 1 else 0 end), 0) as char) as reward_count
       from account_rewards r
       ${rewardWhere.whereSql}`,
    rewardWhere.params
  );

  const [allocationRows] = await conn.query(
    `select
        cast(coalesce(sum(case when a.status = 'RESERVED' then a.allocated_amount_base else 0 end), 0) as char) as reserved_withdrawal_amount_base,
        cast(coalesce(sum(case when a.status = 'CONSUMED' then a.allocated_amount_base else 0 end), 0) as char) as completed_withdrawal_amount_base
       from reward_withdrawal_allocations a
       inner join reward_withdrawals w
         on w.id = a.withdrawal_id
       inner join account_rewards r
         on r.id = a.reward_id
       ${allocationWhere.whereSql}`,
    allocationWhere.params
  );

  const [calcRows] = await conn.query(
    `select
        cast(coalesce(sum(case when status = 'SUCCEEDED' then 1 else 0 end), 0) as char) as calc_run_succeeded_count,
        cast(coalesce(sum(case when status = 'FAILED' then 1 else 0 end), 0) as char) as calc_run_failed_count
       from calc_runs
       ${calcWhere.whereSql}`,
    calcWhere.params
  );

  const [auditRows] = await conn.query(
    `select
        cast(
          coalesce(
            sum(
              cast(coalesce(json_unquote(json_extract(meta, '$.duplicate_skip_count')), '0') as unsigned)
            ),
            0
          ) as char
        ) as duplicate_skip_count,
        cast(
          coalesce(
            sum(
              cast(coalesce(json_unquote(json_extract(meta, '$.conflict_count')), '0') as unsigned)
            ),
            0
          ) as char
        ) as conflict_count,
        cast(
          coalesce(
            sum(
              cast(coalesce(json_unquote(json_extract(meta, '$.failed_count')), '0') as unsigned)
            ),
            0
          ) as char
        ) as failed_count
       from admin_audit_log
      where target_table = 'calc_runs'
        and action in (${buildAuditPlaceholders()})
        and target_id in (
          select id
            from calc_runs
            ${calcWhere.whereSql}
        )`,
    [...CALC_RUN_AUDIT_ACTIONS, ...calcWhere.params]
  );

  const reward = (rewardRows as RewardSummaryReportRow[])[0];
  const allocation = (allocationRows as Array<Pick<RewardSummaryReportRow, "reserved_withdrawal_amount_base" | "completed_withdrawal_amount_base">>)[0];
  const calc = (calcRows as Array<Pick<RewardSummaryReportRow, "calc_run_succeeded_count" | "calc_run_failed_count">>)[0];
  const audit = (auditRows as Array<Pick<RewardSummaryReportRow, "duplicate_skip_count" | "conflict_count" | "failed_count">>)[0];

  return {
    reward_amount_base: reward?.reward_amount_base ?? "0",
    reward_count: reward?.reward_count ?? "0",
    reversal_amount_base: reward?.reversal_amount_base ?? "0",
    net_reward_amount_base: reward?.net_reward_amount_base ?? "0",
    reserved_withdrawal_amount_base: allocation?.reserved_withdrawal_amount_base ?? "0",
    completed_withdrawal_amount_base: allocation?.completed_withdrawal_amount_base ?? "0",
    calc_run_succeeded_count: calc?.calc_run_succeeded_count ?? "0",
    calc_run_failed_count: calc?.calc_run_failed_count ?? "0",
    duplicate_skip_count: audit?.duplicate_skip_count ?? "0",
    conflict_count: audit?.conflict_count ?? "0",
    failed_count: audit?.failed_count ?? "0"
  };
}

export async function listRewardByTypeReport(
  conn: DbConn,
  input: {
    date_from?: string;
    date_to?: string;
    policy_version_id?: string;
    reward_type?: string;
    status?: string;
  }
): Promise<RewardByTypeReportRow[]> {
  const rewardWhere = buildRewardWhere({
    date_from: input.date_from,
    date_to: input.date_to,
    policy_version_id: input.policy_version_id,
    reward_type: input.reward_type,
    status: input.status
  });
  const allocationWhere = buildWithdrawalAllocationWhere(input);

  const [rows] = await conn.query(
    `select
        reward_type,
        cast(sum(reward_amount_base) as char) as reward_amount_base,
        cast(sum(reward_count) as char) as reward_count,
        cast(sum(reversal_amount_base) as char) as reversal_amount_base,
        cast(sum(net_reward_amount_base) as char) as net_reward_amount_base,
        cast(sum(reserved_withdrawal_amount_base) as char) as reserved_withdrawal_amount_base,
        cast(sum(completed_withdrawal_amount_base) as char) as completed_withdrawal_amount_base
      from (
        select
          case when r.reward_type = 'REVERSAL' then coalesce(original.reward_type, 'REVERSAL') else r.reward_type end as reward_type,
          coalesce(sum(case when r.reward_type <> 'REVERSAL' and r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as reward_amount_base,
          coalesce(sum(case when r.reward_type <> 'REVERSAL' then 1 else 0 end), 0) as reward_count,
          coalesce(sum(case when r.reward_type = 'REVERSAL' and r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as reversal_amount_base,
          coalesce(sum(case when r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as net_reward_amount_base,
          0 as reserved_withdrawal_amount_base,
          0 as completed_withdrawal_amount_base
         from account_rewards r
         left join account_rewards original
           on original.id = r.reversal_reward_id
         ${rewardWhere.whereSql}
        group by case when r.reward_type = 'REVERSAL' then coalesce(original.reward_type, 'REVERSAL') else r.reward_type end

        union all

        select
          r.reward_type,
          0 as reward_amount_base,
          0 as reward_count,
          0 as reversal_amount_base,
          0 as net_reward_amount_base,
          coalesce(sum(case when a.status = 'RESERVED' then a.allocated_amount_base else 0 end), 0) as reserved_withdrawal_amount_base,
          coalesce(sum(case when a.status = 'CONSUMED' then a.allocated_amount_base else 0 end), 0) as completed_withdrawal_amount_base
         from reward_withdrawal_allocations a
         inner join reward_withdrawals w
           on w.id = a.withdrawal_id
         inner join account_rewards r
           on r.id = a.reward_id
         ${allocationWhere.whereSql}
        group by r.reward_type
      ) t
     group by reward_type
     order by reward_type asc`,
    [...rewardWhere.params, ...allocationWhere.params]
  );

  return rows as RewardByTypeReportRow[];
}

export async function listCalcRunSummaryReport(
  conn: DbConn,
  input: {
    date_from?: string;
    date_to?: string;
    policy_version_id?: string;
    status?: string;
    run_type?: string;
  }
): Promise<CalcRunSummaryReportRow[]> {
  const calcWhere = buildCalcRunWhere({
    from: input.date_from,
    to: input.date_to,
    policy_version_id: input.policy_version_id,
    status: input.status,
    run_type: input.run_type
  });

  const [rows] = await conn.query(
    `select
        cr.run_type,
        cast(count(distinct cr.id) as char) as total_run_count,
        cast(coalesce(sum(case when cr.status = 'PENDING' then 1 else 0 end), 0) as char) as pending_run_count,
        cast(coalesce(sum(case when cr.status = 'RUNNING' then 1 else 0 end), 0) as char) as running_run_count,
        cast(coalesce(sum(case when cr.status = 'SUCCEEDED' then 1 else 0 end), 0) as char) as succeeded_run_count,
        cast(coalesce(sum(case when cr.status = 'FAILED' then 1 else 0 end), 0) as char) as failed_run_count,
        cast(coalesce(sum(case when cr.status = 'FINALIZED' then 1 else 0 end), 0) as char) as finalized_run_count,
        cast(
          coalesce(
            sum(coalesce(al.created_count, 0)),
            0
          ) as char
        ) as created_count,
        cast(
          coalesce(
            sum(coalesce(al.duplicate_skip_count, 0)),
            0
          ) as char
        ) as duplicate_skip_count,
        cast(
          coalesce(
            sum(coalesce(al.conflict_count, 0)),
            0
          ) as char
        ) as conflict_count,
        cast(
          coalesce(
            sum(coalesce(al.failed_count, 0)),
            0
          ) as char
        ) as failed_count
       from calc_runs cr
       left join (
         select
           target_id,
           max(cast(coalesce(json_unquote(json_extract(meta, '$.created_count')), '0') as unsigned)) as created_count,
           max(cast(coalesce(json_unquote(json_extract(meta, '$.duplicate_skip_count')), '0') as unsigned)) as duplicate_skip_count,
           max(cast(coalesce(json_unquote(json_extract(meta, '$.conflict_count')), '0') as unsigned)) as conflict_count,
           max(cast(coalesce(json_unquote(json_extract(meta, '$.failed_count')), '0') as unsigned)) as failed_count
          from admin_audit_log
         where target_table = 'calc_runs'
           and action in (${buildAuditPlaceholders()})
         group by target_id
       ) al
         on al.target_id = cr.id
       ${calcWhere.whereSql ? calcWhere.whereSql.replace(/policy_version_id/g, "cr.policy_version_id").replace(/run_date/g, "cr.run_date").replace(/status/g, "cr.status").replace(/run_type/g, "cr.run_type") : ""}
      group by cr.run_type
      order by cr.run_type asc`,
    [...CALC_RUN_AUDIT_ACTIONS, ...calcWhere.params]
  );

  return rows as CalcRunSummaryReportRow[];
}

export async function listRewardsForCsv(
  conn: DbConn,
  input: {
    date_from?: string;
    date_to?: string;
    policy_version_id?: string;
    reward_type?: string;
    status?: string;
    account_id?: string;
    calc_run_id?: string;
  }
): Promise<RewardCsvRow[]> {
  const rewardWhere = buildRewardWhere(input);
  const [rows] = await conn.query(
    `select
        r.id,
        r.account_id,
        a.login_id as account_login_id,
        a.display_name as account_display_name,
        r.reward_type,
        r.reward_date,
        cast(r.amount_base as char) as amount_base,
        r.status,
        r.policy_version_id,
        r.calc_run_id,
        cr.run_type as calc_run_run_type,
        r.source_reference,
        r.source_ledger_event_id,
        r.account_staking_id,
        p.id as product_id,
        p.name as product_name,
        p.symbol as product_symbol,
        p.decimals as product_decimals,
        r.confirmed_at,
        r.available_at,
        r.reversed_at,
        r.created_at,
        r.metadata_json
       from account_rewards r
       inner join accounts a
         on a.id = r.account_id
       left join account_stakings s
         on s.id = r.account_staking_id
       left join staking_products p
         on p.id = s.staking_product_id
       left join calc_runs cr
         on cr.id = r.calc_run_id
       ${rewardWhere.whereSql}
      order by r.reward_date desc, r.created_at desc, r.id desc`,
    rewardWhere.params
  );

  return rows as RewardCsvRow[];
}

export async function listCalcRunsForCsv(
  conn: DbConn,
  input: {
    date_from?: string;
    date_to?: string;
    policy_version_id?: string;
    status?: string;
    run_type?: string;
  }
): Promise<CalcRunCsvRow[]> {
  const calcWhere = buildCalcRunWhere({
    from: input.date_from,
    to: input.date_to,
    policy_version_id: input.policy_version_id,
    status: input.status,
    run_type: input.run_type
  });

  const [rows] = await conn.query(
    `select
        cr.id,
        cr.policy_version_id,
        cr.run_type,
        cr.run_date,
        cr.status,
        cr.started_at,
        cr.finished_at,
        cr.finalized_at,
        cr.error_message,
        cr.created_at,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.created_count')), '0') as unsigned)),
            0
          ) as char
        ) as created_count,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.duplicate_skip_count')), '0') as unsigned)),
            0
          ) as char
        ) as duplicate_skip_count,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.conflict_count')), '0') as unsigned)),
            0
          ) as char
        ) as conflict_count,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.failed_count')), '0') as unsigned)),
            0
          ) as char
        ) as failed_count,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.total_reward_amount_base')), '0') as signed)),
            0
          ) as char
        ) as total_reward_amount_base,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.total_base_amount_base')), '0') as signed)),
            0
          ) as char
        ) as total_base_amount_base,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.total_requested_amount_base')), '0') as signed)),
            0
          ) as char
        ) as total_requested_amount_base,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.total_release_amount_base')), '0') as signed)),
            0
          ) as char
        ) as total_release_amount_base,
        cast(
          coalesce(
            max(cast(coalesce(json_unquote(json_extract(al.meta, '$.total_freeze_amount_base')), '0') as signed)),
            0
          ) as char
        ) as total_freeze_amount_base
       from calc_runs cr
       left join admin_audit_log al
         on al.target_table = 'calc_runs'
        and al.target_id = cr.id
        and al.action in (${buildAuditPlaceholders()})
       ${calcWhere.whereSql ? calcWhere.whereSql.replace(/policy_version_id/g, "cr.policy_version_id").replace(/run_date/g, "cr.run_date").replace(/status/g, "cr.status").replace(/run_type/g, "cr.run_type") : ""}
      group by
        cr.id,
        cr.policy_version_id,
        cr.run_type,
        cr.run_date,
        cr.status,
        cr.started_at,
        cr.finished_at,
        cr.finalized_at,
        cr.error_message,
        cr.created_at
      order by cr.run_date desc, cr.created_at desc, cr.id desc`,
    [...CALC_RUN_AUDIT_ACTIONS, ...calcWhere.params]
  );

  return rows as CalcRunCsvRow[];
}
