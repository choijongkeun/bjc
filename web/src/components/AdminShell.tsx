import { Link } from "react-router-dom";
import { Activity, ClipboardList, Coins, FileClock, GitBranch, Layers3, LogOut, Package2, ShieldCheck, Users2 } from "lucide-react";
import { useSessionStore } from "@/store/sessionStore";
import { Button, cn } from "@/components/ui";

type AdminTab = "policies" | "stakings" | "ledger" | "calc" | "reports" | "audit" | "accounts" | "network";

const navItems = [
  { key: "policies", label: "정책/상품", icon: Layers3 },
  { key: "stakings", label: "스테이킹 관리", icon: Coins },
  { key: "accounts", label: "회원", icon: Users2 },
  { key: "network", label: "추천/바이너리", icon: GitBranch },
  { key: "ledger", label: "원장 이벤트", icon: Activity },
  { key: "calc", label: "계산/정산", icon: Package2 },
  { key: "reports", label: "리포트", icon: ClipboardList },
  { key: "audit", label: "감사로그", icon: FileClock },
] as const;

export function AdminShell({
  activeTab,
  onTabChange,
  children,
}: {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  children: React.ReactNode;
}) {
  const actorId = useSessionStore((state) => state.actorId);
  const role = useSessionStore((state) => state.role);
  const logout = useSessionStore((state) => state.logout);
  const visibleItems = role === "ADMIN" ? navItems : navItems.filter((item) => item.key !== "audit");

  return (
    <div className="app-shell">
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-6 px-6 py-6">
        <aside className="hidden w-64 shrink-0 rounded-[28px] border border-slate-800/80 bg-slate-950/70 p-5 shadow-2xl lg:flex lg:flex-col">
          <Link to="/admin?tab=policies" className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-slate-500">BJC Defi</div>
              <div className="text-lg font-bold text-slate-100">Admin Console</div>
            </div>
          </Link>
          <nav className="space-y-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => onTabChange(item.key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition",
                    active ? "bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/30" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
            <div className="font-semibold">현재 Actor</div>
            <div className="mt-2 break-all font-mono text-xs text-slate-400">{actorId}</div>
            <div className="mt-3 inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-100">{role}</div>
            <Button variant="ghost" className="mt-4 w-full justify-start px-0 text-rose-300 hover:bg-transparent hover:text-rose-200" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> 로그아웃
            </Button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="glass-card flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Desktop-first Dark Console</div>
              <h1 className="mt-2 text-2xl font-extrabold text-slate-50">BJC 스테이킹 운영 관리자</h1>
              <p className="mt-1 text-sm text-slate-400">정책, 스테이킹, 회원, 추천/바이너리 조직, 원장, 계산, 리포트, 감사 로그를 오프체인 기준으로 관리합니다.</p>
            </div>
            <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{role}</span>
          </header>
          <div className="lg:hidden">
            <div className="flex gap-2 overflow-auto pb-1">
              {visibleItems.map((item) => (
                <button
                  key={item.key}
                  onClick={() => onTabChange(item.key)}
                  className={cn("whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-semibold", activeTab === item.key ? "bg-blue-500 text-white" : "bg-slate-900 text-slate-300")}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
