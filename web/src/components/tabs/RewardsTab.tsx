import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { api, getErrorMessage, type AdminRewardDetail, type AdminRewardListItem, type SessionRole } from "@/lib/api";
import {
  buildAdminRewardListQuery,
  formatRewardAmountBase,
  formatRewardDate,
  formatRewardDateTime,
  isNegativeRewardAmount,
  REWARD_SORT_OPTIONS,
  REWARD_STATUS_OPTIONS,
  REWARD_TYPE_OPTIONS,
  shouldUseCalcRunRewardsApi,
  type AdminRewardFilters,
} from "@/lib/rewards";
import { DailyRewardRunModal } from "@/components/DailyRewardRunModal";
import { RewardDetailPanel } from "@/components/RewardDetailPanel";
import { RewardStatusBadge } from "@/components/RewardStatusBadge";
import { RewardTypeBadge } from "@/components/RewardTypeBadge";
import { Button, Card, FeedbackState, Pagination, TableShell } from "@/components/ui";

const DEFAULT_FILTERS: AdminRewardFilters = {
  q: "",
  account_id: "",
  staking_id: "",
  reward_type: "",
  status: "",
  calc_run_id: "",
  reward_date_from: "",
  reward_date_to: "",
  page: 1,
  limit: 20,
  sort: "reward_date_desc",
};

