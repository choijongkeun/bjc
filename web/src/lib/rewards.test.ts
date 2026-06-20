import { describe, expect, it } from "vitest";
import {
  buildAdminRewardListQuery,
  canManageDirectReferral,
  canRunDirectReferralForStaking,
  canReverseReward,
  formatDirectReferralRunSummary,
  getDailyRewardRunResultItems,
  getDirectReferralResultTone,
  getVisibleRewardMetadataEntries,
  getDefaultKstRewardDate,
  shouldUseCalcRunRewardsApi,
  validateDirectReferralRunInput,
} from "@/lib/rewards";

describe("admin reward helpers", () => {
  it("builds admin reward query without empty filters", () => {
    expect(
      buildAdminRewardListQuery({
        q: "",
        account_id: "account-1",
        staking_id: "",
        reward_type: "",
        status: "CONFIRMED",
        calc_run_id: "",
        reward_date_from: "",
        reward_date_to: "2026-06-20",
        page: 3,
        limit: 50,
        sort: "created_at_desc",
      })
    ).toEqual({
      q: undefined,
      account_id: "account-1",
      staking_id: undefined,
      reward_type: undefined,
      status: "CONFIRMED",
      calc_run_id: undefined,
      reward_date_from: undefined,
      reward_date_to: "2026-06-20",
      page: 3,
      limit: 50,
      sort: "created_at_desc",
    });
  });

  it("returns reversal availability by reward state", () => {
    expect(
      canReverseReward({
        status: "CONFIRMED",
        reward_type: "DAILY_REWARD",
        reversal_reward_id: null,
      })
    ).toBe(true);

    expect(
      canReverseReward({
        status: "REVERSED",
        reward_type: "DAILY_REWARD",
        reversal_reward_id: "rev-1",
      })
    ).toBe(false);

    expect(
      canReverseReward({
        status: "CONFIRMED",
        reward_type: "REVERSAL",
        reversal_reward_id: null,
      })
    ).toBe(false);
  });

  it("switches to calc run rewards api when only calc_run filter is active", () => {
    expect(shouldUseCalcRunRewardsApi({ calc_run_id: "calc-1", page: 1, limit: 20 })).toBe(true);
    expect(shouldUseCalcRunRewardsApi({ calc_run_id: "calc-1", account_id: "account-1" })).toBe(false);
  });

  it("formats daily reward run result items", () => {
    expect(
      getDailyRewardRunResultItems({
        calc_run: {
          id: "calc-1",
          run_type: "DAILY_REWARD",
          run_date: "2026-06-19",
          status: "SUCCEEDED",
        },
        target_count: 10,
        created_count: 8,
        zero_reward_skip_count: 1,
        duplicate_skip_count: 1,
        failed_count: 0,
        total_reward_amount_base: "12345",
      }).find((item) => item.label === "status")
    ).toEqual({ label: "status", value: "SUCCEEDED" });
  });

  it("uses previous Asia/Seoul business date by default", () => {
    expect(getDefaultKstRewardDate(new Date("2026-06-19T16:00:00.000Z"))).toBe("2026-06-19");
  });

  it("validates direct referral run input", () => {
    expect(
      validateDirectReferralRunInput({
        policy_version_id: "",
        activated_from: "2026-06-01",
        activated_to: "2026-06-30",
      })
    ).toBe("policy_version_id를 입력해 주세요.");

    expect(
      validateDirectReferralRunInput({
        policy_version_id: "policy-1",
        activated_from: "2026-07-01",
        activated_to: "2026-06-30",
      })
    ).toBe("activated_from은 activated_to보다 클 수 없습니다.");
  });

  it("formats direct referral run result items", () => {
    expect(
      formatDirectReferralRunSummary({
        calc_run_id: "calc-direct-1",
        target_count: 4,
        created_count: 1,
        no_sponsor_skip_count: 1,
        inactive_sponsor_skip_count: 1,
        zero_reward_skip_count: 0,
        duplicate_skip_count: 1,
        conflict_count: 0,
        failed_count: 0,
        total_reward_amount_base: "150000",
        status: "SUCCEEDED",
      }).find((item) => item.label === "total_reward_amount_base")
    ).toEqual({
      label: "total_reward_amount_base",
      value: "150,000",
    });
  });

  it("returns direct referral tones", () => {
    expect(getDirectReferralResultTone({ status: "SUCCEEDED" })).toBe("success");
    expect(getDirectReferralResultTone({ result_type: "duplicate" })).toBe("success");
    expect(getDirectReferralResultTone({ conflict_count: 1 })).toBe("error");
    expect(getDirectReferralResultTone({ failed_count: 1 })).toBe("error");
  });

  it("returns direct referral role and staking eligibility", () => {
    expect(canManageDirectReferral("ADMIN")).toBe(true);
    expect(canManageDirectReferral("READER")).toBe(false);
    expect(
      canRunDirectReferralForStaking({
        status: "ACTIVE",
        activated_at: "2026-06-20T00:00:00.000Z",
        cancel_requested_at: null,
      } as any)
    ).toBe(true);
    expect(
      canRunDirectReferralForStaking({
        status: "ACTIVE",
        activated_at: "2026-06-20T00:00:00.000Z",
        cancel_requested_at: "2026-06-21T00:00:00.000Z",
      } as any)
    ).toBe(false);
  });

  it("sanitizes direct referral metadata entries", () => {
    expect(
      getVisibleRewardMetadataEntries({
        formula_version: "direct_referral_v1",
        source_principal_amount_base: "1000000",
        direct_referral_rate_bps: "1500",
        referral_depth: 1,
      }).map((item) => item.label)
    ).toEqual(["formula version", "source principal", "direct referral rate", "referral depth"]);
  });
});
