import { describe, expect, it } from "vitest";

import type { AccountNetworkRow } from "../repos/accountsRepo.js";
import type { BinaryDescendantRow } from "../repos/binaryEdgesRepo.js";
import type { ReferralDescendantRow } from "../repos/referralRepo.js";
import { buildBinaryTree, buildReferralTree, summarizeBinaryLegs } from "./networkService.js";

function createRootAccount(overrides?: Partial<AccountNetworkRow>): AccountNetworkRow {
  return {
    id: "root-id",
    login_id: "root",
    display_name: "Root",
    role: "USER",
    status: "ACTIVE",
    referral_code: "ROOTCODE",
    sponsor_account_id: null,
    binary_parent_account_id: null,
    binary_position: null,
    joined_at: "2026-01-01T00:00:00.000Z",
    last_login_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    ...overrides
  };
}

describe("networkService helpers", () => {
  it("builds referral tree from flat descendants", () => {
    const root = createRootAccount();
    const rows: ReferralDescendantRow[] = [
      {
        account_id: "child-1",
        login_id: "child1",
        display_name: "Child 1",
        referral_code: "CHILD1",
        sponsor_account_id: "root-id",
        binary_parent_account_id: "root-id",
        binary_position: "LEFT",
        joined_at: "2026-01-02T00:00:00.000Z",
        depth: 1
      },
      {
        account_id: "grandchild-1",
        login_id: "grandchild1",
        display_name: "Grandchild 1",
        referral_code: "GRAND1",
        sponsor_account_id: "child-1",
        binary_parent_account_id: "child-1",
        binary_position: "LEFT",
        joined_at: "2026-01-03T00:00:00.000Z",
        depth: 2
      }
    ];

    const tree = buildReferralTree(root, rows);

    expect(tree.root.account_id).toBe("root-id");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]?.account_id).toBe("child-1");
    expect(tree.children[0]?.children[0]?.account_id).toBe("grandchild-1");
  });

  it("builds binary tree from flat descendants", () => {
    const root = createRootAccount();
    const rows: BinaryDescendantRow[] = [
      {
        account_id: "left-child",
        login_id: "left",
        display_name: "Left",
        referral_code: "LEFT1",
        sponsor_account_id: "root-id",
        binary_parent_account_id: "root-id",
        binary_position: "LEFT",
        joined_at: "2026-01-02T00:00:00.000Z",
        depth: 1,
        root_leg: "LEFT"
      },
      {
        account_id: "right-child",
        login_id: "right",
        display_name: "Right",
        referral_code: "RIGHT1",
        sponsor_account_id: "root-id",
        binary_parent_account_id: "root-id",
        binary_position: "RIGHT",
        joined_at: "2026-01-03T00:00:00.000Z",
        depth: 1,
        root_leg: "RIGHT"
      }
    ];

    const tree = buildBinaryTree(root, rows);

    expect(tree.root.account_id).toBe("root-id");
    expect(tree.root.children).toHaveLength(2);
    expect(tree.root.children[0]?.binary_position).toBe("LEFT");
    expect(tree.root.children[1]?.binary_position).toBe("RIGHT");
  });

  it("summarizes binary legs and picks LEFT on zero-volume tie", () => {
    const rows: BinaryDescendantRow[] = [
      {
        account_id: "left-child",
        login_id: "left",
        display_name: "Left",
        referral_code: "LEFT1",
        sponsor_account_id: "root-id",
        binary_parent_account_id: "root-id",
        binary_position: "LEFT",
        joined_at: "2026-01-02T00:00:00.000Z",
        depth: 1,
        root_leg: "LEFT"
      }
    ];

    const summary = summarizeBinaryLegs(rows);

    expect(summary.left.member_count).toBe(1);
    expect(summary.right.member_count).toBe(0);
    expect(summary.weak_leg).toBe("LEFT");
    expect(summary.weak_leg_volume_base).toBe("0");
  });
});
