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

  it("shows contribution and sidecar metadata fields for users", () => {
    expect(
      getVisibleRewardMetadataEntries({
        formula_version: "contribution_v1",
        rule_id: "rule-1",
        weight_bps: "500",
        base_amount_base: "1000",
        pool_amount_base: "200",
        total_score: "5000",
        score_amount_base: "50",
        score_ratio_bps: "100",
        qualification_source: "referral_edges",
      })
    ).toEqual([
      { label: "formula version", value: "contribution_v1" },
      { label: "rule id", value: "rule-1" },
      { label: "weight bps", value: "500" },
      { label: "base amount", value: "1000" },
      { label: "pool amount", value: "200" },
      { label: "total score", value: "5000" },
      { label: "score amount", value: "50" },
      { label: "score ratio", value: "100 bps" },
      { label: "qualification source", value: "referral_edges" },
    ]);

    expect(
      getVisibleRewardMetadataEntries({
        requested_amount_base: "300",
        release_amount_base: "210",
        freeze_amount_base: "90",
        release_bps: "7000",
        freeze_bps: "3000",
        sidecar_status: "SIDECAR_ACTIVE",
      })
    ).toEqual([
      { label: "requested amount", value: "300" },
      { label: "release amount", value: "210" },
      { label: "freeze amount", value: "90" },
      { label: "release bps", value: "7000 bps" },
      { label: "freeze bps", value: "3000 bps" },
      { label: "sidecar status", value: "SIDECAR_ACTIVE" },
    ]);
  });
});
