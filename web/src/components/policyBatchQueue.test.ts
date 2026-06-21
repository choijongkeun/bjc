import { describe, expect, it } from "vitest";

import { getProductQueueKey, getProductQueueSummary } from "@/components/tabs/PoliciesTab";

describe("policy batch queue helpers", () => {
  it("builds a stable dedupe key from all payload fields", () => {
    const product = {
      name: "BJC 500 패키지 30일",
      symbol: "USDC",
      decimals: 6,
      min_stake_amount_base: "500",
      max_stake_amount_base: "500",
      staking_days: 30,
      daily_interest_bps: "50",
      is_active: true,
    };

    expect(getProductQueueKey(product)).toBe("bjc 500 패키지 30일::usdc::6::500::500::30::50");
  });

  it("renders a queue summary with symbol, amount range, duration and bps", () => {
    const product = {
      name: "BJC 500 패키지 30일",
      symbol: "USDC",
      decimals: 6,
      min_stake_amount_base: "500",
      max_stake_amount_base: "500",
      staking_days: 30,
      daily_interest_bps: "50",
      is_active: true,
    };

    expect(getProductQueueSummary(product)).toBe("USDC · 500~500 · 30일 · 50bps");
  });
});
