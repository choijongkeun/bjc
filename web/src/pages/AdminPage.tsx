import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
import { PoliciesTab } from "@/components/tabs/PoliciesTab";
import { AccountsTab } from "@/components/tabs/AccountsTab";
import { NetworkTab } from "@/components/tabs/NetworkTab";
import { LedgerEventsTab } from "@/components/tabs/LedgerEventsTab";
import { CalcSettlementTab } from "@/components/tabs/CalcSettlementTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { AuditLogsTab } from "@/components/tabs/AuditLogsTab";
import { useSessionStore } from "@/store/sessionStore";

type TabKey = "policies" | "accounts" | "network" | "ledger" | "calc" | "reports" | "audit";

const allowedTabs = new Set<TabKey>(["policies", "accounts", "network", "ledger", "calc", "reports", "audit"]);

export default function AdminPage() {
  const actorId = useSessionStore((state) => state.actorId)!;
  const role = useSessionStore((state) => state.role)!;
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get("tab") as TabKey | null) ?? "policies";
  const selectedAccountId = searchParams.get("accountId");

  const safeTab = useMemo<TabKey>(() => {
    if (!allowedTabs.has(currentTab)) {
      return "policies";
    }
    if (role !== "ADMIN" && currentTab === "audit") {
      return "reports";
    }
    return currentTab;
  }, [currentTab, role]);

  function updateParams(next: { tab?: TabKey; accountId?: string | null }) {
    const params = new URLSearchParams(searchParams);
    if (next.tab) params.set("tab", next.tab);
    if (next.accountId === null) {
      params.delete("accountId");
    } else if (next.accountId) {
      params.set("accountId", next.accountId);
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

  return (
    <AdminShell activeTab={safeTab} onTabChange={changeTab}>
      {safeTab === "policies" ? <PoliciesTab actorId={actorId} role={role} /> : null}
      {safeTab === "accounts" ? (
        <AccountsTab
          actorId={actorId}
          role={role}
          selectedAccountId={selectedAccountId}
          onSelectAccount={selectAccount}
          onOpenNetwork={openNetwork}
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
      {safeTab === "calc" ? <CalcSettlementTab actorId={actorId} role={role} /> : null}
      {safeTab === "reports" ? <ReportsTab actorId={actorId} role={role} /> : null}
      {safeTab === "audit" ? <AuditLogsTab actorId={actorId} role={role} /> : null}
    </AdminShell>
  );
}
