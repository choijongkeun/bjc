import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AdminRewardDetail } from "@/lib/api";
import { formatRewardAmountBase } from "@/lib/rewards";
import { Button, FeedbackState, FieldLabel, TextAreaField } from "@/components/ui";

export function RewardReverseModal({
  reward,
  open,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  reward: AdminRewardDetail | null;
  open: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason("");
      setLocalError(null);
    }
  }, [open]);

  if (!open || !reward) {
    return null;
  }

  async function handleSubmit() {
    if (!reason.trim()) {
      setLocalError("역분개 사유를 입력해 주세요.");
      return;
    }

    setLocalError(null);
    await onSubmit(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="modal-panel max-w-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">보상 취소</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">역분개 확인</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-section mt-4">
          <div>원본 보상은 `REVERSED`로 변경되고, 동일 금액의 음수 `REVERSAL` row가 추가됩니다.</div>
          <div className="mt-2">역분개 금액: <span className="tabular font-semibold text-rose-200">-{formatRewardAmountBase(reward.amount_base.replace(/^-/, ""))}</span></div>
        </div>

        {localError ? <div className="mt-4"><FeedbackState title="입력 확인" description={localError} tone="error" /></div> : null}
        {error ? <div className="mt-4"><FeedbackState title="역분개 실패" description={error} tone="error" /></div> : null}

        <div className="mt-4">
          <FieldLabel htmlFor="reward-reversal-reason">사유</FieldLabel>
          <TextAreaField
            id="reward-reversal-reason"
            placeholder="역분개 사유를 입력해 주세요."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button variant="danger" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "처리 중..." : "역분개 실행"}
          </Button>
        </div>
      </div>
    </div>
  );
}
