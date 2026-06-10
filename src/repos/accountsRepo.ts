import type { DbConn } from "../db/pool.js";

export type AccountRole = "USER" | "READER" | "ADMIN";

export type AccountRow = {
  id: string;
  display_name: string | null;
  role: AccountRole;
  created_at: string;
};

export async function getAccountById(conn: DbConn, id: string): Promise<AccountRow | null> {
  const [rows] = await conn.query(
    "select id, display_name, role, created_at from accounts where id = ? limit 1",
    [id]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AccountRow;
}

