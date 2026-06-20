import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Copy, FolderClock, Gift, GitBranch, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getErrorMessage, type BinaryLegsResponse, type MyRankResponse, type RewardSummary, type StakingSummary, type WithdrawalBalance } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { formatRewardAmountBase } from "@/lib/rewards";
import { formatWithdrawalAmountBase } from "@/lib/withdrawals";
import { getAccountStatusLabel, getBinaryPositionLabel } from "@/lib/display";
import { useSessionStore } from "@/store/sessionStore";
import { BinaryLegsCard } from "@/components/BinaryLegsCard";
import { FeedbackState } from "@/components/FeedbackState";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

export default function DashboardPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const account = useSessionStore((state) => state.account);
  const setAccount = useSessionStore((state) => state.setAccount);
  const [legs, setLegs] = useState<BinaryLegsResponse | null>(null);
  const [stakingSummary, setStakingSummary] = useState<StakingSummary | null>(null);
  const [rewardSummary, setRewardSummary] = useState<RewardSummary | null>(null);
  const [rank, setRank] = useState<MyRankResponse | null>(null);
  const [withdrawalBalance, setWithdrawalBalance] = useState<WithdrawalBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [meResult, legsResult, stakingSummaryResult, rewardSummaryResult, rankResult, withdrawalBalanceResult] = await Promise.all([
          api.me(accessToken),
          api.getMyBinaryLegs(accessToken),
          api.getMyStakingSummary(accessToken),
          api.getMyRewardsSummary(accessToken),
          api.getMyRank(accessToken),
          api.getMyWithdrawalBalance(accessToken),
        ]);
        if (cancelled) return;
        setAccount(meResult.account);
        setLegs(legsResult);
        setStakingSummary(stakingSummaryResult);
        setRewardSummary(rewardSummaryResult);
        setRank(rankResult);
        setWithdrawalBalance(withdrawalBalanceResult);
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken, setAccount]);

  async function copyReferralCode() {
    if (!account?.referral_code) return;
    try {
      await navigator.clipboard.writeText(account.referral_code);
      setCopyMessage("추천 코드가 복사되었습니다.");
      window.setTimeout(() => setCopyMessage(null), 1600);
    } catch {
      setCopyMessage("브라우저 복사에 실패했습니다.");
      window.setTimeout(() => setCopyMessage(null), 1600);
    }
  }

  return (
    <UserShell
      title="대시보드"
      subtitle="내 계정과 조직 현황을 한눈에 확인합니다."
      actions={<Badge tone="blue">{getAccountStatusLabel(account?.status)}</Badge>}
    >
      <div className="space-y-6">
        {error ? <FeedbackState title="대시보드 로드 오류" description={error} tone="error" /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <Card className="relative overflow-hidden p-6">
            <div className="soft-grid absolute inset-0 opacity-40" />
            <div className="relative">
              <SectionTitle
                eyebrow="회원 현황"
                title={`${account?.display_name ?? account?.login_id ?? "회원"} 님, 네트워크 현황입니다.`}
              />
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[
                  {
                    label: "활성 스테이킹 원금",
                    value: stakingSummary ? formatBaseAmount(stakingSummary.active_principal_amount_base, 0) : "...",
                    accent: "text-blue-200",
                  },
                  {
                    label: "대기 스테이킹 원금",
                    value: stakingSummary ? formatBaseAmount(stakingSummary.pending_principal_amount_base, 0) : "...",
                    accent: "text-cyan-200",
                  },
                  {
                    label: "확정 보상",
                    value: rewardSummary ? formatRewardAmountBase(rewardSummary.confirmed_reward_amount_base) : "...",
                    accent: "text-emerald-200",
                  },
                  {
                    label: "출금 가능 보상",
                    value: withdrawalBalance
                      ? formatWithdrawalAmountBase(
                          (BigInt(withdrawalBalance.daily_reward.available_amount_base) + BigInt(withdrawalBalance.bonus.available_amount_base)).toString()
                        )
                      : rewardSummary
                        ? formatRewardAmountBase(rewardSummary.withdrawable_reward_amount_base)
                        : "...",
                    accent: "text-violet-200",
                  },
                  {
                    label: "일일 보상 누적",
                    value: rewardSummary ? formatRewardAmountBase(rewardSummary.daily_reward_amount_base) : "...",
                    accent: "text-amber-200",
                  },
                  {
                    label: "보너스 누적",
                    value: rewardSummary ? formatRewardAmountBase(rewardSummary.bonus_reward_amount_base ?? "0") : "...",
                    accent: "text-emerald-200",
                  },
                  {
                    label: "현재 직급",
                    value:
                      rank?.rank_status?.current_rank_level === null || rank?.rank_status?.current_rank_level === undefined
                        ? "-"
                        : String(rank.rank_status.current_rank_level),
                    accent: "text-fuchsia-200",
                  },
                  {
                    label: "활성 / 대기 건수",
                    value: stakingSummary ? `${stakingSummary.active_count} / ${stakingSummary.pending_count}` : "...",
                    accent: "text-slate-100",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-[24px] border border-slate-800 bg-slate-950/55 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                    <div className={`mt-3 tabular text-3xl font-bold ${item.accent}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle eyebrow="내 계정" title="내 계정 요약" />
            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <InfoRow label="이름" value={account?.display_name ?? "-"} />
              <InfoRow label="아이디" value={account?.login_id ?? "-"} />
              <InfoRow label="추천 코드" value={account?.referral_code ?? "-"} />
              <InfoRow label="바이너리 위치" value={getBinaryPositionLabel(account?.binary_position)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => void copyReferralCode()} disabled={!account?.referral_code}>
                <Copy className="mr-2 h-4 w-4" />
                추천 코드 복사
              </Button>
              <Link to="/network">
                <Button variant="secondary">
                  <GitBranch className="mr-2 h-4 w-4" />
                  내 네트워크 보기
                </Button>
              </Link>
            </div>
            {copyMessage ? <div className="mt-4"><FeedbackState title="복사 상태" description={copyMessage} tone={copyMessage.includes("실패") ? "error" : "success"} /></div> : null}
          </Card>
        </div>

        <BinaryLegsCard legs={legs} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            title="내 네트워크 보기"
            description="추천 조직도, 바이너리 조직도, 하위 회원 목록으로 이동합니다."
            icon={<GitBranch className="h-5 w-5" />}
            href="/network"
          />
          <ActionCard
            title="스테이킹 보기"
            description="상품 목록, 내 스테이킹 목록, 상세 상태 확인 화면으로 이동합니다."
            icon={<FolderClock className="h-5 w-5" />}
            href="/staking"
          />
          <ActionCard
            title="직급 보기"
            description={
              rank?.next_rank?.rank_level !== null && rank?.next_rank?.rank_level !== undefined
                ? `현재 ${rank?.rank_status?.current_rank_level ?? "-"} / 다음 ${rank.next_rank.rank_level}`
                : "현재 직급, 다음 직급 조건, 직급 보상 내역으로 이동합니다."
            }
            icon={<FolderClock className="h-5 w-5" />}
            href="/rank"
          />
          <ActionCard
            title="보상 보기"
            description="보상 요약, 목록, 상세를 확인하고 역분개 반영 내역까지 조회합니다."
            icon={<Gift className="h-5 w-5" />}
            href="/rewards"
          />
          <ActionCard
            title="출금 관리"
            description={
              withdrawalBalance
                ? `일일 보상 ${formatWithdrawalAmountBase(withdrawalBalance.daily_reward.available_amount_base)} / 보너스 ${formatWithdrawalAmountBase(withdrawalBalance.bonus.available_amount_base)}`
                : "출금 가능 잔액과 출금 이력으로 이동합니다."
            }
            icon={<Wallet className="h-5 w-5" />}
            href="/withdrawals"
          />
        </div>

        {loading ? <FeedbackState title="불러오는 중" description="대시보드 정보를 불러오고 있습니다." /> : null}
      </div>
    </UserShell>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[22px] border border-slate-800 bg-slate-950/45 p-4">
      <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
      <div className={mono ? "break-all font-mono text-slate-100" : "text-slate-100"}>{value}</div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  icon,
  href,
  disabled,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  disabled?: boolean;
}) {
  const body = (
    <Card className="h-full p-5">
      <div className="flex items-center gap-3 text-blue-200">{icon}</div>
      <div className="mt-4 text-lg font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{description}</div>
      <div className="mt-4">
        {disabled ? <Badge tone="slate">준비 중</Badge> : <Badge tone="blue">바로가기</Badge>}
      </div>
    </Card>
  );

  if (disabled || !href) {
    return body;
  }

  return <Link to={href}>{body}</Link>;
}
