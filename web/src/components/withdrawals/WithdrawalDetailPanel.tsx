import { useMemo, useState } from "react";
import { api, ApiError, type AdminWithdrawalDetail, type SessionRole } from "@/lib/api";
import {
  canManageWithdrawal,
  formatWithdrawalAmountBase,
  formatWithdrawalDateTime,
  getAdminWithdrawalActionState,
  getWithdrawalStatusLabel,
  getWithdrawalTypeLabel,
  shortenTxHash,
  type WithdrawalActionMode,
} from "@/lib/withdrawals";
import { getDisplayLabel } from "@/lib/display";
import { WithdrawalStatusBadge } from "@/components/WithdrawalStatusBadge";
import { WithdrawalTypeBadge } from "@/components/WithdrawalTypeBadge";
import { WithdrawalActionModal } from "@/components/withdrawals/WithdrawalActionModal";
import { Button, Card, FeedbackState } from "@/components/ui";

export function WithdrawalDetailPanel({
  actorId,
  role,
  withdrawal,
  onUpdated,
}: {
  actorId: string;
  role: SessionRole;
  withdrawal: AdminWithdrawalDetail | null;
  onUpdated: (withdrawal: AdminWithdrawalDetail) => void | Promise<void>;
}) {
  const [actionMode, setActionMode] = useState<WithdrawalActionMode | null>(null);
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const actionState = useMemo(
    () =>
      withdrawal
        ? getAdminWithdrawalActionState(withdrawal.status)
        : { canApprove: false, canReject: false, canProcessing: false, canComplete: false, canFail: false },
    [withdrawal]
  );

  if (!withdrawal) {
    return (
      <Card>
        <FeedbackState title="선택된 출금 없음" description="좌측 목록에서 withdrawal row를 선택하면 상세 패널이 표시됩니다." />
      </Card>
    );
  }

  async function handleAction(payload: { reason?: string; network?: string; tx_hash?: string }) {
    if (!actionMode) return;

    try {
      setActionSubmitting(true);
      setActionError(null);
      let result:
        | {
            withdrawal: AdminWithdrawalDetail;
          }
        | undefined;

      if (actionMode === "approve") {
        result = await api.approveAdminWithdrawal(actorId, withdrawal.id);
      } else if (actionMode === "reject") {
        result = await api.rejectAdminWithdrawal(actorId, withdrawal.id, payload.reason ?? "");
      } else if (actionMode === "processing") {
        result = await api.markAdminWithdrawalProcessing(actorId, withdrawal.id, payload.network ?? "");
      } else if (actionMode === "complete") {
        result = await api.completeAdminWithdrawal(actorId, withdrawal.id, {
          tx_hash: payload.tx_hash ?? "",
          network: payload.network ?? "",
        });
      } else {
        result = await api.failAdminWithdrawal(actorId, withdrawal.id, payload.reason ?? "");
      }

      await onUpdated(result.withdrawal);
      setNotice(getSuccessMessage(actionMode));
      setActionMode(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setActionError("현재 상태가 이미 변경되었습니다. 목록과 상세를 새로고침한 뒤 다시 시도해 주세요.");
      } else {
        setActionError(error instanceof Error ? error.message : "출금 상태 처리 중 오류가 발생했습니다.");
      }
    } finally {
      setActionSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-50">출금 상세</h3>
            <p className="text-sm text-slate-400">회원 정보, 출금 배정 내역, 원장 및 감사 기록을 확인합니다.</p>
          </div>
          <WithdrawalStatusBadge status={withdrawal.status} />
        </div>

        {notice ? <div className="mt-4"><FeedbackState title="처리 완료" description={notice} tone="success" /></div> : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoTile label="출금 ID" value={withdrawal.id} mono />
          <InfoTile label="회원" value={`${withdrawal.account?.login_id ?? "-"} / ${withdrawal.account?.display_name ?? "-"}`} />
          <InfoTile label="출금 구분" value={getWithdrawalTypeLabel(withdrawal.withdrawal_type)} badge={<WithdrawalTypeBadge type={withdrawal.withdrawal_type} />} />
          <InfoTile label="상태" value={getWithdrawalStatusLabel(withdrawal.status)} badge={<WithdrawalStatusBadge status={withdrawal.status} />} />
          <InfoTile label="신청 금액" value={formatWithdrawalAmountBase(withdrawal.requested_amount_base)} />
          <InfoTile label="수수료" value={formatWithdrawalAmountBase(withdrawal.fee_amount_base)} />
          <InfoTile label="실수령액" value={formatWithdrawalAmountBase(withdrawal.net_amount_base)} />
          <InfoTile label="수수료 정책 버전" value={withdrawal.fee_policy_version_id} mono />
          <InfoTile label="지갑 주소" value={withdrawal.wallet_address ?? "-"} mono />
          <InfoTile label="네트워크" value={withdrawal.network ?? "-"} />
          <InfoTile label="거래 해시" value={withdrawal.tx_hash ?? "-"} mono />
          <InfoTile label="요청 키" value={withdrawal.idempotency_key} mono />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="신청 일시" value={formatWithdrawalDateTime(withdrawal.requested_at)} />
          <InfoTile label="승인 일시" value={formatWithdrawalDateTime(withdrawal.approved_at)} />
          <InfoTile label="처리 시작 일시" value={formatWithdrawalDateTime(withdrawal.processing_at)} />
          <InfoTile label="완료 일시" value={formatWithdrawalDateTime(withdrawal.completed_at)} />
          <InfoTile label="거절 일시" value={formatWithdrawalDateTime(withdrawal.rejected_at)} />
          <InfoTile label="실패 일시" value={formatWithdrawalDateTime(withdrawal.failed_at)} />
          <InfoTile label="취소 일시" value={formatWithdrawalDateTime(withdrawal.cancelled_at)} />
          <InfoTile label="생성 일시" value={formatWithdrawalDateTime(withdrawal.created_at)} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoTile label="거절 사유" value={withdrawal.reject_reason ?? "-"} />
          <InfoTile label="실패 사유" value={withdrawal.failure_reason ?? "-"} />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs tracking-[0.16em] text-slate-500">출금 배정 내역</div>
              <p className="mt-2 text-sm text-slate-400">보상별 배정 금액과 수수료 정보를 확인합니다.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoTile label="배정 건수" value={String(withdrawal.allocation_summary.allocation_count)} />
            <InfoTile label="예약 금액" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.reserved_amount_base)} />
            <InfoTile label="차감 금액" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.consumed_amount_base)} />
            <InfoTile label="해제 금액" value={formatWithdrawalAmountBase(withdrawal.allocation_summary.released_amount_base)} />
          </div>
          <div className="mt-4 overflow-auto rounded-2xl border border-slate-800">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>보상 ID</th>
                  <th>보상 구분</th>
                  <th>보상 상태</th>
                  <th>보상 기준일</th>
                  <th>보상 금액</th>
                  <th>배정 금액</th>
                  <th>수수료 비율</th>
                  <th>보유 일수</th>
                  <th>수수료</th>
                  <th>실수령액</th>
                  <th>배정 상태</th>
                </tr>
              </thead>
              <tbody>
                {withdrawal.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td className="font-mono text-xs text-slate-300">{allocation.reward_id}</td>
                    <td>{getDisplayLabel(allocation.reward.reward_type)}</td>
                    <td>{getDisplayLabel(allocation.reward.status)}</td>
                    <td>{allocation.reward.reward_date ?? "-"}</td>
                    <td className="tabular text-right">{formatWithdrawalAmountBase(allocation.reward.amount_base)}</td>
                    <td className="tabular text-right">{formatWithdrawalAmountBase(allocation.allocated_amount_base)}</td>
                    <td className="tabular text-right">{allocation.fee_rate_snapshot}</td>
                    <td className="tabular text-right">{String(allocation.holding_days_snapshot)}</td>
                    <td className="tabular text-right">{formatWithdrawalAmountBase(allocation.fee_amount_base)}</td>
                    <td className="tabular text-right">{formatWithdrawalAmountBase(allocation.net_amount_base)}</td>
                    <td>{getDisplayLabel(allocation.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs tracking-[0.16em] text-slate-500">원장 정보</div>
          <div className="mt-4">
            {!withdrawal.ledger_events || withdrawal.ledger_events.length === 0 ? (
              <FeedbackState title="원장 정보 없음" description="연결된 원장 기록이 없습니다." />
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-800">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>이벤트 ID</th>
                      <th>이벤트 구분</th>
                      <th>금액</th>
                      <th>참조 ID</th>
                      <th>발생 일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawal.ledger_events.map((event) => (
                      <tr key={event.id}>
                        <td className="font-mono text-xs text-slate-300">{event.id}</td>
                        <td>{event.event_type}</td>
                        <td className="tabular text-right">{formatWithdrawalAmountBase(event.amount_base)}</td>
                        <td className="font-mono text-xs text-slate-400">{event.reference_id}</td>
                        <td className="text-slate-400">{formatWithdrawalDateTime(event.event_time ?? event.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="text-xs tracking-[0.16em] text-slate-500">감사 기록</div>
          <div className="mt-4">
            {!withdrawal.audit_logs || withdrawal.audit_logs.length === 0 ? (
              <FeedbackState title="감사 기록 없음" description="연결된 감사 기록이 없습니다." />
            ) : (
              <div className="overflow-auto rounded-2xl border border-slate-800">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>감사 ID</th>
                      <th>처리자 ID</th>
                      <th>동작</th>
                      <th>대상</th>
                      <th>생성 일시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawal.audit_logs.map((event) => (
                      <tr key={event.id}>
                        <td className="font-mono text-xs text-slate-300">{event.id}</td>
                        <td className="font-mono text-xs text-slate-400">{event.actor_account_id ?? "-"}</td>
                        <td>{event.action}</td>
                        <td className="font-mono text-xs text-slate-400">{event.target_table ?? "-"} / {event.target_id ?? "-"}</td>
                        <td className="text-slate-400">{formatWithdrawalDateTime(event.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {!canManageWithdrawal(role) ? (
            <FeedbackState title="조회 전용" description="READER는 승인/거절/처리/완료/실패 액션 버튼이 노출되지 않습니다." />
          ) : (
            <div className="flex flex-wrap gap-3">
              {actionState.canApprove ? <Button onClick={() => setActionMode("approve")}>승인</Button> : null}
              {actionState.canReject ? <Button variant="danger" onClick={() => setActionMode("reject")}>거절</Button> : null}
              {actionState.canProcessing ? <Button onClick={() => setActionMode("processing")}>처리 시작</Button> : null}
              {actionState.canComplete ? <Button onClick={() => setActionMode("complete")}>완료 처리</Button> : null}
              {actionState.canFail ? <Button variant="danger" onClick={() => setActionMode("fail")}>실패 처리</Button> : null}
              {!actionState.canApprove && !actionState.canReject && !actionState.canProcessing && !actionState.canComplete && !actionState.canFail ? (
                <FeedbackState title="추가 상태 변경 없음" description="현재 상태에서는 관리자 액션 버튼을 노출하지 않습니다." />
              ) : null}
            </div>
          )}
        </div>
      </Card>

      <WithdrawalActionModal
        open={actionMode !== null}
        mode={actionMode}
        withdrawal={withdrawal}
        submitting={actionSubmitting}
        error={actionError}
        onClose={() => {
          if (actionSubmitting) return;
          setActionMode(null);
          setActionError(null);
        }}
        onSubmit={handleAction}
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
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold text-slate-100 ${mono ? "break-all font-mono" : "tabular"}`}>{value}</div>
    </div>
  );
}

function getSuccessMessage(mode: WithdrawalActionMode) {
  if (mode === "approve") return "출금 요청이 승인되었습니다.";
  if (mode === "reject") return "출금 요청이 거절되었고 예약 금액이 해제되었습니다.";
  if (mode === "processing") return "출금 요청 처리가 시작되었습니다.";
  if (mode === "complete") return "출금 요청이 완료되었고 거래 해시가 기록되었습니다.";
  return "출금 요청이 실패로 처리되었습니다.";
}
