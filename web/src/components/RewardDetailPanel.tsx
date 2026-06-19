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
        <FeedbackState title="선택된 보상 없음" description="좌측 목록에서 reward row를 선택하면 상세 패널이 표시됩니다." />
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
      setNotice("역분개가 완료되었습니다. 원본 보상은 REVERSED로 변경되고 REVERSAL row가 연결되었습니다.");
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
            <h3 className="text-lg font-bold text-slate-50">Reward 상세</h3>
            <p className="text-sm text-slate-400">회원, 스테이킹, calc_run, reversal 연결, 허용된 metadata를 함께 표시합니다.</p>
          </div>
          <RewardStatusBadge status={reward.status} />
        </div>

        {notice ? <div className="mt-4"><FeedbackState title="처리 완료" description={notice} tone="success" /></div> : null}
        {reward.status === "REVERSED" ? (
          <div className="mt-4">
            <FeedbackState
              title="역분개 완료 상태"
              description={reward.reversal ? `원본 보상은 REVERSED 상태이며 reversal reward ID ${reward.reversal.id}가 연결되어 있습니다.` : "원본 보상은 역분개 완료 상태입니다."}
            />
          </div>
        ) : null}
        {reward.reward_type === "REVERSAL" ? (
          <div className="mt-4">
            <FeedbackState
              title="REVERSAL row"
              description={
                reward.original_reward
                  ? `이 reward는 원본 보상 ${reward.original_reward.id}를 상쇄하기 위한 음수 row입니다.`
                  : "이 reward는 원본 보상을 상쇄하기 위한 음수 row입니다."
              }
            />
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoTile label="reward id" value={reward.id} mono />
          <InfoTile label="회원" value={`${reward.account?.login_id ?? "-"} / ${reward.account?.display_name ?? "-"}`} />
          <InfoTile label="reward type" value={getRewardTypeLabel(reward.reward_type)} badge={<RewardTypeBadge type={reward.reward_type} />} />
          <InfoTile label="reward date" value={formatRewardDate(reward.reward_date)} />
          <InfoTile
            label="amount"
            value={formatRewardAmountBase(reward.amount_base)}
            badge={negative ? <span className="text-xs font-semibold text-rose-300">음수</span> : undefined}
            valueClassName={negative ? "text-rose-200" : "text-slate-100"}
          />
          <InfoTile label="status" value={getRewardStatusLabel(reward.status)} badge={<RewardStatusBadge status={reward.status} />} />
          <InfoTile label="staking" value={reward.account_staking_id ?? reward.staking?.id ?? "-"} mono />
          <InfoTile label="상품" value={reward.product ? `${reward.product.name} (${reward.product.symbol})` : "-"} />
          <InfoTile label="policy version" value={reward.policy_version_id} mono />
          <InfoTile label="calc_run" value={reward.calc_run?.id ?? reward.calc_run_id ?? "-"} mono />
          <InfoTile label="source_reference" value={reward.source_reference || "-"} mono />
          <InfoTile label="source_ledger_event_id" value={reward.source_ledger_event_id ?? "-"} mono />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoTile label="available_at" value={formatRewardDateTime(reward.available_at)} />
          <InfoTile label="confirmed_at" value={formatRewardDateTime(reward.confirmed_at)} />
          <InfoTile label="reversed_at" value={formatRewardDateTime(reward.reversed_at)} />
          <InfoTile label="created_at" value={formatRewardDateTime(reward.created_at)} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InfoTile label="reversal 연결" value={reward.reversal?.id ?? "-"} mono />
          <InfoTile label="reversal amount" value={reward.reversal ? formatRewardAmountBase(reward.reversal.amount_base) : "-"} />
          <InfoTile label="original reward" value={reward.original_reward?.id ?? "-"} mono />
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">허용된 metadata</div>
              <p className="mt-2 text-sm text-slate-400">내부 SQL, 토큰, 민감 정보는 표시하지 않고 service가 허용한 키만 렌더링합니다.</p>
            </div>
            {reward.reward_type === "REVERSAL" ? <AlertTriangle className="h-4 w-4 text-rose-300" /> : null}
          </div>
          <div className="mt-4">
            {metadataEntries.length === 0 ? (
              <FeedbackState title="metadata 없음" description="현재 reward에 노출 가능한 metadata가 없습니다." />
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
            <FeedbackState title="조회 전용" description="READER는 reward reversal 버튼이 노출되지 않습니다." />
          ) : canReverse ? (
            <Button variant="danger" onClick={() => setReverseOpen(true)}>
              Reward reversal
            </Button>
          ) : (
            <FeedbackState title="역분개 불가" description="CONFIRMED 상태의 일반 보상만 역분개할 수 있으며, 이미 reversed 된 reward에는 버튼을 노출하지 않습니다." />
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
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold ${mono ? "break-all font-mono" : "tabular"} ${valueClassName ?? "text-slate-100"}`}>{value}</div>
    </div>
  );
}
