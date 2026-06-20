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
      title="보상 상세"
      subtitle="보상 정보와 처리 일시를 확인합니다."
      actions={
        <div className="flex items-center gap-2">
          {reward ? <RewardStatusBadge status={reward.status} /> : <Badge tone="slate">불러오는 중</Badge>}
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
        {loading ? <FeedbackState title="불러오는 중" description="보상 정보를 불러오고 있습니다." /> : null}

        {reward ? (
          <>
            {reward.status === "REVERSED" && reward.reversal ? (
              <FeedbackState
                title="보상 취소가 반영된 내역"
                description="이 보상에는 취소 내역이 연결되어 있습니다."
              />
            ) : null}

            {reward.reward_type === "REVERSAL" ? (
              <FeedbackState
                title="보상 취소 내역"
                description={
                  reward.original_reward
                    ? "기존 보상을 취소하기 위해 생성된 내역입니다."
                    : "기존 보상을 취소하기 위해 생성된 내역입니다."
                }
              />
            ) : null}

            <Card className="p-6">
              <SectionTitle eyebrow="보상 정보" title="보상 기본 정보" />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="보상 구분" value={getRewardTypeLabel(reward.reward_type)} badge={<RewardTypeBadge type={reward.reward_type} />} />
                <InfoTile label="보상 기준일" value={formatRewardDate(reward.reward_date)} />
                <InfoTile
                  label="금액"
                  value={formatRewardAmountBase(reward.amount_base)}
                  valueClassName={negative ? "text-rose-200" : "text-slate-100"}
                />
                <InfoTile label="상태" value={getRewardStatusLabel(reward.status)} badge={<RewardStatusBadge status={reward.status} />} />
                <InfoTile label="상품" value={reward.product ? `${reward.product.name} (${reward.product.symbol})` : "-"} />
                <InfoTile label="스테이킹 원금" value={reward.staking?.principal_amount_base ?? "-"} />
              </div>
            </Card>

            <Card className="p-6">
              <SectionTitle eyebrow="처리 일시" title="처리 시점" />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoTile label="출금 가능 일시" value={formatRewardDateTime(reward.available_at)} />
                <InfoTile label="확정 일시" value={formatRewardDateTime(reward.confirmed_at)} />
                <InfoTile label="취소 반영 일시" value={formatRewardDateTime(reward.reversed_at)} />
                <InfoTile label="생성 일시" value={formatRewardDateTime(reward.created_at)} />
              </div>
            </Card>

            {reward.original_reward || reward.reversal ? (
              <Card className="p-6">
                <SectionTitle eyebrow="연결 정보" title="관련 보상" />
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <InfoTile label="상품" value={reward.product ? `${reward.product.name} (${reward.product.symbol})` : "-"} />
                  <InfoTile label="취소 보상 여부" value={reward.reversal ? "연결됨" : "-"} />
                  <InfoTile label="원본 보상 여부" value={reward.original_reward ? "연결됨" : "-"} />
                  <InfoTile label="원본 보상 유형" value={reward.original_reward ? getRewardTypeLabel(reward.original_reward.reward_type) : "-"} />
                  <InfoTile
                    label="원본 보상 금액"
                    value={reward.original_reward ? formatRewardAmountBase(reward.original_reward.amount_base) : "-"}
                  />
                </div>
              </Card>
            ) : null}

            <Card className="p-6">
              <SectionTitle
                eyebrow="추가 정보"
                title="보상 계산 정보"
                description={undefined}
              />
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metadataEntries.length === 0 ? (
                  <FeedbackState title="추가 정보 없음" description="표시할 보상 계산 정보가 없습니다." />
                ) : (
                  metadataEntries.map((entry) => (
                    <InfoTile key={entry.label} label={entry.label} value={entry.value} />
                  ))
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
  valueClassName,
}: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
        {badge}
      </div>
      <div className={`mt-2 text-sm font-semibold ${mono ? "break-all font-mono" : "tabular"} ${valueClassName ?? "text-slate-100"}`}>{value}</div>
    </div>
  );
}
