import { useEffect, useState } from "react";
import {
  api,
  getErrorMessage,
  type AdminRewardListItem,
  type RankBonusSingleRunResponse,
  type RankHistoryItem,
  type RankQualificationResult,
  type RankReadModel,
  type SessionRole,
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { getDisplayLabel } from "@/lib/display";
import { formatRewardAmountBase, formatRewardDate } from "@/lib/rewards";
import { Button, Card, FeedbackState, TableShell } from "@/components/ui";

export function AccountRankDetailPanel({
  actorId,
  role,
  accountId,
  onOpenRewards,
  onSelectCalcRunId,
}: {
  actorId: string;
  role: SessionRole;
  accountId: string | null;
  onOpenRewards: (target: { accountId?: string | null; calcRunId?: string | null; rewardId?: string | null }) => void;
  onSelectCalcRunId: (calcRunId: string | null) => void;
}) {
  const [rank, setRank] = useState<RankReadModel | null>(null);
  const [history, setHistory] = useState<RankHistoryItem[]>([]);
  const [rewards, setRewards] = useState<AdminRewardListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qualificationSubmitting, setQualificationSubmitting] = useState(false);
  const [bonusSubmitting, setBonusSubmitting] = useState(false);
  const [qualificationResult, setQualificationResult] = useState<RankQualificationResult | null>(null);
  const [bonusResult, setBonusResult] = useState<RankBonusSingleRunResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!accountId) {
        setRank(null);
        setHistory([]);
        setRewards([]);
        return;
      }

      try {
        setLoading(true);
        const [rankResult, historyResult, rewardResult] = await Promise.all([
          api.getAccountRank(actorId, accountId),
          api.getAccountRankHistory(actorId, accountId, { page: 1, limit: 10 }),
          api.listAdminAccountRewards(actorId, accountId, {
            reward_type: "RANK_BONUS",
            page: 1,
            limit: 10,
            sort: "reward_date_desc",
          }),
        ]);
        if (cancelled) {
          return;
        }
        setRank(rankResult);
        setHistory(historyResult.items);
        setRewards(rewardResult.items);
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
  }, [accountId, actorId]);

  async function runQualificationForAccount() {
    if (!accountId || !rank?.rank_status?.policy_version_id || !rank.latest_qualification_result?.calculation_date) {
      return;
    }
    try {
      setQualificationSubmitting(true);
      const result = await api.runRankQualificationForAccount(actorId, accountId, {
        policy_version_id: rank.rank_status.policy_version_id,
        calculation_date: rank.latest_qualification_result.calculation_date,
      });
      setQualificationResult(result.qualification_result);
      onSelectCalcRunId(result.calc_run?.id ?? null);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setQualificationSubmitting(false);
    }
  }

  async function runBonusForAccount() {
    if (!accountId || !rank?.rank_status?.policy_version_id || !rank.latest_qualification_result?.calculation_date) {
      return;
    }
    try {
      setBonusSubmitting(true);
      const result = await api.runRankBonusForAccount(actorId, accountId, {
        policy_version_id: rank.rank_status.policy_version_id,
        calculation_date: rank.latest_qualification_result.calculation_date,
      });
      setBonusResult(result);
      onSelectCalcRunId(result.calc_run_id);
      if (result.reward_id) {
        onOpenRewards({ accountId, rewardId: result.reward_id, calcRunId: result.calc_run_id });
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBonusSubmitting(false);
    }
  }

  if (!accountId) {
    return (
      <Card>
        <FeedbackState title="선택된 회원 없음" description="좌측 목록에서 회원을 선택하면 직급 상세가 표시됩니다." />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs tracking-[0.16em] text-slate-500">회원 직급 상세</div>
          <h3 className="mt-2 text-lg font-bold text-slate-50">{rank?.account.display_name ?? rank?.account.login_id ?? accountId}</h3>
        </div>
        {role === "ADMIN" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void runQualificationForAccount()} disabled={qualificationSubmitting}>
              {qualificationSubmitting ? "실행 중..." : "직급 산정 단건 실행"}
            </Button>
            <Button onClick={() => void runBonusForAccount()} disabled={bonusSubmitting}>
              {bonusSubmitting ? "실행 중..." : "직급 보상 단건 실행"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <div className="mt-4"><FeedbackState title="직급 상세 오류" description={error} tone="error" /></div> : null}
      {loading ? <div className="mt-4"><FeedbackState title="로딩 중" description="직급 상세와 보상 이력을 불러오고 있습니다." /></div> : null}
      {qualificationResult ? (
        <div className="mt-4">
          <FeedbackState
            title="직급 산정 완료"
            description={`상태 ${getDisplayLabel(qualificationResult.result_status)}, 적용 직급 ${qualificationResult.applied_rank_level ?? "-"}`}
            tone="success"
          />
        </div>
      ) : null}
      {bonusResult ? (
        <div className="mt-4">
          <FeedbackState
            title="직급 보상 결과"
            description={`결과 ${getDisplayLabel(bonusResult.result_type)}, 보상 금액 ${formatBaseAmount(bonusResult.rank_bonus_amount_base, 0)}`}
            tone={bonusResult.result_type === "conflict" ? "error" : "success"}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="현재 직급" value={rank?.rank_status?.current_rank_level === null || rank?.rank_status?.current_rank_level === undefined ? "-" : String(rank.rank_status.current_rank_level)} />
        <MetricCard label="다음 직급" value={rank?.next_rank?.rank_level === null || rank?.next_rank?.rank_level === undefined ? "-" : String(rank.next_rank.rank_level)} />
        <MetricCard label="직추천 회원 수" value={rank?.latest_qualification_result ? String(rank.latest_qualification_result.direct_active_referral_count) : "-"} />
        <MetricCard label="개인 활성 스테이킹" value={rank?.latest_qualification_result ? formatBaseAmount(rank.latest_qualification_result.personal_active_stake_amount_base, 0) : "-"} />
        <MetricCard label="좌측 레그" value={rank?.latest_qualification_result ? formatBaseAmount(rank.latest_qualification_result.left_leg_volume_base, 0) : "-"} />
        <MetricCard label="우측 레그" value={rank?.latest_qualification_result ? formatBaseAmount(rank.latest_qualification_result.right_leg_volume_base, 0) : "-"} />
        <MetricCard label="약한 레그" value={rank?.latest_qualification_result ? formatBaseAmount(rank.latest_qualification_result.weak_leg_volume_base, 0) : "-"} />
        <MetricCard label="마지막 산정일" value={rank?.latest_qualification_result?.calculation_date ?? "-"} />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="text-xs tracking-[0.16em] text-slate-500">다음 직급 조건</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {rank?.next_rank_progress?.length ? (
            rank.next_rank_progress.map((item) => (
              <div key={item.metric} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{getProgressMetricLabel(item.metric)}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.met ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-200"}`}>
                    {item.met ? "충족" : "미충족"}
                  </span>
                </div>
                <div className="mt-3 text-sm text-slate-300">
                  현재 {String(item.current)} / 필요 {String(item.required)}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
              다음 직급 조건이 없거나 최고 직급입니다.
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-100">최근 직급 이력</div>
            {history[0]?.calc_run_id ? (
              <Button variant="ghost" onClick={() => onSelectCalcRunId(history[0].calc_run_id)}>
                최근 계산 실행 보기
              </Button>
            ) : null}
          </div>
          <TableShell height="max-h-[320px]">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>기준일</th>
                  <th>변경 구분</th>
                  <th>최종 직급</th>
                  <th>약한 레그</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>{item.effective_date}</td>
                    <td>{getDisplayLabel(item.change_type)}</td>
                    <td className="tabular text-right">{item.final_rank_level ?? "-"}</td>
                    <td className="tabular text-right">{formatBaseAmount(item.weak_leg_volume_base, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-100">직급 보상 내역</div>
            <Button variant="ghost" onClick={() => onOpenRewards({ accountId })}>
              전체 보상 보기
            </Button>
          </div>
          <TableShell height="max-h-[320px]">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>보상 기준일</th>
                  <th>보상 금액</th>
                  <th>상태</th>
                  <th>보기</th>
                </tr>
              </thead>
              <tbody>
                {rewards.map((reward) => (
                  <tr key={reward.id}>
                    <td>{formatRewardDate(reward.reward_date)}</td>
                    <td className="tabular text-right">{formatRewardAmountBase(reward.amount_base)}</td>
                    <td>{getDisplayLabel(reward.status)}</td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => onOpenRewards({ accountId, rewardId: reward.id, calcRunId: reward.calc_run_id ?? null })}
                      >
                        상세 보기
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
      </div>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 tabular text-lg font-semibold text-slate-50">{value}</div>
    </div>
  );
}

function getProgressMetricLabel(metric: string) {
  const labelMap: Record<string, string> = {
    direct_active_referral_count: "직추천 회원 수",
    personal_active_stake_amount_base: "개인 활성 스테이킹",
    left_leg_volume_base: "좌측 레그 매출",
    right_leg_volume_base: "우측 레그 매출",
    weak_leg_volume_base: "약한 레그 매출",
  };

  return labelMap[metric] ?? metric;
}
