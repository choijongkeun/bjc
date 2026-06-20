import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCcw, Search } from "lucide-react";
import {
  api,
  type ContributionRunSummary,
  getErrorMessage,
  type AdminRewardDetail,
  type AdminRewardListItem,
  type DailyRewardRunResponse,
  type DirectReferralRunResponse,
  type SidecarRunSummary,
  type SessionRole,
} from "@/lib/api";
import {
  buildAdminRewardListQuery,
  canManageDirectReferral,
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
import { BonusOperationRunModal } from "@/components/rewards/BonusOperationRunModal";
import { DirectReferralRunModal, DirectReferralRunSummaryPanel } from "@/components/rewards/DirectReferralRunModal";
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
  selectedRewardId,
  onSelectAccountId,
  onSelectCalcRunId,
  onSelectRewardId,
  onOpenCalcRun,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  selectedCalcRunId: string | null;
  selectedRewardId: string | null;
  onSelectAccountId: (accountId: string | null) => void;
  onSelectCalcRunId: (calcRunId: string | null) => void;
  onSelectRewardId: (rewardId: string | null) => void;
  onOpenCalcRun: (calcRunId: string) => void;
}) {
  const [draftFilters, setDraftFilters] = useState<AdminRewardFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AdminRewardFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<AdminRewardListItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeRewardId, setActiveRewardId] = useState<string | null>(selectedRewardId);
  const [selectedReward, setSelectedReward] = useState<AdminRewardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dailyRunModalOpen, setDailyRunModalOpen] = useState(false);
  const [dailyRunSubmitting, setDailyRunSubmitting] = useState(false);
  const [dailyRunError, setDailyRunError] = useState<string | null>(null);
  const [dailyRunResult, setDailyRunResult] = useState<DailyRewardRunResponse | null>(null);
  const [directRunModalOpen, setDirectRunModalOpen] = useState(false);
  const [directRunSubmitting, setDirectRunSubmitting] = useState(false);
  const [directRunError, setDirectRunError] = useState<string | null>(null);
  const [directRunResult, setDirectRunResult] = useState<DirectReferralRunResponse | null>(null);
  const [contributionRunModalOpen, setContributionRunModalOpen] = useState(false);
  const [contributionRunSubmitting, setContributionRunSubmitting] = useState(false);
  const [contributionRunError, setContributionRunError] = useState<string | null>(null);
  const [contributionRunResult, setContributionRunResult] = useState<ContributionRunSummary | null>(null);
  const [sidecarRunModalOpen, setSidecarRunModalOpen] = useState(false);
  const [sidecarRunSubmitting, setSidecarRunSubmitting] = useState(false);
  const [sidecarRunError, setSidecarRunError] = useState<string | null>(null);
  const [sidecarRunResult, setSidecarRunResult] = useState<SidecarRunSummary | null>(null);

  const requestQuery = useMemo(
    () =>
      buildAdminRewardListQuery({
        ...appliedFilters,
        page,
      }),
    [appliedFilters, page]
  );

  const activeSelectedId = useMemo(() => activeRewardId ?? items[0]?.id ?? null, [items, activeRewardId]);

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
    if (selectedRewardId && selectedRewardId !== activeRewardId) {
      setActiveRewardId(selectedRewardId);
    }
    if (!selectedRewardId && activeRewardId) {
      setActiveRewardId(null);
    }
  }, [activeRewardId, selectedRewardId]);

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
        const nextSelectedId = result.items.some((item) => item.id === activeRewardId) ? activeRewardId : (result.items[0]?.id ?? activeRewardId ?? null);
        setActiveRewardId(nextSelectedId);
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
  }, [actorId, requestQuery, activeRewardId]);

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
      setDailyRunSubmitting(true);
      setDailyRunError(null);
      const result = await api.runDailyReward(actorId, payload);
      setDailyRunResult(result);
    } catch (error) {
      setDailyRunError(error instanceof Error ? error.message : "일일 보상 계산 실행에 실패했습니다.");
    } finally {
      setDailyRunSubmitting(false);
    }
  }

  async function handleRunDirectReferral(payload: { policy_version_id: string; activated_from: string; activated_to: string }) {
    try {
      setDirectRunSubmitting(true);
      setDirectRunError(null);
      const result = await api.runDirectReferralReward(actorId, payload);
      setDirectRunResult(result);
      setDraftFilters((current) => ({
        ...current,
        reward_type: "DIRECT_REFERRAL",
        calc_run_id: result.calc_run_id,
      }));
      setAppliedFilters((current) => ({
        ...current,
        reward_type: "DIRECT_REFERRAL",
        calc_run_id: result.calc_run_id,
      }));
      setPage(1);
      onSelectCalcRunId(result.calc_run_id);
      onSelectRewardId(null);
      await refreshList();
    } catch (submitError) {
      setDirectRunError(getErrorMessage(submitError));
    } finally {
      setDirectRunSubmitting(false);
    }
  }

  async function handleRunContribution(payload: { policy_version_id: string; calculation_date: string }) {
    try {
      setContributionRunSubmitting(true);
      setContributionRunError(null);
      const result = await api.runContribution(actorId, payload);
      setContributionRunResult(result);
      setDraftFilters((current) => ({
        ...current,
        reward_type: "CONTRIBUTION",
        calc_run_id: result.calc_run_id,
      }));
      setAppliedFilters((current) => ({
        ...current,
        reward_type: "CONTRIBUTION",
        calc_run_id: result.calc_run_id,
      }));
      setPage(1);
      onSelectCalcRunId(result.calc_run_id);
      onSelectRewardId(null);
      await refreshList();
    } catch (submitError) {
      setContributionRunError(getErrorMessage(submitError));
    } finally {
      setContributionRunSubmitting(false);
    }
  }

  async function handleRunSidecar(payload: { policy_version_id: string; calculation_date: string }) {
    try {
      setSidecarRunSubmitting(true);
      setSidecarRunError(null);
      const result = await api.runSidecar(actorId, payload);
      setSidecarRunResult(result);
      setDraftFilters((current) => ({
        ...current,
        reward_type: "SIDECAR",
        calc_run_id: result.calc_run_id,
      }));
      setAppliedFilters((current) => ({
        ...current,
        reward_type: "SIDECAR",
        calc_run_id: result.calc_run_id,
      }));
      setPage(1);
      onSelectCalcRunId(result.calc_run_id);
      onSelectRewardId(null);
      await refreshList();
    } catch (submitError) {
      setSidecarRunError(getErrorMessage(submitError));
    } finally {
      setSidecarRunSubmitting(false);
    }
  }

  function openCalcRunRewards(calcRunId: string, rewardType?: AdminRewardFilters["reward_type"]) {
    const next = { ...draftFilters, calc_run_id: calcRunId, reward_type: rewardType ?? draftFilters.reward_type };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
    onSelectCalcRunId(calcRunId);
    onSelectRewardId(null);
    setDailyRunModalOpen(false);
    setDirectRunModalOpen(false);
  }

  function openRewardDetail(rewardId: string) {
    setActiveRewardId(rewardId);
    onSelectRewardId(rewardId);
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
            <p className="text-sm text-slate-400">전체 보상 조회, 회원별 조회, calc_run별 조회, reversal, 수동 DAILY_REWARD 및 DIRECT_REFERRAL 실행을 관리합니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {role === "ADMIN" ? <Button onClick={() => setDailyRunModalOpen(true)}>일일 보상 계산 실행</Button> : null}
            {canManageDirectReferral(role) ? (
              <Button variant="secondary" onClick={() => setDirectRunModalOpen(true)}>
                직추천 보상 실행
              </Button>
            ) : null}
            {role === "ADMIN" ? (
              <Button variant="secondary" onClick={() => setContributionRunModalOpen(true)}>
                CONTRIBUTION 실행
              </Button>
            ) : null}
            {role === "ADMIN" ? (
              <Button variant="secondary" onClick={() => setSidecarRunModalOpen(true)}>
                SIDECAR 실행
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void refreshList()} disabled={loading}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
        </div>

        {error ? <FeedbackState title="보상 목록 조회 오류" description={error} tone="error" /> : null}
        {directRunResult ? (
          <div className="mb-4">
            <DirectReferralRunSummaryPanel
              result={directRunResult}
              onOpenCalcRunRewards={(calcRunId) => openCalcRunRewards(calcRunId, "DIRECT_REFERRAL")}
              onOpenCalcRunDetail={onOpenCalcRun}
            />
          </div>
        ) : null}
        {contributionRunResult ? (
          <div className="mb-4">
            <FeedbackState
              title="CONTRIBUTION 실행 결과"
              description={`calc_run=${contributionRunResult.calc_run_id}, created=${contributionRunResult.created_count}, duplicate=${contributionRunResult.duplicate_skip_count}, conflict=${contributionRunResult.conflict_count}`}
              tone={contributionRunResult.failed_count > 0 || contributionRunResult.conflict_count > 0 ? "error" : "success"}
            />
          </div>
        ) : null}
        {sidecarRunResult ? (
          <div className="mb-4">
            <FeedbackState
              title="SIDECAR 실행 결과"
              description={`calc_run=${sidecarRunResult.calc_run_id}, created=${sidecarRunResult.created_count}, duplicate=${sidecarRunResult.duplicate_skip_count}, conflict=${sidecarRunResult.conflict_count}`}
              tone={sidecarRunResult.failed_count > 0 || sidecarRunResult.conflict_count > 0 ? "error" : "success"}
            />
          </div>
        ) : null}
        {selectedCalcRunId ? (
          <div className="mb-4">
            <FeedbackState title="calc_run 필터 적용" description={`현재 calc_run_id ${selectedCalcRunId} 기준으로 rewards를 조회 중입니다.`} />
          </div>
        ) : null}

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="reward id / login_id / source login/display / source_reference"
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
            placeholder="staking_id / source_staking_id"
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
                    <th>staking / source</th>
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
                          openRewardDetail(item.id);
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
                          <div className="font-mono text-xs text-slate-500">{item.account_staking_id ?? item.source_account_staking_id ?? "-"}</div>
                          {item.reward_type === "DIRECT_REFERRAL" ? (
                            <div className="mt-1 text-xs text-slate-400">
                              source: {item.source?.display_name ?? item.source?.login_id ?? item.source_account_id ?? "-"}
                            </div>
                          ) : null}
                        </td>
                        <td className="font-mono text-xs text-slate-400">
                          <div>{item.calc_run_id ?? "-"}</div>
                          {item.calc_run_id ? (
                            <button
                              type="button"
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenCalcRun(item.calc_run_id!);
                              }}
                            >
                              상세
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : null}
                        </td>
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
        open={dailyRunModalOpen}
        submitting={dailyRunSubmitting}
        error={dailyRunError}
        result={dailyRunResult}
        onClose={() => setDailyRunModalOpen(false)}
        onSubmit={handleRunDailyReward}
        onOpenCalcRunRewards={(calcRunId) => openCalcRunRewards(calcRunId)}
      />
      <DirectReferralRunModal
        open={directRunModalOpen}
        role={role}
        submitting={directRunSubmitting}
        error={directRunError}
        result={directRunResult}
        onClose={() => setDirectRunModalOpen(false)}
        onSubmit={handleRunDirectReferral}
        onOpenCalcRunRewards={(calcRunId) => openCalcRunRewards(calcRunId, "DIRECT_REFERRAL")}
        onOpenCalcRunDetail={onOpenCalcRun}
      />
      <BonusOperationRunModal
        kind="CONTRIBUTION"
        open={contributionRunModalOpen}
        title="CONTRIBUTION 배치 실행"
        description="기여도 계산은 contribution rule, depth/weight, 조직 범위, duplicate/conflict 기준을 그대로 사용합니다."
        submitting={contributionRunSubmitting}
        error={contributionRunError}
        result={contributionRunResult}
        onClose={() => setContributionRunModalOpen(false)}
        onSubmit={handleRunContribution}
        onOpenRewards={(calcRunId) => openCalcRunRewards(calcRunId, "CONTRIBUTION")}
        onOpenCalcRun={onOpenCalcRun}
      />
      <BonusOperationRunModal
        kind="SIDECAR"
        open={sidecarRunModalOpen}
        title="SIDECAR 배치 실행"
        description="사이드카는 rule-driven split과 nullable product 정책을 유지하며, release/freeze 합계를 calc_run 단위로 집계합니다."
        submitting={sidecarRunSubmitting}
        error={sidecarRunError}
        result={sidecarRunResult}
        onClose={() => setSidecarRunModalOpen(false)}
        onSubmit={handleRunSidecar}
        onOpenRewards={(calcRunId) => openCalcRunRewards(calcRunId, "SIDECAR")}
        onOpenCalcRun={onOpenCalcRun}
      />
    </div>
  );
}
