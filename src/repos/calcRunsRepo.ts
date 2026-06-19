import type { DbConn } from "../db/pool.js";

import type { CalcRunStatus } from "../domain/calcRunStatus.js";

export type CalcRunRow = {
  id: string;
  policy_version_id: string;
  run_type: string;
  run_date: string;
  status: CalcRunStatus;
  started_at: string | null;
  finished_at: string | null;
  finalized_at: string | null;
  created_by?: string | null;
  created_at?: string;
  error_message?: string | null;
};

export async function insertCalcRun(
  conn: DbConn,
  input: {
    id: string;
    policy_version_id: string;
    run_type: string;
    run_date: string;
    status: CalcRunStatus;
    created_by: string;
  }
): Promise<string> {
  await conn.query(
    "insert into calc_runs (id, policy_version_id, run_type, run_date, status, created_by) values (?, ?, ?, ?, ?, ?)",
    [
      input.id,
      input.policy_version_id,
      input.run_type,
      input.run_date,
      input.status,
      input.created_by
    ]
  );
  return input.id;
}

export async function getCalcRunForUpdate(conn: DbConn, id: string): Promise<CalcRunRow | null> {
  const [rows] = await conn.query(
    "select id, policy_version_id, run_type, run_date, status, started_at, finished_at, finalized_at from calc_runs where id = ? for update",
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as CalcRunRow;
}

export async function getCalcRunById(conn: DbConn, id: string): Promise<CalcRunRow | null> {
  const [rows] = await conn.query(
    "select id, policy_version_id, run_type, run_date, status, started_at, finished_at, finalized_at, created_by, created_at, error_message from calc_runs where id = ? limit 1",
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as CalcRunRow;
}

export async function getCalcRunByPolicyRunTypeDate(
  conn: DbConn,
  input: { policy_version_id: string; run_type: string; run_date: string }
): Promise<CalcRunRow | null> {
  const [rows] = await conn.query(
    `select id, policy_version_id, run_type, run_date, status, started_at, finished_at, finalized_at, created_by, created_at, error_message
       from calc_runs
      where policy_version_id = ?
        and run_type = ?
        and run_date = ?
      limit 1`,
    [input.policy_version_id, input.run_type, input.run_date]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as CalcRunRow;
}

export async function updateCalcRunStatus(
  conn: DbConn,
  input: {
    id: string;
    status: CalcRunStatus;
    started_at?: string | null;
    finished_at?: string | null;
    finalized_at?: string | null;
    error_message?: string | null;
  }
): Promise<void> {
  const hasErrorMessage = Object.prototype.hasOwnProperty.call(input, "error_message");
  await conn.query(
    `update calc_runs
        set status = ?,
            started_at = coalesce(?, started_at),
            finished_at = coalesce(?, finished_at),
            finalized_at = coalesce(?, finalized_at),
            error_message = case when ? = 1 then ? else error_message end
      where id = ?`,
    [
      input.status,
      input.started_at ?? null,
      input.finished_at ?? null,
      input.finalized_at ?? null,
      hasErrorMessage ? 1 : 0,
      input.error_message ?? null,
      input.id
    ]
  );
}

export async function listCalcRuns(
  conn: DbConn,
  input: {
    policy_version_id?: string;
    run_type?: string;
    status?: CalcRunStatus;
    run_date_from?: string;
    run_date_to?: string;
    page: number;
    limit: number;
  }
): Promise<{ items: CalcRunRow[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (input.policy_version_id) {
    where.push("policy_version_id = ?");
    params.push(input.policy_version_id);
  }
  if (input.run_type) {
    where.push("run_type = ?");
    params.push(input.run_type);
  }
  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.run_date_from) {
    where.push("run_date >= ?");
    params.push(input.run_date_from);
  }
  if (input.run_date_to) {
    where.push("run_date <= ?");
    params.push(input.run_date_to);
  }

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const offset = (input.page - 1) * input.limit;

  const [countRows] = await conn.query(`select count(*) as total from calc_runs ${whereSql}`, params);
  const total = Number((countRows as Array<{ total: number | string }>)[0]?.total ?? 0);

  const [rows] = await conn.query(
    `select id, policy_version_id, run_type, run_date, status, started_at, finished_at, finalized_at, created_by, created_at, error_message
       from calc_runs
       ${whereSql}
      order by run_date desc, created_at desc, id desc
      limit ? offset ?`,
    [...params, input.limit, offset]
  );

  return {
    items: rows as CalcRunRow[],
    total
  };
}
