import { render, screen, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import WithdrawalDetailPage from "@/pages/WithdrawalDetailPage";
import { useSessionStore } from "@/store/sessionStore";

const apiMock = vi.hoisted(() => ({
  getMyWithdrawal: vi.fn(),
  cancelMyWithdrawal: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
}));

function createWithdrawal(status: "REQUESTED" | "COMPLETED") {
  return {
    id: "withdrawal-1",
    account_id: "account-1",
    fee_policy_version_id: "policy-1",
    withdrawal_type: "DAILY_REWARD" as const,
    requested_amount_base: "1000",
    fee_amount_base: "100",
    net_amount_base: "900",
    fee_mode_snapshot: "DEDUCT_FROM_WITHDRAWAL" as const,
    status,
    idempotency_key: "withdrawal-key-1",
    wallet_address: "0x1234567890abcdef",
    network: "BASE",
    tx_hash: status === "COMPLETED" ? "0xtxhash" : null,
    requested_kst_date: "2026-06-19",
    requested_at: "2026-06-19T00:00:00.000Z",
    approved_at: null,
    processing_at: null,
    completed_at: status === "COMPLETED" ? "2026-06-19T01:00:00.000Z" : null,
    rejected_at: null,
    failed_at: null,
    cancelled_at: null,
    reject_reason: null,
    failure_reason: null,
    created_at: "2026-06-19T00:00:00.000Z",
    updated_at: "2026-06-19T00:00:00.000Z",
    allocation_summary: {
      allocation_count: 1,
      reserved_amount_base: status === "REQUESTED" ? "1000" : "0",
      consumed_amount_base: status === "COMPLETED" ? "1000" : "0",
      released_amount_base: "0",
    },
    allocations: [],
  };
}

describe("WithdrawalDetailPage", () => {
  beforeEach(() => {
    useSessionStore.setState({
      accessToken: "token",
      account: {
        id: "account-1",
        login_id: "member01",
        display_name: "회원",
        role: "USER",
        status: "ACTIVE",
        referral_code: "REF001",
        sponsor_account_id: null,
        binary_parent_account_id: null,
        binary_position: null,
        joined_at: null,
        last_login_at: null,
      },
    });
    apiMock.cancelMyWithdrawal.mockReset();
  });

  it("shows cancel button only for requested withdrawals", async () => {
    apiMock.getMyWithdrawal.mockResolvedValueOnce({ withdrawal: createWithdrawal("REQUESTED") });

    render(
      <MemoryRouter initialEntries={["/withdrawals/withdrawal-1"]}>
        <Routes>
          <Route path="/withdrawals/:withdrawalId" element={<WithdrawalDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "REQUESTED 출금 취소" })).toBeInTheDocument();
    });
  });

  it("hides cancel button for completed withdrawals", async () => {
    apiMock.getMyWithdrawal.mockResolvedValueOnce({ withdrawal: createWithdrawal("COMPLETED") });

    render(
      <MemoryRouter initialEntries={["/withdrawals/withdrawal-1"]}>
        <Routes>
          <Route path="/withdrawals/:withdrawalId" element={<WithdrawalDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("취소 불가 상태")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "REQUESTED 출금 취소" })).not.toBeInTheDocument();
  });
});
