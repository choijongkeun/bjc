import { render, screen, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StakingDetailPage from "@/pages/StakingDetailPage";
import { useSessionStore } from "@/store/sessionStore";

const apiMock = vi.hoisted(() => ({
  getMyStaking: vi.fn(),
  getMyStakingRewards: vi.fn(),
  cancelMyStaking: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
}));

describe("StakingDetailPage", () => {
  beforeEach(() => {
    useSessionStore.setState({
      accessToken: "token",
      account: null,
    });

    apiMock.getMyStaking.mockResolvedValue({
      staking: {
        id: "staking-1",
        account_id: "account-1",
        principal_amount_base: "100000",
        daily_interest_bps_snapshot: "25",
        duration_days_snapshot: 30,
        status: "ACTIVE",
        started_at: "2026-06-18T00:00:00.000Z",
        matures_at: "2026-07-18T00:00:00.000Z",
        activated_at: "2026-06-18T00:00:00.000Z",
        cancel_requested_at: null,
        cancelled_at: null,
        matured_at: null,
        closed_at: null,
        source_ledger_event_id: null,
        cancellation_ledger_event_id: null,
        created_at: "2026-06-17T00:00:00.000Z",
        updated_at: "2026-06-17T00:00:00.000Z",
        product: {
          id: "product-1",
          name: "Starter",
          symbol: "BJC",
          decimals: 0,
          min_stake_amount_base: "1000",
          max_stake_amount_base: "1000000",
          staking_days: 30,
          daily_interest_bps: "25",
          is_active: true,
        },
      },
    });

    apiMock.getMyStakingRewards.mockResolvedValue({
      items: [
        {
          id: "reward-1",
          account_id: "account-1",
          reward_type: "DAILY_REWARD",
          reward_date: "2026-06-19",
          amount_base: "250",
          status: "CONFIRMED",
          account_staking_id: "staking-1",
          policy_version_id: "policy-1",
          calc_run_id: "calc-1",
          source_reference: "reward.daily:staking-1:2026-06-19",
          source_ledger_event_id: null,
          reversal_reward_id: null,
          available_at: null,
          confirmed_at: "2026-06-19T00:00:00.000Z",
          reversed_at: null,
          created_at: "2026-06-19T00:00:00.000Z",
          updated_at: "2026-06-19T00:00:00.000Z",
          staking: null,
          product: null,
        },
      ],
      page: 1,
      limit: 10,
      total: 1,
    });
  });

  it("renders staking rewards section", async () => {
    render(
      <MemoryRouter initialEntries={["/staking/staking-1"]}>
        <Routes>
          <Route path="/staking/:stakingId" element={<StakingDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("이 스테이킹에서 발생한 보상")).toBeInTheDocument();
      expect(screen.getByText("2026-06-19")).toBeInTheDocument();
      expect(screen.getByText("250")).toBeInTheDocument();
    });
  });
});
