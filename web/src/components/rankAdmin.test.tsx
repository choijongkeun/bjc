import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RewardDetailPanel } from "@/components/RewardDetailPanel";
import { RankRunSummary } from "@/components/ranks/RankRunSummary";
import { RanksTab } from "@/components/tabs/RanksTab";
import type { AdminRewardDetail } from "@/lib/api";

const rankBonusReward: AdminRewardDetail = {
  id: "reward-rank-1",
  account_id: "account-1",
  reward_type: "RANK_BONUS",
  reward_date: "2026-06-30",
  amount_base: "50000",
  status: "CONFIRMED",
  account_staking_id: null,
  source_account_id: null,
  source_account_staking_id: null,
  policy_version_id: "policy-1",
  calc_run_id: "calc-rank-bonus-1",
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
  account: {
    id: "account-1",
    login_id: "rank-user",
    display_name: "Rank User",
  },
  source: null,
  calc_run: {
    id: "calc-rank-bonus-1",
    run_type: "RANK_BONUS",
    run_date: "2026-06-30",
    status: "SUCCEEDED",
  },
  metadata: {
    formula_version: "rank_bonus_v1",
    organization_scope: "binary_subtree_daily_reward_net_v1",
    rank_level: 3,
    effective_bonus_bps: "500",
    base_daily_reward_amount_base: "1000000",
    qualification_calc_run_id: "calc-rank-qualification-1",
    qualification_result_id: "qualification-1",
  },
  reversal: null,
  original_reward: null,
};

describe("rank admin UI", () => {
  it("shows rank execution buttons for ADMIN", () => {
    const html = renderToStaticMarkup(
      <RanksTab
        actorId="admin-1"
        role="ADMIN"
        selectedAccountId={null}
        selectedCalcRunId={null}
        onSelectAccountId={() => undefined}
        onSelectCalcRunId={() => undefined}
        onOpenRewards={() => undefined}
        onOpenCalcRun={() => undefined}
      />
    );

    expect(html).toContain("Qualification 실행");
    expect(html).toContain("Rank Bonus 실행");
  });

  it("hides rank execution buttons for READER", () => {
    const html = renderToStaticMarkup(
      <RanksTab
        actorId="reader-1"
        role="READER"
        selectedAccountId={null}
        selectedCalcRunId={null}
        onSelectAccountId={() => undefined}
        onSelectCalcRunId={() => undefined}
        onOpenRewards={() => undefined}
        onOpenCalcRun={() => undefined}
      />
    );

    expect(html).not.toContain("Qualification 실행");
    expect(html).not.toContain("Rank Bonus 실행");
    expect(html).toContain("READER는 rank 실행 버튼이 비노출되며 조회만 가능합니다.");
  });

  it("renders rank bonus metadata in reward detail without sensitive fields", () => {
    const html = renderToStaticMarkup(
      <RewardDetailPanel
        actorId="admin-1"
        role="ADMIN"
        reward={rankBonusReward}
        onUpdated={() => undefined}
      />
    );

    expect(html).toContain("조직 범위");
    expect(html).toContain("직급 단계");
    expect(html).toContain("추가 비율");
    expect(html).toContain("직급 산정 결과 ID");
    expect(html).not.toContain("password");
    expect(html).not.toContain("token");
  });

  it("renders rank bonus summary totals and rewards CTA", () => {
    const html = renderToStaticMarkup(
      <RankRunSummary
        summary={{
          calc_run_id: "calc-rank-bonus-1",
          target_count: 3,
          created_count: 1,
          no_rank_skip_count: 0,
          no_qualification_skip_count: 0,
          zero_base_skip_count: 1,
          zero_reward_skip_count: 0,
          duplicate_skip_count: 1,
          conflict_count: 0,
          failed_count: 0,
          total_base_daily_reward_amount_base: "1000000",
          total_rank_bonus_amount_base: "50000",
          status: "SUCCEEDED",
        }}
        onOpenRewards={() => undefined}
      />
    );

    expect(html).toContain("total_base_daily_reward");
    expect(html).toContain("total_rank_bonus");
    expect(html).toContain("이 실행의 보상 보기");
  });
});
