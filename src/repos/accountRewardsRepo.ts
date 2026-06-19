import type { DbConn } from "../db/pool.js";

export type RewardType =
  | "DAILY_REWARD"
  | "DIRECT_REFERRAL"
  | "RANK_BONUS"
  | "CONTRIBUTION"
  | "WITHDRAWAL_FEE"
  | "SIDECAR"
  | "ADJUSTMENT"
  | "REVERSAL";

export type RewardStatus = "PENDING" | "CONFIRMED" | "REVERSED";

export type RewardRow = {
  id: string;
  account_id: string;
  account_staking_id: string | null;
  policy_version_id: string;
  calc_run_id: string | null;
  reward_type: RewardType;
  reward_date: string;
  amount_base: string;
  status: RewardStatus;
  source_reference: string;
  source_ledger_event_id: string | null;
  reversal_reward_id: string | null;
  available_at: string | null;
  confirmed_at: string | null;
  reversed_at: string | null;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

export type RewardViewRow = RewardRow & {
  account_login_id: string | null;
  account_display_name: string | null;
  staking_principal_amount_base: string | null;
  staking_daily_interest_bps_snapshot: string | null;
  staking_duration_days_snapshot: number | null;
  staking_status: string | null;
  product_id: string | null;
  product_name: string | null;
  product_symbol: string | null;
  product_decimals: number | null;
  calc_run_status: string | null;
  calc_run_run_type: string | null;
  calc_run_run_date: string | null;
};

export type RewardListSort =
  | "reward_date_desc"
  | "reward_date_asc"
  | "created_at_desc"
  | "created_at_asc"
  | "available_at_desc"
  | "available_at_asc";

export type RewardSummaryRow = {
  pending_reward_amount_base: string;
  confirmed_reward_amount_base: string;
  withdrawable_reward_amount_base: string;
  withdrawn_reward_amount_base: string;
  daily_reward_amount_base: string;
  reward_count: number;
};

function normalizeDateTimeInput(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 23).replace("T", " ").replace("Z", "");
  }
  return value;
}

function toOrderBy(sort: RewardListSort): string {
  switch (sort) {
    case "reward_date_asc":
      return "r.reward_date asc, r.created_at asc, r.id asc";
    case "created_at_desc":
      return "r.created_at desc, r.id desc";
    case "created_at_asc":
      return "r.created_at asc, r.id asc";
    case "available_at_desc":
      return "r.available_at desc, r.created_at desc, r.id desc";
    case "available_at_asc":
      return "r.available_at asc, r.created_at asc, r.id asc";
    case "reward_date_desc":
    default:
      return "r.reward_date desc, r.created_at desc, r.id desc";
  }
}

function baseSelectSql() {
  return `select
      r.id,
      r.account_id,
      r.account_staking_id,
      r.policy_version_id,
      r.calc_run_id,
      r.reward_type,
      r.reward_date,
      r.amount_base,
      r.status,
      r.source_reference,
      r.source_ledger_event_id,
      r.reversal_reward_id,
      r.available_at,
      r.confirmed_at,
      r.reversed_at,
      r.metadata_json,
      r.created_at,
      r.updated_at,
      a.login_id as account_login_id,
      a.display_name as account_display_name,
      s.principal_amount_base as staking_principal_amount_base,
      s.daily_interest_bps_snapshot as staking_daily_interest_bps_snapshot,
      s.duration_days_snapshot as staking_duration_days_snapshot,
      s.status as staking_status,
      p.id as product_id,
      p.name as product_name,
      p.symbol as product_symbol,
      p.decimals as product_decimals,
      cr.status as calc_run_status,
      cr.run_type as calc_run_run_type,
      cr.run_date as calc_run_run_date
     from account_rewards r
     inner join accounts a
       on a.id = r.account_id
     left join account_stakings s
       on s.id = r.account_staking_id
     left join staking_products p
       on p.id = s.staking_product_id
     left join calc_runs cr
       on cr.id = r.calc_run_id`;
}

