import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArrowUpRight, Coins, GitBranch, LayoutDashboard, LogOut, Menu, Wallet } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useSessionStore } from "@/store/sessionStore";
import { Badge, Button, Card, cn } from "@/components/ui";

const menuItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, enabled: true },
  { label: "Staking", href: "/staking", icon: Coins, enabled: true },
  { label: "Network", href: "/network", icon: GitBranch, enabled: true },
  { label: "Rewards", href: "#", icon: ArrowUpRight, enabled: false },
  { label: "Withdrawals", href: "#", icon: Wallet, enabled: false },
] as const;

export function UserShell({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const account = useSessionStore((state) => state.account);
  const clearSession = useSessionStore((state) => state.clearSession);

  const accountName = useMemo(() => {
    if (!account) return "회원";
    return account.display_name ?? account.login_id ?? "회원";
  }, [account]);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await api.logout(accessToken);
    } catch {
      // ignore logout failure and clear client session regardless
    } finally {
      clearSession();
      setLoggingOut(false);
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-[280px] border-r border-slate-800 bg-slate-950/92 p-5 backdrop-blur-xl transition md:static md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="rounded-[28px] border border-slate-800 bg-slate-900/65 p-5">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">BJC User Front</div>
              <div className="mt-3 text-2xl font-extrabold text-slate-50">회원 워크스페이스</div>
              <div className="mt-2 text-sm text-slate-400">추천인과 바이너리 조직을 기준으로 개인 네트워크 상태를 조회합니다.</div>
            </div>

            <nav className="mt-6 flex-1 space-y-2">
              {menuItems.map((item) =>
                item.enabled ? (
                  <NavLink
                    key={item.label}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-between rounded-[22px] px-4 py-3 text-sm font-semibold transition",
                        isActive || location.pathname === item.href
                          ? "bg-blue-500/15 text-blue-100 shadow-[0_12px_36px_rgba(37,99,235,0.16)]"
                          : "bg-slate-900/30 text-slate-300 hover:bg-slate-900/70"
                      )
                    }
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <ArrowUpRight className="h-4 w-4 opacity-50" />
                  </NavLink>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    disabled
                    className="flex w-full items-center justify-between rounded-[22px] border border-slate-800 bg-slate-900/25 px-4 py-3 text-left text-sm font-semibold text-slate-500"
                  >
                    <span className="flex items-center gap-3">
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </span>
                    <Badge tone="slate">Coming Soon</Badge>
                  </button>
                )
              )}
            </nav>

            <Card className="mt-6 bg-slate-900/55">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">내 세션</div>
              <div className="mt-2 text-lg font-semibold text-slate-50">{accountName}</div>
              <div className="mt-2 text-sm text-slate-400">{account?.login_id ?? "로그인 정보 로딩 중"}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="blue">{account?.status ?? "ACTIVE"}</Badge>
                <Badge tone="slate">{account?.binary_position ?? "ROOT"}</Badge>
              </div>
              <Button className="mt-4 w-full" variant="secondary" onClick={() => void handleLogout()} disabled={loggingOut}>
                <LogOut className="mr-2 h-4 w-4" />
                {loggingOut ? "로그아웃 중..." : "Logout"}
              </Button>
            </Card>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/70 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-8">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-2 text-slate-100 md:hidden"
                  onClick={() => setMobileOpen((value) => !value)}
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">BJC Member View</div>
                  <h1 className="mt-1 text-xl font-bold text-slate-50">{title}</h1>
                  <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">{actions}</div>
            </div>
          </header>

          <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
