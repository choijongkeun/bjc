import type { DbConn } from "../db/pool.js";

export type BinaryEdgeRow = {
  ancestor_account_id: string;
  descendant_account_id: string;
  depth: number;
  root_leg: "LEFT" | "RIGHT" | null;
  path: string | null;
  created_at: string;
};

export type BinaryDescendantRow = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  referral_code: string | null;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: "LEFT" | "RIGHT" | null;
  joined_at: string | null;
  depth: number;
  root_leg: "LEFT" | "RIGHT" | null;
};

export async function listBinaryAncestorsByDescendant(
  conn: DbConn,
  descendantAccountId: string
): Promise<BinaryEdgeRow[]> {
  const [rows] = await conn.query(
    `select ancestor_account_id, descendant_account_id, depth, root_leg, path, created_at
       from binary_edges
      where descendant_account_id = ?
      order by depth asc, ancestor_account_id asc
      for update`,
    [descendantAccountId]
  );

  return rows as BinaryEdgeRow[];
}

export async function insertBinaryEdges(
  conn: DbConn,
  input: Array<{
    ancestor_account_id: string;
    descendant_account_id: string;
    depth: number;
    root_leg: "LEFT" | "RIGHT" | null;
    path: string | null;
  }>
): Promise<void> {
  if (input.length === 0) return;

  const placeholders = input.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const params = input.flatMap((row) => [
    row.ancestor_account_id,
    row.descendant_account_id,
    row.depth,
    row.root_leg,
    row.path
  ]);

  await conn.query(
    `insert into binary_edges (
        ancestor_account_id,
        descendant_account_id,
        depth,
        root_leg,
        path
      ) values ${placeholders}`,
    params
  );
}

export async function listBinaryDescendants(
  conn: DbConn,
  input: {
    ancestor_account_id: string;
    maxDepth: number;
  }
): Promise<BinaryDescendantRow[]> {
  const [rows] = await conn.query(
    `select
        a.id as account_id,
        a.login_id,
        a.display_name,
        a.referral_code,
        a.sponsor_account_id,
        n.parent_account_id as binary_parent_account_id,
        n.position as binary_position,
        a.joined_at,
        e.depth,
        e.root_leg
       from binary_edges e
       join accounts a
         on a.id = e.descendant_account_id
       join binary_nodes n
         on n.account_id = e.descendant_account_id
      where e.ancestor_account_id = ?
        and e.depth between 1 and ?
      order by e.depth asc, a.joined_at asc, a.created_at asc, a.id asc`,
    [input.ancestor_account_id, input.maxDepth]
  );

  return rows as BinaryDescendantRow[];
}

export async function countBinaryDescendants(
  conn: DbConn,
  input: {
    ancestor_account_id: string;
    maxDepth: number;
  }
): Promise<number> {
  const [rows] = await conn.query(
    `select count(*) as total
       from binary_edges
      where ancestor_account_id = ?
        and depth between 1 and ?`,
    [input.ancestor_account_id, input.maxDepth]
  );
  return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
}

export async function listBinaryDownlinesPage(
  conn: DbConn,
  input: {
    ancestor_account_id: string;
    maxDepth: number;
    limit: number;
    offset: number;
  }
): Promise<BinaryDescendantRow[]> {
  const [rows] = await conn.query(
    `select
        a.id as account_id,
        a.login_id,
        a.display_name,
        a.referral_code,
        a.sponsor_account_id,
        n.parent_account_id as binary_parent_account_id,
        n.position as binary_position,
        a.joined_at,
        e.depth,
        e.root_leg
       from binary_edges e
       join accounts a
         on a.id = e.descendant_account_id
       join binary_nodes n
         on n.account_id = e.descendant_account_id
      where e.ancestor_account_id = ?
        and e.depth between 1 and ?
      order by e.depth asc, a.joined_at asc, a.created_at asc, a.id asc
      limit ? offset ?`,
    [input.ancestor_account_id, input.maxDepth, input.limit, input.offset]
  );

  return rows as BinaryDescendantRow[];
}
