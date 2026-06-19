import { describe, expect, it } from "vitest";
import {
  buildAdminRewardListQuery,
  canReverseReward,
  getDailyRewardRunResultItems,
  getDefaultKstRewardDate,
  shouldUseCalcRunRewardsApi,
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
});
