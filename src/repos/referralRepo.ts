import type { DbConn } from "../db/pool.js";

import { newId } from "../util/ids.js";

export type ReferralAncestorRow = {
  parent_account_id: string;
  child_account_id: string;
  depth: number;
  path: string | null;
};

export async function listReferralAncestorsByChild(conn: DbConn, childAccountId: string): Promise<ReferralAncestorRow[]> {
  const [rows] = await conn.query(
    `select parent_account_id, child_account_id, depth, path
       from referral_edges
      where child_account_id = ?
      order by depth asc, parent_account_id asc
      for update`,
    [childAccountId]
  );

  return rows as ReferralAncestorRow[];
}

export async function insertReferralEdges(
  conn: DbConn,
  input: Array<{
    id?: string;
    parent_account_id: string;
    child_account_id: string;
    depth: number;
    path: string | null;
  }>
): Promise<void> {
  if (input.length === 0) return;

  const placeholders = input.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const params = input.flatMap((row) => [
    row.id ?? newId(),
    row.parent_account_id,
    row.child_account_id,
    row.depth,
    row.path
  ]);

  await conn.query(
    `insert into referral_edges (
        id,
        parent_account_id,
        child_account_id,
        depth,
        path
      ) values ${placeholders}`,
    params
  );
}
