import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RankQualificationRunSummary } from "@/lib/api";
import { Button, FeedbackState, FieldLabel, TextField } from "@/components/ui";
import { RankRunSummary } from "@/components/ranks/RankRunSummary";

export function RankQualificationRunModal({
  open,
  submitting,
  error,
  result,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  result: RankQualificationRunSummary | null;
  onClose: () => void;
  onSubmit: (payload: { policy_version_id: string; calculation_date: string }) => void | Promise<void>;
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
      <div className="modal-panel max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.18em] text-slate-500">직급 산정 실행</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">직급 산정 실행</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-section mt-4">
          <div className="font-semibold text-slate-100">실행 안내</div>
          <ul className="mt-2 space-y-1 text-slate-400">
            <li>정책 버전과 계산 기준일에 따라 직급을 산정합니다.</li>
            <li>같은 기준으로 재실행하면 기존 결과와 중복 여부를 확인합니다.</li>
          </ul>
        </div>

        {localError ? <div className="mt-4"><FeedbackState title="입력 확인" description={localError} tone="error" /></div> : null}
        {error ? <div className="mt-4"><FeedbackState title="실행 실패" description={error} tone="error" /></div> : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <FieldLabel htmlFor="rank-qualification-policy-version">정책 버전</FieldLabel>
            <TextField
              id="rank-qualification-policy-version"
              value={policyVersionId}
              onChange={(event) => setPolicyVersionId(event.target.value)}
              placeholder="정책 버전 ID 입력"
              disabled={submitting}
            />
          </label>
          <label className="block">
            <FieldLabel htmlFor="rank-qualification-calculation-date">계산 기준일</FieldLabel>
            <TextField
              id="rank-qualification-calculation-date"
              type="date"
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
            {submitting ? "실행 중..." : "직급 산정 실행"}
          </Button>
        </div>

        {result ? (
          <div className="mt-6">
            <RankRunSummary summary={result} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
