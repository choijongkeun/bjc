import { X } from "lucide-react";
import { FeedbackState } from "@/components/FeedbackState";
import { Button } from "@/components/ui";

export function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel,
  submitting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.18em] text-slate-500">작업 확인</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">{title}</h3>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">{description}</div>

        {error ? (
          <div className="mt-4">
            <FeedbackState title="처리 실패" description={error} tone="error" />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button onClick={() => void onConfirm()} disabled={submitting}>
            {submitting ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
