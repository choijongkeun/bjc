import { describe, expect, it } from "vitest";

import {
  calculateDailyRewardAmountBase,
  getRewardDateWindowUtc,
  isDailyRewardEligibleByTimestamps,
} from "./dailyRewardService.js";

describe("dailyRewardService helpers", () => {
  it("calculates bigint-safe floor reward amounts for supported bps snapshots", () => {
    expect(calculateDailyRewardAmountBase("1000000", "50")).toBe("5000");
    expect(calculateDailyRewardAmountBase("1000000", "70")).toBe("7000");
    expect(calculateDailyRewardAmountBase("1000000", "100")).toBe("10000");
    expect(calculateDailyRewardAmountBase("1000000", "120")).toBe("12000");
  });

  it("floors fractional results and skips zero-value rewards", () => {
    expect(calculateDailyRewardAmountBase("999999", "50")).toBe("4999");
    expect(calculateDailyRewardAmountBase("1", "1")).toBe("0");
  });

  it("supports very large decimal strings without Number conversion", () => {
    expect(calculateDailyRewardAmountBase("123456789012345678901234567890", "120")).toBe("1481481468148148146814814814");
  });

  it("builds the Asia/Seoul reward window in UTC", () => {
    const window = getRewardDateWindowUtc("2026-06-19");

    expect(window.start.toISOString()).toBe("2026-06-18T15:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-06-19T15:00:00.000Z");
    expect(window.startSql).toBe("2026-06-18 15:00:00");
    expect(window.endSql).toBe("2026-06-19 15:00:00");
  });

  it("includes ACTIVE and CANCEL_REQUESTED rows when their KST business date is reward_date", () => {
    const { startSql, endSql } = getRewardDateWindowUtc("2026-06-19");

    expect(
      isDailyRewardEligibleByTimestamps({
        status: "ACTIVE",
        started_at: "2026-06-19 14:59:59",
        matures_at: "2026-06-20 15:00:00",
        cancelled_at: null,
        closed_at: null,
        reward_day_start: startSql,
        reward_day_end: endSql,
      })
    ).toBe(true);

    expect(
      isDailyRewardEligibleByTimestamps({
        status: "CANCEL_REQUESTED",
        started_at: "2026-06-18 15:00:00",
        matures_at: "2026-06-19 15:00:01",
        cancelled_at: null,
        closed_at: null,
        reward_day_start: startSql,
        reward_day_end: endSql,
      })
    ).toBe(true);
  });

  it("excludes cancelled, matured-at-boundary, closed, and next-day-start rows", () => {
    const { startSql, endSql } = getRewardDateWindowUtc("2026-06-19");

    expect(
      isDailyRewardEligibleByTimestamps({
        status: "ACTIVE",
        started_at: endSql,
        matures_at: "2026-06-20 15:00:00",
        cancelled_at: null,
        closed_at: null,
        reward_day_start: startSql,
        reward_day_end: endSql,
      })
    ).toBe(false);

    expect(
      isDailyRewardEligibleByTimestamps({
        status: "ACTIVE",
        started_at: "2026-06-18 15:00:00",
        matures_at: startSql,
        cancelled_at: null,
        closed_at: null,
        reward_day_start: startSql,
        reward_day_end: endSql,
      })
    ).toBe(false);

    expect(
      isDailyRewardEligibleByTimestamps({
        status: "ACTIVE",
        started_at: "2026-06-18 15:00:00",
        matures_at: "2026-06-20 15:00:00",
        cancelled_at: startSql,
        closed_at: null,
        reward_day_start: startSql,
        reward_day_end: endSql,
      })
    ).toBe(false);

    expect(
      isDailyRewardEligibleByTimestamps({
        status: "ACTIVE",
        started_at: "2026-06-18 15:00:00",
        matures_at: "2026-06-20 15:00:00",
        cancelled_at: null,
        closed_at: startSql,
        reward_day_start: startSql,
        reward_day_end: endSql,
      })
    ).toBe(false);
  });
});
