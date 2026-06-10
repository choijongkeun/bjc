import type { DbConn } from "../db/pool.js";

export type PolicyVersionStatus = "DRAFT" | "ACTIVE" | "RETIRED";

export type PolicyVersionRow = {
  id: string;
  status: PolicyVersionStatus;
  note: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  retired_at: string | null;
};

export async function insertPolicyVersion(
  conn: DbConn,
  input: {
    id: string;
    status: PolicyVersionStatus;
    note?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    created_by: string;
  }
): Promise<void> {
  await conn.query(
    "insert into policy_versions (id, status, note, effective_from, effective_to, created_by) values (?, ?, ?, ?, ?, ?)",
    [
      input.id,
      input.status,
      input.note ?? null,
      input.effective_from ?? null,
      input.effective_to ?? null,
      input.created_by
    ]
  );
}

export async function getPolicyVersionById(conn: DbConn, id: string): Promise<PolicyVersionRow | null> {
  const [rows] = await conn.query(
    "select id, status, note, effective_from, effective_to, created_by, created_at, activated_at, retired_at from policy_versions where id = ? limit 1",
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as PolicyVersionRow;
}

export async function lockPolicyVersion(conn: DbConn, id: string): Promise<PolicyVersionRow | null> {
  const [rows] = await conn.query(
    "select id, status, note, effective_from, effective_to, created_by, created_at, activated_at, retired_at from policy_versions where id = ? for update",
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as PolicyVersionRow;
}

export async function activatePolicyVersion(conn: DbConn, id: string): Promise<void> {
  await conn.query(
    "update policy_versions set status='ACTIVE', activated_at=current_timestamp where id = ?",
    [id]
  );
}

export async function retirePolicyVersion(conn: DbConn, id: string): Promise<void> {
  await conn.query(
    "update policy_versions set status='RETIRED', retired_at=current_timestamp where id = ?",
    [id]
  );
}

export async function listPolicyVersions(
  conn: DbConn,
  input: {
    status?: PolicyVersionStatus;
    effective_from?: string;
    effective_to?: string;
    page: number;
    limit: number;
  }
): Promise<{ items: PolicyVersionRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.effective_from) {
    where.push("effective_from >= ?");
    params.push(input.effective_from);
  }
  if (input.effective_to) {
    where.push("effective_to <= ?");
    params.push(input.effective_to);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from policy_versions ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `select id, status, note, effective_from, effective_to, created_by, created_at, activated_at, retired_at
       from policy_versions
       ${whereSql}
      order by created_at desc, id desc
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return { items: rows as PolicyVersionRow[], total };
}
