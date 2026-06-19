import { render, screen, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "@/pages/DashboardPage";
import { useSessionStore } from "@/store/sessionStore";

const apiMock = vi.hoisted(() => ({
  me: vi.fn(),
  getMyBinaryLegs: vi.fn(),
  getMyStakingSummary: vi.fn(),
  getMyRewardsSummary: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: apiMock,
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "error"),
}));

vi.mock("@/components/BinaryLegsCard", () => ({
  BinaryLegsCard: () => <div data-testid="binary-legs-card" />,
}));

describe("DashboardPage", () => {
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

    apiMock.me.mockResolvedValue({
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
    apiMock.getMyBinaryLegs.mockResolvedValue({
      left: { member_count: 0, total_stake_amount_base: "0", total_sales_amount_base: "0", total_reward_amount_base: "0" },
      right: { member_count: 0, total_stake_amount_base: "0", total_sales_amount_base: "0", total_reward_amount_base: "0" },
      weak_leg: "LEFT",
      weak_leg_volume_base: "0",
    });
    apiMock.getMyStakingSummary.mockResolvedValue({
      pending_count: 2,
      active_count: 3,
      cancel_requested_count: 0,
      cancelled_count: 0,
      matured_count: 0,
      closed_count: 0,
      pending_principal_amount_base: "5000",
      active_principal_amount_base: "12000",
    });
    apiMock.getMyRewardsSummary.mockResolvedValue({
      pending_reward_amount_base: "20",
      confirmed_reward_amount_base: "200",
      withdrawable_reward_amount_base: "180",
      withdrawn_reward_amount_base: "0",
      daily_reward_amount_base: "350",
      reward_count: 7,
    });
  });

  it("renders staking and rewards summary from APIs", async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("활성 스테이킹 원금")).toBeInTheDocument();
      expect(screen.getByText("12,000")).toBeInTheDocument();
      expect(screen.getByText("확정 보상")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("활성 / 대기 건수")).toBeInTheDocument();
      expect(screen.getByText("3 / 2")).toBeInTheDocument();
    });
  });
});
