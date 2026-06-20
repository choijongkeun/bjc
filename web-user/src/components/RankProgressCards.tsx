import type { MyRankResponse } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { Card } from "@/components/ui";

function formatMetricValue(metric: string, value: string | number) {
  if (metric === "weak_leg_volume_base") {
    return formatBaseAmount(String(value), 0);
  }
  return String(value);
}

function getMetricLabel(metric: string) {
  switch (metric) {
    case "direct_active_referral_count":
      return "직추천 회원 수";
    case "weak_leg_volume_base":
      return "약한 레그 매출";
    default:
      return metric;
  }
}

export function RankProgressCards({
  rank,
}: {
  rank: MyRankResponse | null;
}) {
  const metrics = rank?.latest_qualification_result;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="p-6">
        <div className="text-xs tracking-[0.16em] text-slate-500">현재 직급</div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="현재 직급" value={rank?.rank_status?.current_rank_level === null || rank?.rank_status?.current_rank_level === undefined ? "-" : String(rank.rank_status.current_rank_level)} />
          <MetricCard label="승급일" value={rank?.rank_status?.qualified_at ?? "-"} />
          <MetricCard label="마지막 계산일" value={rank?.latest_qualification_result?.calculation_date ?? "-"} />
          <MetricCard label="다음 직급" value={rank?.next_rank?.rank_level === null || rank?.next_rank?.rank_level === undefined ? "-" : String(rank.next_rank.rank_level)} />
          <MetricCard label="직추천 수" value={metrics ? String(metrics.direct_active_referral_count) : "-"} />
          <MetricCard label="개인 활성 스테이킹" value={metrics ? formatBaseAmount(metrics.personal_active_stake_amount_base, 0) : "-"} />
          <MetricCard label="좌측 레그 매출" value={metrics ? formatBaseAmount(metrics.left_leg_volume_base, 0) : "-"} />
          <MetricCard label="우측 레그 매출" value={metrics ? formatBaseAmount(metrics.right_leg_volume_base, 0) : "-"} />
          <MetricCard label="약한 레그 매출" value={metrics ? formatBaseAmount(metrics.weak_leg_volume_base, 0) : "-"} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="text-xs tracking-[0.16em] text-slate-500">다음 직급 진행 현황</div>
        <div className="mt-4 space-y-3">
          {!rank?.next_rank_progress?.length ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
              다음 직급 조건이 없거나 최고 직급입니다.
            </div>
          ) : (
            rank.next_rank_progress.map((item) => (
              <div key={item.metric} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{getMetricLabel(item.metric)}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.met ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                    {item.met ? "충족" : "미충족"}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <MetricCard label="현재" value={formatMetricValue(item.metric, item.current)} compact />
                  <MetricCard label="필요" value={formatMetricValue(item.metric, item.required)} compact />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-2 tabular font-semibold text-slate-50 ${compact ? "text-lg" : "text-xl"}`}>{value}</div>
    </div>
  );
}
