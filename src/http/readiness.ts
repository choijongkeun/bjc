import type { Pool } from "mysql2/promise";

type ReadyOptions = {
  service: string;
  environment: string;
  build_commit?: string;
};

const REQUIRED_TABLES = [
  "accounts",
  "policy_versions",
  "account_stakings",
  "account_rewards",
  "reward_withdrawals",
  "calc_runs",
  "ledger_events",
] as const;

export type ReadyPayload = {
  ok: boolean;
  service: string;
  environment: string;
  database: "ready";
  build_commit?: string;
};

export async function checkReadiness(pool: Pool, options: ReadyOptions): Promise<ReadyPayload> {
  const conn = await pool.getConnection();
  try {
    await conn.query("select 1");
    const [rows] = await conn.query(
      `select table_name
         from information_schema.tables
        where table_schema = database()
          and table_name in (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
      [...REQUIRED_TABLES]
    );
    const existing = new Set(
      (rows as Array<{ table_name?: string; TABLE_NAME?: string }>)
        .map((row) => row.table_name ?? row.TABLE_NAME)
        .filter((tableName): tableName is string => Boolean(tableName))
    );
    const missing = REQUIRED_TABLES.filter((table) => !existing.has(table));
    if (missing.length > 0) {
      throw new Error(`required tables missing: ${missing.join(",")}`);
    }
    return {
      ok: true,
      service: options.service,
      environment: options.environment,
      database: "ready",
      ...(options.build_commit ? { build_commit: options.build_commit } : {}),
    };
  } finally {
    conn.release();
  }
}
