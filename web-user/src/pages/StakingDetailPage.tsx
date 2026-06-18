import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCcw, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ApiError, api, getErrorMessage, type AccountStaking } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { createClientIdempotencyKey, formatDailyInterestBps, getAvailableUserStakingAction } from "@/lib/staking";
import { useSessionStore } from "@/store/sessionStore";
import { FeedbackState } from "@/components/FeedbackState";
import { StakingStatusBadge } from "@/components/StakingStatusBadge";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

export default function StakingDetailPage() {
  const { stakingId = "" } = useParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [staking, setStaking] = useState<AccountStaking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const availableAction = useMemo(() => (staking ? getAvailableUserStakingAction(staking.status) : "none"), [staking]);

  async function loadDetail() {
    if (!accessToken || !stakingId) return;
    try {
      setLoading(true);
      const result = await api.getMyStaking(stakingId, accessToken);
      setStaking(result.staking);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [accessToken, stakingId]);

  async function handleCancel() {
    if (!accessToken || !staking) return;
    try {
      setSubmitting(true);
      setActionError(null);
      const result = await api.cancelMyStaking(
        staking.id,
        {
          reason: reason.trim() || undefined,
          idempotency_key: createClientIdempotencyKey("stake-cancel"),
        },
        accessToken
      );
      setStaking(result.staking);
      setActionSuccess(
        availableAction === "cancel"
          ? "PENDING 스테이킹이 취소되어 CANCELLED 상태로 변경되었습니다."
          : "취소 요청이 접수되어 CANCEL_REQUESTED 상태로 변경되었습니다."
      );
      setConfirmOpen(false);
      setReason("");
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) {
        setActionError("현재 상태가 이미 변경되었습니다. 최신 상세 정보를 다시 불러왔습니다.");
        await loadDetail();
      } else {
        setActionError(getErrorMessage(submitError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <UserShell
      title="Staking Detail"
      subtitle="신청 상세, 상태 변경 시점, 상품 snapshot을 확인합니다."
      actions={
        <div className="flex items-center gap-2">
          {staking ? <StakingStatusBadge status={staking.status} /> : <Badge tone="slate">Loading</Badge>}
          <Button variant="secondary" onClick={() => void loadDetail()} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Link to="/staking" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />
          스테이킹 목록으로
        </Link>

        {error ? <FeedbackState title="상세 조회 오류" description={error} tone="error" /> : null}
        {actionError ? <FeedbackState title="처리 실패" description={actionError} tone="error" /> : null}
        {actionSuccess ? <FeedbackState title="처리 완료" description={actionSuccess} tone="success" /> : null}
        {loading ? <FeedbackState title="상세 로딩 중" description="스테이킹 상세 정보를 불러오고 있습니다." /> : null}

        {staking ? (
          <>
            <Card className="p-6">
              <SectionTitle
                eyebrow="Staking Summary"
                title={staking.product.name}
                description="현재 상태와 신청 당시 snapshot, 현재 상품 정보를 함께 표시합니다."
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="staking id" value={staking.id} mono />
                <InfoTile label="현재 상태" value={staking.status} />
                <InfoTile
                  label="원금"
                  value={`${formatBaseAmount(staking.principal_amount_base, staking.product.decimals)} ${staking.product.symbol}`}
                />
                <InfoTile
                  label="신청 당시 일일 이율"
                  value={`${formatDailyInterestBps(staking.daily_interest_bps_snapshot)} (${staking.daily_interest_bps_snapshot} bps)`}
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="신청 당시 기간" value={`${staking.duration_days_snapshot}일`} />
                <InfoTile label="상품 현재 최소 금액" value={formatBaseAmount(staking.product.min_stake_amount_base, staking.product.decimals)} />
                <InfoTile label="상품 현재 최대 금액" value={formatBaseAmount(staking.product.max_stake_amount_base, staking.product.decimals)} />
                <InfoTile label="상품 현재 일일 이율" value={`${formatDailyInterestBps(staking.product.daily_interest_bps)} (${staking.product.daily_interest_bps} bps)`} />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle eyebrow="Timeline" title="상태 타임라인" />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="신청일" value={formatDateTime(staking.created_at)} />
                <InfoTile label="활성화일" value={formatDateTime(staking.activated_at)} />
                <InfoTile label="시작일" value={formatDateTime(staking.started_at)} />
                <InfoTile label="만기 예정일" value={formatDateTime(staking.matures_at)} />
                <InfoTile label="취소 요청일" value={formatDateTime(staking.cancel_requested_at)} />
                <InfoTile label="취소일" value={formatDateTime(staking.cancelled_at)} />
                <InfoTile label="종료일" value={formatDateTime(staking.closed_at)} />
                <InfoTile label="matured_at" value={formatDateTime(staking.matured_at)} />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle eyebrow="Action" title="상태별 처리" />
              <div className="mt-4">
                {availableAction === "cancel" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-800 bg-slate-950/50 p-4">
                    <div>
                      <div className="font-semibold text-slate-100">신청 취소 가능</div>
                      <div className="mt-1 text-sm text-slate-400">현재 상태가 `PENDING`이므로 즉시 취소할 수 있습니다.</div>
                    </div>
                    <Button onClick={() => setConfirmOpen(true)}>신청 취소</Button>
                  </div>
                ) : null}
                {availableAction === "cancel_request" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-800 bg-slate-950/50 p-4">
                    <div>
                      <div className="font-semibold text-slate-100">취소 요청 가능</div>
                      <div className="mt-1 text-sm text-slate-400">현재 상태가 `ACTIVE`이므로 관리자 확인을 위한 취소 요청을 보낼 수 있습니다.</div>
                    </div>
                    <Button onClick={() => setConfirmOpen(true)}>취소 요청</Button>
                  </div>
                ) : null}
                {staking.status === "CANCEL_REQUESTED" ? (
                  <FeedbackState title="처리 중" description="취소 요청이 접수되었습니다. 현재는 재요청 버튼을 노출하지 않습니다." />
                ) : null}
                {availableAction === "none" && staking.status !== "CANCEL_REQUESTED" ? (
                  <FeedbackState title="추가 액션 없음" description="현재 상태에서는 취소 또는 취소 요청을 진행할 수 없습니다." />
                ) : null}
              </div>
            </Card>
          </>
        ) : null}
      </div>

      {confirmOpen && staking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {availableAction === "cancel" ? "Cancel Staking" : "Cancel Request"}
                </div>
                <h2 className="mt-2 text-xl font-bold text-slate-50">
                  {availableAction === "cancel" ? "신청 취소 확인" : "취소 요청 확인"}
                </h2>
              </div>
              <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={() => setConfirmOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 rounded-[20px] border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
              {availableAction === "cancel"
                ? "이 요청은 즉시 CANCELLED 상태로 전환됩니다."
                : "이 요청은 CANCEL_REQUESTED 상태로 전환되며, 최종 취소는 관리자 처리 후 확정됩니다."}
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="cancel-reason">
                사유 입력
              </label>
              <textarea
                id="cancel-reason"
                className="min-h-[120px] w-full rounded-[20px] border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
                placeholder="선택 입력"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={submitting}
              />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                닫기
              </Button>
              <Button onClick={() => void handleCancel()} disabled={submitting}>
                {submitting ? "처리 중..." : availableAction === "cancel" ? "신청 취소 실행" : "취소 요청 실행"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </UserShell>
  );
}

function InfoTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm font-semibold text-slate-100 ${mono ? "break-all font-mono" : "tabular"}`}>{value}</div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}
