import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getErrorMessage, type WithdrawalDetail } from "@/lib/api";
import {
  canCancelMyWithdrawal,
  formatWithdrawalAmountBase,
  formatWithdrawalDateTime,
  maskWalletAddress,
  shortenTxHash,
} from "@/lib/withdrawals";
import { useSessionStore } from "@/store/sessionStore";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { FeedbackState } from "@/components/FeedbackState";
import { UserShell } from "@/components/UserShell";
import { WithdrawalStatusBadge } from "@/components/WithdrawalStatusBadge";
import { WithdrawalTypeBadge } from "@/components/WithdrawalTypeBadge";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

export default function WithdrawalDetailPage() {
  const { withdrawalId = "" } = useParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [withdrawal, setWithdrawal] = useState<WithdrawalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!accessToken || !withdrawalId) return;
      try {
        setLoading(true);
        const result = await api.getMyWithdrawal(withdrawalId, accessToken);
        if (cancelled) return;
        setWithdrawal(result.withdrawal);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshNonce, withdrawalId]);

  async function handleCancel() {
    if (!accessToken || !withdrawal) return;
    try {
      setCancelSubmitting(true);
      setCancelError(null);
      const result = await api.cancelMyWithdrawal(withdrawal.id, accessToken);
      setWithdrawal(result.withdrawal);
      setNotice("출금 요청이 취소되었고 예약 allocation이 RELEASED 처리되었습니다.");
      setCancelOpen(false);
    } catch (cancelFailure) {
      setCancelError(getErrorMessage(cancelFailure));
    } finally {
      setCancelSubmitting(false);
    }
  }

  return (
    <>
      <UserShell
        title="Withdrawal Detail"
        subtitle="출금 요청의 상태, 금액, allocation 요약과 reward 연결 정보를 확인합니다."
        actions={
          <div className="flex items-center gap-2">
            {withdrawal ? <WithdrawalStatusBadge status={withdrawal.status} /> : <Badge tone="slate">Loading</Badge>}
            <Button variant="secondary" onClick={() => setRefreshNonce((current) => current + 1)} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <Link to="/withdrawals" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-slate-100">
            <ArrowLeft className="h-4 w-4" />
            출금 목록으로
          </Link>

          {error ? <FeedbackState title="출금 상세 조회 오류" description={error} tone="error" /> : null}
          {notice ? <FeedbackState title="처리 완료" description={notice} tone="success" /> : null}
          {loading ? <FeedbackState title="출금 상세 로딩 중" description="출금 상세 정보를 불러오고 있습니다." /> : null}

          {withdrawal ? (
            <>
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle eyebrow="Withdrawal Summary" title="출금 기본 정보" description="신청 금액, 수수료, 실수령액과 상태를 확인합니다." />
                  <div className="flex flex-wrap gap-2">
                    <WithdrawalTypeBadge type={withdrawal.withdrawal_type} />
                    <WithdrawalStatusBadge status={withdrawal.status} />
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="출금 ID" value={withdrawal.id} mono />
                  <InfoTile label="신청 금액" value={formatWithdrawalAmountBase(withdrawal.requested_amount_base)} />
                  <InfoTile label="수수료" value={formatWithdrawalAmountBase(withdrawal.fee_amount_base)} />
                  <InfoTile label="실수령액" value={formatWithdrawalAmountBase(withdrawal.net_amount_base)} />
                  <InfoTile label="wallet address" value={withdrawal.wallet_address ?? "-"} mono />
                  <InfoTile label="network" value={withdrawal.network ?? "-"} />
                  <InfoTile label="tx_hash" value={withdrawal.tx_hash ?? "-"} mono />
                  <InfoTile label="idempotency_key" value={withdrawal.idempotency_key} mono />
                </div>
              </Card>

              <Card className="p-6">
                <SectionTitle eyebrow="Timeline" title="상태 타임라인" />
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="requested_at" value={formatWithdrawalDateTime(withdrawal.requested_at)} />
                  <InfoTile label="approved_at" value={formatWithdrawalDateTime(withdrawal.approved_at)} />
                  <InfoTile label="processing_at" value={formatWithdrawalDateTime(withdrawal.processing_at)} />
                  <InfoTile label="completed_at" value={formatWithdrawalDateTime(withdrawal.completed_at)} />
                  <InfoTile label="rejected_at" value={formatWithdrawalDateTime(withdrawal.rejected_at)} />
                  <InfoTile label="failed_at" value={formatWithdrawalDateTime(withdrawal.failed_at)} />
                  <InfoTile label="cancelled_at" value={formatWithdrawalDateTime(withdrawal.cancelled_at)} />
                  <InfoTile label="updated_at" value={formatWithdrawalDateTime(withdrawal.updated_at)} />
                </div>
              </Card>

              <Card className="p-6">
                <SectionTitle eyebrow="Allocation Summary" title="allocation 요약" description="예약, 소비, 해제 상태별 allocation 금액과 reward 연결 개수를 표시합니다." />
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="allocation_count" value={String(withdrawal.allocation_summary.allocation_count)} />
                  <InfoTile label="reserved_amount_base" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.reserved_amount_base)} />
                  <InfoTile label="consumed_amount_base" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.consumed_amount_base)} />
                  <InfoTile label="released_amount_base" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.released_amount_base)} />
                </div>
              </Card>

              {withdrawal.reject_reason ? (
                <Card className="p-6">
                  <SectionTitle eyebrow="Reject Reason" title="거절 사유" />
                  <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{withdrawal.reject_reason}</div>
                </Card>
              ) : null}

              {withdrawal.failure_reason ? (
                <Card className="p-6">
                  <SectionTitle eyebrow="Failure Reason" title="실패 사유" />
                  <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{withdrawal.failure_reason}</div>
                </Card>
              ) : null}

              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle eyebrow="Allocations" title="reward allocation 상세" description="각 reward slice의 fee snapshot과 상태를 확인합니다." />
                  {canCancelMyWithdrawal(withdrawal.status) ? (
                    <Button onClick={() => setCancelOpen(true)} disabled={cancelSubmitting}>
                      REQUESTED 출금 취소
                    </Button>
                  ) : (
                    <Badge tone="slate">취소 불가 상태</Badge>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  {withdrawal.allocations.length === 0 ? (
                    <FeedbackState title="allocation 없음" description="현재 연결된 reward allocation 정보가 없습니다." />
                  ) : (
                    withdrawal.allocations.map((allocation) => (
                      <div key={allocation.id} className="rounded-[24px] border border-slate-800 bg-slate-950/50 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Allocation #{allocation.id}</div>
                            <div className="mt-2 font-mono text-xs text-slate-400">{allocation.reward_id}</div>
                          </div>
                          <Badge tone={allocation.status === "CONSUMED" ? "emerald" : allocation.status === "RELEASED" ? "rose" : "blue"}>
                            {allocation.status}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <InfoTile label="allocated" value={formatWithdrawalAmountBase(allocation.allocated_amount_base)} />
                          <InfoTile label="fee" value={formatWithdrawalAmountBase(allocation.fee_amount_base)} />
                          <InfoTile label="net" value={formatWithdrawalAmountBase(allocation.net_amount_base)} />
                          <InfoTile label="holding_days_snapshot" value={String(allocation.holding_days_snapshot)} />
                          <InfoTile label="fee_schedule_days" value={String(allocation.fee_schedule_days_snapshot)} />
                          <InfoTile label="fee_rate_snapshot" value={allocation.fee_rate_snapshot} />
                          <InfoTile label="reserved_at" value={formatWithdrawalDateTime(allocation.reserved_at)} />
                          <InfoTile label="consumed_at" value={formatWithdrawalDateTime(allocation.consumed_at)} />
                        </div>

                        <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-100">연결 reward 정보</summary>
                          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <InfoTile label="reward_type" value={allocation.reward.reward_type} />
                            <InfoTile label="reward_date" value={allocation.reward.reward_date ?? "-"} />
                            <InfoTile label="reward_amount_base" value={formatWithdrawalAmountBase(allocation.reward.amount_base)} />
                            <InfoTile label="reward_status" value={allocation.reward.status} />
                            <InfoTile label="available_at" value={formatWithdrawalDateTime(allocation.reward.available_at)} />
                            <InfoTile label="confirmed_at" value={formatWithdrawalDateTime(allocation.reward.confirmed_at)} />
                            <InfoTile label="source_reference" value={allocation.reward.source_reference} mono />
                            <InfoTile label="policy_version_id" value={allocation.reward.policy_version_id} mono />
                          </div>
                        </details>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <SectionTitle eyebrow="Security Note" title="보안 및 표시 정책" />
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <InfoTile label="상세 wallet 표시" value={withdrawal.wallet_address ?? "-"} mono />
                  <InfoTile label="목록 wallet 마스킹 예시" value={maskWalletAddress(withdrawal.wallet_address)} mono />
                  <InfoTile label="tx_hash 축약 예시" value={shortenTxHash(withdrawal.tx_hash)} mono />
                </div>
              </Card>
            </>
          ) : null}
        </div>
      </UserShell>

      <ConfirmationModal
        open={cancelOpen}
        title="출금 요청을 취소할까요?"
        description="REQUESTED 상태의 출금만 취소할 수 있습니다. 취소 시 RESERVED allocation은 RELEASED로 전환됩니다."
        confirmLabel="출금 취소"
        submitting={cancelSubmitting}
        error={cancelError}
        onClose={() => setCancelOpen(false)}
        onConfirm={handleCancel}
      />
    </>
  );
}

function InfoTile({
  label,
  value,
  mono = false,
  badge,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold text-slate-100 ${mono ? "break-all font-mono" : "tabular"}`}>{value}</div>
    </div>
  );
}
