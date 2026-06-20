import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import {
  api,
  getErrorMessage,
  type AdminAccountListItem,
  type CalcRun,
  type RankBonusRunSummary,
  type RankQualificationResult,
  type RankQualificationRunSummary,
  type RankReadModel,
  type SessionRole,
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { getDisplayLabel } from "@/lib/display";
import { Button, Card, FeedbackState, Pagination, StatusBadge, TableShell } from "@/components/ui";
import { AccountRankDetailPanel } from "@/components/ranks/AccountRankDetailPanel";
import { RankBonusRunModal } from "@/components/ranks/RankBonusRunModal";
import { RankQualificationRunModal } from "@/components/ranks/RankQualificationRunModal";
import { RankRunSummary } from "@/components/ranks/RankRunSummary";

type RankAccountRow = {
  account: AdminAccountListItem;
  rank: RankReadModel | null;
  error?: string | null;
};

const ACCOUNT_LIMIT = 10;
const RUN_LIMIT = 10;

export function RanksTab({
  actorId,
  role,
  selectedAccountId,
  selectedCalcRunId,
  onSelectAccountId,
  onSelectCalcRunId,
  onOpenRewards,
  onOpenCalcRun,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  selectedCalcRunId: string | null;
  onSelectAccountId: (accountId: string | null) => void;
  onSelectCalcRunId: (calcRunId: string | null) => void;
  onOpenRewards: (target: { accountId?: string | null; calcRunId?: string | null; rewardId?: string | null }) => void;
  onOpenCalcRun: (calcRunId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [accountPage, setAccountPage] = useState(1);
  const [accounts, setAccounts] = useState<RankAccountRow[]>([]);
  const [accountTotal, setAccountTotal] = useState(0);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  const [runs, setRuns] = useState<CalcRun[]>([]);
  const [runPage, setRunPage] = useState(1);
  const [runTotal, setRunTotal] = useState(0);
  const [runError, setRunError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(true);

  const [summary, setSummary] = useState<RankQualificationRunSummary | RankBonusRunSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [results, setResults] = useState<RankQualificationResult[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [qualificationOpen, setQualificationOpen] = useState(false);
  const [qualificationSubmitting, setQualificationSubmitting] = useState(false);
  const [qualificationError, setQualificationError] = useState<string | null>(null);
  const [qualificationResult, setQualificationResult] = useState<RankQualificationRunSummary | null>(null);

  const [bonusOpen, setBonusOpen] = useState(false);
  const [bonusSubmitting, setBonusSubmitting] = useState(false);
  const [bonusError, setBonusError] = useState<string | null>(null);
  const [bonusResult, setBonusResult] = useState<RankBonusRunSummary | null>(null);

  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedCalcRunId) ?? runs[0] ?? null,
    [runs, selectedCalcRunId]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      try {
        setAccountLoading(true);
        const result = await api.listAdminAccounts(actorId, {
          q: appliedQuery || undefined,
          role: "USER",
          page: accountPage,
          limit: ACCOUNT_LIMIT,
          sort: "total_stake_desc",
        });
        if (cancelled) {
          return;
        }

        const rankEntries = await Promise.all(
          result.items.map(async (account) => {
            try {
              const rank = await api.getAccountRank(actorId, account.id);
              return { account, rank, error: null } satisfies RankAccountRow;
            } catch (error) {
              return {
                account,
                rank: null,
                error: getErrorMessage(error),
              } satisfies RankAccountRow;
            }
          })
        );

        if (cancelled) {
          return;
        }

        setAccounts(rankEntries);
        setAccountTotal(result.total);
        setAccountError(null);
        if (!selectedAccountId) {
          onSelectAccountId(rankEntries[0]?.account.id ?? null);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setAccounts([]);
        setAccountTotal(0);
        setAccountError(getErrorMessage(error));
      } finally {
        if (!cancelled) {
          setAccountLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [actorId, accountPage, appliedQuery, onSelectAccountId, selectedAccountId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRuns() {
      try {
        setRunLoading(true);
        const result = await api.listCalcRuns(actorId, {
          page: runPage,
          limit: RUN_LIMIT,
        });
        if (cancelled) {
          return;
        }

        const rankRuns = result.calc_runs.filter(
          (run) => run.run_type === "RANK_QUALIFICATION" || run.run_type === "RANK_BONUS"
        );
        setRuns(rankRuns);
        setRunTotal(rankRuns.length === result.calc_runs.length ? result.total : rankRuns.length);
        setRunError(null);
        if (!selectedCalcRunId && rankRuns[0]) {
          onSelectCalcRunId(rankRuns[0].id);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setRuns([]);
        setRunTotal(0);
        setRunError(getErrorMessage(error));
      } finally {
        if (!cancelled) {
          setRunLoading(false);
        }
      }
    }

    void loadRuns();

    return () => {
      cancelled = true;
    };
  }, [actorId, onSelectCalcRunId, runPage, selectedCalcRunId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRunDetail() {
      if (!selectedRun) {
        setSummary(null);
        setResults([]);
        setResultsTotal(0);
        return;
      }

      try {
        setResultsLoading(true);
        const summaryResult = await api.getRankCalcRunSummary(actorId, selectedRun.id);
        if (cancelled) {
          return;
        }
        setSummary(summaryResult);
        setSummaryError(null);

        if (selectedRun.run_type !== "RANK_QUALIFICATION") {
          setResults([]);
          setResultsTotal(0);
          return;
        }

        const result = await api.getRankCalcRunResults(actorId, selectedRun.id, { page: 1, limit: 10 });
        if (cancelled) {
          return;
        }
        setResults(result.items);
        setResultsTotal(result.total);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSummary(null);
        setResults([]);
        setResultsTotal(0);
        setSummaryError(getErrorMessage(error));
      } finally {
        if (!cancelled) {
          setResultsLoading(false);
        }
      }
    }

    void loadRunDetail();

    return () => {
      cancelled = true;
    };
  }, [actorId, selectedRun]);

  async function refreshAll() {
    setAppliedQuery((current) => `${current}`);
    setRunPage((current) => current);
  }

  async function handleRunQualification(payload: { policy_version_id: string; calculation_date: string }) {
    try {
      setQualificationSubmitting(true);
      setQualificationError(null);
      const result = await api.runRankQualification(actorId, payload);
      setQualificationResult(result);
      onSelectCalcRunId(result.calc_run_id);
      setRunPage(1);
    } catch (error) {
      setQualificationError(getErrorMessage(error));
    } finally {
      setQualificationSubmitting(false);
    }
  }

  async function handleRunBonus(payload: { policy_version_id: string; calculation_date: string }) {
    try {
      setBonusSubmitting(true);
      setBonusError(null);
      const result = await api.runRankBonus(actorId, payload);
      setBonusResult(result);
      onSelectCalcRunId(result.calc_run_id);
      setRunPage(1);
    } catch (error) {
      setBonusError(getErrorMessage(error));
    } finally {
      setBonusSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">직급 관리</h2>
            <p className="text-sm text-slate-400">직급 산정 실행, 직급 보상 실행, 회원별 직급 현황을 확인합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {role === "ADMIN" ? (
              <Button variant="secondary" onClick={() => setQualificationOpen(true)}>
                직급 산정 실행
              </Button>
            ) : null}
            {role === "ADMIN" ? <Button onClick={() => setBonusOpen(true)}>직급 보상 실행</Button> : null}
            <Button variant="secondary" onClick={() => void refreshAll()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
        </div>

        {role !== "ADMIN" ? (
          <div className="mt-4">
            <FeedbackState title="조회 전용" description="READER는 직급 실행 기능 없이 조회만 가능합니다." />
          </div>
        ) : null}

        {qualificationResult ? (
          <div className="mt-4">
            <RankRunSummary summary={qualificationResult} />
          </div>
        ) : null}
        {bonusResult ? (
          <div className="mt-4">
            <RankRunSummary
              summary={bonusResult}
              onOpenRewards={(calcRunId) => onOpenRewards({ calcRunId })}
            />
          </div>
        ) : null}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-50">직급 대상 회원</h3>
                <p className="text-sm text-slate-400">현재 직급과 다음 직급 조건을 함께 확인합니다.</p>
              </div>
              <div className="flex gap-2">
                <input
                  className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
                  placeholder="아이디 / 이름"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Button
                  onClick={() => {
                    setAppliedQuery(query.trim());
                    setAccountPage(1);
                  }}
                >
                  <Search className="mr-2 h-4 w-4" />
                  조회
                </Button>
              </div>
            </div>

            {accountError ? <FeedbackState title="회원 조회 실패" description={accountError} tone="error" /> : null}
            {accountLoading ? <FeedbackState title="회원 목록 불러오는 중" description="직급 정보를 함께 조회하고 있습니다." /> : null}

            <TableShell height="max-h-[520px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>현재 직급</th>
                    <th>다음 직급</th>
                    <th>직추천 수</th>
                    <th>활성 스테이킹</th>
                    <th>좌측 레그</th>
                    <th>우측 레그</th>
                    <th>약한 레그</th>
                    <th>최근 산정일</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((entry) => {
                    const rank = entry.rank?.latest_qualification_result;
                    const active = entry.account.id === selectedAccountId;
                    return (
                      <tr
                        key={entry.account.id}
                        className={active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}
                        onClick={() => onSelectAccountId(entry.account.id)}
                      >
                        <td>
                          <div className="font-semibold text-slate-100">{entry.account.login_id ?? "-"}</div>
                          <div className="text-xs text-slate-500">{entry.account.display_name ?? "-"}</div>
                        </td>
                        <td className="tabular text-right">{entry.rank?.rank_status?.current_rank_level ?? "-"}</td>
                        <td className="tabular text-right">{entry.rank?.next_rank?.rank_level ?? "-"}</td>
                        <td className="tabular text-right">{rank?.direct_active_referral_count ?? "-"}</td>
                        <td className="tabular text-right">
                          {rank ? formatBaseAmount(rank.personal_active_stake_amount_base, 0) : "-"}
                        </td>
                        <td className="tabular text-right">{rank ? formatBaseAmount(rank.left_leg_volume_base, 0) : "-"}</td>
                        <td className="tabular text-right">{rank ? formatBaseAmount(rank.right_leg_volume_base, 0) : "-"}</td>
                        <td className="tabular text-right">{rank ? formatBaseAmount(rank.weak_leg_volume_base, 0) : "-"}</td>
                        <td>
                          <div>{rank?.calculation_date ?? "-"}</div>
                          {entry.error ? <div className="text-xs text-rose-300">{entry.error}</div> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>

            <div className="mt-4">
              <Pagination page={accountPage} limit={ACCOUNT_LIMIT} total={accountTotal} onChange={setAccountPage} />
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-50">직급 계산 실행 내역</h3>
                <p className="text-sm text-slate-400">직급 산정과 직급 보상 실행 이력을 확인합니다.</p>
              </div>
              <Button variant="secondary" onClick={() => void refreshAll()} disabled={runLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                새로고침
              </Button>
            </div>

            {runError ? <FeedbackState title="계산 실행 조회 실패" description={runError} tone="error" /> : null}
            {runLoading ? <FeedbackState title="계산 실행 불러오는 중" description="직급 실행 목록을 불러오고 있습니다." /> : null}

            <TableShell height="max-h-[400px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>실행일</th>
                    <th>실행 구분</th>
                    <th>상태</th>
                    <th>정책 버전</th>
                    <th>보기</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className={selectedRun?.id === run.id ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}
                      onClick={() => onSelectCalcRunId(run.id)}
                    >
                      <td>{run.run_date}</td>
                      <td>{getDisplayLabel(run.run_type)}</td>
                      <td><StatusBadge value={run.status} /></td>
                      <td className="font-mono text-xs text-slate-400">{run.policy_version_id}</td>
                      <td>
                        <Button
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenCalcRun(run.id);
                          }}
                        >
                          계산 실행 보기
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>

            <div className="mt-4">
              <Pagination page={runPage} limit={RUN_LIMIT} total={runTotal} onChange={setRunPage} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-50">선택한 실행 결과</h3>
                <p className="text-sm text-slate-400">선택한 직급 실행의 요약을 확인합니다.</p>
              </div>
              {selectedRun ? <StatusBadge value={selectedRun.run_type} tone="blue" /> : null}
            </div>
            <div className="mt-4">
              {summaryError ? <FeedbackState title="실행 결과 조회 실패" description={summaryError} tone="error" /> : null}
              {!selectedRun ? (
                <FeedbackState title="선택된 실행 없음" description="좌측 계산 실행 목록에서 실행을 선택해 주세요." />
              ) : summary ? (
                <RankRunSummary
                  summary={summary}
                  onOpenRewards={(calcRunId) => onOpenRewards({ calcRunId })}
                />
              ) : (
                <FeedbackState title="실행 결과 불러오는 중" description="선택한 직급 실행 결과를 불러오고 있습니다." />
              )}
            </div>
            {selectedRun?.run_type === "RANK_QUALIFICATION" ? (
              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">직급 산정 결과</div>
                  <div className="text-xs text-slate-500">총 {resultsTotal}건</div>
                </div>
                {resultsLoading ? (
                  <FeedbackState title="직급 산정 결과 불러오는 중" description="회원별 산정 결과를 불러오고 있습니다." />
                ) : (
                  <TableShell height="max-h-[320px]">
                    <table className="data-table min-w-full">
                      <thead>
                        <tr>
                          <th>회원 ID</th>
                          <th>상태</th>
                          <th>적용 직급</th>
                          <th>약한 레그</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((item) => (
                          <tr key={item.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => onSelectAccountId(item.account_id)}>
                            <td className="font-mono text-xs text-slate-400">{item.account_id}</td>
                            <td>{getDisplayLabel(item.result_status)}</td>
                            <td className="tabular text-right">{item.applied_rank_level ?? "-"}</td>
                            <td className="tabular text-right">{formatBaseAmount(item.weak_leg_volume_base, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableShell>
                )}
              </div>
            ) : null}
          </Card>

          <AccountRankDetailPanel
            actorId={actorId}
            role={role}
            accountId={selectedAccountId}
            onOpenRewards={onOpenRewards}
            onSelectCalcRunId={onSelectCalcRunId}
          />
        </div>
      </div>

      <RankQualificationRunModal
        open={qualificationOpen}
        submitting={qualificationSubmitting}
        error={qualificationError}
        result={qualificationResult}
        onClose={() => setQualificationOpen(false)}
        onSubmit={handleRunQualification}
      />
      <RankBonusRunModal
        open={bonusOpen}
        submitting={bonusSubmitting}
        error={bonusError}
        result={bonusResult}
        onClose={() => setBonusOpen(false)}
        onSubmit={handleRunBonus}
        onOpenRewards={(calcRunId) => onOpenRewards({ calcRunId })}
      />
    </div>
  );
}
