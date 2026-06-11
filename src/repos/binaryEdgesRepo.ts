import type { DbConn } from "../db/pool.js";

export type BinaryEdgeRow = {
  ancestor_account_id: string;
  descendant_account_id: string;
  depth: number;
  root_leg: "LEFT" | "RIGHT" | null;
  path: string | null;
  created_at: string;
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
