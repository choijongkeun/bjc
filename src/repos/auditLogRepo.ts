import type { DbConn } from "../db/pool.js";

import { newId } from "../util/ids.js";

export async function insertAdminAuditLog(
  conn: DbConn,
  input: {
    id?: string;
    actor_account_id: string;
    action: string;
    target_table?: string | null;
    target_id?: string | null;
    meta: object;
  }
): Promise<void> {
  const id = input.id ?? newId();
  await conn.query(
    "insert into admin_audit_log (id, actor_account_id, action, target_table, target_id, meta) values (?, ?, ?, ?, ?, cast(? as json))",
    [
      id,
      input.actor_account_id,
      input.action,
      input.target_table ?? null,
      input.target_id ?? null,
      JSON.stringify(input.meta ?? {})
    ]
  );
}

export type AdminAuditLogRow = {
  id: string;
  actor_account_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  meta: unknown;
  created_at: string;
};

export async function listAdminAuditLogs(
  conn: DbConn,
  input: {
    actor_account_id?: string;
    action?: string;
    target_table?: string;
    target_id?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }
): Promise<{ items: AdminAuditLogRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.actor_account_id) {
    where.push("actor_account_id = ?");
    params.push(input.actor_account_id);
  }
  if (input.action) {
    where.push("action = ?");
    params.push(input.action);
  }
  if (input.target_table) {
    where.push("target_table = ?");
    params.push(input.target_table);
  }
  if (input.target_id) {
    where.push("target_id = ?");
    params.push(input.target_id);
  }
  if (input.from) {
    where.push("created_at >= ?");
    params.push(input.from);
  }
  if (input.to) {
    where.push("created_at <= ?");
    params.push(input.to);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from admin_audit_log ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `select id, actor_account_id, action, target_table, target_id, meta, created_at
       from admin_audit_log
       ${whereSql}
      order by created_at desc, id desc
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as AdminAuditLogRow[], total };
}
