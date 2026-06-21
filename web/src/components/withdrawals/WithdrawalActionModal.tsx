import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { AdminWithdrawalDetail } from "@/lib/api";
import { formatWithdrawalAmountBase, type WithdrawalActionMode, validateWithdrawalActionInput } from "@/lib/withdrawals";
import { Button, FeedbackState, FieldLabel, TextAreaField, TextField } from "@/components/ui";

type ActionPayload = {
  reason?: string;
  network?: string;
  tx_hash?: string;
};

export function WithdrawalActionModal({
  open,
  mode,
  withdrawal,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: WithdrawalActionMode | null;
  withdrawal: AdminWithdrawalDetail | null;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: ActionPayload) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [network, setNetwork] = useState("");
  const [txHash, setTxHash] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !mode) {
      setReason("");
      setNetwork("");
      setTxHash("");
      setValidationError(null);
      return;
    }

    setReason("");
    setNetwork(withdrawal?.network ?? "");
    setTxHash(withdrawal?.tx_hash ?? "");
    setValidationError(null);
  }, [mode, open, withdrawal?.network, withdrawal?.tx_hash]);

  const title = useMemo(() => {
    if (mode === "approve") return "출금 승인 확인";
    if (mode === "reject") return "출금 거절 확인";
    if (mode === "processing") return "처리중 전환 확인";
    if (mode === "complete") return "출금 완료 처리 확인";
    if (mode === "fail") return "출금 실패 처리 확인";
    return "출금 액션";
  }, [mode]);

  const confirmLabel = useMemo(() => {
    if (mode === "approve") return "승인 실행";
    if (mode === "reject") return "거절 실행";
    if (mode === "processing") return "처리 시작";
    if (mode === "complete") return "완료 처리";
    if (mode === "fail") return "실패 처리";
    return "실행";
  }, [mode]);

  if (!open || !mode || !withdrawal) {
    return null;
  }

  async function handleSubmit() {
    const nextValidationError = validateWithdrawalActionInput(mode, {
      reason,
      network,
      tx_hash: txHash,
    });
    if (nextValidationError) {
      setValidationError(nextValidationError);
      return;
    }

    setValidationError(null);
    await onSubmit({
      reason: reason.trim() || undefined,
      network: network.trim() || undefined,
      tx_hash: txHash.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="modal-panel max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{mode}</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">{title}</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-section mt-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SummaryItem label="출금 ID" value={withdrawal.id} mono />
            <SummaryItem label="회원" value={`${withdrawal.account?.login_id ?? "-"} / ${withdrawal.account?.display_name ?? "-"}`} />
            <SummaryItem label="상태" value={withdrawal.status} />
            <SummaryItem label="신청 금액" value={formatWithdrawalAmountBase(withdrawal.requested_amount_base)} />
            <SummaryItem label="수수료" value={formatWithdrawalAmountBase(withdrawal.fee_amount_base)} />
            <SummaryItem label="실수령액" value={formatWithdrawalAmountBase(withdrawal.net_amount_base)} />
          </div>
        </div>

        <div className="modal-section mt-4">
          {mode === "approve" ? <div>요청된 출금을 APPROVED 상태로 전환합니다. 승인 후 다음 단계에서 처리 시작을 별도로 수행해야 합니다.</div> : null}
          {mode === "reject" ? <div>REQUESTED 상태의 출금을 거절합니다. 거절 사유는 필수이며 예약된 allocation은 해제됩니다.</div> : null}
          {mode === "processing" ? <div>APPROVED 상태의 출금을 PROCESSING으로 전환합니다. 실제 외부 송금은 이번 시스템이 수행하지 않습니다.</div> : null}
          {mode === "complete" ? (
            <>
              <div>실제 외부 송금이 완료된 뒤에만 완료 처리하세요. 이번 시스템은 블록체인 송금을 직접 수행하지 않습니다.</div>
              <div className="mt-2 text-xs text-amber-300">`tx_hash`와 `network`는 필수이며, 운영자가 검증 후 수동 입력해야 합니다.</div>
            </>
          ) : null}
          {mode === "fail" ? <div>PROCESSING 상태의 출금을 실패 처리합니다. 실패 사유는 필수이며 재처리는 이번 범위에 포함되지 않습니다.</div> : null}
        </div>

        {validationError ? <div className="mt-4"><FeedbackState title="입력 확인" description={validationError} tone="error" /></div> : null}
        {error ? <div className="mt-4"><FeedbackState title="처리 실패" description={error} tone="error" /></div> : null}

        {mode === "reject" || mode === "fail" ? (
          <div className="mt-4">
            <FieldLabel htmlFor="withdrawal-action-reason">{mode === "reject" ? "거절 사유" : "실패 사유"}</FieldLabel>
            <TextAreaField
              id="withdrawal-action-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={submitting}
              maxLength={500}
              placeholder={mode === "reject" ? "거절 사유를 입력해 주세요." : "실패 사유를 입력해 주세요."}
            />
          </div>
        ) : null}

        {mode === "processing" || mode === "complete" ? (
          <div className="mt-4">
            <FieldLabel htmlFor="withdrawal-action-network">네트워크</FieldLabel>
            <TextField
              id="withdrawal-action-network"
              value={network}
              onChange={(event) => setNetwork(event.target.value)}
              disabled={submitting}
              maxLength={50}
              placeholder="예: BASE"
            />
          </div>
        ) : null}

        {mode === "complete" ? (
          <div className="mt-4">
            <FieldLabel htmlFor="withdrawal-action-tx-hash">거래 해시</FieldLabel>
            <TextField
              id="withdrawal-action-tx-hash"
              value={txHash}
              onChange={(event) => setTxHash(event.target.value)}
              disabled={submitting}
              maxLength={255}
              placeholder="실제 외부 송금 완료 후 tx_hash 입력"
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button variant={mode === "approve" || mode === "processing" || mode === "complete" ? "primary" : "danger"} onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold text-slate-100 ${mono ? "break-all font-mono" : "tabular"}`}>{value}</div>
    </div>
  );
}
