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
      <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
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
        { label: "대상 건수", value: summary.target_count },
        { label: "생성 건수", value: summary.created_count },
        { label: "중복 건수", value: summary.duplicate_skip_count },
        { label: "충돌 건수", value: summary.conflict_count },
        { label: "실패 건수", value: summary.failed_count },
        { label: "총 기준 보상 금액", value: summary.total_base_daily_reward_amount_base },
        { label: "총 직급 보상 금액", value: summary.total_rank_bonus_amount_base },
      ]
    : [
        { label: "대상 건수", value: summary.target_count },
        { label: "최초 산정 건수", value: summary.initial_count },
        { label: "승급 건수", value: summary.promoted_count },
        { label: "유지 건수", value: summary.maintained_count },
        { label: "하락 보류 건수", value: summary.demotion_deferred_count },
        { label: "미충족 건수", value: summary.unqualified_count },
        { label: "실패 건수", value: summary.failed_count },
      ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-slate-500">실행 결과</div>
          <div className="mt-2 text-lg font-bold text-slate-50">
            {isRankBonusSummary(summary) ? "직급 보상 실행 결과" : "직급 산정 실행 결과"}
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
