import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { StakingProduct } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { createClientIdempotencyKey, formatDailyInterestBps } from "@/lib/staking";
import { Button, FieldHint, FormField, TextField } from "@/components/ui";
import { FeedbackState } from "@/components/FeedbackState";

export function StakingApplyModal({
  product,
  open,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  product: StakingProduct | null;
  open: boolean;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: { staking_product_id: string; principal_amount_base: string; idempotency_key: string }) => Promise<void>;
}) {
  const [amountBase, setAmountBase] = useState("");

  const rangeText = useMemo(() => {
    if (!product) return "";
    return `${formatBaseAmount(product.min_stake_amount_base, product.decimals)} ~ ${formatBaseAmount(
      product.max_stake_amount_base,
      product.decimals
    )}`;
  }, [product]);

  useEffect(() => {
    if (open) {
      setAmountBase("");
    }
  }, [open, product?.id]);

  if (!open || !product) {
    return null;
  }

  async function handleSubmit() {
    if (!amountBase.trim()) {
      return;
    }
    await onSubmit({
      staking_product_id: product.id,
      principal_amount_base: amountBase.trim(),
      idempotency_key: createClientIdempotencyKey("stake"),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="modal-panel max-w-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs tracking-[0.18em] text-slate-500">스테이킹 신청</div>
            <h2 className="mt-2 text-xl font-bold text-slate-50">{product.name}</h2>
            <p className="mt-2 text-sm text-slate-400">신청 후 승인 전까지 대기 상태로 표시됩니다.</p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-800 p-2 text-slate-400 transition hover:text-slate-100"
            onClick={onClose}
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <InfoTile label="심볼" value={product.symbol} />
          <InfoTile label="일일 이율" value={`${formatDailyInterestBps(product.daily_interest_bps)} (${product.daily_interest_bps}bp)`} />
          <InfoTile label="스테이킹 기간" value={`${product.staking_days}일`} />
          <InfoTile label="신청 가능 범위" value={rangeText} />
        </div>

        <div className="mt-5">
          <FormField label="원금 입력" htmlFor="principal_amount_base">
          <TextField
            id="principal_amount_base"
            inputMode="numeric"
            className="font-mono tabular"
            placeholder="금액을 입력하세요"
            value={amountBase}
            onChange={(event) => setAmountBase(event.target.value.replace(/[^\d]/g, ""))}
            disabled={submitting}
          />
            <FieldHint>최소 및 최대 신청 금액을 확인한 뒤 숫자만 입력해 주세요.</FieldHint>
          </FormField>
        </div>

        {error ? (
          <div className="mt-4">
            <FeedbackState title="신청 실패" description={error} tone="error" />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !amountBase.trim()}>
            {submitting ? "신청 처리 중..." : "신청 확정"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 tabular text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
