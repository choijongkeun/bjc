import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCcw } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api, getErrorMessage, type AccountRewardDetail } from "@/lib/api";
import {
  formatRewardAmountBase,
  formatRewardDate,
  formatRewardDateTime,
  getRewardStatusLabel,
  getRewardTypeLabel,
  getVisibleRewardMetadataEntries,
  isNegativeRewardAmount,
} from "@/lib/rewards";
import { useSessionStore } from "@/store/sessionStore";
import { FeedbackState } from "@/components/FeedbackState";
import { RewardStatusBadge } from "@/components/RewardStatusBadge";
import { RewardTypeBadge } from "@/components/RewardTypeBadge";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

export default function RewardDetailPage() {
  const { rewardId = "" } = useParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [reward, setReward] = useState<AccountRewardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!accessToken || !rewardId) return;
      try {
        setLoading(true);
        const result = await api.getMyReward(rewardId, accessToken);
        if (cancelled) return;
        setReward(result.reward);
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
  }, [accessToken, refreshNonce, rewardId]);

  const metadataEntries = getVisibleRewardMetadataEntries(reward?.metadata);
  const negative = reward ? reward.reward_type === "REVERSAL" || isNegativeRewardAmount(reward.amount_base) : false;

  return (
    <UserShell
      title="Reward Detail"
      subtitle="reward row의 상태, 연결된 스테이킹, 허용된 metadata만 확인합니다."
      actions={
        <div className="flex items-center gap-2">
          {reward ? <RewardStatusBadge status={reward.status} /> : <Badge tone="slate">Loading</Badge>}
          <Button variant="secondary" onClick={() => setRefreshNonce((current) => current + 1)} disabled={loading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Link to="/rewards" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />
          보상 목록으로
        </Link>

        {error ? <FeedbackState title="보상 상세 조회 오류" description={error} tone="error" /> : null}
        {loading ? <FeedbackState title="보상 상세 로딩 중" description="reward 상세 정보를 불러오고 있습니다." /> : null}

        {reward ? (
          <>
            {reward.status === "REVERSED" && reward.reversal ? (
              <FeedbackState
                title="역분개 처리된 원본 보상"
                description={`이 원본 보상은 역분개 완료 상태입니다. 연결된 reversal reward ID는 ${reward.reversal.id}입니다.`}
              />
            ) : null}

            {reward.reward_type === "REVERSAL" ? (
              <FeedbackState
                title="REVERSAL 보상"
                description={
                  reward.original_reward
                    ? `이 row는 원본 보상 ${reward.original_reward.id}를 상쇄하기 위해 생성된 음수 보상입니다.`
                    : "이 row는 원본 보상을 상쇄하기 위해 생성된 음수 보상입니다."
                }
              />
            ) : null}

            <Card className="p-6">
              <SectionTitle eyebrow="Reward Summary" title="보상 기본 정보" description="사용자 화면에는 보상 조회에 필요한 항목만 제한적으로 노출합니다." />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="reward id" value={reward.id} mono />
                <InfoTile label="reward type" value={getRewardTypeLabel(reward.reward_type)} badge={<RewardTypeBadge type={reward.reward_type} />} />
                <InfoTile label="reward date" value={formatRewardDate(reward.reward_date)} />
                <InfoTile
                  label="amount"
                  value={formatRewardAmountBase(reward.amount_base)}
                  valueClassName={negative ? "text-rose-200" : "text-slate-100"}
                  description={negative ? "역분개 음수 금액" : undefined}
                />
                <InfoTile label="status" value={getRewardStatusLabel(reward.status)} badge={<RewardStatusBadge status={reward.status} />} />
                <InfoTile label="staking id" value={reward.account_staking_id ?? "-"} mono />
                <InfoTile label="source_reference" value={reward.source_reference || "-"} mono />
                <InfoTile label="policy_version_id" value={reward.policy_version_id} mono />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle eyebrow="Timeline" title="처리 시점" />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="available_at" value={formatRewardDateTime(reward.available_at)} />
                <InfoTile label="confirmed_at" value={formatRewardDateTime(reward.confirmed_at)} />
                <InfoTile label="reversed_at" value={formatRewardDateTime(reward.reversed_at)} />
                <InfoTile label="created_at" value={formatRewardDateTime(reward.created_at)} />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle eyebrow="Relations" title="연결 정보" />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <InfoTile label="상품" value={reward.product ? `${reward.product.name} (${reward.product.symbol})` : "-"} />
                <InfoTile label="calc_run_id" value={reward.calc_run?.id ?? reward.calc_run_id ?? "-"} mono />
                <InfoTile label="reversal reward" value={reward.reversal?.id ?? "-"} mono />
                <InfoTile label="original reward" value={reward.original_reward?.id ?? "-"} mono />
                <InfoTile label="원본 보상 유형" value={reward.original_reward ? getRewardTypeLabel(reward.original_reward.reward_type) : "-"} />
                <InfoTile
                  label="원본 보상 금액"
                  value={reward.original_reward ? formatRewardAmountBase(reward.original_reward.amount_base) : "-"}
                />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle
                eyebrow="Metadata"
                title="허용된 metadata"
                description="principal snapshot, bps snapshot, duration snapshot, denominator만 표시합니다."
              />
              <div className="mt-5">
                {metadataEntries.length === 0 ? (
                  <FeedbackState title="표시할 metadata 없음" description="현재 reward에는 사용자에게 노출 가능한 metadata가 없습니다." />
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {metadataEntries.map((entry) => (
                      <InfoTile key={entry.label} label={entry.label} value={entry.value} mono={entry.label === "denominator"} />
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </>
        ) : null}
      </div>
    </UserShell>
  );
}

function InfoTile({
  label,
  value,
  mono = false,
  badge,
  description,
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: ReactNode;
  description?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold ${mono ? "break-all font-mono" : "tabular"} ${valueClassName ?? "text-slate-100"}`}>{value}</div>
      {description ? <div className="mt-2 text-xs text-slate-500">{description}</div> : null}
    </div>
  );
}
