import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage, type MyRankResponse, type RankHistoryItem, type RewardListResponse } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { formatRewardAmountBase, formatRewardDate } from "@/lib/rewards";
import { useSessionStore } from "@/store/sessionStore";
import { FeedbackState } from "@/components/FeedbackState";
import { RankHistoryTable } from "@/components/RankHistoryTable";
import { RankProgressCards } from "@/components/RankProgressCards";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle, TableShell } from "@/components/ui";

export default function RankPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [rank, setRank] = useState<MyRankResponse | null>(null);
  const [history, setHistory] = useState<RankHistoryItem[]>([]);
  const [rankBonusRewards, setRankBonusRewards] = useState<RewardListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accessToken) {
        return;
      }

      try {
        setLoading(true);
        const [rankResult, historyResult, bonusResult] = await Promise.all([
          api.getMyRank(accessToken),
          api.getMyRankHistory({ page: 1, limit: 10 }, accessToken),
          api.getMyRankBonusRewards({ page: 1, limit: 5 }, accessToken),
        ]);
        if (cancelled) {
          return;
        }
        setRank(rankResult);
        setHistory(historyResult.items);
        setRankBonusRewards(bonusResult);
        setError(null);
      } catch (loadError) {
        if (cancelled) {
          return;
        }
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
  }, [accessToken]);

  return (
    <UserShell
      title="Rank"
      subtitle="현재 직급, 다음 직급 조건, 최근 직급 이력과 직급 보상을 확인합니다."
      actions={<Badge tone="blue">Rank API 연결</Badge>}
    >
      <div className="space-y-6">
        {error ? <FeedbackState title="직급 조회 오류" description={error} tone="error" /> : null}
        {loading ? <FeedbackState title="직급 데이터 로딩 중" description="현재 직급과 최근 이력을 불러오고 있습니다." /> : null}

        <RankProgressCards rank={rank} />

        <div className="grid gap-6 xl:grid-cols-[1fr,0.95fr]">
          <RankHistoryTable items={history} />

          <Card className="p-6">
            <SectionTitle
              eyebrow="Rank Bonus"
              title="최근 RANK_BONUS 내역"
              description="기존 Rewards 상세와 연결되며, BONUS 출금 가능 잔액에도 자동 반영됩니다."
            />
            <div className="mt-4">
              {!rankBonusRewards?.items.length ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">
                  최근 직급 보상 내역이 없습니다.
                </div>
              ) : (
                <TableShell>
                  <table className="min-w-full text-left text-sm text-slate-300">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">reward_date</th>
                        <th className="px-4 py-3">amount</th>
                        <th className="px-4 py-3">rank_level</th>
                        <th className="px-4 py-3">base</th>
                        <th className="px-4 py-3 text-right">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankBonusRewards.items.map((reward) => (
                        <tr key={reward.id} className="border-t border-slate-800/80">
                          <td className="px-4 py-3">{formatRewardDate(reward.reward_date)}</td>
                          <td className="px-4 py-3 tabular font-semibold text-slate-100">{formatRewardAmountBase(reward.amount_base)}</td>
                          <td className="px-4 py-3 tabular">{reward.metadata?.rank_level ?? "-"}</td>
                          <td className="px-4 py-3 tabular">
                            {reward.metadata?.base_daily_reward_amount_base
                              ? formatBaseAmount(reward.metadata.base_daily_reward_amount_base, 0)
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link to={`/rewards/${reward.id}`}>
                              <Button variant="secondary">보상 상세</Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              )}
            </div>
            <div className="mt-4">
              <Link to="/rewards">
                <Button variant="secondary">전체 Rewards 보기</Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </UserShell>
  );
}
