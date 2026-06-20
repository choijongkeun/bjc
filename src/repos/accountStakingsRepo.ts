import type { DbConn } from "../db/pool.js";

export type AccountStakingStatus =
  | "PENDING"
  | "ACTIVE"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "MATURED"
  | "CLOSED";

export type AccountStakingRow = {
  id: string;
  account_id: string;
  staking_product_id: string;
  policy_version_id: string;
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  status: AccountStakingStatus;
  idempotency_key: string;
  started_at: string | null;
  matures_at: string | null;
  activated_at: string | null;
  cancel_requested_at: string | null;
  cancelled_at: string | null;
  matured_at: string | null;
  closed_at: string | null;
  source_ledger_event_id: string | null;
  cancellation_ledger_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountStakingViewRow = AccountStakingRow & {
  product_name: string;
  product_symbol: string;
  product_decimals: number;
  product_min_stake_amount_base: string;
  product_max_stake_amount_base: string;
  product_staking_days: number;
  product_daily_interest_bps: string;
  product_is_active: number | boolean;
  account_login_id: string | null;
  account_display_name: string | null;
};

export type AccountStakingSort =
  | "created_at_desc"
  | "created_at_asc"
  | "matures_at_asc"
  | "matures_at_desc";

export type DailyRewardEligibleStakingRow = {
  id: string;
  account_id: string;
  staking_product_id: string;
  policy_version_id: string;
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  status: AccountStakingStatus;
  started_at: string;
  matures_at: string;
  cancelled_at: string | null;
  closed_at: string | null;
  product_name: string;
  product_symbol: string;
  product_decimals: number;
};

export type DirectReferralEligibleStakingCandidateRow = {
  id: string;
  account_id: string;
  policy_version_id: string;
  activated_at: string;
};

export type AccountStakingSummaryRow = {
  pending_count: number;
  active_count: number;
  cancel_requested_count: number;
  cancelled_count: number;
  matured_count: number;
  closed_count: number;
  pending_principal_amount_base: string;
  active_principal_amount_base: string;
};

function toOrderBy(sort: AccountStakingSort): string {
  switch (sort) {
    case "created_at_asc":
      return "s.created_at asc, s.id asc";
    case "matures_at_asc":
      return "s.matures_at asc, s.id asc";
    case "matures_at_desc":
      return "s.matures_at desc, s.id desc";
    case "created_at_desc":
    default:
      return "s.created_at desc, s.id desc";
  }
}

function baseSelectSql() {
  return `select
      s.id,
      s.account_id,
      s.staking_product_id,
      s.policy_version_id,
      s.principal_amount_base,
      s.daily_interest_bps_snapshot,
      s.duration_days_snapshot,
      s.status,
      s.idempotency_key,
      s.started_at,
      s.matures_at,
      s.activated_at,
      s.cancel_requested_at,
      s.cancelled_at,
      s.matured_at,
      s.closed_at,
      s.source_ledger_event_id,
      s.cancellation_ledger_event_id,
      s.created_at,
      s.updated_at,
      p.name as product_name,
      p.symbol as product_symbol,
      p.decimals as product_decimals,
      p.min_stake_amount_base as product_min_stake_amount_base,
      p.max_stake_amount_base as product_max_stake_amount_base,
      p.staking_days as product_staking_days,
      p.daily_interest_bps as product_daily_interest_bps,
      p.is_active as product_is_active,
      a.login_id as account_login_id,
      a.display_name as account_display_name
     from account_stakings s
     inner join staking_products p
       on p.id = s.staking_product_id
     inner join accounts a
       on a.id = s.account_id`;
}

export async function getAccountStakingById(conn: DbConn, id: string): Promise<AccountStakingViewRow | null> {
  const [rows] = await conn.query(`${baseSelectSql()} where s.id = ? limit 1`, [id]);
  const arr = rows as AccountStakingViewRow[];
  return arr[0] ?? null;
}

export async function getAccountStakingByIdForUpdate(conn: DbConn, id: string): Promise<AccountStakingRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        account_id,
        staking_product_id,
        policy_version_id,
        principal_amount_base,
        daily_interest_bps_snapshot,
        duration_days_snapshot,
        status,
        idempotency_key,
        started_at,
        matures_at,
        activated_at,
        cancel_requested_at,
        cancelled_at,
        matured_at,
        closed_at,
        source_ledger_event_id,
        cancellation_ledger_event_id,
        created_at,
        updated_at
       from account_stakings
      where id = ?
      limit 1
      for update`,
    [id]
  );
  const arr = rows as AccountStakingRow[];
  return arr[0] ?? null;
}

export async function getAccountStakingByIdempotencyKey(
  conn: DbConn,
  idempotencyKey: string
): Promise<AccountStakingViewRow | null> {
  const [rows] = await conn.query(`${baseSelectSql()} where s.idempotency_key = ? limit 1`, [idempotencyKey]);
  const arr = rows as AccountStakingViewRow[];
  return arr[0] ?? null;
}

export async function getAccountStakingByIdempotencyKeyForUpdate(
  conn: DbConn,
  idempotencyKey: string
): Promise<AccountStakingRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        account_id,
        staking_product_id,
        policy_version_id,
        principal_amount_base,
        daily_interest_bps_snapshot,
        duration_days_snapshot,
        status,
        idempotency_key,
        started_at,
        matures_at,
        activated_at,
        cancel_requested_at,
        cancelled_at,
        matured_at,
        closed_at,
        source_ledger_event_id,
        cancellation_ledger_event_id,
        created_at,
        updated_at
       from account_stakings
      where idempotency_key = ?
      limit 1
      for update`,
    [idempotencyKey]
  );
  const arr = rows as AccountStakingRow[];
  return arr[0] ?? null;
}

