import { describe, expect, it } from "vitest";

import { negateAmountBase, sanitizeRewardMetadata } from "./accountRewardService.js";

describe("accountRewardService helpers", () => {
  it("converts confirmed reward amounts into exact negative reversal amounts", () => {
    expect(negateAmountBase("1")).toBe("-1");
    expect(negateAmountBase("5000")).toBe("-5000");
    expect(negateAmountBase("123456789012345678901234567890")).toBe("-123456789012345678901234567890");
  });

  it("rejects zero or already-negative reversal targets", () => {
    expect(() => negateAmountBase("0")).toThrow(/positive/);
    expect(() => negateAmountBase("-10")).toThrow(/positive/);
  });

  it("keeps only allowed metadata keys for user/admin reward responses", () => {
    expect(
      sanitizeRewardMetadata({
        principal_amount_base: "1000",
        daily_interest_bps_snapshot: "50",
        duration_days_snapshot: 30,
        denominator: "10000",
        original_reward_id: "reward-1",
        original_source_reference: "reward.daily:staking-1:2026-06-19",
        reason: "manual reversal",
        reward_type: "REVERSAL",
        password_hash: "hidden",
        session_token_hash: "hidden",
        nested: { should: "drop" },
      })
    ).toEqual({
      principal_amount_base: "1000",
      daily_interest_bps_snapshot: "50",
      duration_days_snapshot: 30,
      denominator: "10000",
      original_reward_id: "reward-1",
      original_source_reference: "reward.daily:staking-1:2026-06-19",
      reason: "manual reversal",
      reward_type: "REVERSAL",
    });
  });

  it("returns an empty object for non-object metadata", () => {
    expect(sanitizeRewardMetadata(null)).toEqual({});
    expect(sanitizeRewardMetadata("secret")).toEqual({});
    expect(sanitizeRewardMetadata(["secret"])).toEqual({});
  });
});
