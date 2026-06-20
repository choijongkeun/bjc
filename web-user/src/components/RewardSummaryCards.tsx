import type { RewardSummary } from "@/lib/api";
import { Link } from "react-router-dom";
import { formatRewardAmountBase } from "@/lib/rewards";
import { Card } from "@/components/ui";

export function RewardSummaryCards({
  summary,
  loading,
  withdrawalsHref,
}: {
  summary: RewardSummary | null;
  loading?: boolean;
  withdrawalsHref?: string;
}) {
  const items = [
    {
      label: "대기 보상",
      value: summary ? formatRewardAmountBase(summary.pending_reward_amount_base) : "...",
      note: "정산 대기 중인 보상",
    },
    {
      label: "확정 보상",
      value: summary ? formatRewardAmountBase(summary.confirmed_reward_amount_base) : "...",
      note: "확정 처리된 보상",
    },
    {
      label: "출금 가능 보상",
      value: summary ? formatRewardAmountBase(summary.withdrawable_reward_amount_base) : "...",
      note: "현재 출금 가능 금액",
      href: withdrawalsHref,
    },
    {
      label: "출금 완료 보상",
      value: summary ? formatRewardAmountBase(summary.withdrawn_reward_amount_base) : "...",
      note: "실제 완료된 출금 합계",
      href: withdrawalsHref,
    },
    {
      label: "DAILY_REWARD 누적",
      value: summary ? formatRewardAmountBase(summary.daily_reward_amount_base) : "...",
      note: "일일 보상 누적 합계",
    },
    {
      label: "BONUS 누적",
      value: summary ? formatRewardAmountBase(summary.bonus_reward_amount_base ?? "0") : "...",
      note: "직추천 및 직급 보상 누적 합계",
      href: withdrawalsHref,
    },
    {
      label: "총 보상 건수",
      value: summary ? String(summary.reward_count) : "...",
      note: "전체 reward row 수",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const content = (
          <Card key={item.label} className="p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
            <div className="mt-3 tabular text-3xl font-bold text-slate-50">{item.value}</div>
            <div className="mt-2 text-sm text-slate-400">{loading && !summary ? "요약 데이터를 불러오는 중입니다." : item.note}</div>
          </Card>
        );

        return item.href ? (
          <Link key={item.label} to={item.href} className="block transition hover:-translate-y-0.5">
            {content}
          </Link>
        ) : (
          content
        );
      })}
    </div>
  );
}
