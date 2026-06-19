import { describe, expect, it } from "vitest";
import {
  buildWithdrawalListQuery,
  canCancelMyWithdrawal,
  formatWithdrawalAmountBase,
  getWithdrawalStatusLabel,
  getWithdrawalTypeLabel,
  sumWithdrawalAvailableBalance,
} from "@/lib/withdrawals";

describe("user withdrawal helpers", () => {
  it("returns withdrawal labels", () => {
    expect(getWithdrawalTypeLabel("DAILY_REWARD")).toBe("일일 보상");
    expect(getWithdrawalTypeLabel("BONUS")).toBe("보너스");
    expect(getWithdrawalStatusLabel("REQUESTED")).toBe("신청");
    expect(getWithdrawalStatusLabel("CANCELLED")).toBe("취소");
  });

  it("builds withdrawal query without empty filters", () => {
    expect(
      buildWithdrawalListQuery({
        withdrawal_type: "",
        status: "PROCESSING",
        requested_from: "",
        requested_to: "2026-06-20",
        page: 3,
        limit: 50,
        sort: "completed_at_desc",
      })
    ).toEqual({
      withdrawal_type: undefined,
      status: "PROCESSING",
      requested_from: undefined,
      requested_to: "2026-06-20",
      page: 3,
      limit: 50,
      sort: "completed_at_desc",
    });
  });

  it("allows cancel only for requested withdrawals", () => {
    expect(canCancelMyWithdrawal("REQUESTED")).toBe(true);
    expect(canCancelMyWithdrawal("APPROVED")).toBe(false);
    expect(canCancelMyWithdrawal("COMPLETED")).toBe(false);
  });

  it("keeps amount formatting in string-safe path", () => {
    expect(formatWithdrawalAmountBase("12345678901234567890")).toBe("12,345,678,901,234,567,890");
    expect(sumWithdrawalAvailableBalance({
      daily_reward: {
        confirmed_amount_base: "0",
        available_amount_base: "99999999999999999999",
        reserved_amount_base: "0",
        completed_amount_base: "0",
      },
      bonus: {
        confirmed_amount_base: "0",
        available_amount_base: "1",
        reserved_amount_base: "0",
        completed_amount_base: "0",
      },
      total: {
        reserved_amount_base: "0",
        completed_amount_base: "0",
      },
    })).toBe("100000000000000000000");
  });
});
