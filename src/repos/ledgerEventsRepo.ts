import type { DbConn } from "../db/pool.js";

import type { LedgerEventType } from "../../shared/bjc-types.js";

function normalizeEventTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 23).replace("T", " ").replace("Z", "");
}

export type LedgerEventRow = {
  id: string;
  account_id: string;
  product_id: string;
  policy_version_id: string;
  calc_run_id: string | null;
  event_time: string;
  event_type: LedgerEventType;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string;
  related_account_id: string | null;
  meta: unknown;
  created_by: string | null;
  created_at: string;
};

export async function insertLedgerEvent(
  conn: DbConn,
  input: {
    id: string;
    account_id: string;
    product_id: string;
    policy_version_id: string;
    calc_run_id?: string | null;
    event_time: string;
    event_type: LedgerEventType;
    amount_base: string;
    decimals: number;
    symbol: string;
    reference_id: string;
    related_account_id?: string | null;
    meta: object;
    created_by: string;
  }
): Promise<void> {
  await conn.query(
    "insert into ledger_events (id, account_id, product_id, policy_version_id, calc_run_id, event_time, event_type, amount_base, decimals, symbol, reference_id, related_account_id, meta, created_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?)",
    [
      input.id,
      input.account_id,
      input.product_id,
      input.policy_version_id,
      input.calc_run_id ?? null,
      normalizeEventTime(input.event_time),
      input.event_type,
      input.amount_base,
      input.decimals,
      input.symbol,
      input.reference_id,
      input.related_account_id ?? null,
      JSON.stringify(input.meta ?? {}),
      input.created_by
    ]
  );
}

export async function insertLedgerEvents(
  conn: DbConn,
  inputs: Array<{
    id: string;
    account_id: string;
    product_id: string;
    policy_version_id: string;
    calc_run_id?: string | null;
    event_time: string;
    event_type: LedgerEventType;
    amount_base: string;
    decimals: number;
    symbol: string;
    reference_id: string;
    related_account_id?: string | null;
    meta: object;
    created_by: string;
  }>
): Promise<void> {
  for (const input of inputs) {
    await insertLedgerEvent(conn, input);
  }
}

export async function findExistingLedgerEventReferenceIds(conn: DbConn, referenceIds: string[]): Promise<string[]> {
  if (!referenceIds.length) {
    return [];
  }

  const chunkSize = 500;
  const found = new Set<string>();

  for (let i = 0; i < referenceIds.length; i += chunkSize) {
    const chunk = referenceIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(", ");
    const [rows] = await conn.query(
      `select reference_id from ledger_events where reference_id in (${placeholders})`,
      chunk
    );
    for (const row of rows as Array<{ reference_id: string }>) {
      found.add(row.reference_id);
    }
  }

  return Array.from(found);
}

export async function listLedgerEvents(
  conn: DbConn,
  input: {
    account_id?: string;
    product_id?: string;
    policy_version_id?: string;
    calc_run_id?: string;
    event_type?: LedgerEventType;
    reference_id?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }
): Promise<{ items: LedgerEventRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.account_id) {
    where.push("account_id = ?");
    params.push(input.account_id);
  }
  if (input.product_id) {
    where.push("product_id = ?");
    params.push(input.product_id);
  }
  if (input.policy_version_id) {
    where.push("policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (input.calc_run_id) {
    where.push("calc_run_id = ?");
    params.push(input.calc_run_id);
  }
  if (input.event_type) {
    where.push("event_type = ?");
    params.push(input.event_type);
  }
  if (input.reference_id) {
    where.push("reference_id = ?");
    params.push(input.reference_id);
  }
  if (input.from) {
    where.push("event_time >= ?");
    params.push(input.from);
  }
  if (input.to) {
    where.push("event_time <= ?");
    params.push(input.to);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from ledger_events ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `select id, account_id, product_id, policy_version_id, calc_run_id, event_time, event_type, amount_base, decimals, symbol, reference_id, related_account_id, meta, created_by, created_at
       from ledger_events
       ${whereSql}
      order by event_time desc, created_at desc, id desc
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as LedgerEventRow[], total };
}