export function RewardsTab({
  actorId,
  role,
  selectedAccountId,
  selectedCalcRunId,
  onSelectAccountId,
  onSelectCalcRunId,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  selectedCalcRunId: string | null;
  onSelectAccountId: (accountId: string | null) => void;
  onSelectCalcRunId: (calcRunId: string | null) => void;
}) {
  const [draftFilters, setDraftFilters] = useState<AdminRewardFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AdminRewardFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<AdminRewardListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);
  const [selectedReward, setSelectedReward] = useState<AdminRewardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Awaited<ReturnType<typeof api.runDailyReward>> | null>(null);

  const requestQuery = useMemo(
    () =>
      buildAdminRewardListQuery({
        ...appliedFilters,
        page,
      }),
    [appliedFilters, page]
  );

  const activeSelectedId = useMemo(() => selectedRewardId ?? items[0]?.id ?? null, [items, selectedRewardId]);

  useEffect(() => {
    if (selectedAccountId && draftFilters.account_id !== selectedAccountId) {
      const next = { ...draftFilters, account_id: selectedAccountId, page: 1 };
      setDraftFilters(next);
      setAppliedFilters(next);
      setPage(1);
    }
  }, [draftFilters, selectedAccountId]);

  useEffect(() => {
    if (selectedCalcRunId && draftFilters.calc_run_id !== selectedCalcRunId) {
      const next = { ...draftFilters, calc_run_id: selectedCalcRunId, page: 1 };
      setDraftFilters(next);
      setAppliedFilters(next);
      setPage(1);
    }
  }, [draftFilters, selectedCalcRunId]);

  useEffect(() => {
    let cancelled = false;

    async function loadRewards() {
      try {
        setLoading(true);
        const result = shouldUseCalcRunRewardsApi(requestQuery)
          ? await api.listAdminCalcRunRewards(actorId, requestQuery.calc_run_id!, {
              reward_type: requestQuery.reward_type,
              status: requestQuery.status,
              page: requestQuery.page,
              limit: requestQuery.limit,
              sort: requestQuery.sort,
            })
          : await api.listAdminRewards(actorId, requestQuery);
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
        const nextSelectedId = result.items.some((item) => item.id === selectedRewardId) ? selectedRewardId : (result.items[0]?.id ?? null);
        setSelectedRewardId(nextSelectedId);
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError));
        setItems([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRewards();

    return () => {
      cancelled = true;
    };
  }, [actorId, requestQuery, selectedRewardId]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!activeSelectedId) {
        setSelectedReward(null);
        return;
      }

      try {
        setDetailLoading(true);
        const result = await api.getAdminReward(actorId, activeSelectedId);
        if (cancelled) return;
        setSelectedReward(result.reward);
        setDetailError(null);
      } catch (loadError) {
        if (cancelled) return;
        setSelectedReward(null);
        setDetailError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [activeSelectedId, actorId]);

  function updateDraft<K extends keyof AdminRewardFilters>(key: K, value: AdminRewardFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setPage(1);
    onSelectAccountId(draftFilters.account_id || null);
    onSelectCalcRunId(draftFilters.calc_run_id || null);
  }

  function resetFilters() {
    const next = {
      ...DEFAULT_FILTERS,
      account_id: selectedAccountId ?? "",
      calc_run_id: selectedCalcRunId ?? "",
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
  }

  async function handleRunDailyReward(payload: { policy_version_id: string; reward_date: string }) {
    try {
      setRunSubmitting(true);
      setRunError(null);
      const result = await api.runDailyReward(actorId, payload);
      setRunResult(result);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "일일 보상 계산 실행에 실패했습니다.");
    } finally {
      setRunSubmitting(false);
    }
  }

  function openCalcRunRewards(calcRunId: string) {
    const next = { ...draftFilters, calc_run_id: calcRunId };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
    onSelectCalcRunId(calcRunId);
    setRunModalOpen(false);
  }

  async function handleUpdated(nextReward: AdminRewardDetail) {
    setSelectedReward(nextReward);
    await refreshList();
  }

  async function refreshList() {
    setAppliedFilters((current) => ({ ...current }));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">Rewards 관리</h2>
            <p className="text-sm text-slate-400">전체 보상 조회, 회원별 조회, calc_run별 조회, reversal, 수동 DAILY_REWARD 실행을 관리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {role === "ADMIN" ? <Button onClick={() => setRunModalOpen(true)}>일일 보상 계산 실행</Button> : null}
            <Button variant="secondary" onClick={() => void refreshList()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
        </div>

        {error ? <FeedbackState title="보상 목록 조회 오류" description={error} tone="error" /> : null}
        {selectedCalcRunId ? (
          <div className="mb-4">
            <FeedbackState title="calc_run 필터 적용" description={`현재 calc_run_id ${selectedCalcRunId} 기준으로 rewards를 조회 중입니다.`} />
          </div>
        ) : null}

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="reward id / login_id / source_reference"
            value={draftFilters.q ?? ""}
            onChange={(event) => updateDraft("q", event.target.value)}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="account_id"
            value={draftFilters.account_id ?? ""}
            onChange={(event) => updateDraft("account_id", event.target.value)}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="staking_id"
            value={draftFilters.staking_id ?? ""}
            onChange={(event) => updateDraft("staking_id", event.target.value)}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="calc_run_id"
            value={draftFilters.calc_run_id ?? ""}
            onChange={(event) => updateDraft("calc_run_id", event.target.value)}
          />
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.reward_type ?? ""}
            onChange={(event) => updateDraft("reward_type", event.target.value as AdminRewardFilters["reward_type"])}
          >
            <option value="">전체 reward_type</option>
            {REWARD_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.status ?? ""}
            onChange={(event) => updateDraft("status", event.target.value as AdminRewardFilters["status"])}
          >
            <option value="">전체 status</option>
            {REWARD_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.reward_date_from ?? ""}
            onChange={(event) => updateDraft("reward_date_from", event.target.value)}
          />
          <input
            type="date"
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.reward_date_to ?? ""}
            onChange={(event) => updateDraft("reward_date_to", event.target.value)}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              조회
            </Button>
            <Button variant="ghost" onClick={resetFilters}>
              초기화
            </Button>
          </div>
          <div className="flex gap-2">
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
              value={draftFilters.sort ?? "reward_date_desc"}
              onChange={(event) => updateDraft("sort", event.target.value as AdminRewardFilters["sort"])}
            >
              {REWARD_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
              value={String(draftFilters.limit ?? 20)}
              onChange={(event) => {
                const limit = Number(event.target.value);
                updateDraft("limit", limit);
                setAppliedFilters((current) => ({ ...current, limit }));
                setPage(1);
              }}
            >
              {[20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}개
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4 text-sm text-slate-400">
          총 <span className="tabular text-slate-200">{total}</span>건
        </div>

        {loading ? <FeedbackState title="보상 목록 로딩 중" description="admin rewards 목록을 불러오고 있습니다." /> : null}
        {!loading && items.length === 0 ? <FeedbackState title="보상 내역 없음" description="현재 필터 조건에 맞는 rewards가 없습니다." /> : null}

        {items.length > 0 ? (
          <>
            <TableShell height="max-h-[760px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>reward id</th>
                    <th>reward date</th>
                    <th>login_id</th>
                    <th>display_name</th>
                    <th>reward type</th>
                    <th>amount</th>
                    <th>status</th>
                    <th>staking / product</th>
                    <th>calc_run_id</th>
                    <th>confirmed_at</th>
                    <th>available_at</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const negative = item.reward_type === "REVERSAL" || isNegativeRewardAmount(item.amount_base);
                    const active = activeSelectedId === item.id;
                    return (
                      <tr
                        key={item.id}
                        className={active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}
                        onClick={() => {
                          setSelectedRewardId(item.id);
                          onSelectAccountId(item.account_id);
                          onSelectCalcRunId(item.calc_run_id);
                        }}
                      >
                        <td className="font-mono text-xs text-slate-300">{item.id}</td>
                        <td>{formatRewardDate(item.reward_date)}</td>
                        <td>{item.account?.login_id ?? "-"}</td>
                        <td>{item.account?.display_name ?? "-"}</td>
                        <td><RewardTypeBadge type={item.reward_type} /></td>
                        <td className={`tabular text-right font-semibold ${negative ? "text-rose-200" : "text-slate-100"}`}>{formatRewardAmountBase(item.amount_base)}</td>
                        <td><RewardStatusBadge status={item.status} /></td>
                        <td>
                          <div>{item.product?.name ?? "-"}</div>
                          <div className="font-mono text-xs text-slate-500">{item.account_staking_id ?? "-"}</div>
                        </td>
                        <td className="font-mono text-xs text-slate-400">{item.calc_run_id ?? "-"}</td>
                        <td className="text-slate-400">{formatRewardDateTime(item.confirmed_at)}</td>
                        <td className="text-slate-400">{formatRewardDateTime(item.available_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
            <div className="mt-4">
              <Pagination page={page} limit={requestQuery.limit!} total={total} onChange={setPage} />
            </div>
          </>
        ) : null}
      </Card>

      <div className="space-y-6">
        {detailLoading ? <FeedbackState title="보상 상세 로딩 중" description="선택한 reward 상세를 불러오고 있습니다." /> : null}
        {detailError ? <FeedbackState title="보상 상세 조회 오류" description={detailError} tone="error" /> : null}
        <RewardDetailPanel actorId={actorId} role={role} reward={selectedReward} onUpdated={handleUpdated} />
      </div>

      <DailyRewardRunModal
        open={runModalOpen}
        submitting={runSubmitting}
        error={runError}
        result={runResult}
        onClose={() => setRunModalOpen(false)}
        onSubmit={handleRunDailyReward}
        onOpenCalcRunRewards={openCalcRunRewards}
      />
    </div>
  );
}
