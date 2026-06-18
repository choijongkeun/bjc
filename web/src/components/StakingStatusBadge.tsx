import type { AccountStakingStatus } from "@/lib/api";
import { cn } from "@/components/ui";

const toneMap: Record<AccountStakingStatus, string> = {
  PENDING: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  ACTIVE: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  CANCEL_REQUESTED: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
  CANCELLED: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
  MATURED: "bg-slate-500/15 text-slate-300 ring-slate-400/30",
  CLOSED: "bg-slate-700/40 text-slate-200 ring-slate-500/30",
};

export function StakingStatusBadge({ status }: { status: AccountStakingStatus }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", toneMap[status])}>{status}</span>;
}
