import { describe, expect, it } from "vitest";
import {
  buildRewardListQuery,
  getRewardStatusLabel,
  getRewardTypeLabel,
  getVisibleRewardMetadataEntries,
  isNegativeRewardAmount,
} from "@/lib/rewards";

describe("reward helpers", () => {
  it("maps reward type and status labels", () => {
    expect(getRewardTypeLabel("DAILY_REWARD")).toBe("일일 보상");
    expect(getRewardTypeLabel("REVERSAL")).toBe("역분개");
    expect(getRewardStatusLabel("PENDING")).toBe("대기");
    expect(getRewardStatusLabel("REVERSED")).toBe("역분개 완료");
  });

  it("builds reward list query without empty values", () => {
    expect(
      buildRewardListQuery({
        reward_type: "",
        status: "CONFIRMED",
        reward_date_from: "",
        reward_date_to: "2026-06-20",
        staking_id: "",
        page: 2,
        limit: 50,
        sort: "created_at_desc",
      })
    ).toEqual({
      reward_type: undefined,
      status: "CONFIRMED",
      reward_date_from: undefined,
      reward_date_to: "2026-06-20",
      staking_id: undefined,
      page: 2,
      limit: 50,
      sort: "created_at_desc",
    });
  });

  it("detects reversal negative amounts", () => {
    expect(isNegativeRewardAmount("-1000")).toBe(true);
    expect(isNegativeRewardAmount("1000")).toBe(false);
  });

  it("limits visible metadata to allowed user fields", () => {
    expect(
      getVisibleRewardMetadataEntries({
        principal_amount_base: "1000000",
        daily_interest_bps_snapshot: "25",
        duration_days_snapshot: 30,
        denominator: "10000",
        original_reward_id: "hidden",
        reason: "hidden",
      })
    ).toEqual([
      { label: "원금 snapshot", value: "1000000" },
      { label: "bps snapshot", value: "25" },
      { label: "기간 snapshot", value: "30일" },
      { label: "denominator", value: "10000" },
    ]);
  });
});
