import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import WithdrawalsPage from "@/pages/WithdrawalsPage";
import { useSessionStore } from "@/store/sessionStore";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const apiMock = vi.hoisted(() => ({
  getMyWithdrawalBalance: vi.fn(),
  listMyWithdrawals: vi.fn(),
  previewMyWithdrawal: vi.fn(),
  createMyWithdrawal: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
}));

describe("WithdrawalsPage", () => {
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

    apiMock.getMyWithdrawalBalance.mockResolvedValue({
      daily_reward: {
        available_amount_base: "1200",
        reserved_amount_base: "0",
        completed_amount_base: "0",
      },
      bonus: {
        available_amount_base: "300",
        reserved_amount_base: "0",
        completed_amount_base: "0",
      },
      total: {
        reserved_amount_base: "200",
        completed_amount_base: "700",
      },
    });
    apiMock.listMyWithdrawals.mockResolvedValue({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
    });
    apiMock.previewMyWithdrawal.mockResolvedValue({
      withdrawal_type: "DAILY_REWARD",
      requested_amount_base: "1000",
      fee_amount_base: "100",
      net_amount_base: "900",
      available_amount_base: "1200",
      allocations: [
        {
          reward_id: "reward-1",
          allocated_amount_base: "1000",
          fee_amount_base: "100",
          net_amount_base: "900",
          holding_days: 7,
          fee_rate_bps: "1000",
          fee_schedule_days: 30,
        },
      ],
      preview_only: true,
    });
    apiMock.createMyWithdrawal.mockReset();
  });

  it("renders withdrawal balance cards and preview result", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <WithdrawalsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("DAILY_REWARD 출금 가능")).toBeInTheDocument();
      expect(screen.getAllByText("1,200").length).toBeGreaterThan(0);
      expect(screen.getByText("BONUS 출금 가능")).toBeInTheDocument();
      expect(screen.getByText("300")).toBeInTheDocument();
      expect(screen.getByText("예약 금액")).toBeInTheDocument();
      expect(screen.getByText("완료 출금액")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("예: 1000000"), { target: { value: "1000" } });
    fireEvent.change(screen.getByPlaceholderText("출금 지갑 주소"), { target: { value: "0xabc123456789" } });
    fireEvent.change(screen.getByPlaceholderText("BASE"), { target: { value: "BASE" } });
    fireEvent.click(screen.getByRole("button", { name: /수수료 미리보기/i }));

    await waitFor(() => {
      expect(screen.getByText("Preview Result")).toBeInTheDocument();
      expect(screen.getByText("적용 reward 수 1건")).toBeInTheDocument();
    });

    expect(apiMock.previewMyWithdrawal).toHaveBeenCalledWith(
      {
        withdrawal_type: "DAILY_REWARD",
        requested_amount_base: "1000",
      },
      "token"
    );
  });
});
