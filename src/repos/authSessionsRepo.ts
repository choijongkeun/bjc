import type { DbConn } from "../db/pool.js";

export type AuthSessionRow = {
  id: number;
  account_id: string;
  session_token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  user_agent: string | null;
  ip_address: string | null;
};

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

export async function findActiveSessionByTokenHash(
  conn: DbConn,
  sessionTokenHash: string
): Promise<AuthSessionRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        account_id,
        session_token_hash,
        expires_at,
        revoked_at,
        created_at,
        last_seen_at,
        user_agent,
        ip_address
       from auth_sessions
      where session_token_hash = ?
        and revoked_at is null
        and expires_at > current_timestamp(6)
      limit 1`,
    [sessionTokenHash]
  );

  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AuthSessionRow;
}

export async function findActiveSessionByTokenHashForUpdate(
  conn: DbConn,
  sessionTokenHash: string
): Promise<AuthSessionRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        account_id,
        session_token_hash,
        expires_at,
        revoked_at,
        created_at,
        last_seen_at,
        user_agent,
        ip_address
       from auth_sessions
      where session_token_hash = ?
        and revoked_at is null
        and expires_at > current_timestamp(6)
      limit 1
      for update`,
    [sessionTokenHash]
  );

  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as AuthSessionRow;
}

export async function revokeSessionByTokenHash(
  conn: DbConn,
  input: { session_token_hash: string; revoked_at: Date }
): Promise<boolean> {
  const [result] = await conn.query(
    `update auth_sessions
        set revoked_at = ?
      where session_token_hash = ?
        and revoked_at is null
        and expires_at > current_timestamp(6)`,
    [input.revoked_at, input.session_token_hash]
  );

  return Number((result as { affectedRows: number }).affectedRows ?? 0) > 0;
}
