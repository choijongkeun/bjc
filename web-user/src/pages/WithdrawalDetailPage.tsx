import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getErrorMessage, type WithdrawalDetail } from "@/lib/api";
import {
  canCancelMyWithdrawal,
  formatWithdrawalAmountBase,
  formatWithdrawalDateTime,
  getWithdrawalStatusLabel,
  getWithdrawalTypeLabel,
  maskWalletAddress,
  shortenTxHash,
} from "@/lib/withdrawals";
import { getRewardStatusLabel, getRewardTypeLabel } from "@/lib/rewards";
import { getAllocationStatusLabel } from "@/lib/display";
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
      setNotice("출금 요청이 취소되었습니다.");
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
        title="출금 상세"
        subtitle="출금 정보와 처리 상태를 확인합니다."
        actions={
          <div className="flex items-center gap-2">
            {withdrawal ? <WithdrawalStatusBadge status={withdrawal.status} /> : <Badge tone="slate">불러오는 중</Badge>}
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
          {loading ? <FeedbackState title="불러오는 중" description="출금 정보를 조회하고 있습니다." /> : null}

          {withdrawal ? (
            <>
              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle eyebrow="출금 정보" title="출금 기본 정보" />
                  <div className="flex flex-wrap gap-2">
                    <WithdrawalTypeBadge type={withdrawal.withdrawal_type} />
                    <WithdrawalStatusBadge status={withdrawal.status} />
                  </div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="출금 구분" value={getWithdrawalTypeLabel(withdrawal.withdrawal_type)} />
                  <InfoTile label="신청 금액" value={formatWithdrawalAmountBase(withdrawal.requested_amount_base)} />
                  <InfoTile label="수수료 금액" value={formatWithdrawalAmountBase(withdrawal.fee_amount_base)} />
                  <InfoTile label="실수령액" value={formatWithdrawalAmountBase(withdrawal.net_amount_base)} />
                  <InfoTile label="지갑 주소" value={maskWalletAddress(withdrawal.wallet_address)} mono />
                  <InfoTile label="네트워크" value={withdrawal.network ?? "-"} />
                  <InfoTile label="거래 해시" value={shortenTxHash(withdrawal.tx_hash)} mono />
                  <InfoTile label="상태" value={getWithdrawalStatusLabel(withdrawal.status)} />
                </div>
              </Card>

              <Card className="p-6">
                <SectionTitle eyebrow="처리 일시" title="상태 타임라인" />
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="신청 일시" value={formatWithdrawalDateTime(withdrawal.requested_at)} />
                  <InfoTile label="승인 일시" value={formatWithdrawalDateTime(withdrawal.approved_at)} />
                  <InfoTile label="처리 시작 일시" value={formatWithdrawalDateTime(withdrawal.processing_at)} />
                  <InfoTile label="완료 일시" value={formatWithdrawalDateTime(withdrawal.completed_at)} />
                  <InfoTile label="거절 일시" value={formatWithdrawalDateTime(withdrawal.rejected_at)} />
                  <InfoTile label="실패 일시" value={formatWithdrawalDateTime(withdrawal.failed_at)} />
                  <InfoTile label="취소 일시" value={formatWithdrawalDateTime(withdrawal.cancelled_at)} />
                  <InfoTile label="수정 일시" value={formatWithdrawalDateTime(withdrawal.updated_at)} />
                </div>
              </Card>

              <Card className="p-6">
                <SectionTitle eyebrow="출금 배정" title="배정 요약" />
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <InfoTile label="배정 건수" value={String(withdrawal.allocation_summary.allocation_count)} />
                  <InfoTile label="출금 예약 금액" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.reserved_amount_base)} />
                  <InfoTile label="출금 완료 금액" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.consumed_amount_base)} />
                  <InfoTile label="예약 해제 금액" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.released_amount_base)} />
                </div>
              </Card>

              {withdrawal.reject_reason ? (
                <Card className="p-6">
                  <SectionTitle eyebrow="거절 사유" title="거절 사유" />
                  <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{withdrawal.reject_reason}</div>
                </Card>
              ) : null}

              {withdrawal.failure_reason ? (
                <Card className="p-6">
                  <SectionTitle eyebrow="실패 사유" title="실패 사유" />
                  <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{withdrawal.failure_reason}</div>
                </Card>
              ) : null}

              <Card className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SectionTitle eyebrow="배정 내역" title="출금 배정 상세" />
                  {canCancelMyWithdrawal(withdrawal.status) ? (
                    <Button onClick={() => setCancelOpen(true)} disabled={cancelSubmitting}>
                      출금 신청 취소
                    </Button>
                  ) : (
                    <Badge tone="slate">취소 불가 상태</Badge>
                  )}
                </div>

                <div className="mt-5 space-y-4">
                  {withdrawal.allocations.length === 0 ? (
                    <FeedbackState title="배정 내역 없음" description="현재 연결된 출금 배정 정보가 없습니다." />
                  ) : (
                    withdrawal.allocations.map((allocation) => (
                      <div key={allocation.id} className="rounded-[24px] border border-slate-800 bg-slate-950/50 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-xs tracking-[0.16em] text-slate-500">배정 내역</div>
                            <div className="mt-2 text-sm text-slate-400">{getWithdrawalTypeLabel(withdrawal.withdrawal_type)}</div>
                          </div>
                          <Badge tone={allocation.status === "CONSUMED" ? "emerald" : allocation.status === "RELEASED" ? "rose" : "blue"}>
                            {getAllocationStatusLabel(allocation.status)}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <InfoTile label="배정 금액" value={formatWithdrawalAmountBase(allocation.allocated_amount_base)} />
                          <InfoTile label="수수료 금액" value={formatWithdrawalAmountBase(allocation.fee_amount_base)} />
                          <InfoTile label="실수령액" value={formatWithdrawalAmountBase(allocation.net_amount_base)} />
                          <InfoTile label="보유 일수" value={`${allocation.holding_days_snapshot}일`} />
                          <InfoTile label="수수료 기준 일수" value={`${allocation.fee_schedule_days_snapshot}일`} />
                          <InfoTile label="수수료 비율" value={allocation.fee_rate_snapshot} />
                          <InfoTile label="예약 일시" value={formatWithdrawalDateTime(allocation.reserved_at)} />
                          <InfoTile label="완료 일시" value={formatWithdrawalDateTime(allocation.consumed_at)} />
                        </div>

                        <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                          <summary className="cursor-pointer text-sm font-semibold text-slate-100">연결된 보상 정보</summary>
                          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            <InfoTile label="보상 구분" value={getRewardTypeLabel(allocation.reward.reward_type)} />
                            <InfoTile label="보상 기준일" value={allocation.reward.reward_date ?? "-"} />
                            <InfoTile label="보상 금액" value={formatWithdrawalAmountBase(allocation.reward.amount_base)} />
                            <InfoTile label="보상 상태" value={getRewardStatusLabel(allocation.reward.status)} />
                            <InfoTile label="출금 가능 일시" value={formatWithdrawalDateTime(allocation.reward.available_at)} />
                            <InfoTile label="확정 일시" value={formatWithdrawalDateTime(allocation.reward.confirmed_at)} />
                          </div>
                        </details>
                      </div>
                    ))
                  )}
                </div>
              </Card>

            </>
          ) : null}
        </div>
      </UserShell>

      <ConfirmationModal
        open={cancelOpen}
        title="출금 요청을 취소할까요?"
        description="신청 상태의 출금만 취소할 수 있습니다."
        confirmLabel="출금 신청 취소"
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
        <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold text-slate-100 ${mono ? "break-all font-mono" : "tabular"}`}>{value}</div>
    </div>
  );
}
