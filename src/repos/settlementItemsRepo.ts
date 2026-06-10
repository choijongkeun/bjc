import type { DbConn } from "../db/pool.js";

import type { SettlementType } from "../../shared/bjc-types.js";

export async function insertSettlementItem(
  conn: DbConn,
  input: {
    id: string;
    calc_run_id: string;
    settlement_type: SettlementType;
    account_id: string;
    ledger_event_id?: string | null;
    amount_base: string;
    decimals: number;
    symbol: string;
    reference_id?: string | null;
    meta: object;
  }
): Promise<void> {
  await conn.query(
    "insert into settlement_items (id, calc_run_id, settlement_type, account_id, ledger_event_id, amount_base, decimals, symbol, reference_id, meta) values (?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json))",
    [
      input.id,
      input.calc_run_id,
      input.settlement_type,
      input.account_id,
      input.ledger_event_id ?? null,
      input.amount_base,
      input.decimals,
      input.symbol,
      input.reference_id ?? null,
      JSON.stringify(input.meta ?? {})
    ]
  );
}

export async function updateSettlementItemAmount(
  conn: DbConn,
  input: { id: string; amount_base: string; meta?: object }
): Promise<void> {
  await conn.query(
    "update settlement_items set amount_base = ?, meta = coalesce(cast(? as json), meta) where id = ?",
    [input.amount_base, input.meta ? JSON.stringify(input.meta) : null, input.id]
  );
}

export async function deleteSettlementItem(conn: DbConn, id: string): Promise<void> {
  await conn.query("delete from settlement_items where id = ?", [id]);
}

export type SettlementItemRow = {
  id: string;
  calc_run_id: string;
  settlement_type: SettlementType;
  account_id: string;
  ledger_event_id: string | null;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string | null;
  meta: unknown;
  created_at: string;
};

export async function listSettlementItems(
  conn: DbConn,
  input: {
    calc_run_id?: string;
    account_id?: string;
    settlement_type?: SettlementType;
    page: number;
    limit: number;
  }
): Promise<{ items: SettlementItemRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.calc_run_id) {
    where.push("calc_run_id = ?");
    params.push(input.calc_run_id);
  }
  if (input.account_id) {
    where.push("account_id = ?");
    params.push(input.account_id);
  }
  if (input.settlement_type) {
    where.push("settlement_type = ?");
    params.push(input.settlement_type);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from settlement_items ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `select id, calc_run_id, settlement_type, account_id, ledger_event_id, amount_base, decimals, symbol, reference_id, meta, created_at
       from settlement_items
       ${whereSql}
      order by created_at desc, id desc
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as SettlementItemRow[], total };
}
