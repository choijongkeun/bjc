import type { DbConn } from "../db/pool.js";

export async function insertAuthSession(
  conn: DbConn,
  input: {
    account_id: string;
    session_token_hash: string;
    expires_at: Date;
    last_seen_at: Date;
    user_agent?: string | null;
    ip_address?: string | null;
  }
): Promise<number> {
  const [result] = await conn.query(
    `insert into auth_sessions (
        account_id,
        session_token_hash,
        expires_at,
        revoked_at,
        created_at,
        last_seen_at,
        user_agent,
        ip_address
      ) values (?, ?, ?, null, current_timestamp(6), ?, ?, ?)`,
    [
      input.account_id,
      input.session_token_hash,
      input.expires_at,
      input.last_seen_at,
      input.user_agent ?? null,
      input.ip_address ?? null
    ]
  );

  return Number((result as { insertId: number }).insertId);
}
