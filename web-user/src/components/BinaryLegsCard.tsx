import { GitBranch, ShieldCheck } from "lucide-react";
import type { BinaryLegsResponse } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { Badge, Card } from "@/components/ui";

export function BinaryLegsCard({ legs }: { legs: BinaryLegsResponse | null }) {
  const data = legs ?? {
    left: {
      member_count: 0,
      total_stake_amount_base: "0",
      total_sales_amount_base: "0",
      total_reward_amount_base: "0",
    },
    right: {
      member_count: 0,
      total_stake_amount_base: "0",
      total_sales_amount_base: "0",
      total_reward_amount_base: "0",
    },
    weak_leg: "LEFT" as const,
    weak_leg_volume_base: "0",
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-blue-500/12 p-3 text-blue-200">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">LEFT Leg</div>
            <div className="mt-1 tabular text-2xl font-bold text-slate-50">{data.left.member_count}명</div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-400">
          <div>stake(base): <span className="tabular text-slate-200">{formatBaseAmount(data.left.total_stake_amount_base, 0)}</span></div>
          <div>sales(base): <span className="tabular text-slate-200">{formatBaseAmount(data.left.total_sales_amount_base, 0)}</span></div>
          <div>reward(base): <span className="tabular text-slate-200">{formatBaseAmount(data.left.total_reward_amount_base, 0)}</span></div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-500/12 p-3 text-emerald-200">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">RIGHT Leg</div>
            <div className="mt-1 tabular text-2xl font-bold text-slate-50">{data.right.member_count}명</div>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-400">
          <div>stake(base): <span className="tabular text-slate-200">{formatBaseAmount(data.right.total_stake_amount_base, 0)}</span></div>
          <div>sales(base): <span className="tabular text-slate-200">{formatBaseAmount(data.right.total_sales_amount_base, 0)}</span></div>
          <div>reward(base): <span className="tabular text-slate-200">{formatBaseAmount(data.right.total_reward_amount_base, 0)}</span></div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-slate-800 p-3 text-slate-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Weak Leg</div>
            <div className="mt-2">
              <Badge tone={data.weak_leg === "LEFT" ? "blue" : "emerald"}>{data.weak_leg}</Badge>
            </div>
          </div>
        </div>
        <div className="mt-4 text-sm text-slate-400">weak_leg_volume_base</div>
        <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseAmount(data.weak_leg_volume_base, 0)}</div>
      </Card>
    </div>
  );
}
