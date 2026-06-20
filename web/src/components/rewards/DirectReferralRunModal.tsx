import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { DirectReferralRunResponse } from "@/lib/api";
import {
  canManageDirectReferral,
  formatDirectReferralRunSummary,
  getDirectReferralResultTone,
  getDirectReferralRunStatusLabel,
  validateDirectReferralRunInput,
} from "@/lib/rewards";
import { Button, FeedbackState, StatusBadge } from "@/components/ui";

type DirectReferralRunPayload = {
  policy_version_id: string;
  activated_from: string;
  activated_to: string;
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-400/15 bg-slate-950/30 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-emerald-100/70">{label}</div>
      <div className="mt-2 break-all tabular text-sm font-semibold text-emerald-50">{value}</div>
    </div>
  );
}

export function DirectReferralRunSummaryPanel({
  result,
  onOpenCalcRunRewards,
  onOpenCalcRunDetail,
}: {
  result: DirectReferralRunResponse;
  onOpenCalcRunRewards: (calcRunId: string) => void;
  onOpenCalcRunDetail?: (calcRunId: string) => void;
}) {
  const tone = getDirectReferralResultTone(result);
  const wrapperClassName =
    tone === "error"
      ? "border-rose-500/20 bg-rose-500/10"
      : "border-emerald-500/20 bg-emerald-500/10";

  return (
    <div className={`rounded-2xl p-5 ${wrapperClassName}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-slate-300/80">Run Result</div>
          <div className="mt-2 text-lg font-bold text-slate-50">DIRECT_REFERRAL 실행 결과</div>
        </div>
        <div className="flex items-center gap-2">
          {result.conflict_count > 0 ? <AlertTriangle className="h-4 w-4 text-amber-300" /> : null}
          <StatusBadge value={getDirectReferralRunStatusLabel(result.status)} tone={tone === "error" ? "rose" : "emerald"} />
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {formatDirectReferralRunSummary(result).map((item) => (
          <SummaryCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={() => onOpenCalcRunRewards(result.calc_run_id)}>
          이 실행의 보상 보기
        </Button>
        {onOpenCalcRunDetail ? (
          <Button variant="ghost" onClick={() => onOpenCalcRunDetail(result.calc_run_id)}>
            calc_run 상세 보기
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function DirectReferralRunModal({
  open,
  role,
  submitting,
  error,
  result,
  onClose,
  onSubmit,
  onOpenCalcRunRewards,
  onOpenCalcRunDetail,
}: {
  open: boolean;
  role: "ADMIN" | "READER" | "USER";
  submitting: boolean;
  error: string | null;
  result: DirectReferralRunResponse | null;
  onClose: () => void;
  onSubmit: (payload: DirectReferralRunPayload) => void | Promise<void>;
  onOpenCalcRunRewards: (calcRunId: string) => void;
  onOpenCalcRunDetail?: (calcRunId: string) => void;
}) {
  const [policyVersionId, setPolicyVersionId] = useState("");
  const [activatedFrom, setActivatedFrom] = useState("");
  const [activatedTo, setActivatedTo] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPolicyVersionId("");
      setActivatedFrom("");
      setActivatedTo("");
      setLocalError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    if (!canManageDirectReferral(role)) {
      setLocalError("ADMIN만 DIRECT_REFERRAL 실행이 가능합니다.");
      return;
    }

    const validationError = validateDirectReferralRunInput({
      policy_version_id: policyVersionId,
      activated_from: activatedFrom,
      activated_to: activatedTo,
    });
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    await onSubmit({
      policy_version_id: policyVersionId.trim(),
      activated_from: activatedFrom.trim(),
      activated_to: activatedTo.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Direct Referral Run</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">직추천 보상 배치 실행</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
          <div className="font-semibold text-slate-100">실행 전 안내</div>
          <ul className="mt-2 space-y-1 text-slate-400">
            <li>대상은 `ACTIVE` 스테이킹이며 `CANCEL_REQUESTED`는 제외됩니다.</li>
            <li>sponsor는 `ACTIVE USER`만 대상이며 `BLOCKED/WITHDRAWN`은 skip 됩니다.</li>
            <li>보상률은 `referral_bonus_rules depth=1` 정책 rule 기준으로 계산됩니다.</li>
            <li>동일 source staking 보상은 duplicate로 처리되어 중복 생성되지 않습니다.</li>
            <li>자동 reversal은 이번 버전에 포함되지 않습니다.</li>
          </ul>
        </div>

        {localError ? <div className="mt-4"><FeedbackState title="입력 확인" description={localError} tone="error" /></div> : null}
        {error ? <div className="mt-4"><FeedbackState title="실행 실패" description={error} tone="error" /></div> : null}
        {!canManageDirectReferral(role) ? (
          <div className="mt-4">
            <FeedbackState title="조회 전용" description="READER는 DIRECT_REFERRAL 실행 버튼과 submit 동작이 비활성화됩니다." />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">policy_version_id</div>
            <input
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={policyVersionId}
              onChange={(event) => setPolicyVersionId(event.target.value)}
              placeholder="정책 버전 ID 입력"
              disabled={submitting || !canManageDirectReferral(role)}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">activated_from</div>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={activatedFrom}
              onChange={(event) => setActivatedFrom(event.target.value)}
              disabled={submitting || !canManageDirectReferral(role)}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-slate-200">activated_to</div>
            <input
              type="date"
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
              value={activatedTo}
              onChange={(event) => setActivatedTo(event.target.value)}
              disabled={submitting || !canManageDirectReferral(role)}
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !canManageDirectReferral(role)}>
            {submitting ? "실행 중..." : "직추천 보상 실행"}
          </Button>
        </div>

        {result ? (
          <div className="mt-6">
            <DirectReferralRunSummaryPanel
              result={result}
              onOpenCalcRunRewards={onOpenCalcRunRewards}
              onOpenCalcRunDetail={onOpenCalcRunDetail}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
