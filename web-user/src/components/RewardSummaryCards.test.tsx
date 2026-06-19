import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RewardSummaryCards } from "@/components/RewardSummaryCards";

describe("RewardSummaryCards", () => {
  it("renders reward summary values and withdrawal note", () => {
    render(
      <RewardSummaryCards
        summary={{
          pending_reward_amount_base: "100",
          confirmed_reward_amount_base: "200",
          withdrawable_reward_amount_base: "150",
          withdrawn_reward_amount_base: "0",
          daily_reward_amount_base: "350",
          reward_count: 5,
        }}
      />
    );

    expect(screen.getByText("대기 보상")).toBeInTheDocument();
    expect(screen.getByText("출금 완료 보상")).toBeInTheDocument();
    expect(screen.getByText("출금 기능 준비 중")).toBeInTheDocument();
    expect(screen.getByText("350")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
