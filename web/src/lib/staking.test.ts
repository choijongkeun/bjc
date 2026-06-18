import { describe, expect, it } from "vitest";
import { formatDailyInterestBps, getAdminStakingActionState } from "@/lib/staking";

describe("admin staking helpers", () => {
  it("formats bps text", () => {
    expect(formatDailyInterestBps("50")).toBe("0.005%");
    expect(formatDailyInterestBps("5000")).toBe("0.5%");
  });

  it("returns admin action visibility by status", () => {
    expect(getAdminStakingActionState("PENDING")).toEqual({
      canActivate: true,
      canReject: true,
      canCancel: false,
    });
    expect(getAdminStakingActionState("ACTIVE")).toEqual({
      canActivate: false,
      canReject: false,
      canCancel: true,
    });
  });
});
