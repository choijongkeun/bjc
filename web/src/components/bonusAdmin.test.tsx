import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RewardDetailPanel } from "@/components/RewardDetailPanel";
import { RewardsTab } from "@/components/tabs/RewardsTab";
import type { AdminRewardDetail } from "@/lib/api";

const contributionReward: AdminRewardDetail = {
  id: "reward-contribution-1",
  account_id: "account-1",
  reward_type: "CONTRIBUTION",
  reward_date: "2026-06-30",
  amount_base: "120",
  status: "CONFIRMED",
  account_staking_id: null,
  source_account_id: null,
  source_account_staking_id: null,
  policy_version_id: "policy-1",
  calc_run_id: "calc-contribution-1",
  source_reference: "calc:CONTRIBUTION:2026-06-30:acct:account-1",
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
    login_id: "bonus-user",
    display_name: "Bonus User"
  },
  source: null,
  calc_run: {
    id: "calc-contribution-1",
    run_type: "CONTRIBUTION",
    run_date: "2026-06-30",
    status: "SUCCEEDED"
  },
  metadata: {
    formula_version: "contribution_v1",
    rule_id: "rule-1",
    weight_bps: "500",
    base_amount_base: "1000",
    pool_amount_base: "200",
    total_score: "5000",
    score_amount_base: "50",
    score_ratio_bps: "100"
  },
  reversal: null,
  original_reward: null
};

const sidecarReward: AdminRewardDetail = {
  ...contributionReward,
  id: "reward-sidecar-1",
  reward_type: "SIDECAR",
  amount_base: "210",
  calc_run_id: "calc-sidecar-1",
  source_reference: "calc:SIDECAR:2026-06-30:calc-sidecar-1:release:withdrawal:req-1",
  source_ledger_event_id: "ledger-2",
  calc_run: {
    id: "calc-sidecar-1",
    run_type: "SIDECAR",
    run_date: "2026-06-30",
    status: "SUCCEEDED"
  },
  metadata: {
    formula_version: "sidecar_v1",
    requested_amount_base: "300",
    release_amount_base: "210",
    freeze_amount_base: "90",
    release_bps: "7000",
    freeze_bps: "3000",
    sidecar_status: "SIDECAR_ACTIVE"
  }
};

describe("bonus admin UI", () => {
  it("shows contribution and sidecar batch buttons for ADMIN", () => {
    const html = renderToStaticMarkup(
      <RewardsTab
        actorId="admin-1"
        role="ADMIN"
        selectedAccountId={null}
        selectedCalcRunId={null}
        selectedRewardId={null}
        onSelectAccountId={() => undefined}
        onSelectCalcRunId={() => undefined}
        onSelectRewardId={() => undefined}
        onOpenCalcRun={() => undefined}
      />
    );

    expect(html).toContain("기여 보상 실행");
    expect(html).toContain("사이드카 정산 실행");
  });

  it("hides contribution and sidecar batch buttons for READER", () => {
    const html = renderToStaticMarkup(
      <RewardsTab
        actorId="reader-1"
        role="READER"
        selectedAccountId={null}
        selectedCalcRunId={null}
        selectedRewardId={null}
        onSelectAccountId={() => undefined}
        onSelectCalcRunId={() => undefined}
        onSelectRewardId={() => undefined}
        onOpenCalcRun={() => undefined}
      />
    );

    expect(html).not.toContain("기여 보상 실행");
    expect(html).not.toContain("사이드카 정산 실행");
  });

  it("renders contribution and sidecar metadata in reward detail", () => {
    const contributionHtml = renderToStaticMarkup(
      <RewardDetailPanel actorId="admin-1" role="ADMIN" reward={contributionReward} onUpdated={() => undefined} />
    );
    const sidecarHtml = renderToStaticMarkup(
      <RewardDetailPanel actorId="admin-1" role="ADMIN" reward={sidecarReward} onUpdated={() => undefined} />
    );

    expect(contributionHtml).toContain("풀 금액");
    expect(contributionHtml).toContain("점수 비율");
    expect(contributionHtml).toContain("가중치 비율");
    expect(sidecarHtml).toContain("신청 금액");
    expect(sidecarHtml).toContain("동결 금액");
    expect(sidecarHtml).toContain("사이드카 상태");
  });
});