export async function insertAccountStaking(
  conn: DbConn,
  input: {
    id: string;
    account_id: string;
    staking_product_id: string;
    policy_version_id: string;
    principal_amount_base: string;
    daily_interest_bps_snapshot: string;
    duration_days_snapshot: number;
    status: AccountStakingStatus;
    idempotency_key: string;
    started_at?: Date | null;
    matures_at?: Date | null;
    activated_at?: Date | null;
    cancel_requested_at?: Date | null;
    cancelled_at?: Date | null;
    matured_at?: Date | null;
    closed_at?: Date | null;
    source_ledger_event_id?: string | null;
    cancellation_ledger_event_id?: string | null;
    created_at: Date;
    updated_at: Date;
  }
): Promise<void> {
  await conn.query(
    `insert into account_stakings (
        id,
        account_id,
        staking_product_id,
        policy_version_id,
        principal_amount_base,
        daily_interest_bps_snapshot,
        duration_days_snapshot,
        status,
        idempotency_key,
        started_at,
        matures_at,
        activated_at,
        cancel_requested_at,
        cancelled_at,
        matured_at,
        closed_at,
        source_ledger_event_id,
        cancellation_ledger_event_id,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.account_id,
      input.staking_product_id,
      input.policy_version_id,
      input.principal_amount_base,
      input.daily_interest_bps_snapshot,
      input.duration_days_snapshot,
      input.status,
      input.idempotency_key,
      input.started_at ?? null,
      input.matures_at ?? null,
      input.activated_at ?? null,
      input.cancel_requested_at ?? null,
      input.cancelled_at ?? null,
      input.matured_at ?? null,
      input.closed_at ?? null,
      input.source_ledger_event_id ?? null,
      input.cancellation_ledger_event_id ?? null,
      input.created_at,
      input.updated_at
    ]
  );
}

export async function updateAccountStaking(
  conn: DbConn,
  input: {
    id: string;
    status?: AccountStakingStatus;
    started_at?: Date | null;
    matures_at?: Date | null;
    activated_at?: Date | null;
    cancel_requested_at?: Date | null;
    cancelled_at?: Date | null;
    matured_at?: Date | null;
    closed_at?: Date | null;
    source_ledger_event_id?: string | null;
    cancellation_ledger_event_id?: string | null;
    updated_at: Date;
  }
): Promise<void> {
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [input.updated_at];

  if (input.status !== undefined) {
    sets.push("status = ?");
    params.push(input.status);
  }
  if (input.started_at !== undefined) {
    sets.push("started_at = ?");
    params.push(input.started_at);
  }
  if (input.matures_at !== undefined) {
    sets.push("matures_at = ?");
    params.push(input.matures_at);
  }
  if (input.activated_at !== undefined) {
    sets.push("activated_at = ?");
    params.push(input.activated_at);
  }
  if (input.cancel_requested_at !== undefined) {
    sets.push("cancel_requested_at = ?");
    params.push(input.cancel_requested_at);
  }
  if (input.cancelled_at !== undefined) {
    sets.push("cancelled_at = ?");
    params.push(input.cancelled_at);
  }
  if (input.matured_at !== undefined) {
    sets.push("matured_at = ?");
    params.push(input.matured_at);
  }
  if (input.closed_at !== undefined) {
    sets.push("closed_at = ?");
    params.push(input.closed_at);
  }
  if (input.source_ledger_event_id !== undefined) {
    sets.push("source_ledger_event_id = ?");
    params.push(input.source_ledger_event_id);
  }
  if (input.cancellation_ledger_event_id !== undefined) {
    sets.push("cancellation_ledger_event_id = ?");
    params.push(input.cancellation_ledger_event_id);
  }

  params.push(input.id);
  await conn.query(`update account_stakings set ${sets.join(", ")} where id = ?`, params);
}

export async function listAccountStakings(
  conn: DbConn,
  input: {
    account_id?: string;
    q?: string;
    product_id?: string;
    status?: AccountStakingStatus;
    created_from?: string;
    created_to?: string;
    matures_from?: string;
    matures_to?: string;
    page: number;
    limit: number;
    sort: AccountStakingSort;
  }
): Promise<{ items: AccountStakingViewRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.account_id) {
    where.push("s.account_id = ?");
    params.push(input.account_id);
  }
  if (input.q) {
    const text = `%${input.q}%`;
    where.push("(s.id like ? or a.login_id like ? or a.display_name like ?)");
    params.push(text, text, text);
  }
  if (input.product_id) {
    where.push("s.staking_product_id = ?");
    params.push(input.product_id);
  }
  if (input.status) {
    where.push("s.status = ?");
    params.push(input.status);
  }
  if (input.created_from) {
    where.push("s.created_at >= ?");
    params.push(input.created_from);
  }
  if (input.created_to) {
    where.push("s.created_at <= ?");
    params.push(input.created_to);
  }
  if (input.matures_from) {
    where.push("s.matures_at >= ?");
    params.push(input.matures_from);
  }
  if (input.matures_to) {
    where.push("s.matures_at <= ?");
    params.push(input.matures_to);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from account_stakings s inner join accounts a on a.id = s.account_id ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `${baseSelectSql()}
      ${whereSql}
      order by ${toOrderBy(input.sort)}
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as AccountStakingViewRow[], total };
}

