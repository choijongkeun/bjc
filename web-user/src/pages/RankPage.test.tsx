import { render, screen, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RankPage from "@/pages/RankPage";
import { useSessionStore } from "@/store/sessionStore";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const apiMock = vi.hoisted(() => ({
  getMyRank: vi.fn(),
  getMyRankHistory: vi.fn(),
  getMyRankBonusRewards: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
}));

describe("RankPage", () => {
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

    apiMock.getMyRank.mockResolvedValue({
      account: {
        id: "account-1",
        login_id: "member01",
        display_name: "회원",
        role: "USER",
        status: "ACTIVE",
      },
      rank_status: {
        account_id: "account-1",
        policy_version_id: "policy-1",
        current_rank_level: 3,
        qualified_at: "2026-06-30T00:00:00.000Z",
        maintained_until: null,
        last_qualification_calc_run_id: "calc-1",
        last_bonus_calc_run_id: "calc-bonus-1",
        last_change_type: "PROMOTED",
        created_at: "2026-06-30T00:00:00.000Z",
        updated_at: "2026-06-30T00:00:00.000Z",
      },
      latest_qualification_result: {
        id: "qual-1",
        calc_run_id: "calc-1",
        account_id: "account-1",
        policy_version_id: "policy-1",
        calculation_date: "2026-06-30",
        period_from: "2026-06-30",
        period_to: "2026-06-30",
        previous_rank_level: 2,
        qualified_rank_level: 3,
        applied_rank_level: 3,
        result_status: "QUALIFIED",
        personal_active_stake_amount_base: "1000000",
        personal_cumulative_stake_amount_base: "1500000",
        direct_referral_count: 4,
        direct_active_referral_count: 3,
        left_leg_volume_base: "8000000",
        right_leg_volume_base: "6000000",
        weak_leg_volume_base: "6000000",
        strong_leg_volume_base: "8000000",
        downline_daily_reward_amount_base: "900000",
        created_at: "2026-06-30T00:00:00.000Z",
      },
      next_rank: { rank_level: 4 },
      next_rank_progress: [
        {
          metric: "direct_active_referral_count",
          current: 3,
          required: 4,
          met: false,
        },
      ],
    });
    apiMock.getMyRankHistory.mockResolvedValue({
      items: [
        {
          id: "history-1",
          account_id: "account-1",
          policy_version_id: "policy-1",
          calc_run_id: "calc-1",
          qualification_result_id: "qual-1",
          effective_date: "2026-06-30",
          previous_rank_level: 2,
          calculated_rank_level: 3,
          final_rank_level: 3,
          change_type: "PROMOTED",
          personal_active_stake_amount_base: "1000000",
          personal_cumulative_stake_amount_base: "1500000",
          direct_referral_count: 4,
          direct_active_referral_count: 3,
          left_leg_volume_base: "8000000",
          right_leg_volume_base: "6000000",
          weak_leg_volume_base: "6000000",
          strong_leg_volume_base: "8000000",
          downline_daily_reward_amount_base: "900000",
          created_at: "2026-06-30T00:00:00.000Z",
        },
      ],
      page: 1,
      limit: 10,
      total: 1,
    });
    apiMock.getMyRankBonusRewards.mockResolvedValue({
      items: [
        {
          id: "reward-1",
          account_id: "account-1",
          reward_type: "RANK_BONUS",
          reward_date: "2026-06-30",
          amount_base: "45000",
          status: "CONFIRMED",
          account_staking_id: null,
          policy_version_id: "policy-1",
          calc_run_id: "calc-bonus-1",
          source_reference: "rank_bonus:2026-06-30:account-1:3",
          source_ledger_event_id: "ledger-1",
          reversal_reward_id: null,
          available_at: "2026-06-30T00:00:00.000Z",
          confirmed_at: "2026-06-30T00:00:00.000Z",
          reversed_at: null,
          created_at: "2026-06-30T00:00:00.000Z",
          updated_at: "2026-06-30T00:00:00.000Z",
          staking: null,
          product: null,
          metadata: {
            rank_level: 3,
            base_daily_reward_amount_base: "900000",
          },
        },
      ],
      page: 1,
      limit: 5,
      total: 1,
    });
  });

  it("renders current rank, next rank progress, history and rank bonus rewards", async () => {
    render(
      <MemoryRouter future={routerFuture}>
        <RankPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("현재 직급")).toBeInTheDocument();
      expect(screen.getByText("다음 직급")).toBeInTheDocument();
      expect(screen.getByText("직추천 ACTIVE")).toBeInTheDocument();
      expect(screen.getByText("최근 직급 이력")).toBeInTheDocument();
      expect(screen.getByText("최근 RANK_BONUS 내역")).toBeInTheDocument();
      expect(screen.getByText("45,000")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "보상 상세" })).toHaveAttribute("href", "/rewards/reward-1");
    });
  });
});
