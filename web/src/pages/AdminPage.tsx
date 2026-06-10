import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminShell } from "@/components/AdminShell";
import { PoliciesTab } from "@/components/tabs/PoliciesTab";
import { LedgerEventsTab } from "@/components/tabs/LedgerEventsTab";
import { CalcSettlementTab } from "@/components/tabs/CalcSettlementTab";
import { ReportsTab } from "@/components/tabs/ReportsTab";
import { AuditLogsTab } from "@/components/tabs/AuditLogsTab";
import { useSessionStore } from "@/store/sessionStore";

type TabKey = "policies" | "ledger" | "calc" | "reports" | "audit";

export default function AdminPage() {
  const actorId = useSessionStore((state) => state.actorId)!;
  const role = useSessionStore((state) => state.role)!;
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = (searchParams.get("tab") as TabKey | null) ?? "policies";

  const safeTab = useMemo<TabKey>(() => {
    if (role !== "ADMIN" && currentTab === "audit") {
      return "reports";
    }
    return currentTab;
  }, [currentTab, role]);

  function changeTab(tab: TabKey) {
    setSearchParams({ tab });
  }

  return (
    <AdminShell activeTab={safeTab} onTabChange={changeTab}>
      {safeTab === "policies" ? <PoliciesTab actorId={actorId} role={role} /> : null}
      {safeTab === "ledger" ? <LedgerEventsTab actorId={actorId} role={role} /> : null}
      {safeTab === "calc" ? <CalcSettlementTab actorId={actorId} role={role} /> : null}
      {safeTab === "reports" ? <ReportsTab actorId={actorId} role={role} /> : null}
      {safeTab === "audit" ? <AuditLogsTab actorId={actorId} role={role} /> : null}
    </AdminShell>
  );
}
