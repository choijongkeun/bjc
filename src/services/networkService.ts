import type { DbConn, DbPool } from "../db/pool.js";

import { notFound } from "../domain/errors.js";
import {
  getAccountNetworkById,
  type AccountNetworkRow,
  type BinaryPosition
} from "../repos/accountsRepo.js";
import {
  countBinaryDescendants,
  listBinaryDescendants,
  listBinaryDownlinesPage,
  type BinaryDescendantRow
} from "../repos/binaryEdgesRepo.js";
import {
  countReferralDescendants,
  listReferralDescendants,
  listReferralDownlinesPage,
  type ReferralDescendantRow
} from "../repos/referralRepo.js";

export type ReferralTreeNode = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  referral_code: string | null;
  sponsor_account_id: string | null;
  depth: number;
  rank_level: number;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  children: ReferralTreeNode[];
};

export type BinaryTreeNode = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  depth: number;
  root_leg: "LEFT" | "RIGHT" | null;
  total_stake_amount_base: string;
  total_sales_amount_base: string;
  total_reward_amount_base: string;
  rank_level: number;
  children: BinaryTreeNode[];
};

export type BinaryLegSummary = {
  member_count: number;
  total_stake_amount_base: string;
  total_sales_amount_base: string;
  total_reward_amount_base: string;
};

export type DownlineItem = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  depth: number;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  root_leg: "LEFT" | "RIGHT" | null;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  rank_level: number;
  joined_at: string | null;
};

const ZERO = "0";
const FULL_TREE_DEPTH = 2147483647;

function compareAmountBase(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function toReferralRootNode(account: AccountNetworkRow): ReferralTreeNode {
  return {
    account_id: account.id,
    login_id: account.login_id,
    display_name: account.display_name,
    referral_code: account.referral_code,
    sponsor_account_id: account.sponsor_account_id,
    depth: 0,
    rank_level: 0,
    total_stake_amount_base: ZERO,
    total_reward_amount_base: ZERO,
    children: []
  };
}

function toBinaryRootNode(account: AccountNetworkRow): BinaryTreeNode {
  return {
    account_id: account.id,
    login_id: account.login_id,
    display_name: account.display_name,
    binary_parent_account_id: account.binary_parent_account_id,
    binary_position: account.binary_position,
    depth: 0,
    root_leg: null,
    rank_level: 0,
    total_stake_amount_base: ZERO,
    total_sales_amount_base: ZERO,
    total_reward_amount_base: ZERO,
    children: []
  };
}

export function buildReferralTree(root: AccountNetworkRow, rows: ReferralDescendantRow[]): {
  root: Omit<ReferralTreeNode, "children">;
  children: ReferralTreeNode[];
} {
  const rootNode = toReferralRootNode(root);
  const nodes = new Map<string, ReferralTreeNode>([[root.id, rootNode]]);

  for (const row of rows) {
    nodes.set(row.account_id, {
      account_id: row.account_id,
      login_id: row.login_id,
      display_name: row.display_name,
      referral_code: row.referral_code,
      sponsor_account_id: row.sponsor_account_id,
      depth: row.depth,
      rank_level: 0,
      total_stake_amount_base: ZERO,
      total_reward_amount_base: ZERO,
      children: []
    });
  }

  for (const row of rows) {
    const node = nodes.get(row.account_id);
    const parentId = row.sponsor_account_id ?? root.id;
    const parent = nodes.get(parentId);
    if (node && parent) {
      parent.children.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if ((a.login_id ?? "") !== (b.login_id ?? "")) return (a.login_id ?? "").localeCompare(b.login_id ?? "");
      return a.account_id.localeCompare(b.account_id);
    });
  }

  const { children, ...rootWithoutChildren } = rootNode;
  return {
    root: rootWithoutChildren,
    children
  };
}

