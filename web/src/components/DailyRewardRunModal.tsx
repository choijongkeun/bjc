import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { DailyRewardRunResponse } from "@/lib/api";
import { getDailyRewardRunResultItems, getDefaultKstRewardDate } from "@/lib/rewards";
import { Button, FeedbackState, StatusBadge } from "@/components/ui";

export function DailyRewardRunModal({
  open,
  submitting,
  error,
  result,
  onClose,
  onSubmit,
  onOpenCalcRunRewards,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  result: DailyRewardRunResponse | null;
  onClose: () => void;
  onSubmit: (payload: { policy_version_id: string; reward_date: string }) => void | Promise<void>;
  onOpenCalcRunRewards: (calcRunId: string) => void;
}) {
  const [policyVersionId, setPolicyVersionId] = useState("");
  const [rewardDate, setRewardDate] = useState(getDefaultKstRewardDate());
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPolicyVersionId("");
      setRewardDate(getDefaultKstRewardDate());
      setLocalError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    if (!policyVersionId.trim() || !rewardDate.trim()) {
      setLocalError("policy_version_id와 reward_date를 모두 입력해 주세요.");
      return;
    }

    setLocalError(null);
    await onSubmit({
      policy_version_id: policyVersionId.trim(),
      reward_date: rewardDate.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Daily Reward Run</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">일일 보상 계산 실행</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
          <div className="font-semibold text-slate-100">실행 전 안내</div>
          <ul className="mt-2 space-y-1 text-slate-400">
            <li>동일 policy/date 실행 이력이 있으면 중복 실행이 거절될 수 있습니다.</li>
            <li>실행 결과가 `SUCCEEDED`여도 자동 `FINALIZED`되지 않습니다.</li>
            <li>현재 수동 실행 기능이며 자동 scheduler/cron은 이번 범위에 포함하지 않습니다.</li>
          </ul>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          <div className="font-semibold">현재 날짜 정책</div>
          <ul className="mt-2 space-y-1 text-blue-100/85">
            <li>Asia/Seoul 기준 reward_date를 사용합니다.</li>
            <li>`ACTIVE`, `CANCEL_REQUESTED` 스테이킹을 대상으로 계산합니다.</li>
            <li>같은 날짜에 시작한 staking도 보상 계산에 포함합니다.</li>
            <li>`CANCEL_REQUESTED`는 최종 취소 전까지 보상이 발생합니다.</li>
          </ul>
        </div>

        {localError ? <div className="mt-4"><FeedbackState title="입력 확인" description={localError} tone="error" /></div> : null}
        {error ? <div className="mt-4"><FeedbackState title="실행 실패" description={error} tone="error" /></div> : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">policy_version_id</div>
            <input
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={policyVersionId}
              onChange={(event) => setPolicyVersionId(event.target.value)}
              placeholder="정책 버전 ID 입력"
              disabled={submitting}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">reward_date</div>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={rewardDate}
              onChange={(event) => setRewardDate(event.target.value)}
              disabled={submitting}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "실행 중..." : "일일 보상 계산 실행"}
          </Button>
        </div>

        {result ? (
          <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-emerald-100/80">Run Result</div>
                <div className="mt-2 text-lg font-bold text-emerald-50">DAILY_REWARD 실행 결과</div>
              </div>
              <StatusBadge value={result.calc_run.status} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {getDailyRewardRunResultItems(result).map((item) => (
                <div key={item.label} className="rounded-2xl border border-emerald-400/15 bg-slate-950/30 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">{item.label}</div>
                  <div className="mt-2 break-all tabular text-sm font-semibold text-emerald-50">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => onOpenCalcRunRewards(result.calc_run.id)}>
                이 실행의 보상 보기
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