function buildListWhere(input: {
  account_id?: string;
  q?: string;
  staking_id?: string;
  reward_type?: RewardType;
  status?: RewardStatus;
  calc_run_id?: string;
  reward_date_from?: string;
  reward_date_to?: string;
}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.account_id) {
    where.push("r.account_id = ?");
    params.push(input.account_id);
  }
  if (input.q) {
    const q = `%${input.q}%`;
    where.push("(r.id like ? or a.login_id like ? or a.display_name like ?)");
    params.push(q, q, q);
  }
  if (input.staking_id) {
    where.push("r.account_staking_id = ?");
    params.push(input.staking_id);
  }
  if (input.reward_type) {
    where.push("r.reward_type = ?");
    params.push(input.reward_type);
  }
  if (input.status) {
    where.push("r.status = ?");
    params.push(input.status);
  }
  if (input.calc_run_id) {
    where.push("r.calc_run_id = ?");
    params.push(input.calc_run_id);
  }
  if (input.reward_date_from) {
    where.push("r.reward_date >= ?");
    params.push(input.reward_date_from);
  }
  if (input.reward_date_to) {
    where.push("r.reward_date <= ?");
    params.push(input.reward_date_to);
  }

  return {
    whereSql: where.length ? `where ${where.join(" and ")}` : "",
    params
  };
}

export async function insertAccountReward(
  conn: DbConn,
  input: {
    id: string;
    account_id: string;
    account_staking_id?: string | null;
    policy_version_id: string;
    calc_run_id?: string | null;
    reward_type: RewardType;
    reward_date: string;
    amount_base: string;
    status: RewardStatus;
    source_reference: string;
    source_ledger_event_id?: string | null;
    reversal_reward_id?: string | null;
    available_at?: Date | null;
    confirmed_at?: Date | null;
    reversed_at?: Date | null;
    metadata_json?: object | null;
    created_at: Date;
    updated_at: Date;
  }
): Promise<void> {
  await conn.query(
    `insert into account_rewards (
        id,
        account_id,
        account_staking_id,
        policy_version_id,
        calc_run_id,
        reward_type,
        reward_date,
        amount_base,
        status,
        source_reference,
        source_ledger_event_id,
        reversal_reward_id,
        available_at,
        confirmed_at,
        reversed_at,
        metadata_json,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?)`,
    [
      input.id,
      input.account_id,
      input.account_staking_id ?? null,
      input.policy_version_id,
      input.calc_run_id ?? null,
      input.reward_type,
      input.reward_date,
      input.amount_base,
      input.status,
      input.source_reference,
      input.source_ledger_event_id ?? null,
      input.reversal_reward_id ?? null,
      normalizeDateTimeInput(input.available_at),
      normalizeDateTimeInput(input.confirmed_at),
      normalizeDateTimeInput(input.reversed_at),
      JSON.stringify(input.metadata_json ?? {}),
      normalizeDateTimeInput(input.created_at),
      normalizeDateTimeInput(input.updated_at)
    ]
  );
}

export async function insertReversalReward(
  conn: DbConn,
  input: Parameters<typeof insertAccountReward>[1]
): Promise<void> {
  await insertAccountReward(conn, input);
}

export async function updateRewardSourceLedgerEvent(
  conn: DbConn,
  input: { id: string; source_ledger_event_id: string; updated_at: Date }
): Promise<void> {
  await conn.query(
    "update account_rewards set source_ledger_event_id = ?, updated_at = ? where id = ?",
    [input.source_ledger_event_id, normalizeDateTimeInput(input.updated_at), input.id]
  );
}

export async function getRewardById(conn: DbConn, id: string): Promise<RewardViewRow | null> {
  const [rows] = await conn.query(`${baseSelectSql()} where r.id = ? limit 1`, [id]);
  const arr = rows as RewardViewRow[];
  return arr[0] ?? null;
}

export async function getRewardByIdForUpdate(conn: DbConn, id: string): Promise<RewardRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        account_id,
        account_staking_id,
        policy_version_id,
        calc_run_id,
        reward_type,
        reward_date,
        amount_base,
        status,
        source_reference,
        source_ledger_event_id,
        reversal_reward_id,
        available_at,
        confirmed_at,
        reversed_at,
        metadata_json,
        created_at,
        updated_at
       from account_rewards
      where id = ?
      limit 1
      for update`,
    [id]
  );
  const arr = rows as RewardRow[];
  return arr[0] ?? null;
}

export async function getRewardBySourceReference(
  conn: DbConn,
  input: { reward_type: RewardType; source_reference: string }
): Promise<RewardViewRow | null> {
  const [rows] = await conn.query(
    `${baseSelectSql()}
      where r.reward_type = ?
        and r.source_reference = ?
      limit 1`,
    [input.reward_type, input.source_reference]
  );
  const arr = rows as RewardViewRow[];
  return arr[0] ?? null;
}

export async function getReversalRewardByOriginalRewardId(
  conn: DbConn,
  reward_id: string
): Promise<RewardViewRow | null> {
  const [rows] = await conn.query(`${baseSelectSql()} where r.reversal_reward_id = ? and r.reward_type = 'REVERSAL' limit 1`, [
    reward_id
  ]);
  const arr = rows as RewardViewRow[];
  return arr[0] ?? null;
}

export async function listMyRewards(
  conn: DbConn,
  input: {
    account_id: string;
    staking_id?: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    reward_date_from?: string;
    reward_date_to?: string;
    page: number;
    limit: number;
    sort: RewardListSort;
  }
): Promise<{ items: RewardViewRow[]; total: number }> {
  const { whereSql, params } = buildListWhere({
    account_id: input.account_id,
    staking_id: input.staking_id,
    reward_type: input.reward_type,
    status: input.status,
    reward_date_from: input.reward_date_from,
    reward_date_to: input.reward_date_to
  });
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from account_rewards r ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `${baseSelectSql()}
      ${whereSql}
      order by ${toOrderBy(input.sort)}
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as RewardViewRow[], total };
}

