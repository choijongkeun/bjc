import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RewardSummaryCards } from "@/components/RewardSummaryCards";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

describe("RewardSummaryCards", () => {
  it("renders reward summary values and links withdrawal cards", () => {
    render(
      <MemoryRouter future={routerFuture}>
        <RewardSummaryCards
          summary={{
            pending_reward_amount_base: "100",
            confirmed_reward_amount_base: "200",
            withdrawable_reward_amount_base: "150",
            withdrawn_reward_amount_base: "10",
            daily_reward_amount_base: "350",
            bonus_reward_amount_base: "120",
            reward_count: 5,
          }}
          withdrawalsHref="/withdrawals"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("대기 보상")).toBeInTheDocument();
    expect(screen.getByText("출금 완료 보상")).toBeInTheDocument();
    expect(screen.getByText("실제 완료된 출금 합계")).toBeInTheDocument();
    expect(screen.getByText("350")).toBeInTheDocument();
    expect(screen.getByText("BONUS 누적")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /출금 가능 보상/i })).toHaveAttribute("href", "/withdrawals");
  });
});
