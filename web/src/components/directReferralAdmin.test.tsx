import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RewardDetailPanel } from "@/components/RewardDetailPanel";
import { StakingDetailPanel } from "@/components/StakingDetailPanel";
import { RewardsTab } from "@/components/tabs/RewardsTab";
import type { AdminRewardDetail, AdminStakingDetail } from "@/lib/api";

const baseStaking: AdminStakingDetail = {
  id: "staking-1",
  account_id: "account-1",
  principal_amount_base: "1000000",
  daily_interest_bps_snapshot: "50",
  duration_days_snapshot: 30,
  status: "ACTIVE",
  started_at: "2026-06-20T00:00:00.000Z",
  matures_at: "2026-07-20T00:00:00.000Z",
  activated_at: "2026-06-20T00:00:00.000Z",
  cancel_requested_at: null,
  cancelled_at: null,
  matured_at: null,
  closed_at: null,
  source_ledger_event_id: "ledger-1",
  cancellation_ledger_event_id: null,
  created_at: "2026-06-19T00:00:00.000Z",
  updated_at: "2026-06-20T00:00:00.000Z",
  product: {
    id: "product-1",
    name: "30D",
    symbol: "BJC",
    decimals: 0,
    min_stake_amount_base: "1000",
    max_stake_amount_base: "100000000",
    staking_days: 30,
    daily_interest_bps: "50",
    is_active: true,
  },
  account: {
    id: "account-1",
    login_id: "source-user",
    display_name: "Source User",
  },
};

const directReferralReward: AdminRewardDetail = {
  id: "reward-1",
  account_id: "sponsor-1",
  reward_type: "DIRECT_REFERRAL",
  reward_date: "2026-06-20",
  amount_base: "150000",
  status: "CONFIRMED",
  account_staking_id: null,
  source_account_id: "source-1",
  source_account_staking_id: "staking-1",
  policy_version_id: "policy-1",
  calc_run_id: "calc-1",
  source_reference: "direct_referral:staking-1:sponsor-1",
  source_ledger_event_id: "ledger-1",
  reversal_reward_id: null,
  available_at: "2026-06-20T00:00:00.000Z",
  confirmed_at: "2026-06-20T00:00:00.000Z",
  reversed_at: null,
  created_at: "2026-06-20T00:00:00.000Z",
  updated_at: "2026-06-20T00:00:00.000Z",
  staking: null,
  product: {
    id: "product-1",
    name: "30D",
    symbol: "BJC",
    decimals: 0,
  },
  account: {
    id: "sponsor-1",
    login_id: "sponsor-user",
    display_name: "Sponsor User",
  },
  source: {
    account_id: "source-1",
    login_id: "source-user",
    display_name: "Source User",
    direct_referral_rate_bps: "1500",
    staking: {
      id: "staking-1",
      principal_amount_base: "1000000",
      status: "ACTIVE",
    },
  },
  calc_run: {
    id: "calc-1",
    run_type: "DIRECT_REFERRAL",
    run_date: "2026-06-20",
    status: "SUCCEEDED",
  },
  metadata: {
    formula_version: "direct_referral_v1",
    source_principal_amount_base: "1000000",
    direct_referral_rate_bps: "1500",
    referral_depth: 1,
  },
  reversal: null,
  original_reward: null,
};

describe("direct referral admin UI", () => {
  it("shows direct referral run button for ADMIN in rewards tab", () => {
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

    expect(html).toContain("직추천 보상 실행");
  });

  it("hides direct referral run button for READER in rewards tab", () => {
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

    expect(html).not.toContain("직추천 보상 실행");
  });

  it("shows single direct referral action only for eligible active staking", () => {
    const eligibleHtml = renderToStaticMarkup(
      <StakingDetailPanel
        actorId="admin-1"
        role="ADMIN"
        staking={baseStaking}
        onUpdated={() => undefined}
        onOpenReward={() => undefined}
      />
    );
    const ineligibleHtml = renderToStaticMarkup(
      <StakingDetailPanel
        actorId="admin-1"
        role="ADMIN"
        staking={{ ...baseStaking, cancel_requested_at: "2026-06-21T00:00:00.000Z" }}
        onUpdated={() => undefined}
        onOpenReward={() => undefined}
      />
    );

    expect(eligibleHtml).toContain("직추천 보상 계산");
    expect(ineligibleHtml).not.toContain("직추천 보상 계산</button>");
    expect(ineligibleHtml).toContain("직추천 계산 비대상");
  });

  it("renders direct referral source fields in reward detail", () => {
    const html = renderToStaticMarkup(
      <RewardDetailPanel
        actorId="admin-1"
        role="ADMIN"
        reward={directReferralReward}
        onUpdated={() => undefined}
      />
    );

    expect(html).toContain("직추천 발생 정보");
    expect(html).toContain("발생 회원 ID");
    expect(html).toContain("발생 회원 아이디");
    expect(html).toContain("발생 스테이킹 ID");
    expect(html).toContain("계산식 버전");
  });
});