export async function listAdminRewards(
  conn: DbConn,
  input: {
    q?: string;
    account_id?: string;
    staking_id?: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    calc_run_id?: string;
    reward_date_from?: string;
    reward_date_to?: string;
    page: number;
    limit: number;
    sort: RewardListSort;
  }
): Promise<{ items: RewardViewRow[]; total: number }> {
  const { whereSql, params } = buildListWhere(input);
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(
    `select count(*) as total
       from account_rewards r
       inner join accounts a on a.id = r.account_id
       ${whereSql}`,
    params
  );
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `${baseSelectSql()}
      ${whereSql}
      order by ${toOrderBy(input.sort)}
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as RewardViewRow[], total };
}

export async function listRewardsByCalcRun(
  conn: DbConn,
  input: {
    calc_run_id: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    page: number;
    limit: number;
    sort: RewardListSort;
  }
): Promise<{ items: RewardViewRow[]; total: number }> {
  return listAdminRewards(conn, {
    calc_run_id: input.calc_run_id,
    reward_type: input.reward_type,
    status: input.status,
    page: input.page,
    limit: input.limit,
    sort: input.sort
  });
}

export async function getMyRewardSummary(
  conn: DbConn,
  input: { account_id: string; now: string }
): Promise<RewardSummaryRow> {
  const [rows] = await conn.query(
    `select
        coalesce(sum(case when r.status = 'PENDING' then r.amount_base else 0 end), 0) as pending_reward_amount_base,
        coalesce(sum(case when r.status = 'CONFIRMED' then r.amount_base else 0 end), 0) as confirmed_reward_amount_base,
        coalesce(sum(case when r.status = 'CONFIRMED' and (r.available_at is null or r.available_at <= ?) then r.amount_base else 0 end), 0) as withdrawable_reward_amount_base,
        '0' as withdrawn_reward_amount_base,
        coalesce(
          sum(
            case
              when r.status = 'CONFIRMED' and r.reward_type = 'DAILY_REWARD' then r.amount_base
              when r.status = 'CONFIRMED' and r.reward_type = 'REVERSAL' and original.reward_type = 'DAILY_REWARD' then r.amount_base
              else 0
            end
          ),
          0
        ) as daily_reward_amount_base,
        cast(count(*) as unsigned) as reward_count
       from account_rewards r
       left join account_rewards original
         on original.id = r.reversal_reward_id
      where r.account_id = ?`,
    [input.now, input.account_id]
  );

  const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
  return {
    pending_reward_amount_base: String(row.pending_reward_amount_base ?? "0"),
    confirmed_reward_amount_base: String(row.confirmed_reward_amount_base ?? "0"),
    withdrawable_reward_amount_base: String(row.withdrawable_reward_amount_base ?? "0"),
    withdrawn_reward_amount_base: String(row.withdrawn_reward_amount_base ?? "0"),
    daily_reward_amount_base: String(row.daily_reward_amount_base ?? "0"),
    reward_count: Number(row.reward_count ?? 0)
  };
}

export async function markRewardReversed(
  conn: DbConn,
  input: { id: string; reversed_at: Date; updated_at: Date }
): Promise<void> {
  await conn.query(
    "update account_rewards set status = 'REVERSED', reversed_at = ?, updated_at = ? where id = ?",
    [normalizeDateTimeInput(input.reversed_at), normalizeDateTimeInput(input.updated_at), input.id]
  );
}
