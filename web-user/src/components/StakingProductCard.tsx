import { Clock3, Landmark, Percent, WalletCards } from "lucide-react";
import type { StakingProduct } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { formatDailyInterestBps } from "@/lib/staking";
import { Badge, Button, Card } from "@/components/ui";

export function StakingProductCard({
  product,
  onApply,
}: {
  product: StakingProduct;
  onApply: (product: StakingProduct) => void;
}) {
  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/12 text-blue-200">
          <WalletCards className="h-5 w-5" />
        </div>
        <Badge tone={product.is_active ? "emerald" : "slate"}>{product.is_active ? "신청 가능" : "비활성"}</Badge>
      </div>
      <div className="mt-5">
        <div className="text-lg font-bold text-slate-50">{product.name}</div>
        <div className="mt-1 text-sm text-slate-400">{product.symbol}</div>
      </div>
      <div className="mt-5 space-y-3 text-sm">
        <MetricRow icon={<Percent className="h-4 w-4" />} label="일일 이율" value={`${formatDailyInterestBps(product.daily_interest_bps)} (${product.daily_interest_bps} bps)`} />
        <MetricRow icon={<Clock3 className="h-4 w-4" />} label="스테이킹 기간" value={`${product.staking_days}일`} />
        <MetricRow
          icon={<Landmark className="h-4 w-4" />}
          label="최소 신청 금액"
          value={formatBaseAmount(product.min_stake_amount_base, product.decimals)}
        />
        <MetricRow
          icon={<Landmark className="h-4 w-4" />}
          label="최대 신청 금액"
          value={formatBaseAmount(product.max_stake_amount_base, product.decimals)}
        />
      </div>
      <Button className="mt-6 w-full" onClick={() => onApply(product)} disabled={!product.is_active}>
        스테이킹 신청
      </Button>
    </Card>
  );
}

function MetricRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[20px] border border-slate-800 bg-slate-950/45 px-4 py-3">
      <div className="flex items-center gap-2 text-slate-400">
        <span className="text-slate-500">{icon}</span>
        <span>{label}</span>
      </div>
      <span className="tabular text-right font-semibold text-slate-100">{value}</span>
    </div>
  );
}
