import { describe, expect, it } from "vitest";
import { formatDailyInterestBps, getAvailableUserStakingAction, sumBaseAmounts } from "@/lib/staking";

describe("staking helpers", () => {
  it("formats bps as percent text", () => {
    expect(formatDailyInterestBps("50")).toBe("0.005%");
    expect(formatDailyInterestBps("5000")).toBe("0.5%");
    expect(formatDailyInterestBps("12345")).toBe("1.2345%");
  });

  it("returns user action by status", () => {
    expect(getAvailableUserStakingAction("PENDING")).toBe("cancel");
    expect(getAvailableUserStakingAction("ACTIVE")).toBe("cancel_request");
    expect(getAvailableUserStakingAction("CANCEL_REQUESTED")).toBe("none");
  });

  it("sums decimal-string base amounts with bigint", () => {
    expect(sumBaseAmounts(["1000", "2500", "99"])).toBe("3599");
  });
});
