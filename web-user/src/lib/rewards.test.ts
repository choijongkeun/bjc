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
    expect(getRewardTypeLabel("REVERSAL")).toBe("보상 취소");
    expect(getRewardStatusLabel("PENDING")).toBe("대기");
    expect(getRewardStatusLabel("REVERSED")).toBe("취소 반영");
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
      { label: "스테이킹 원금", value: "1000000" },
      { label: "일일 적용 비율", value: "25 bps" },
      { label: "적용 기간", value: "30일" },
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
      { label: "가중치 비율", value: "500 bps" },
      { label: "기준 금액", value: "1000" },
      { label: "풀 금액", value: "200" },
      { label: "총 점수", value: "5000" },
      { label: "점수 반영 금액", value: "50" },
      { label: "점수 비율", value: "100 bps" },
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
      { label: "신청 금액", value: "300" },
      { label: "지급 금액", value: "210" },
      { label: "동결 금액", value: "90" },
      { label: "지급 비율", value: "7000 bps" },
      { label: "동결 비율", value: "3000 bps" },
    ]);
  });
});
