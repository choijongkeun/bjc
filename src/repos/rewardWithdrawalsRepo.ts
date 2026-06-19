import type { DbConn } from "../db/pool.js";

import type { WithdrawalFeeMode } from "../../shared/bjc-types.js";
import type { WithdrawalType } from "../domain/rewardBucket.js";
import type { RewardWithdrawalStatus } from "../domain/withdrawalStatus.js";

export type RewardWithdrawalSort =
  | "requested_at_desc"
  | "requested_at_asc"
  | "created_at_desc"
  | "created_at_asc"
  | "completed_at_desc"
  | "completed_at_asc";

export type RewardWithdrawalRow = {
  id: string;
  account_id: string;
  fee_policy_version_id: string;
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  fee_amount_base: string;
  net_amount_base: string;
  fee_mode_snapshot: WithdrawalFeeMode;
  status: RewardWithdrawalStatus;
  idempotency_key: string;
  wallet_address: string | null;
  network: string | null;
  tx_hash: string | null;
  requested_kst_date: string;
  requested_at: string;
  processing_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  reject_reason: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type RewardWithdrawalViewRow = RewardWithdrawalRow & {
  account_login_id: string | null;
  account_display_name: string | null;
  account_role: string | null;
  account_status: string | null;
};

export type RewardWithdrawalSummaryRow = {
  requested_amount_base: string;
  approved_amount_base: string;
  processing_amount_base: string;
  completed_amount_base: string;
  rejected_amount_base: string;
  failed_amount_base: string;
  cancelled_amount_base: string;
  fee_amount_base: string;
  net_completed_amount_base: string;
  requested_count: string;
  completed_count: string;
};

export type LedgerProductContextRow = {
  product_id: string;
  symbol: string;
  decimals: number;
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

function baseSelectSql(): string {
  return `select
      w.id,
      w.account_id,
      w.fee_policy_version_id,
      w.withdrawal_type,
      w.requested_amount_base,
      w.fee_amount_base,
      w.net_amount_base,
      w.fee_mode_snapshot,
      w.status,
      w.idempotency_key,
      w.wallet_address,
      w.network,
      w.tx_hash,
      w.requested_kst_date,
      w.requested_at,
      w.processing_at,
      w.approved_at,
      w.rejected_at,
      w.completed_at,
      w.failed_at,
      w.cancelled_at,
      w.reject_reason,
      w.failure_reason,
      w.created_at,
      w.updated_at,
      a.login_id as account_login_id,
      a.display_name as account_display_name,
      a.role as account_role,
      a.status as account_status
     from reward_withdrawals w
     inner join accounts a
       on a.id = w.account_id`;
}

function toOrderBy(sort: RewardWithdrawalSort): string {
  switch (sort) {
    case "requested_at_asc":
      return "w.requested_at asc, w.id asc";
    case "created_at_desc":
      return "w.created_at desc, w.id desc";
    case "created_at_asc":
      return "w.created_at asc, w.id asc";
    case "completed_at_desc":
      return "w.completed_at desc, w.id desc";
    case "completed_at_asc":
      return "w.completed_at asc, w.id asc";
    case "requested_at_desc":
    default:
      return "w.requested_at desc, w.id desc";
  }
}

function buildWhere(input: {
  account_id?: string;
  q?: string;
  withdrawal_type?: WithdrawalType;
  status?: RewardWithdrawalStatus;
  network?: string;
  requested_from?: string;
  requested_to?: string;
  completed_from?: string;
  completed_to?: string;
}): { whereSql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.account_id) {
    where.push("w.account_id = ?");
    params.push(input.account_id);
  }
  if (input.q) {
    const q = `%${input.q}%`;
    where.push("(a.login_id like ? or a.display_name like ? or w.id like ? or coalesce(w.tx_hash, '') like ?)");
    params.push(q, q, q, q);
  }
  if (input.withdrawal_type) {
    where.push("w.withdrawal_type = ?");
    params.push(input.withdrawal_type);
  }
  if (input.status) {
    where.push("w.status = ?");
    params.push(input.status);
  }
  if (input.network) {
    where.push("w.network = ?");
    params.push(input.network);
  }
  if (input.requested_from) {
    where.push("w.requested_at >= ?");
    params.push(input.requested_from);
  }
  if (input.requested_to) {
    where.push("w.requested_at <= ?");
    params.push(input.requested_to);
  }
  if (input.completed_from) {
    where.push("w.completed_at >= ?");
    params.push(input.completed_from);
  }
  if (input.completed_to) {
    where.push("w.completed_at <= ?");
    params.push(input.completed_to);
  }

  return {
    whereSql: where.length ? `where ${where.join(" and ")}` : "",
    params
  };
}

export async function insertWithdrawal(
  conn: DbConn,
  input: {
    id: string;
    account_id: string;
    fee_policy_version_id: string;
    withdrawal_type: WithdrawalType;
    requested_amount_base: string;
    fee_amount_base: string;
    net_amount_base: string;
    fee_mode_snapshot: WithdrawalFeeMode;
    status: RewardWithdrawalStatus;
    idempotency_key: string;
    wallet_address?: string | null;
    network?: string | null;
    tx_hash?: string | null;
    requested_kst_date: string;
    requested_at: Date | string;
    processing_at?: Date | string | null;
    approved_at?: Date | string | null;
    rejected_at?: Date | string | null;
    completed_at?: Date | string | null;
    failed_at?: Date | string | null;
    cancelled_at?: Date | string | null;
    reject_reason?: string | null;
    failure_reason?: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }
): Promise<void> {
  await conn.query(
    `insert into reward_withdrawals (
        id,
        account_id,
        fee_policy_version_id,
        withdrawal_type,
        requested_amount_base,
        fee_amount_base,
        net_amount_base,
        fee_mode_snapshot,
        status,
        idempotency_key,
        wallet_address,
        network,
        tx_hash,
        requested_kst_date,
        requested_at,
        processing_at,
        approved_at,
        rejected_at,
        completed_at,
        failed_at,
        cancelled_at,
        reject_reason,
        failure_reason,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.account_id,
      input.fee_policy_version_id,
      input.withdrawal_type,
      input.requested_amount_base,
      input.fee_amount_base,
      input.net_amount_base,
      input.fee_mode_snapshot,
      input.status,
      input.idempotency_key,
      input.wallet_address ?? null,
      input.network ?? null,
      input.tx_hash ?? null,
      input.requested_kst_date,
      normalizeDateTimeInput(input.requested_at),
      normalizeDateTimeInput(input.processing_at),
      normalizeDateTimeInput(input.approved_at),
      normalizeDateTimeInput(input.rejected_at),
      normalizeDateTimeInput(input.completed_at),
      normalizeDateTimeInput(input.failed_at),
      normalizeDateTimeInput(input.cancelled_at),
      input.reject_reason ?? null,
      input.failure_reason ?? null,
      normalizeDateTimeInput(input.created_at),
      normalizeDateTimeInput(input.updated_at)
    ]
  );
}

export async function getWithdrawalById(conn: DbConn, id: string): Promise<RewardWithdrawalViewRow | null> {
  const [rows] = await conn.query(`${baseSelectSql()} where w.id = ? limit 1`, [id]);
  const arr = rows as RewardWithdrawalViewRow[];
  return arr[0] ?? null;
}

export async function getWithdrawalByIdForUpdate(conn: DbConn, id: string): Promise<RewardWithdrawalRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        account_id,
        fee_policy_version_id,
        withdrawal_type,
        requested_amount_base,
        fee_amount_base,
        net_amount_base,
        fee_mode_snapshot,
        status,
        idempotency_key,
        wallet_address,
        network,
        tx_hash,
        requested_kst_date,
        date_format(requested_at, '%Y-%m-%d %H:%i:%s.%f') as requested_at,
        date_format(processing_at, '%Y-%m-%d %H:%i:%s.%f') as processing_at,
        date_format(approved_at, '%Y-%m-%d %H:%i:%s.%f') as approved_at,
        date_format(rejected_at, '%Y-%m-%d %H:%i:%s.%f') as rejected_at,
        date_format(completed_at, '%Y-%m-%d %H:%i:%s.%f') as completed_at,
        date_format(failed_at, '%Y-%m-%d %H:%i:%s.%f') as failed_at,
        date_format(cancelled_at, '%Y-%m-%d %H:%i:%s.%f') as cancelled_at,
        reject_reason,
        failure_reason,
        date_format(created_at, '%Y-%m-%d %H:%i:%s.%f') as created_at,
        date_format(updated_at, '%Y-%m-%d %H:%i:%s.%f') as updated_at
       from reward_withdrawals
      where id = ?
      limit 1
      for update`,
    [id]
  );
  const arr = rows as RewardWithdrawalRow[];
  return arr[0] ?? null;
}

export async function findByAccountIdempotencyKey(
  conn: DbConn,
  input: { account_id: string; idempotency_key: string }
): Promise<RewardWithdrawalViewRow | null> {
  const [rows] = await conn.query(
    `${baseSelectSql()}
      where w.account_id = ?
        and w.idempotency_key = ?
      limit 1`,
    [input.account_id, input.idempotency_key]
  );
  const arr = rows as RewardWithdrawalViewRow[];
  return arr[0] ?? null;
}

export async function listMyWithdrawals(
  conn: DbConn,
  input: {
    account_id: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    requested_from?: string;
    requested_to?: string;
    page: number;
    limit: number;
    sort: RewardWithdrawalSort;
  }
): Promise<RewardWithdrawalViewRow[]> {
  const { whereSql, params } = buildWhere({
    account_id: input.account_id,
    withdrawal_type: input.withdrawal_type,
    status: input.status,
    requested_from: input.requested_from,
    requested_to: input.requested_to
  });
  const offset = (input.page - 1) * input.limit;
  const [rows] = await conn.query(
    `${baseSelectSql()}
      ${whereSql}
      order by ${toOrderBy(input.sort)}
      limit ? offset ?`,
    [...params, input.limit, offset]
  );
  return rows as RewardWithdrawalViewRow[];
}

export async function countMyWithdrawals(
  conn: DbConn,
  input: {
    account_id: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    requested_from?: string;
    requested_to?: string;
  }
): Promise<number> {
  const { whereSql, params } = buildWhere(input);
  const [rows] = await conn.query(`select count(*) as total from reward_withdrawals w ${whereSql}`, params);
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
}

export async function listAdminWithdrawals(
  conn: DbConn,
  input: {
    q?: string;
    account_id?: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    network?: string;
    requested_from?: string;
    requested_to?: string;
    completed_from?: string;
    completed_to?: string;
    page: number;
    limit: number;
    sort: RewardWithdrawalSort;
  }
): Promise<RewardWithdrawalViewRow[]> {
  const { whereSql, params } = buildWhere(input);
  const offset = (input.page - 1) * input.limit;
  const [rows] = await conn.query(
    `${baseSelectSql()}
      ${whereSql}
      order by ${toOrderBy(input.sort)}
      limit ? offset ?`,
    [...params, input.limit, offset]
  );
  return rows as RewardWithdrawalViewRow[];
}

export async function countAdminWithdrawals(
  conn: DbConn,
  input: {
    q?: string;
    account_id?: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    network?: string;
    requested_from?: string;
    requested_to?: string;
    completed_from?: string;
    completed_to?: string;
  }
): Promise<number> {
  const { whereSql, params } = buildWhere(input);
  const [rows] = await conn.query(
    `select count(*) as total
       from reward_withdrawals w
       inner join accounts a on a.id = w.account_id
       ${whereSql}`,
    params
  );
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
}

export async function updateStatusAndTimestamps(
  conn: DbConn,
  input: {
    id: string;
    status: RewardWithdrawalStatus;
    updated_at: Date | string;
    approved_at?: Date | string | null;
    processing_at?: Date | string | null;
    rejected_at?: Date | string | null;
    completed_at?: Date | string | null;
    failed_at?: Date | string | null;
    cancelled_at?: Date | string | null;
    reject_reason?: string | null;
    failure_reason?: string | null;
    network?: string | null;
    tx_hash?: string | null;
  }
): Promise<void> {
  await conn.query(
    `update reward_withdrawals
        set status = ?,
            approved_at = ?,
            processing_at = ?,
            rejected_at = ?,
            completed_at = ?,
            failed_at = ?,
            cancelled_at = ?,
            reject_reason = ?,
            failure_reason = ?,
            network = ?,
            tx_hash = ?,
            updated_at = ?
      where id = ?`,
    [
      input.status,
      normalizeDateTimeInput(input.approved_at),
      normalizeDateTimeInput(input.processing_at),
      normalizeDateTimeInput(input.rejected_at),
      normalizeDateTimeInput(input.completed_at),
      normalizeDateTimeInput(input.failed_at),
      normalizeDateTimeInput(input.cancelled_at),
      input.reject_reason ?? null,
      input.failure_reason ?? null,
      input.network ?? null,
      input.tx_hash ?? null,
      normalizeDateTimeInput(input.updated_at),
      input.id
    ]
  );
}

export async function getSummary(
  conn: DbConn,
  input: {
    date_from?: string;
    date_to?: string;
    withdrawal_type?: WithdrawalType;
    network?: string;
  }
): Promise<RewardWithdrawalSummaryRow> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.date_from) {
    where.push("requested_at >= ?");
    params.push(input.date_from);
  }
  if (input.date_to) {
    where.push("requested_at <= ?");
    params.push(input.date_to);
  }
  if (input.withdrawal_type) {
    where.push("withdrawal_type = ?");
    params.push(input.withdrawal_type);
  }
  if (input.network) {
    where.push("network = ?");
    params.push(input.network);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const [rows] = await conn.query(
    `select
        cast(coalesce(sum(case when status = 'REQUESTED' then requested_amount_base else 0 end), 0) as char) as requested_amount_base,
        cast(coalesce(sum(case when status = 'APPROVED' then requested_amount_base else 0 end), 0) as char) as approved_amount_base,
        cast(coalesce(sum(case when status = 'PROCESSING' then requested_amount_base else 0 end), 0) as char) as processing_amount_base,
        cast(coalesce(sum(case when status = 'COMPLETED' then requested_amount_base else 0 end), 0) as char) as completed_amount_base,
        cast(coalesce(sum(case when status = 'REJECTED' then requested_amount_base else 0 end), 0) as char) as rejected_amount_base,
        cast(coalesce(sum(case when status = 'FAILED' then requested_amount_base else 0 end), 0) as char) as failed_amount_base,
        cast(coalesce(sum(case when status = 'CANCELLED' then requested_amount_base else 0 end), 0) as char) as cancelled_amount_base,
        cast(coalesce(sum(fee_amount_base), 0) as char) as fee_amount_base,
        cast(coalesce(sum(case when status = 'COMPLETED' then net_amount_base else 0 end), 0) as char) as net_completed_amount_base,
        cast(count(*) as char) as requested_count,
        cast(coalesce(sum(case when status = 'COMPLETED' then 1 else 0 end), 0) as char) as completed_count
       from reward_withdrawals
       ${whereSql}`,
    params
  );
  const row = (rows as RewardWithdrawalSummaryRow[])[0];
  return {
    requested_amount_base: row?.requested_amount_base ?? "0",
    approved_amount_base: row?.approved_amount_base ?? "0",
    processing_amount_base: row?.processing_amount_base ?? "0",
    completed_amount_base: row?.completed_amount_base ?? "0",
    rejected_amount_base: row?.rejected_amount_base ?? "0",
    failed_amount_base: row?.failed_amount_base ?? "0",
    cancelled_amount_base: row?.cancelled_amount_base ?? "0",
    fee_amount_base: row?.fee_amount_base ?? "0",
    net_completed_amount_base: row?.net_completed_amount_base ?? "0",
    requested_count: row?.requested_count ?? "0",
    completed_count: row?.completed_count ?? "0"
  };
}

export async function getLedgerProductContextByPolicyVersion(
  conn: DbConn,
  policy_version_id: string
): Promise<LedgerProductContextRow | null> {
  const [rows] = await conn.query(
    `select
        id as product_id,
        symbol,
        decimals
       from staking_products
      where policy_version_id = ?
      order by is_active desc, id asc
      limit 1`,
    [policy_version_id]
  );
  const arr = rows as LedgerProductContextRow[];
  return arr[0] ?? null;
}
