import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { ContributionRunSummary, SidecarRunSummary } from "@/lib/api";
import { formatRewardAmountBase } from "@/lib/rewards";
import { Button, FeedbackState, StatusBadge } from "@/components/ui";

type BonusOperationKind = "CONTRIBUTION" | "SIDECAR";

type SummaryValue = ContributionRunSummary | SidecarRunSummary;

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-400/15 bg-slate-950/30 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">{label}</div>
      <div className="mt-2 break-all tabular text-sm font-semibold text-emerald-50">{value}</div>
    </div>
  );
}

function formatSummary(kind: BonusOperationKind, result: SummaryValue): Array<{ label: string; value: string }> {
  if (kind === "CONTRIBUTION") {
    const summary = result as ContributionRunSummary;
    return [
      { label: "계산 실행 ID", value: summary.calc_run_id },
      { label: "대상 건수", value: String(summary.target_count) },
      { label: "생성 건수", value: String(summary.created_count) },
      { label: "기준 금액 0건", value: String(summary.zero_base_skip_count) },
      { label: "보상 금액 0건", value: String(summary.zero_reward_skip_count) },
      { label: "제외 건수", value: String(summary.ineligible_skip_count) },
      { label: "중복 건수", value: String(summary.duplicate_skip_count) },
      { label: "충돌 건수", value: String(summary.conflict_count) },
      { label: "실패 건수", value: String(summary.failed_count) },
      { label: "총 기준 금액", value: summary.total_base_amount_base },
      { label: "총 보상 금액", value: formatRewardAmountBase(summary.total_reward_amount_base) },
      { label: "풀 금액", value: summary.pool_amount_base },
      { label: "총 점수", value: summary.total_score },
      { label: "상태", value: summary.status },
    ];
  }

  const summary = result as SidecarRunSummary;
  return [
    { label: "계산 실행 ID", value: summary.calc_run_id },
    { label: "대상 건수", value: String(summary.target_count) },
    { label: "생성 건수", value: String(summary.created_count) },
    { label: "기준 금액 0건", value: String(summary.zero_base_skip_count) },
    { label: "제외 건수", value: String(summary.ineligible_skip_count) },
    { label: "중복 건수", value: String(summary.duplicate_skip_count) },
    { label: "충돌 건수", value: String(summary.conflict_count) },
    { label: "실패 건수", value: String(summary.failed_count) },
    { label: "총 신청 금액", value: summary.total_requested_amount_base },
    { label: "총 지급 금액", value: summary.total_release_amount_base },
    { label: "총 동결 금액", value: summary.total_freeze_amount_base },
    { label: "사이드카 상태", value: summary.sidecar_status },
    { label: "상태", value: summary.status },
  ];
}

export function BonusOperationRunModal({
  kind,
  open,
  title,
  description,
  submitting,
  error,
  result,
  onClose,
  onSubmit,
  onOpenRewards,
  onOpenCalcRun,
}: {
  kind: BonusOperationKind;
  open: boolean;
  title: string;
  description: string;
  submitting: boolean;
  error: string | null;
  result: SummaryValue | null;
  onClose: () => void;
  onSubmit: (payload: { policy_version_id: string; calculation_date: string }) => void | Promise<void>;
  onOpenRewards: (calcRunId: string) => void;
  onOpenCalcRun?: (calcRunId: string) => void;
}) {
  const [policyVersionId, setPolicyVersionId] = useState("");
  const [calculationDate, setCalculationDate] = useState(new Date().toISOString().slice(0, 10));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPolicyVersionId("");
      setCalculationDate(new Date().toISOString().slice(0, 10));
      setLocalError(null);
    }
  }, [open]);

  const tone = useMemo(() => {
    if (!result) {
      return "emerald";
    }
    return result.failed_count > 0 || result.conflict_count > 0 ? "rose" : "emerald";
  }, [result]);

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    if (!policyVersionId.trim() || !calculationDate.trim()) {
      setLocalError("정책 버전과 계산 기준일을 모두 입력해 주세요.");
      return;
    }
    setLocalError(null);
    await onSubmit({
      policy_version_id: policyVersionId.trim(),
      calculation_date: calculationDate.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{kind === "CONTRIBUTION" ? "기여 보상" : "사이드카 정산"}</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">{title}</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
          <div className="font-semibold text-slate-100">실행 안내</div>
          <ul className="mt-2 space-y-1 text-slate-400">
            <li>{description}</li>
            <li>정책 버전과 계산 기준일에 따라 실행합니다.</li>
            <li>동일 기준으로 재실행하면 중복 또는 충돌로 집계될 수 있습니다.</li>
          </ul>
        </div>

        {localError ? <div className="mt-4"><FeedbackState title="입력 확인" description={localError} tone="error" /></div> : null}
        {error ? <div className="mt-4"><FeedbackState title="실행 실패" description={error} tone="error" /></div> : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">정책 버전</div>
            <input
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={policyVersionId}
              onChange={(event) => setPolicyVersionId(event.target.value)}
              placeholder="정책 버전 ID 입력"
              disabled={submitting}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">계산 기준일</div>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={calculationDate}
              onChange={(event) => setCalculationDate(event.target.value)}
              disabled={submitting}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "실행 중..." : `${title} 실행`}
          </Button>
        </div>

        {result ? (
          <div className={`mt-6 rounded-2xl border p-5 ${tone === "rose" ? "border-rose-500/20 bg-rose-500/10" : "border-emerald-500/20 bg-emerald-500/10"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-slate-300/80">실행 결과</div>
                <div className="mt-2 text-lg font-bold text-slate-50">{title} 결과</div>
              </div>
              <div className="flex items-center gap-2">
                {result.conflict_count > 0 ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : null}
                <StatusBadge value={result.status} tone={tone} />
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {formatSummary(kind, result).map((item) => (
                <SummaryCard key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <Button variant="secondary" onClick={() => onOpenRewards(result.calc_run_id)}>
                이 실행의 보상 보기
              </Button>
              {onOpenCalcRun ? (
                <Button variant="ghost" onClick={() => onOpenCalcRun(result.calc_run_id)}>
                  계산 실행 상세 보기
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
