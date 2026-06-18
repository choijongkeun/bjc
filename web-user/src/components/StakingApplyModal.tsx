import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { StakingProduct } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { createClientIdempotencyKey, formatDailyInterestBps } from "@/lib/staking";
import { Button, TextField } from "@/components/ui";
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
      <div className="w-full max-w-xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Staking Apply</div>
            <h2 className="mt-2 text-xl font-bold text-slate-50">{product.name}</h2>
            <p className="mt-2 text-sm text-slate-400">신청 후 상태는 관리자 활성화 전까지 `PENDING`으로 유지됩니다.</p>
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
          <InfoTile label="일일 이율" value={`${formatDailyInterestBps(product.daily_interest_bps)} (${product.daily_interest_bps} bps)`} />
          <InfoTile label="스테이킹 기간" value={`${product.staking_days}일`} />
          <InfoTile label="신청 가능 범위" value={rangeText} />
        </div>

        <div className="mt-5 space-y-2">
          <label className="text-sm font-semibold text-slate-200" htmlFor="principal_amount_base">
            원금 입력
          </label>
          <TextField
            id="principal_amount_base"
            inputMode="numeric"
            placeholder="정수 문자열 기준으로 입력"
            value={amountBase}
            onChange={(event) => setAmountBase(event.target.value.replace(/[^\d]/g, ""))}
            disabled={submitting}
          />
          <p className="text-xs text-slate-500">현재 상품의 최소/최대 범위를 확인한 뒤 base amount 그대로 입력합니다.</p>
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
