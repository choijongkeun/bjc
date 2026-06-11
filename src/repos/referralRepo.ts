import type { DbConn } from "../db/pool.js";

import { newId } from "../util/ids.js";

export type ReferralAncestorRow = {
  parent_account_id: string;
  child_account_id: string;
  depth: number;
  path: string | null;
};

export type ReferralDescendantRow = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  referral_code: string | null;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: "LEFT" | "RIGHT" | null;
  joined_at: string | null;
  depth: number;
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

export async function listReferralDescendants(
  conn: DbConn,
  input: {
    parent_account_id: string;
    maxDepth: number;
  }
): Promise<ReferralDescendantRow[]> {
  const [rows] = await conn.query(
    `select
        a.id as account_id,
        a.login_id,
        a.display_name,
        a.referral_code,
        a.sponsor_account_id,
        a.binary_parent_account_id,
        a.binary_position,
        a.joined_at,
        e.depth
       from referral_edges e
       join accounts a
         on a.id = e.child_account_id
      where e.parent_account_id = ?
        and e.depth between 1 and ?
      order by e.depth asc, a.joined_at asc, a.created_at asc, a.id asc`,
    [input.parent_account_id, input.maxDepth]
  );

  return rows as ReferralDescendantRow[];
}

export async function countReferralDescendants(
  conn: DbConn,
  input: {
    parent_account_id: string;
    maxDepth: number;
  }
): Promise<number> {
  const [rows] = await conn.query(
    `select count(*) as total
       from referral_edges
      where parent_account_id = ?
        and depth between 1 and ?`,
    [input.parent_account_id, input.maxDepth]
  );
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
}

export async function listReferralDownlinesPage(
  conn: DbConn,
  input: {
    parent_account_id: string;
    maxDepth: number;
    limit: number;
    offset: number;
  }
): Promise<ReferralDescendantRow[]> {
  const [rows] = await conn.query(
    `select
        a.id as account_id,
        a.login_id,
        a.display_name,
        a.referral_code,
        a.sponsor_account_id,
        a.binary_parent_account_id,
        a.binary_position,
        a.joined_at,
        e.depth
       from referral_edges e
       join accounts a
         on a.id = e.child_account_id
      where e.parent_account_id = ?
        and e.depth between 1 and ?
      order by e.depth asc, a.joined_at asc, a.created_at asc, a.id asc
      limit ? offset ?`,
    [input.parent_account_id, input.maxDepth, input.limit, input.offset]
  );

  return rows as ReferralDescendantRow[];
}
