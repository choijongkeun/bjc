import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api, ApiError, type AdminRewardDetail, type SessionRole } from "@/lib/api";
import {
  canReverseReward,
  formatRewardAmountBase,
  formatRewardDate,
  formatRewardDateTime,
  getRewardStatusLabel,
  getRewardTypeLabel,
  getVisibleRewardMetadataEntries,
  isNegativeRewardAmount,
} from "@/lib/rewards";
import { RewardStatusBadge } from "@/components/RewardStatusBadge";
import { RewardTypeBadge } from "@/components/RewardTypeBadge";
import { RewardReverseModal } from "@/components/RewardReverseModal";
import { Button, Card, FeedbackState } from "@/components/ui";

export function RewardDetailPanel({
  actorId,
  role,
  reward,
  onUpdated,
}: {
  actorId: string;
  role: SessionRole;
  reward: AdminRewardDetail | null;
  onUpdated: (reward: AdminRewardDetail) => void | Promise<void>;
}) {
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseSubmitting, setReverseSubmitting] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!reward) {
    return (
      <Card>
        <FeedbackState title="선택된 보상 없음" description="좌측 목록에서 보상을 선택해 주세요." />
      </Card>
    );
  }

  const metadataEntries = getVisibleRewardMetadataEntries(reward.metadata);
  const negative = reward.reward_type === "REVERSAL" || isNegativeRewardAmount(reward.amount_base);
  const canReverse = role === "ADMIN" && canReverseReward(reward);

  async function handleReverse(reason: string) {
    try {
      setReverseSubmitting(true);
      setReverseError(null);
      const result = await api.reverseAdminReward(actorId, reward.id, { reason });
      await onUpdated(result.reward);
      setNotice("보상 취소가 완료되었습니다.");
      setReverseOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setReverseError("이미 역분개된 보상이거나 현재 상태로는 역분개할 수 없습니다.");
      } else {
        setReverseError(error instanceof Error ? error.message : "역분개 처리 중 오류가 발생했습니다.");
      }
    } finally {
      setReverseSubmitting(false);
    }
  }

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-50">보상 상세</h3>
          </div>
          <RewardStatusBadge status={reward.status} />
        </div>

        {notice ? <div className="mt-4"><FeedbackState title="처리 완료" description={notice} tone="success" /></div> : null}
        {reward.status === "REVERSED" ? (
          <div className="mt-4">
            <FeedbackState
              title="보상 취소 반영"
              description="원본 보상에 취소 내역이 연결되어 있습니다."
            />
          </div>
        ) : null}
        {reward.reward_type === "REVERSAL" ? (
          <div className="mt-4">
            <FeedbackState
              title="보상 취소 내역"
              description={
                reward.original_reward
                  ? "기존 보상을 취소하기 위해 생성된 내역입니다."
                  : "기존 보상을 취소하기 위해 생성된 내역입니다."
              }
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoTile label="보상 ID" value={reward.id} mono />
          <InfoTile label="회원" value={`${reward.account?.login_id ?? "-"} / ${reward.account?.display_name ?? "-"}`} />
          <InfoTile label="보상 구분" value={getRewardTypeLabel(reward.reward_type)} badge={<RewardTypeBadge type={reward.reward_type} />} />
          <InfoTile label="보상 기준일" value={formatRewardDate(reward.reward_date)} />
          <InfoTile
            label="보상 금액"
            value={formatRewardAmountBase(reward.amount_base)}
            badge={negative ? <span className="text-xs font-semibold text-rose-300">음수</span> : undefined}
            valueClassName={negative ? "text-rose-200" : "text-slate-100"}
          />
          <InfoTile label="상태" value={getRewardStatusLabel(reward.status)} badge={<RewardStatusBadge status={reward.status} />} />
          <InfoTile label="스테이킹 ID" value={reward.account_staking_id ?? reward.staking?.id ?? "-"} mono />
          <InfoTile label="상품" value={reward.product ? `${reward.product.name} (${reward.product.symbol})` : "-"} />
          <InfoTile label="정책 버전" value={reward.policy_version_id} mono />
          <InfoTile label="계산 실행 ID" value={reward.calc_run?.id ?? reward.calc_run_id ?? "-"} mono />
          <InfoTile label="발생 정보" value={reward.source_reference || "-"} mono />
          <InfoTile label="원장 이벤트 ID" value={reward.source_ledger_event_id ?? "-"} mono />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="출금 가능 일시" value={formatRewardDateTime(reward.available_at)} />
          <InfoTile label="확정 일시" value={formatRewardDateTime(reward.confirmed_at)} />
          <InfoTile label="취소 반영 일시" value={formatRewardDateTime(reward.reversed_at)} />
          <InfoTile label="생성 일시" value={formatRewardDateTime(reward.created_at)} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoTile label="취소 보상 ID" value={reward.reversal?.id ?? "-"} mono />
          <InfoTile label="취소 보상 금액" value={reward.reversal ? formatRewardAmountBase(reward.reversal.amount_base) : "-"} />
          <InfoTile label="원본 보상 ID" value={reward.original_reward?.id ?? "-"} mono />
        </div>

        {reward.reward_type === "DIRECT_REFERRAL" ? (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="text-xs tracking-[0.16em] text-slate-500">직추천 발생 정보</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <InfoTile label="발생 회원 ID" value={reward.source_account_id ?? reward.source?.account_id ?? "-"} mono />
              <InfoTile label="발생 회원 아이디" value={reward.source?.login_id ?? "-"} />
              <InfoTile label="발생 회원 이름" value={reward.source?.display_name ?? "-"} />
              <InfoTile label="발생 스테이킹 ID" value={reward.source_account_staking_id ?? reward.source?.staking?.id ?? "-"} mono />
              <InfoTile label="기준 원금" value={reward.source?.staking?.principal_amount_base ?? reward.metadata?.source_principal_amount_base ?? "-"} />
              <InfoTile label="적용 비율" value={reward.source?.direct_referral_rate_bps ?? reward.metadata?.direct_referral_rate_bps ?? "-"} />
              <InfoTile label="추천 단계" value={reward.metadata?.referral_depth === undefined ? "-" : String(reward.metadata.referral_depth)} />
              <InfoTile label="계산식 버전" value={reward.metadata?.formula_version ?? "-"} />
              <InfoTile label="계산 실행 ID" value={reward.calc_run?.id ?? reward.calc_run_id ?? "-"} mono />
              <InfoTile label="원장 이벤트 ID" value={reward.source_ledger_event_id ?? "-"} mono />
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs tracking-[0.16em] text-slate-500">보상 계산 정보</div>
            </div>
            {reward.reward_type === "REVERSAL" ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : null}
          </div>
          <div className="mt-4">
            {metadataEntries.length === 0 ? (
              <FeedbackState title="보상 계산 정보가 없습니다" description="표시할 내용이 없습니다." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {metadataEntries.map((entry) => (
                  <InfoTile key={entry.label} label={entry.label} value={entry.value} mono={entry.label.includes("ID") || entry.label.includes("source") || entry.label === "denominator"} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5">
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="조회 관리자에게는 보상 취소 버튼이 표시되지 않습니다." />
          ) : canReverse ? (
            <Button variant="danger" onClick={() => setReverseOpen(true)}>
              보상 취소
            </Button>
          ) : (
            <FeedbackState title="보상 취소 불가" description="확정된 일반 보상만 취소할 수 있습니다." />
          )}
        </div>
      </Card>

      <RewardReverseModal
        reward={reward}
        open={reverseOpen}
        submitting={reverseSubmitting}
        error={reverseError}
        onClose={() => setReverseOpen(false)}
        onSubmit={handleReverse}
      />
    </>
  );
}

function InfoTile({
  label,
  value,
  mono = false,
  badge,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold ${mono ? "break-all font-mono" : "tabular"} ${valueClassName ?? "text-slate-100"}`}>{value}</div>
    </div>
  );
}
