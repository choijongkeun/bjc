import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  api,
  ApiError,
  type AdminStakingDetail,
  type DirectReferralSingleRunResponse,
  type SessionRole,
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { formatDailyInterestBps, getAdminStakingActionState } from "@/lib/staking";
import {
  canManageDirectReferral,
  canRunDirectReferralForStaking,
  getDirectReferralResultTone,
  getDirectReferralSingleResultLabel,
} from "@/lib/rewards";
import { Button, Card, FeedbackState } from "@/components/ui";
import { StakingStatusBadge } from "@/components/StakingStatusBadge";

type ActionMode = "activate" | "reject" | "cancel";

export function StakingDetailPanel({
  actorId,
  role,
  staking,
  onUpdated,
  onOpenReward,
}: {
  actorId: string;
  role: SessionRole;
  staking: AdminStakingDetail | null;
  onUpdated: (staking: AdminStakingDetail) => void | Promise<void>;
  onOpenReward?: (rewardId: string) => void;
}) {
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [directReferralOpen, setDirectReferralOpen] = useState(false);
  const [directReferralBusy, setDirectReferralBusy] = useState(false);
  const [directReferralError, setDirectReferralError] = useState<string | null>(null);
  const [directReferralResult, setDirectReferralResult] = useState<DirectReferralSingleRunResponse | null>(null);

  const actionState = useMemo(
    () => (staking ? getAdminStakingActionState(staking.status) : { canActivate: false, canReject: false, canCancel: false }),
    [staking]
  );

  if (!staking) {
    return (
      <Card>
        <FeedbackState title="선택된 스테이킹 없음" description="좌측 목록에서 스테이킹을 선택하면 상세 정보를 확인할 수 있습니다." />
      </Card>
    );
  }

  async function handleAction() {
    if (!staking || !actionMode) return;
    if ((actionMode === "reject" || actionMode === "cancel") && !reason.trim()) {
      setError(actionMode === "reject" ? "거절 사유를 입력해 주세요." : "관리자 취소 사유를 입력해 주세요.");
      return;
    }

    try {
      setBusy(true);
      setError(null);
      let result:
        | {
            staking: AdminStakingDetail;
          }
        | undefined;

      if (actionMode === "activate") {
        result = await api.activateAdminStaking(actorId, staking.id);
      } else if (actionMode === "reject") {
        result = await api.rejectAdminStaking(actorId, staking.id, { reason: reason.trim() });
      } else {
        result = await api.cancelAdminStaking(actorId, staking.id, { reason: reason.trim() });
      }

      await onUpdated(result.staking);
      setSuccess(
        actionMode === "activate"
          ? "스테이킹이 활성 상태로 변경되었습니다."
          : actionMode === "reject"
            ? "스테이킹이 거절 처리되었습니다."
            : "관리자 취소가 완료되었습니다."
      );
      setActionMode(null);
      setReason("");
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) {
        setError("현재 상태가 이미 변경되었습니다. 목록과 상세를 다시 확인해 주세요.");
      } else {
        setError(submitError instanceof Error ? submitError.message : "처리 중 오류가 발생했습니다.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleDirectReferralRun() {
    if (!staking) return;

    try {
      setDirectReferralBusy(true);
      setDirectReferralError(null);
      const result = await api.runDirectReferralForStaking(actorId, staking.id);
      setDirectReferralResult(result);
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) {
        setDirectReferralError("현재 상태가 변경되었거나 직추천 보상 계산이 이미 진행 중입니다. 목록을 새로고침해 주세요.");
      } else {
        setDirectReferralError(submitError instanceof Error ? submitError.message : "직추천 보상 계산 중 오류가 발생했습니다.");
      }
    } finally {
      setDirectReferralBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-50">스테이킹 상세</h3>
            <p className="text-sm text-slate-400">회원 정보와 상품 정보, 처리 이력을 확인합니다.</p>
        </div>
        <StakingStatusBadge status={staking.status} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <InfoTile label="스테이킹 ID" value={staking.id} mono />
        <InfoTile label="회원" value={`${staking.account.login_id ?? "-"} / ${staking.account.display_name ?? "-"}`} />
        <InfoTile label="상품명" value={staking.product.name} />
        <InfoTile
          label="원금"
          value={`${formatBaseAmount(staking.principal_amount_base, staking.product.decimals)} ${staking.product.symbol}`}
        />
        <InfoTile
          label="신청 당시 일일 이율"
          value={`${formatDailyInterestBps(staking.daily_interest_bps_snapshot)} (${staking.daily_interest_bps_snapshot}bp)`}
        />
        <InfoTile label="신청 당시 기간" value={`${staking.duration_days_snapshot}일`} />
        <InfoTile
          label="상품 현재 일일 이율"
          value={`${formatDailyInterestBps(staking.product.daily_interest_bps)} (${staking.product.daily_interest_bps}bp)`}
        />
        <InfoTile label="상품 현재 기간" value={`${staking.product.staking_days}일`} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoTile label="생성 일시" value={formatDateTime(staking.created_at)} />
        <InfoTile label="활성화 일시" value={formatDateTime(staking.activated_at)} />
        <InfoTile label="시작 일시" value={formatDateTime(staking.started_at)} />
        <InfoTile label="만기 일시" value={formatDateTime(staking.matures_at)} />
        <InfoTile label="취소 요청 일시" value={formatDateTime(staking.cancel_requested_at)} />
        <InfoTile label="취소 일시" value={formatDateTime(staking.cancelled_at)} />
        <InfoTile label="원장 이벤트 ID" value={staking.source_ledger_event_id ?? "-"} mono />
        <InfoTile label="취소 원장 이벤트 ID" value={staking.cancellation_ledger_event_id ?? "-"} mono />
      </div>

      <div className="mt-5 space-y-3">
        {error ? <FeedbackState title="상태 처리 실패" description={error} tone="error" /> : null}
        {success ? <FeedbackState title="상태 처리 완료" description={success} /> : null}
        {directReferralResult ? (
          <FeedbackState
            title={`직추천 계산 결과: ${getDirectReferralSingleResultLabel(directReferralResult.result_type)}`}
            description={
              directReferralResult.reward_id
                ? `보상 ID ${directReferralResult.reward_id}가 생성되었습니다.`
                : directReferralResult.existing_reward_id
                  ? `기존 보상 ID ${directReferralResult.existing_reward_id}와 연결됩니다.`
                  : `상태 ${directReferralResult.status}`
            }
            tone={getDirectReferralResultTone(directReferralResult) === "error" ? "error" : getDirectReferralResultTone(directReferralResult) === "success" ? "success" : "default"}
          />
        ) : null}
        {role !== "ADMIN" ? (
          <FeedbackState title="조회 전용" description="READER는 상태 변경 기능을 사용할 수 없습니다." />
        ) : (
          <div className="flex flex-wrap gap-3">
            {actionState.canActivate ? <Button onClick={() => setActionMode("activate")}>활성화</Button> : null}
            {actionState.canReject ? (
              <Button variant="danger" onClick={() => setActionMode("reject")}>
                거절
              </Button>
            ) : null}
            {actionState.canCancel ? (
              <Button variant="danger" onClick={() => setActionMode("cancel")}>
                관리자 취소
              </Button>
            ) : null}
            {canManageDirectReferral(role) && canRunDirectReferralForStaking(staking) ? (
              <Button variant="secondary" onClick={() => setDirectReferralOpen(true)}>
                직추천 보상 계산
              </Button>
            ) : null}
            {!actionState.canActivate && !actionState.canReject && !actionState.canCancel ? (
              <FeedbackState title="추가 상태 변경 없음" description="현재 상태에서는 처리 가능한 작업이 없습니다." />
            ) : null}
            {canManageDirectReferral(role) && !canRunDirectReferralForStaking(staking) ? (
              <FeedbackState title="직추천 계산 비대상" description="활성 상태이며 취소 요청이 없는 스테이킹만 실행할 수 있습니다." />
            ) : null}
          </div>
        )}
      </div>

      {actionMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.18em] text-slate-500">{getActionLabel(actionMode)}</div>
                <h3 className="mt-2 text-xl font-bold text-slate-50">{getActionTitle(actionMode)}</h3>
              </div>
              <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={() => setActionMode(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              {actionMode === "activate" ? (
                <>
                  <div>활성화하면 시작일과 만기일이 확정됩니다.</div>
                </>
              ) : null}
              {actionMode === "reject" ? <div>대기 상태의 신청을 거절 처리합니다.</div> : null}
              {actionMode === "cancel" ? (
                <>
                  <div>관리자 취소 시 취소 처리와 함께 관련 기록이 남습니다.</div>
                </>
              ) : null}
            </div>

            {actionMode === "reject" || actionMode === "cancel" ? (
              <div className="mt-4">
                <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="staking-admin-reason">
                  사유 입력
                </label>
                <textarea
                  id="staking-admin-reason"
                  className="min-h-[120px] w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  disabled={busy}
                  placeholder={actionMode === "reject" ? "거절 사유를 입력해 주세요." : "관리자 취소 사유를 입력해 주세요."}
                />
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setActionMode(null)} disabled={busy}>
                닫기
              </Button>
              <Button variant={actionMode === "activate" ? "primary" : "danger"} onClick={() => void handleAction()} disabled={busy}>
                {busy ? "처리 중..." : getActionConfirmLabel(actionMode)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {directReferralOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[28px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.18em] text-slate-500">직추천 보상</div>
                <h3 className="mt-2 text-xl font-bold text-slate-50">직추천 보상 계산 확인</h3>
              </div>
              <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={() => setDirectReferralOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
              <div>선택한 활성 스테이킹에 대해 직추천 보상을 단건 계산합니다.</div>
              <div className="mt-2 text-xs text-slate-500">이미 생성된 보상이 있으면 기존 결과를 안내합니다.</div>
            </div>

            {directReferralError ? <div className="mt-4"><FeedbackState title="실행 실패" description={directReferralError} tone="error" /></div> : null}
            {directReferralResult ? (
              <div className="mt-4">
                <FeedbackState
                  title={getDirectReferralSingleResultLabel(directReferralResult.result_type)}
                  description={`계산 실행 ID ${directReferralResult.calc_run_id ?? "-"} / 상태 ${directReferralResult.status}`}
                  tone={getDirectReferralResultTone(directReferralResult) === "error" ? "error" : getDirectReferralResultTone(directReferralResult) === "success" ? "success" : "default"}
                />
                {directReferralResult.reward_id || directReferralResult.existing_reward_id ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {directReferralResult.reward_id ? (
                      <Button variant="secondary" onClick={() => onOpenReward?.(directReferralResult.reward_id!)}>
                        생성된 보상 보기
                      </Button>
                    ) : null}
                    {directReferralResult.existing_reward_id ? (
                      <Button variant="secondary" onClick={() => onOpenReward?.(directReferralResult.existing_reward_id!)}>
                        기존 보상 보기
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setDirectReferralOpen(false)} disabled={directReferralBusy}>
                닫기
              </Button>
              <Button onClick={() => void handleDirectReferralRun()} disabled={directReferralBusy}>
                {directReferralBusy ? "처리 중..." : "직추천 보상 계산 실행"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function InfoTile({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm font-semibold text-slate-100 ${mono ? "break-all font-mono" : "tabular"}`}>{value}</div>
    </div>
  );
}

function getActionTitle(mode: ActionMode) {
  if (mode === "activate") return "스테이킹 활성화 확인";
  if (mode === "reject") return "스테이킹 거절 확인";
  return "스테이킹 관리자 취소 확인";
}

function getActionConfirmLabel(mode: ActionMode) {
  if (mode === "activate") return "활성화 실행";
  if (mode === "reject") return "거절 실행";
  return "관리자 취소 실행";
}

function getActionLabel(mode: ActionMode) {
  if (mode === "activate") return "활성화";
  if (mode === "reject") return "거절";
  return "관리자 취소";
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}
