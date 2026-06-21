import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
import { PoliciesTab } from "@/components/tabs/PoliciesTab";
import { StakingsTab } from "@/components/tabs/StakingsTab";
import { AccountsTab } from "@/components/tabs/AccountsTab";
import { NetworkTab } from "@/components/tabs/NetworkTab";
import { LedgerEventsTab } from "@/components/tabs/LedgerEventsTab";
import { CalcSettlementTab } from "@/components/tabs/CalcSettlementTab";
import { RanksTab } from "@/components/tabs/RanksTab";
import { RewardsTab } from "@/components/tabs/RewardsTab";
import { WithdrawalsTab } from "@/components/tabs/WithdrawalsTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { AuditLogsTab } from "@/components/tabs/AuditLogsTab";
import { useSessionStore } from "@/store/sessionStore";

type TabKey =
  | "policies"
  | "stakings"
  | "accounts"
  | "network"
  | "ledger"
  | "calc"
  | "ranks"
  | "rewards"
  | "withdrawals"
  | "reports"
  | "audit";

const allowedTabs = new Set<TabKey>([
  "policies",
  "stakings",
  "accounts",
  "network",
  "ledger",
  "calc",
  "ranks",
  "rewards",
  "withdrawals",
  "reports",
  "audit",
]);

export default function AdminPage() {
  const account = useSessionStore((state) => state.account)!;
  const actorId = account.id;
  const role = account.role;
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get("tab") as TabKey | null) ?? "policies";
  const selectedAccountId = searchParams.get("accountId");
  const selectedCalcRunId = searchParams.get("calcRunId");
  const selectedRewardId = searchParams.get("rewardId");

  const safeTab = useMemo<TabKey>(() => {
    if (!allowedTabs.has(currentTab)) {
      return "policies";
    }
    if (role !== "ADMIN" && currentTab === "audit") {
      return "reports";
    }
    return currentTab;
  }, [currentTab, role]);

  function updateParams(next: { tab?: TabKey; accountId?: string | null; calcRunId?: string | null; rewardId?: string | null }) {
    const params = new URLSearchParams(searchParams);
    if (next.tab) params.set("tab", next.tab);
    if (next.accountId === null) {
      params.delete("accountId");
    } else if (next.accountId) {
      params.set("accountId", next.accountId);
    }
    if (next.calcRunId === null) {
      params.delete("calcRunId");
    } else if (next.calcRunId) {
      params.set("calcRunId", next.calcRunId);
    }
    if (next.rewardId === null) {
      params.delete("rewardId");
    } else if (next.rewardId) {
      params.set("rewardId", next.rewardId);
    }
    setSearchParams(params);
  }

  function changeTab(tab: TabKey) {
    updateParams({ tab });
  }

  function selectAccount(accountId: string) {
    updateParams({ accountId });
  }

  function openNetwork(accountId: string) {
    updateParams({ tab: "network", accountId });
  }

  function openStakings(accountId: string) {
    updateParams({ tab: "stakings", accountId, rewardId: null });
  }

  function openRewards(target: { accountId?: string | null; calcRunId?: string | null; rewardId?: string | null }) {
    updateParams({
      tab: "rewards",
      accountId: target.accountId ?? null,
      calcRunId: target.calcRunId ?? null,
      rewardId: target.rewardId ?? null,
    });
  }

  function openCalcRun(calcRunId: string) {
    updateParams({
      tab: "calc",
      calcRunId,
      rewardId: null,
    });
  }

  function openWithdrawals(accountId: string) {
    updateParams({
      tab: "withdrawals",
      accountId,
      calcRunId: null,
    });
  }

  return (
    <AdminShell activeTab={safeTab} onTabChange={changeTab}>
      {safeTab === "policies" ? <PoliciesTab actorId={actorId} role={role} /> : null}
      {safeTab === "stakings" ? (
        <StakingsTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          onSelectAccountId={selectAccount}
          onOpenReward={(rewardId) => openRewards({ rewardId })}
        />
      ) : null}
      {safeTab === "accounts" ? (
        <AccountsTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          onSelectAccount={selectAccount}
          onOpenNetwork={openNetwork}
          onOpenStakings={openStakings}
          onOpenRewards={(accountId) => openRewards({ accountId })}
          onOpenWithdrawals={openWithdrawals}
          onOpenRanks={(accountId) => updateParams({ tab: "ranks", accountId, rewardId: null })}
        />
      ) : null}
      {safeTab === "network" ? (
        <NetworkTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          onSelectAccountId={selectAccount}
        />
      ) : null}
      {safeTab === "ledger" ? <LedgerEventsTab actorId={actorId} role={role} /> : null}
      {safeTab === "calc" ? (
        <CalcSettlementTab
          actorId={actorId}
          role={role}
          selectedCalcRunId={selectedCalcRunId}
          onSelectCalcRunId={(calcRunId) => updateParams({ calcRunId })}
          onOpenRewards={(calcRunId) => openRewards({ calcRunId })}
          onOpenRanks={(target) =>
            updateParams({
              tab: "ranks",
              calcRunId: target.calcRunId ?? null,
              accountId: target.accountId ?? null,
              rewardId: null,
            })
          }
        />
      ) : null}
      {safeTab === "ranks" ? (
        <RanksTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          selectedCalcRunId={selectedCalcRunId}
          onSelectAccountId={(accountId) => updateParams({ accountId })}
          onSelectCalcRunId={(calcRunId) => updateParams({ calcRunId })}
          onOpenRewards={openRewards}
          onOpenCalcRun={openCalcRun}
        />
      ) : null}
      {safeTab === "rewards" ? (
        <RewardsTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          selectedCalcRunId={selectedCalcRunId}
          selectedRewardId={selectedRewardId}
          onSelectAccountId={(accountId) => updateParams({ accountId })}
          onSelectCalcRunId={(calcRunId) => updateParams({ calcRunId })}
          onSelectRewardId={(rewardId) => updateParams({ rewardId })}
          onOpenCalcRun={openCalcRun}
        />
      ) : null}
      {safeTab === "withdrawals" ? (
        <WithdrawalsTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          onSelectAccountId={(accountId) => updateParams({ accountId })}
        />
      ) : null}
      {safeTab === "reports" ? <ReportsTab actorId={actorId} role={role} /> : null}
      {safeTab === "audit" ? <AuditLogsTab actorId={actorId} role={role} /> : null}
    </AdminShell>
  );
}