export async function listDailyRewardEligibleStakings(
  conn: DbConn,
  input: {
    policy_version_id: string;
    reward_day_start: string;
    reward_day_end: string;
    limit?: number;
    offset?: number;
  }
): Promise<DailyRewardEligibleStakingRow[]> {
  const [rows] = await conn.query(
    `select
        s.id,
        s.account_id,
        s.staking_product_id,
        s.policy_version_id,
        s.principal_amount_base,
        s.daily_interest_bps_snapshot,
        s.duration_days_snapshot,
        s.status,
        s.started_at,
        s.matures_at,
        s.cancelled_at,
        s.closed_at,
        p.name as product_name,
        p.symbol as product_symbol,
        p.decimals as product_decimals
       from account_stakings s
       inner join staking_products p
         on p.id = s.staking_product_id
      where s.policy_version_id = ?
        and s.status in ('ACTIVE', 'CANCEL_REQUESTED')
        and s.started_at is not null
        and s.matures_at is not null
        and s.started_at < ?
        and s.matures_at > ?
        and (s.cancelled_at is null or s.cancelled_at > ?)
        and (s.closed_at is null or s.closed_at > ?)
      order by s.started_at asc, s.id asc
      limit ? offset ?`,
    [
      input.policy_version_id,
      input.reward_day_end,
      input.reward_day_start,
      input.reward_day_start,
      input.reward_day_start,
      input.limit ?? 1000,
      input.offset ?? 0
    ]
  );

  return rows as DailyRewardEligibleStakingRow[];
}

export async function listDirectReferralEligibleStakingCandidates(
  conn: DbConn,
  input: {
    policy_version_id: string;
    activated_from_sql: string;
    activated_to_exclusive_sql: string;
    limit?: number;
    offset?: number;
  }
): Promise<DirectReferralEligibleStakingCandidateRow[]> {
  const [rows] = await conn.query(
    `select
        s.id,
        s.account_id,
        s.policy_version_id,
        s.activated_at
       from account_stakings s
      where s.policy_version_id = ?
        and s.status = 'ACTIVE'
        and s.activated_at is not null
        and s.activated_at >= ?
        and s.activated_at < ?
      order by s.activated_at asc, s.id asc
      limit ? offset ?`,
    [
      input.policy_version_id,
      input.activated_from_sql,
      input.activated_to_exclusive_sql,
      input.limit ?? 1000,
      input.offset ?? 0
    ]
  );

  return rows as DirectReferralEligibleStakingCandidateRow[];
}

export async function getMyStakingSummary(conn: DbConn, account_id: string): Promise<AccountStakingSummaryRow> {
  const [rows] = await conn.query(
    `select
        cast(sum(case when status = 'PENDING' then 1 else 0 end) as unsigned) as pending_count,
        cast(sum(case when status = 'ACTIVE' then 1 else 0 end) as unsigned) as active_count,
        cast(sum(case when status = 'CANCEL_REQUESTED' then 1 else 0 end) as unsigned) as cancel_requested_count,
        cast(sum(case when status = 'CANCELLED' then 1 else 0 end) as unsigned) as cancelled_count,
        cast(sum(case when status = 'MATURED' then 1 else 0 end) as unsigned) as matured_count,
        cast(sum(case when status = 'CLOSED' then 1 else 0 end) as unsigned) as closed_count,
        coalesce(sum(case when status = 'PENDING' then principal_amount_base else 0 end), 0) as pending_principal_amount_base,
        coalesce(sum(case when status = 'ACTIVE' then principal_amount_base else 0 end), 0) as active_principal_amount_base
       from account_stakings
      where account_id = ?`,
    [account_id]
  );

  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    pending_count: Number(row.pending_count ?? 0),
    active_count: Number(row.active_count ?? 0),
    cancel_requested_count: Number(row.cancel_requested_count ?? 0),
    cancelled_count: Number(row.cancelled_count ?? 0),
    matured_count: Number(row.matured_count ?? 0),
    closed_count: Number(row.closed_count ?? 0),
    pending_principal_amount_base: String(row.pending_principal_amount_base ?? "0"),
    active_principal_amount_base: String(row.active_principal_amount_base ?? "0")
  };
}
