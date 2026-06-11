import type { DbConn } from "../db/pool.js";
import type { BinaryPosition } from "../repos/accountsRepo.js";

import { conflictError } from "../domain/errors.js";
import { insertBinaryEdges, listBinaryAncestorsByDescendant } from "../repos/binaryEdgesRepo.js";
import {
  getBinaryNodeByAccountIdForUpdate,
  insertBinaryNode,
  listBinaryChildrenForUpdate,
  listBinarySubtreeCandidatesForPlacement,
  type BinaryNodeRow
} from "../repos/binaryNodesRepo.js";

export type PlacementCandidate = Pick<BinaryNodeRow, "account_id" | "root_account_id" | "created_at"> & {
  depth: number;
};

export type BinaryPlacementResult = {
  parent_account_id: string;
  position: BinaryPosition;
  root_account_id: string;
};

export function pickAvailablePosition(
  preferredPosition: BinaryPosition | null | undefined,
  occupiedPositions: Array<BinaryPosition | null>,
  isSponsorCandidate: boolean
): BinaryPosition | null {
  const occupied = new Set(occupiedPositions.filter((value): value is BinaryPosition => value === "LEFT" || value === "RIGHT"));
  const order: BinaryPosition[] =
    isSponsorCandidate && preferredPosition ? [preferredPosition, preferredPosition === "LEFT" ? "RIGHT" : "LEFT"] : ["LEFT", "RIGHT"];

  for (const position of order) {
    if (!occupied.has(position)) return position;
  }

  return null;
}

export async function ensureBinaryRootForAccount(conn: DbConn, accountId: string): Promise<BinaryNodeRow> {
  const existing = await getBinaryNodeByAccountIdForUpdate(conn, accountId);
  if (existing) {
    const ancestors = await listBinaryAncestorsByDescendant(conn, accountId);
    if (ancestors.length === 0) {
      await insertBinaryEdges(conn, [
        {
          ancestor_account_id: accountId,
          descendant_account_id: accountId,
          depth: 0,
          root_leg: null,
          path: `/${accountId}/`
        }
      ]);
    }
    return existing;
  }

  await insertBinaryNode(conn, {
    account_id: accountId,
    parent_account_id: null,
    position: null,
    root_account_id: accountId,
    updated_at: new Date()
  });
  await insertBinaryEdges(conn, [
    {
      ancestor_account_id: accountId,
      descendant_account_id: accountId,
      depth: 0,
      root_leg: null,
      path: `/${accountId}/`
    }
  ]);

  const created = await getBinaryNodeByAccountIdForUpdate(conn, accountId);
  if (!created) {
    throw conflictError("failed to initialize binary root", { account_id: accountId });
  }

  return created;
}

export async function findBinaryPlacement(
  conn: DbConn,
  input: {
    sponsor_account_id: string;
    preferred_binary_position?: BinaryPosition | null;
  }
): Promise<BinaryPlacementResult> {
  const sponsorNode = await ensureBinaryRootForAccount(conn, input.sponsor_account_id);
  const candidates = await listBinarySubtreeCandidatesForPlacement(conn, input.sponsor_account_id);

  if (candidates.length === 0) {
    throw conflictError("binary placement candidates not found", { sponsor_account_id: input.sponsor_account_id });
  }

  for (const candidate of candidates) {
    const children = await listBinaryChildrenForUpdate(conn, candidate.account_id);
    const available = pickAvailablePosition(
      input.preferred_binary_position,
      children.map((child) => child.position),
      candidate.account_id === input.sponsor_account_id
    );

    if (available) {
      return {
        parent_account_id: candidate.account_id,
        position: available,
        root_account_id: candidate.root_account_id ?? sponsorNode.root_account_id ?? input.sponsor_account_id
      };
    }
  }

  throw conflictError("no binary placement slot available", { sponsor_account_id: input.sponsor_account_id });
}

export async function getBinaryAncestorRowsForPlacement(conn: DbConn, parentAccountId: string) {
  return listBinaryAncestorsByDescendant(conn, parentAccountId);
}
