import type { DbConn } from "../db/pool.js";

import type { BinaryPosition } from "./accountsRepo.js";

export type BinaryNodeRow = {
  account_id: string;
  parent_account_id: string | null;
  position: BinaryPosition | null;
  root_account_id: string | null;
  created_at: string;
  updated_at: string | null;
};

export type BinaryChildSlotRow = {
  account_id: string;
  position: BinaryPosition | null;
  created_at: string;
};

export async function getBinaryNodeByAccountId(conn: DbConn, accountId: string): Promise<BinaryNodeRow | null> {
  const [rows] = await conn.query(
    `select account_id, parent_account_id, position, root_account_id, created_at, updated_at
       from binary_nodes
      where account_id = ?
      limit 1`,
    [accountId]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as BinaryNodeRow;
}

export async function getBinaryNodeByAccountIdForUpdate(conn: DbConn, accountId: string): Promise<BinaryNodeRow | null> {
  const [rows] = await conn.query(
    `select account_id, parent_account_id, position, root_account_id, created_at, updated_at
       from binary_nodes
      where account_id = ?
      limit 1
      for update`,
    [accountId]
  );
  const arr = rows as any[];
  if (!arr[0]) return null;
  return arr[0] as BinaryNodeRow;
}

export async function listBinarySubtreeCandidatesForPlacement(
  conn: DbConn,
  ancestorAccountId: string
): Promise<Array<BinaryNodeRow & { depth: number }>> {
  const [rows] = await conn.query(
    `select
        n.account_id,
        n.parent_account_id,
        n.position,
        n.root_account_id,
        n.created_at,
        n.updated_at,
        e.depth
       from binary_edges e
       join binary_nodes n
         on n.account_id = e.descendant_account_id
      where e.ancestor_account_id = ?
      order by e.depth asc, n.created_at asc, n.account_id asc
      for update`,
    [ancestorAccountId]
  );

  return rows as Array<BinaryNodeRow & { depth: number }>;
}

export async function listBinaryChildrenForUpdate(conn: DbConn, parentAccountId: string): Promise<BinaryChildSlotRow[]> {
  const [rows] = await conn.query(
    `select account_id, position, created_at
       from binary_nodes
      where parent_account_id = ?
      order by case position when 'LEFT' then 0 when 'RIGHT' then 1 else 2 end, created_at asc, account_id asc
      for update`,
    [parentAccountId]
  );

  return rows as BinaryChildSlotRow[];
}

export async function insertBinaryNode(
  conn: DbConn,
  input: {
    account_id: string;
    parent_account_id: string | null;
    position: BinaryPosition | null;
    root_account_id: string | null;
    updated_at?: Date | null;
  }
): Promise<void> {
  await conn.query(
    `insert into binary_nodes (
        account_id,
        parent_account_id,
        position,
        root_account_id,
        updated_at
      ) values (?, ?, ?, ?, ?)`,
    [
      input.account_id,
      input.parent_account_id,
      input.position,
      input.root_account_id,
      input.updated_at ?? null
    ]
  );
}
