import { describe, expect, it } from "vitest";

import {
  buildPreviewAllocationsFromCandidates,
  buildWithdrawalBalanceResponse,
  assertWithdrawalOwnedByAccount,
  evaluateCreateWithdrawalIdempotency,
  sortEligibleRewardsFifo
} from "./rewardWithdrawalService.js";
import {
  classifyRewardTypeToWithdrawalBucket,
  classifyReversalOriginalRewardTypeToWithdrawalBucket
} from "../domain/rewardBucket.js";
import {
  calculateWithdrawalFeeAmountBase,
  selectApplicableWithdrawalFeeRule
} from "../domain/withdrawalFee.js";
import {
  assertCanApproveWithdrawal,
  assertCanCompleteWithdrawal,
  assertCanFailWithdrawal,
  assertCanMarkProcessingWithdrawal,
  assertCanRejectWithdrawal,
  assertCanUserCancelWithdrawal
} from "../domain/withdrawalStatus.js";
import { assertRoleAtLeast } from "./authz.js";

describe("rewardWithdrawalService helpers", () => {
  it("classifies reward buckets and reversal inheritance", () => {
    expect(classifyRewardTypeToWithdrawalBucket("DAILY_REWARD")).toBe("DAILY_REWARD");
    expect(classifyRewardTypeToWithdrawalBucket("DIRECT_REFERRAL")).toBe("BONUS");
    expect(classifyRewardTypeToWithdrawalBucket("ADJUSTMENT")).toBeNull();
    expect(classifyRewardTypeToWithdrawalBucket("REVERSAL")).toBeNull();

    expect(classifyReversalOriginalRewardTypeToWithdrawalBucket("DAILY_REWARD")).toBe("DAILY_REWARD");
    expect(classifyReversalOriginalRewardTypeToWithdrawalBucket("SIDECAR")).toBe("BONUS");
    expect(classifyReversalOriginalRewardTypeToWithdrawalBucket("ADJUSTMENT")).toBeNull();
  });

  it("sorts eligible rewards by confirmed_at, reward_date, id", () => {
    const sorted = sortEligibleRewardsFifo([
      {
        id: "reward-b",
        account_id: "account-1",
        account_staking_id: "staking-1",
        policy_version_id: "policy-1",
        reward_type: "DAILY_REWARD",
        reward_date: "2026-06-02",
        amount_base: "100",
        status: "CONFIRMED",
        available_at: new Date("2026-06-02T00:00:00.000Z"),
        confirmed_at: new Date("2026-06-02T00:00:00.000Z"),
        staking_product_id: "product-1",
        product_symbol: "BJC",
        product_decimals: 18
      },
      {
        id: "reward-a",
        account_id: "account-1",
        account_staking_id: "staking-1",
        policy_version_id: "policy-1",
        reward_type: "DAILY_REWARD",
        reward_date: "2026-06-01",
        amount_base: "100",
        status: "CONFIRMED",
        available_at: new Date("2026-06-01T00:00:00.000Z"),
        confirmed_at: new Date("2026-06-02T00:00:00.000Z"),
        staking_product_id: "product-1",
        product_symbol: "BJC",
        product_decimals: 18
      },
      {
        id: "reward-c",
        account_id: "account-1",
        account_staking_id: "staking-1",
        policy_version_id: "policy-1",
        reward_type: "DAILY_REWARD",
        reward_date: "2026-06-01",
        amount_base: "100",
        status: "CONFIRMED",
        available_at: new Date("2026-06-01T00:00:00.000Z"),
        confirmed_at: new Date("2026-06-01T00:00:00.000Z"),
        staking_product_id: "product-1",
        product_symbol: "BJC",
        product_decimals: 18
      }
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["reward-c", "reward-a", "reward-b"]);
  });

  it("selects the largest fee schedule less than or equal to holding days", () => {
    const selected = selectApplicableWithdrawalFeeRule(
      [
        { schedule_days: 1, fee_bps: "2000", fee_mode: "DEDUCT_FROM_WITHDRAWAL" as const },
        { schedule_days: 7, fee_bps: "1000", fee_mode: "DEDUCT_FROM_WITHDRAWAL" as const },
        { schedule_days: 30, fee_bps: "300", fee_mode: "DEDUCT_FROM_WITHDRAWAL" as const }
      ],
      12
    );

    expect(selected).toEqual({
      schedule_days: 7,
      fee_bps: "1000",
      fee_mode: "DEDUCT_FROM_WITHDRAWAL"
    });
  });

  it("calculates fee amounts with bigint-safe floor rounding", () => {
    expect(calculateWithdrawalFeeAmountBase("1000000", "2000")).toBe("200000");
    expect(calculateWithdrawalFeeAmountBase("999", "333")).toBe("33");
  });

  it("builds partial allocations and keeps requested totals exact", () => {
    const plan = buildPreviewAllocationsFromCandidates({
      requested_amount_base: "1200",
      requested_kst_date: "2026-06-20",
      candidates: [
        {
          id: "reward-1",
          reward_type: "DAILY_REWARD",
          reward_date: "2026-06-10",
          confirmed_at: "2026-06-10T00:00:00.000Z",
          available_at: "2026-06-10T00:00:00.000Z",
          amount_base: "1000",
          policy_version_id: "policy-1",
          active_allocated_amount_base: "400",
          fee_rules: [{ schedule_days: 1, fee_bps: "2000", fee_mode: "DEDUCT_FROM_WITHDRAWAL" }],
          staking_product_id: "product-1",
          product_symbol: "BJC",
          product_decimals: 18
        },
        {
          id: "reward-2",
          reward_type: "DAILY_REWARD",
          reward_date: "2026-06-11",
          confirmed_at: "2026-06-11T00:00:00.000Z",
          available_at: "2026-06-11T00:00:00.000Z",
          amount_base: "1000",
          policy_version_id: "policy-1",
          active_allocated_amount_base: "0",
          fee_rules: [{ schedule_days: 1, fee_bps: "1000", fee_mode: "DEDUCT_FROM_WITHDRAWAL" }],
          staking_product_id: "product-1",
          product_symbol: "BJC",
          product_decimals: 18
        }
      ]
    });

    expect(plan.remaining_amount_base).toBe("0");
    expect(plan.allocations.map((item) => item.reward_id)).toEqual(["reward-1", "reward-2"]);
    expect(plan.allocations.map((item) => item.allocated_amount_base)).toEqual(["600", "600"]);
    expect(plan.allocations.map((item) => item.fee_amount_base)).toEqual(["120", "60"]);
    expect(plan.allocations.map((item) => item.net_amount_base)).toEqual(["480", "540"]);
  });

  it("computes available, reserved, and completed balances", () => {
    expect(
      buildWithdrawalBalanceResponse({
        daily_confirmed_amount_base: "1500",
        daily_reserved_amount_base: "200",
        daily_completed_amount_base: "300",
        bonus_confirmed_amount_base: "700",
        bonus_reserved_amount_base: "50",
        bonus_completed_amount_base: "100",
        total_reserved_amount_base: "250",
        total_completed_amount_base: "400"
      })
    ).toEqual({
      daily_reward: {
        confirmed_amount_base: "1500",
        reserved_amount_base: "200",
        completed_amount_base: "300",
        available_amount_base: "1000"
      },
      bonus: {
        confirmed_amount_base: "700",
        reserved_amount_base: "50",
        completed_amount_base: "100",
        available_amount_base: "550"
      },
      total: {
        reserved_amount_base: "250",
        completed_amount_base: "400"
      }
    });
  });

  it("allows and rejects withdrawal status transitions correctly", () => {
    expect(() => assertCanUserCancelWithdrawal("REQUESTED")).not.toThrow();
    expect(() => assertCanApproveWithdrawal("REQUESTED")).not.toThrow();
    expect(() => assertCanRejectWithdrawal("REQUESTED")).not.toThrow();
    expect(() => assertCanMarkProcessingWithdrawal("APPROVED")).not.toThrow();
    expect(() => assertCanCompleteWithdrawal("PROCESSING")).not.toThrow();
    expect(() => assertCanFailWithdrawal("PROCESSING")).not.toThrow();

    expect(() => assertCanUserCancelWithdrawal("APPROVED")).toThrow();
    expect(() => assertCanApproveWithdrawal("PROCESSING")).toThrow();
    expect(() => assertCanRejectWithdrawal("CANCELLED")).toThrow();
    expect(() => assertCanMarkProcessingWithdrawal("REQUESTED")).toThrow();
    expect(() => assertCanCompleteWithdrawal("APPROVED")).toThrow();
    expect(() => assertCanFailWithdrawal("COMPLETED")).toThrow();
  });

  it("detects matching and conflicting idempotent create requests", () => {
    const existing = {
      withdrawal_type: "DAILY_REWARD" as const,
      requested_amount_base: "1000",
      wallet_address: "wallet-1",
      network: "BASE"
    };

    expect(
      evaluateCreateWithdrawalIdempotency(existing, {
        withdrawal_type: "DAILY_REWARD",
        requested_amount_base: "1000",
        wallet_address: "wallet-1",
        network: "BASE"
      })
    ).toBe("match");

    expect(
      evaluateCreateWithdrawalIdempotency(existing, {
        withdrawal_type: "BONUS",
        requested_amount_base: "1000",
        wallet_address: "wallet-1",
        network: "BASE"
      })
    ).toBe("conflict");
  });

  it("enforces user ownership on withdrawal detail access", () => {
    expect(() => assertWithdrawalOwnedByAccount("account-1", "account-1", "wd-1")).not.toThrow();
    expect(() => assertWithdrawalOwnedByAccount("account-1", "account-2", "wd-1")).toThrow(/withdrawal not found/);
  });

  it("enforces READER and ADMIN authorization rules", () => {
    expect(() => assertRoleAtLeast({ id: "reader", role: "READER" }, "READER")).not.toThrow();
    expect(() => assertRoleAtLeast({ id: "admin", role: "ADMIN" }, "READER")).not.toThrow();
    expect(() => assertRoleAtLeast({ id: "admin", role: "ADMIN" }, "ADMIN")).not.toThrow();

    expect(() => assertRoleAtLeast({ id: "user", role: "USER" }, "READER")).toThrow();
    expect(() => assertRoleAtLeast({ id: "reader", role: "READER" }, "ADMIN")).toThrow();
  });
});