export function buildBinaryTree(root: AccountNetworkRow, rows: BinaryDescendantRow[]): { root: BinaryTreeNode } {
  const rootNode = toBinaryRootNode(root);
  const nodes = new Map<string, BinaryTreeNode>([[root.id, rootNode]]);

  for (const row of rows) {
    nodes.set(row.account_id, {
      account_id: row.account_id,
      login_id: row.login_id,
      display_name: row.display_name,
      binary_parent_account_id: row.binary_parent_account_id,
      binary_position: row.binary_position,
      depth: row.depth,
      root_leg: row.root_leg,
      rank_level: 0,
      total_stake_amount_base: ZERO,
      total_sales_amount_base: ZERO,
      total_reward_amount_base: ZERO,
      children: []
    });
  }

  for (const row of rows) {
    const node = nodes.get(row.account_id);
    const parentId = row.binary_parent_account_id ?? root.id;
    const parent = nodes.get(parentId);
    if (node && parent) {
      parent.children.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort((a, b) => {
      const positionOrder = (value: BinaryPosition | null) => (value === "LEFT" ? 0 : value === "RIGHT" ? 1 : 2);
      const posDiff = positionOrder(a.binary_position) - positionOrder(b.binary_position);
      if (posDiff !== 0) return posDiff;
      if ((a.login_id ?? "") !== (b.login_id ?? "")) return (a.login_id ?? "").localeCompare(b.login_id ?? "");
      return a.account_id.localeCompare(b.account_id);
    });
  }

  return { root: rootNode };
}

export function summarizeBinaryLegs(rows: BinaryDescendantRow[]): {
  left: BinaryLegSummary;
  right: BinaryLegSummary;
  weak_leg: "LEFT" | "RIGHT";
  weak_leg_volume_base: string;
} {
  const baseSummary = (): BinaryLegSummary => ({
    member_count: 0,
    total_stake_amount_base: ZERO,
    total_sales_amount_base: ZERO,
    total_reward_amount_base: ZERO
  });

  const left = baseSummary();
  const right = baseSummary();

  for (const row of rows) {
    if (row.root_leg === "LEFT") left.member_count += 1;
    if (row.root_leg === "RIGHT") right.member_count += 1;
  }

  const weak_leg =
    compareAmountBase(left.total_sales_amount_base, right.total_sales_amount_base) <= 0 ? "LEFT" : "RIGHT";

  return {
    left,
    right,
    weak_leg,
    weak_leg_volume_base: weak_leg === "LEFT" ? left.total_sales_amount_base : right.total_sales_amount_base
  };
}

function toReferralDownlineItem(row: ReferralDescendantRow): DownlineItem {
  return {
    account_id: row.account_id,
    login_id: row.login_id,
    display_name: row.display_name,
    depth: row.depth,
    sponsor_account_id: row.sponsor_account_id,
    binary_parent_account_id: row.binary_parent_account_id,
    binary_position: row.binary_position,
    root_leg: null,
    total_stake_amount_base: ZERO,
    total_reward_amount_base: ZERO,
    rank_level: 0,
    joined_at: row.joined_at
  };
}

function toBinaryDownlineItem(row: BinaryDescendantRow): DownlineItem {
  return {
    account_id: row.account_id,
    login_id: row.login_id,
    display_name: row.display_name,
    depth: row.depth,
    sponsor_account_id: row.sponsor_account_id,
    binary_parent_account_id: row.binary_parent_account_id,
    binary_position: row.binary_position,
    root_leg: row.root_leg,
    total_stake_amount_base: ZERO,
    total_reward_amount_base: ZERO,
    rank_level: 0,
    joined_at: row.joined_at
  };
}

export class NetworkService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async requireAccount(conn: DbConn, accountId: string): Promise<AccountNetworkRow> {
    const account = await getAccountNetworkById(conn, accountId);
    if (!account) {
      throw notFound("account not found", { account_id: accountId });
    }
    return account;
  }

  async getReferralTreeForAccount(input: { account_id: string; depth: number }) {
    return this.withConnection(async (conn) => {
      const account = await this.requireAccount(conn, input.account_id);
      const rows = await listReferralDescendants(conn, {
        parent_account_id: input.account_id,
        maxDepth: input.depth
      });
      return buildReferralTree(account, rows);
    });
  }

  async getReferralTree(input: { account_id: string; depth: number }) {
    return this.getReferralTreeForAccount(input);
  }

  async getBinaryTreeForAccount(input: { account_id: string; depth: number }) {
    return this.withConnection(async (conn) => {
      const account = await this.requireAccount(conn, input.account_id);
      const rows = await listBinaryDescendants(conn, {
        ancestor_account_id: input.account_id,
        maxDepth: input.depth
      });
      return buildBinaryTree(account, rows);
    });
  }

  async getBinaryTree(input: { account_id: string; depth: number }) {
    return this.getBinaryTreeForAccount(input);
  }

  async getBinaryLegsForAccount(input: { account_id: string }) {
    return this.withConnection(async (conn) => {
      await this.requireAccount(conn, input.account_id);
      const rows = await listBinaryDescendants(conn, {
        ancestor_account_id: input.account_id,
        maxDepth: FULL_TREE_DEPTH
      });
      return summarizeBinaryLegs(rows);
    });
  }

  async getBinaryLegs(input: { account_id: string }) {
    return this.getBinaryLegsForAccount(input);
  }

  async getDownlinesForAccount(input: {
    account_id: string;
    type: "referral" | "binary";
    depth: number;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      await this.requireAccount(conn, input.account_id);
      const offset = (input.page - 1) * input.limit;

      if (input.type === "referral") {
        const total = await countReferralDescendants(conn, {
          parent_account_id: input.account_id,
          maxDepth: input.depth
        });
        const rows = await listReferralDownlinesPage(conn, {
          parent_account_id: input.account_id,
          maxDepth: input.depth,
          limit: input.limit,
          offset
        });

        return {
          items: rows.map(toReferralDownlineItem),
          page: input.page,
          limit: input.limit,
          total
        };
      }

      const total = await countBinaryDescendants(conn, {
        ancestor_account_id: input.account_id,
        maxDepth: input.depth
      });
      const rows = await listBinaryDownlinesPage(conn, {
        ancestor_account_id: input.account_id,
        maxDepth: input.depth,
        limit: input.limit,
        offset
      });

      return {
        items: rows.map(toBinaryDownlineItem),
        page: input.page,
        limit: input.limit,
        total
      };
    });
  }

  async listDownlines(input: {
    account_id: string;
    type: "referral" | "binary";
    depth: number;
    page: number;
    limit: number;
  }) {
    return this.getDownlinesForAccount(input);
  }
}
