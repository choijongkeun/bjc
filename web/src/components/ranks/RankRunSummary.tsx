import type { RankBonusRunSummary, RankQualificationRunSummary } from "@/lib/api";
import { Button, StatusBadge } from "@/components/ui";

function isRankBonusSummary(
  summary: RankQualificationRunSummary | RankBonusRunSummary
): summary is RankBonusRunSummary {
  return "created_count" in summary;
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 break-all tabular text-sm font-semibold text-slate-50">{String(value)}</div>
    </div>
  );
}

export function RankRunSummary({
  summary,
  onOpenRewards,
}: {
  summary: RankQualificationRunSummary | RankBonusRunSummary;
  onOpenRewards?: (calcRunId: string) => void;
}) {
  const items = isRankBonusSummary(summary)
    ? [
        { label: "target_count", value: summary.target_count },
        { label: "created_count", value: summary.created_count },
        { label: "duplicate_skip_count", value: summary.duplicate_skip_count },
        { label: "conflict_count", value: summary.conflict_count },
        { label: "failed_count", value: summary.failed_count },
        { label: "total_base_daily_reward", value: summary.total_base_daily_reward_amount_base },
        { label: "total_rank_bonus", value: summary.total_rank_bonus_amount_base },
      ]
    : [
        { label: "target_count", value: summary.target_count },
        { label: "initial_count", value: summary.initial_count },
        { label: "promoted_count", value: summary.promoted_count },
        { label: "maintained_count", value: summary.maintained_count },
        { label: "demotion_deferred_count", value: summary.demotion_deferred_count },
        { label: "unqualified_count", value: summary.unqualified_count },
        { label: "failed_count", value: summary.failed_count },
      ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Run Summary</div>
          <div className="mt-2 text-lg font-bold text-slate-50">
            {isRankBonusSummary(summary) ? "RANK_BONUS 실행 결과" : "RANK_QUALIFICATION 실행 결과"}
          </div>
        </div>
        <StatusBadge value={summary.status} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <SummaryItem key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
      {isRankBonusSummary(summary) && onOpenRewards ? (
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => onOpenRewards(summary.calc_run_id)}>
            이 실행의 보상 보기
          </Button>
        </div>
      ) : null}
    </div>
  );
}
