import { describe, expect, it } from "vitest";

import {
  addDirectReferralSummaryCount,
  buildDirectReferralSourceReference,
  calculateDirectReferralRewardAmountBase,
  classifyDirectReferralSponsorEligibility,
  classifyExistingDirectReferralReward,
  createEmptyDirectReferralBatchSummary,
  getKstDateFromSqlDateTime
} from "../domain/directReferralReward.js";
import { AppError } from "../domain/errors.js";
import { assertCanRunDirectReferral } from "./directReferralRewardService.js";

describe("directReferralRewardService helpers", () => {
  it("calculates 15 percent direct referral rewards with bigint-safe floor division", () => {
    expect(calculateDirectReferralRewardAmountBase("1000000", "1500")).toBe("150000");
    expect(calculateDirectReferralRewardAmountBase("999999", "1500")).toBe("149999");
  });

  it("returns zero when the reward floors below one base unit", () => {
    expect(calculateDirectReferralRewardAmountBase("1", "1")).toBe("0");
  });

  it("classifies sponsor eligibility for missing, self, blocked, withdrawn, and active sponsors", () => {
    expect(
      classifyDirectReferralSponsorEligibility({
        sponsor_account_id: null,
        sponsor_role: null,
        sponsor_status: null,
        source_account_id: "source-1"
      })
    ).toBe("no_sponsor");

    expect(
      classifyDirectReferralSponsorEligibility({
        sponsor_account_id: "source-1",
        sponsor_role: "USER",
        sponsor_status: "ACTIVE",
        source_account_id: "source-1"
      })
    ).toBe("inactive_sponsor");

    expect(
      classifyDirectReferralSponsorEligibility({
        sponsor_account_id: "sponsor-1",
        sponsor_role: "USER",
        sponsor_status: "BLOCKED",
        source_account_id: "source-1"
      })
    ).toBe("inactive_sponsor");

    expect(
      classifyDirectReferralSponsorEligibility({
        sponsor_account_id: "sponsor-1",
        sponsor_role: "USER",
        sponsor_status: "WITHDRAWN",
        source_account_id: "source-1"
      })
    ).toBe("inactive_sponsor");

    expect(
      classifyDirectReferralSponsorEligibility({
        sponsor_account_id: "sponsor-1",
        sponsor_role: "USER",
        sponsor_status: "ACTIVE",
        source_account_id: "source-1"
      })
    ).toBe("eligible");
  });

  it("builds deterministic source references", () => {
    expect(buildDirectReferralSourceReference("staking-1", "sponsor-1")).toBe(
      "direct_referral:staking-1:sponsor-1"
    );
  });

  it("detects identical duplicates and mismatched conflicts", () => {
    const existing = {
      account_id: "sponsor-1",
      source_account_id: "source-1",
      source_account_staking_id: "staking-1",
      policy_version_id: "policy-1",
      amount_base: "150000",
      metadata_json: {
        direct_referral_rate_bps: "1500"
      }
    };

    expect(
      classifyExistingDirectReferralReward(existing, {
        account_id: "sponsor-1",
        source_account_id: "source-1",
        source_account_staking_id: "staking-1",
        policy_version_id: "policy-1",
        amount_base: "150000",
        direct_referral_rate_bps: "1500"
      })
    ).toBe("duplicate");

    expect(
      classifyExistingDirectReferralReward(existing, {
        account_id: "sponsor-1",
        source_account_id: "source-1",
        source_account_staking_id: "staking-1",
        policy_version_id: "policy-1",
        amount_base: "160000",
        direct_referral_rate_bps: "1500"
      })
    ).toBe("conflict");
  });

  it("converts activated_at timestamps into KST reward dates", () => {
    expect(getKstDateFromSqlDateTime("2026-06-19 00:00:00")).toBe("2026-06-19");
    expect(getKstDateFromSqlDateTime("2026-06-18 15:00:00")).toBe("2026-06-19");
    expect(getKstDateFromSqlDateTime("2026-06-19 14:59:59")).toBe("2026-06-19");
  });

  it("aggregates batch counters without using Number conversion for reward sums", () => {
    let summary = createEmptyDirectReferralBatchSummary();
    summary = { ...summary, target_count: 5 };
    summary = addDirectReferralSummaryCount(summary, { type: "created", amount_base: "150000" });
    summary = addDirectReferralSummaryCount(summary, { type: "duplicate" });
    summary = addDirectReferralSummaryCount(summary, { type: "no_sponsor" });
    summary = addDirectReferralSummaryCount(summary, { type: "inactive_sponsor" });
    summary = addDirectReferralSummaryCount(summary, { type: "zero_reward" });
    summary = addDirectReferralSummaryCount(summary, { type: "conflict" });
    summary = addDirectReferralSummaryCount(summary, { type: "failed" });

    expect(summary).toEqual({
      target_count: 5,
      created_count: 1,
      no_sponsor_skip_count: 1,
      inactive_sponsor_skip_count: 1,
      zero_reward_skip_count: 1,
      duplicate_skip_count: 1,
      conflict_count: 1,
      failed_count: 1,
      total_reward_amount_base: "150000"
    });
  });

  it("allows only ADMIN actors to run direct referral rewards", () => {
    expect(() => assertCanRunDirectReferral("ADMIN")).not.toThrow();

    try {
      assertCanRunDirectReferral("READER");
      throw new Error("expected READER to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(403);
    }

    try {
      assertCanRunDirectReferral("USER");
      throw new Error("expected USER to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(403);
    }
  });
});
