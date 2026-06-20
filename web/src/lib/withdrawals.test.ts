import { describe, expect, it } from "vitest";
import {
  buildAdminWithdrawalListQuery,
  buildAdminWithdrawalSummaryQuery,
  canManageWithdrawal,
  getAvailableWithdrawalActions,
  getWithdrawalSummaryCardItems,
  maskWalletAddress,
  validateWithdrawalActionInput,
} from "@/lib/withdrawals";

describe("admin withdrawal helpers", () => {
  it("builds admin withdrawal list query without empty filters", () => {
    expect(
      buildAdminWithdrawalListQuery({
        q: "",
        account_id: "account-1",
        withdrawal_type: "",
        status: "REQUESTED",
        network: "",
        requested_from: "",
        requested_to: "2026-06-20",
        completed_from: "",
        completed_to: "",
        page: 2,
        limit: 50,
        sort: "completed_at_desc",
      })
    ).toEqual({
      q: undefined,
      account_id: "account-1",
      withdrawal_type: undefined,
      status: "REQUESTED",
      network: undefined,
      requested_from: undefined,
      requested_to: "2026-06-20",
      completed_from: undefined,
      completed_to: undefined,
      page: 2,
      limit: 50,
      sort: "completed_at_desc",
    });
  });

  it("builds withdrawal summary query from shared filters", () => {
    expect(
      buildAdminWithdrawalSummaryQuery({
        withdrawal_type: "BONUS",
        network: "BASE",
        date_from: "2026-06-01",
        date_to: "",
      })
    ).toEqual({
      date_from: "2026-06-01",
      date_to: undefined,
      withdrawal_type: "BONUS",
      network: "BASE",
    });
  });

  it("returns available actions by withdrawal status", () => {
    expect(getAvailableWithdrawalActions({ status: "REQUESTED" })).toEqual(["approve", "reject"]);
    expect(getAvailableWithdrawalActions({ status: "APPROVED" })).toEqual(["processing"]);
    expect(getAvailableWithdrawalActions({ status: "PROCESSING" })).toEqual(["complete", "fail"]);
    expect(getAvailableWithdrawalActions({ status: "COMPLETED" })).toEqual([]);
  });

  it("splits admin and reader capabilities", () => {
    expect(canManageWithdrawal("ADMIN")).toBe(true);
    expect(canManageWithdrawal("READER")).toBe(false);
  });

  it("validates complete action fields", () => {
    expect(validateWithdrawalActionInput("complete", { network: "BASE" })).toBe("거래 해시를 입력해 주세요.");
    expect(validateWithdrawalActionInput("complete", { tx_hash: "0xabc" })).toBe("네트워크를 입력해 주세요.");
    expect(validateWithdrawalActionInput("complete", { tx_hash: "0xabc", network: "BASE" })).toBeNull();
  });

  it("validates reject and fail reasons", () => {
    expect(validateWithdrawalActionInput("reject", { reason: "" })).toBe("거절 사유를 입력해 주세요.");
    expect(validateWithdrawalActionInput("fail", { reason: "" })).toBe("실패 사유를 입력해 주세요.");
    expect(validateWithdrawalActionInput("reject", { reason: "invalid wallet" })).toBeNull();
  });

  it("masks wallet addresses for list rows", () => {
    expect(maskWalletAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x123456...345678");
    expect(maskWalletAddress(null)).toBe("-");
  });

  it("formats withdrawal summary cards", () => {
    const cards = getWithdrawalSummaryCardItems({
      requested_amount_base: "1000",
      approved_amount_base: "900",
      processing_amount_base: "800",
      completed_amount_base: "700",
      rejected_amount_base: "10",
      failed_amount_base: "20",
      cancelled_amount_base: "30",
      fee_amount_base: "40",
      net_completed_amount_base: "660",
      requested_count: 5,
      completed_count: 3,
    });

    expect(cards.find((item) => item.label === "수수료")).toEqual({ label: "수수료", value: "40" });
    expect(cards.find((item) => item.label === "완료 건수")).toEqual({ label: "완료 건수", value: "3건" });
  });
});
