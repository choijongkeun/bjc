import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, RefreshCcw, Search } from "lucide-react";
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
import { Button, Card, FeedbackState, FormField, Pagination, SelectField, TableShell, TextField, cn } from "@/components/ui";

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

function formatCompactDateTime(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function CopyableValue({
  label,
  value,
  className,
  textClassName,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
  textClassName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const safeValue = value?.trim() ? value : null;

  async function handleCopy(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!safeValue || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className={cn("min-w-0 flex-1 truncate", textClassName)} title={safeValue ?? "-"}>
        {safeValue ?? "-"}
      </span>
      {safeValue ? (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:border-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30"
          aria-label={`${label} 복사`}
          title={copied ? `${label} 복사됨` : `${label} 복사`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

function CalcRunLink({
  calcRunId,
  onOpenCalcRun,
}: {
  calcRunId: string | null | undefined;
  onOpenCalcRun: (calcRunId: string) => void;
}) {
  if (!calcRunId) {
    return <span>-</span>;
  }

  return (
    <div className="space-y-1">
      <CopyableValue
        label="계산 실행 ID"
        value={calcRunId}
        textClassName="font-mono text-xs text-slate-400"
      />
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-blue-300 hover:text-blue-200"
        onClick={(event) => {
          event.stopPropagation();
          onOpenCalcRun(calcRunId);
        }}
      >
        상세
        <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  );
}

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
  const [expandedRewardId, setExpandedRewardId] = useState<string | null>(null);

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

  function toggleExpandedReward(rewardId: string) {
    setExpandedRewardId((current) => (current === rewardId ? null : rewardId));
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
            <h2 className="text-lg font-bold text-slate-50">보상 실행 관리</h2>
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
                기여 보상 실행
              </Button>
            ) : null}
            {role === "ADMIN" ? (
              <Button variant="secondary" onClick={() => setSidecarRunModalOpen(true)}>
                사이드카 정산 실행
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
              title="기여 보상 실행 결과"
              description={`계산 실행 ID ${contributionRunResult.calc_run_id}, 생성 ${contributionRunResult.created_count}건, 중복 ${contributionRunResult.duplicate_skip_count}건, 충돌 ${contributionRunResult.conflict_count}건`}
              tone={contributionRunResult.failed_count > 0 || contributionRunResult.conflict_count > 0 ? "error" : "success"}
            />
          </div>
        ) : null}
        {sidecarRunResult ? (
          <div className="mb-4">
            <FeedbackState
              title="사이드카 정산 실행 결과"
              description={`계산 실행 ID ${sidecarRunResult.calc_run_id}, 생성 ${sidecarRunResult.created_count}건, 중복 ${sidecarRunResult.duplicate_skip_count}건, 충돌 ${sidecarRunResult.conflict_count}건`}
              tone={sidecarRunResult.failed_count > 0 || sidecarRunResult.conflict_count > 0 ? "error" : "success"}
            />
          </div>
        ) : null}
        {selectedCalcRunId ? (
          <div className="mb-4">
            <FeedbackState title="계산 실행 필터 적용" description={`현재 계산 실행 ID ${selectedCalcRunId} 기준으로 보상을 조회 중입니다.`} />
          </div>
        ) : null}

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="검색" className="sm:col-span-2">
            <TextField
              placeholder="보상 ID / 회원 아이디 / 발생 회원을 입력하세요"
              value={draftFilters.q ?? ""}
              onChange={(event) => updateDraft("q", event.target.value)}
            />
          </FormField>
          <FormField label="회원 ID">
            <TextField
              placeholder="회원 ID를 입력하세요"
              value={draftFilters.account_id ?? ""}
              onChange={(event) => updateDraft("account_id", event.target.value)}
            />
          </FormField>
          <FormField label="스테이킹 ID">
            <TextField
              placeholder="스테이킹 ID를 입력하세요"
              value={draftFilters.staking_id ?? ""}
              onChange={(event) => updateDraft("staking_id", event.target.value)}
            />
          </FormField>
          <FormField label="계산 실행 ID">
            <TextField
              placeholder="계산 실행 ID를 입력하세요"
              value={draftFilters.calc_run_id ?? ""}
              onChange={(event) => updateDraft("calc_run_id", event.target.value)}
            />
          </FormField>
          <FormField label="보상 구분">
            <SelectField
              value={draftFilters.reward_type ?? ""}
              onChange={(event) => updateDraft("reward_type", event.target.value as AdminRewardFilters["reward_type"])}
            >
              <option value="">전체 보상 구분</option>
              {REWARD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label="상태">
            <SelectField
              value={draftFilters.status ?? ""}
              onChange={(event) => updateDraft("status", event.target.value as AdminRewardFilters["status"])}
            >
              <option value="">전체 상태</option>
              {REWARD_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          </FormField>
          <FormField label="보상 시작일">
            <TextField
              type="date"
              value={draftFilters.reward_date_from ?? ""}
              onChange={(event) => updateDraft("reward_date_from", event.target.value)}
            />
          </FormField>
          <FormField label="보상 종료일">
            <TextField
              type="date"
              value={draftFilters.reward_date_to ?? ""}
              onChange={(event) => updateDraft("reward_date_to", event.target.value)}
            />
          </FormField>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              조회
            </Button>
            <Button className="flex-1 sm:flex-none" variant="ghost" onClick={resetFilters}>
              초기화
            </Button>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <FormField label="정렬" className="sm:min-w-[220px]">
              <SelectField
                value={draftFilters.sort ?? "reward_date_desc"}
                onChange={(event) => updateDraft("sort", event.target.value as AdminRewardFilters["sort"])}
              >
                {REWARD_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FormField>
            <FormField label="페이지 크기" className="sm:min-w-[140px]">
              <SelectField
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
              </SelectField>
            </FormField>
          </div>
        </div>

        <div className="mb-4 text-sm text-slate-400">
          총 <span className="tabular text-slate-200">{total}</span>건
        </div>

        {loading ? <FeedbackState title="보상 목록을 불러오는 중" description="보상 목록을 조회하고 있습니다." /> : null}
        {!loading && items.length === 0 ? <FeedbackState title="보상 내역이 없습니다" description="조회된 내용이 없습니다." /> : null}

        {items.length > 0 ? (
          <>
            <div className="hidden xl:block">
              <TableShell height="max-h-[760px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>보상 ID</th>
                      <th>보상 기준일</th>
                      <th>아이디</th>
                      <th>이름</th>
                      <th>보상 구분</th>
                      <th>보상 금액</th>
                      <th>상태</th>
                      <th>스테이킹 / 발생 정보</th>
                      <th>계산 실행 ID</th>
                      <th>확정 일시</th>
                      <th>출금 가능 일시</th>
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
                          <td className="max-w-[230px]">
                            <CopyableValue label="보상 ID" value={item.id} textClassName="font-mono text-xs text-slate-300" />
                          </td>
                          <td>{formatRewardDate(item.reward_date)}</td>
                          <td className="max-w-[170px]">
                            <CopyableValue label="회원 아이디" value={item.account?.login_id} />
                          </td>
                          <td className="max-w-[170px] truncate" title={item.account?.display_name ?? "-"}>
                            {item.account?.display_name ?? "-"}
                          </td>
                          <td><RewardTypeBadge type={item.reward_type} /></td>
                          <td className={`tabular text-right font-semibold ${negative ? "text-rose-200" : "text-slate-100"}`}>{formatRewardAmountBase(item.amount_base)}</td>
                          <td><RewardStatusBadge status={item.status} /></td>
                          <td className="max-w-[240px]">
                            <div className="truncate" title={item.product?.name ?? "-"}>
                              {item.product?.name ?? "-"}
                            </div>
                            <CopyableValue
                              label="스테이킹 ID"
                              value={item.account_staking_id ?? item.source_account_staking_id}
                              textClassName="font-mono text-xs text-slate-500"
                            />
                            {item.reward_type === "DIRECT_REFERRAL" ? (
                              <div className="mt-1 truncate text-xs text-slate-400" title={item.source?.display_name ?? item.source?.login_id ?? item.source_account_id ?? "-"}>
                                발생 회원: {item.source?.display_name ?? item.source?.login_id ?? item.source_account_id ?? "-"}
                              </div>
                            ) : null}
                          </td>
                          <td className="max-w-[220px]">
                            <CalcRunLink calcRunId={item.calc_run_id} onOpenCalcRun={onOpenCalcRun} />
                          </td>
                          <td className="max-w-[148px] truncate text-slate-400" title={formatRewardDateTime(item.confirmed_at)}>
                            {formatRewardDateTime(item.confirmed_at)}
                          </td>
                          <td className="max-w-[148px] truncate text-slate-400" title={formatRewardDateTime(item.available_at)}>
                            {formatRewardDateTime(item.available_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            </div>

            <div className="hidden md:block xl:hidden">
              <TableShell height="max-h-[760px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>회원 / 보상</th>
                      <th>구분</th>
                      <th>금액</th>
                      <th>상태</th>
                      <th>기준일</th>
                      <th className="w-[120px]">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const negative = item.reward_type === "REVERSAL" || isNegativeRewardAmount(item.amount_base);
                      const active = activeSelectedId === item.id;
                      const expanded = expandedRewardId === item.id;
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className={cn(active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60", expanded && "border-b-0")}
                            onClick={() => {
                              openRewardDetail(item.id);
                              onSelectAccountId(item.account_id);
                              onSelectCalcRunId(item.calc_run_id);
                            }}
                          >
                            <td className="max-w-[320px]">
                              <div className="space-y-1">
                                <CopyableValue label="회원 아이디" value={item.account?.login_id} textClassName="font-semibold text-slate-100" />
                                <div className="truncate text-sm text-slate-400" title={item.account?.display_name ?? "-"}>
                                  {item.account?.display_name ?? "-"}
                                </div>
                                <CopyableValue label="보상 ID" value={item.id} textClassName="font-mono text-xs text-slate-500" />
                              </div>
                            </td>
                            <td><RewardTypeBadge type={item.reward_type} /></td>
                            <td className={`tabular text-right font-semibold ${negative ? "text-rose-200" : "text-slate-100"}`}>
                              {formatRewardAmountBase(item.amount_base)}
                            </td>
                            <td><RewardStatusBadge status={item.status} /></td>
                            <td className="text-slate-400">{formatCompactDateTime(item.reward_date)}</td>
                            <td>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  className="px-3 py-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openRewardDetail(item.id);
                                    onSelectAccountId(item.account_id);
                                    onSelectCalcRunId(item.calc_run_id);
                                  }}
                                >
                                  선택
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="px-3 py-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleExpandedReward(item.id);
                                  }}
                                >
                                  {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                                  {expanded ? "접기" : "열기"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="bg-slate-950/70">
                              <td colSpan={6} className="px-4 py-4">
                                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  <DetailItem
                                    label="보상 ID"
                                    value={<CopyableValue label="보상 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem
                                    label="계산 실행 ID"
                                    value={<CalcRunLink calcRunId={item.calc_run_id} onOpenCalcRun={onOpenCalcRun} />}
                                  />
                                  <DetailItem
                                    label="스테이킹 ID"
                                    value={<CopyableValue label="스테이킹 ID" value={item.account_staking_id ?? item.source_account_staking_id} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem label="상품" value={item.product?.name ?? "-"} />
                                  <DetailItem label="확정 일시" value={formatRewardDateTime(item.confirmed_at)} />
                                  <DetailItem label="출금 가능 일시" value={formatRewardDateTime(item.available_at)} />
                                  {item.reward_type === "DIRECT_REFERRAL" ? (
                                    <DetailItem
                                      label="발생 회원"
                                      value={
                                        <CopyableValue
                                          label="발생 회원"
                                          value={item.source?.display_name ?? item.source?.login_id ?? item.source_account_id}
                                        />
                                      }
                                      className="sm:col-span-2 lg:col-span-3"
                                    />
                                  ) : null}
                                </dl>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((item) => {
                const negative = item.reward_type === "REVERSAL" || isNegativeRewardAmount(item.amount_base);
                const active = activeSelectedId === item.id;
                const expanded = expandedRewardId === item.id;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-[24px] border border-slate-800 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                      active && "border-blue-500/40 bg-blue-500/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CopyableValue label="회원 아이디" value={item.account?.login_id} textClassName="font-semibold text-slate-100" />
                        <div className="mt-1 truncate text-sm text-slate-400" title={item.account?.display_name ?? "-"}>
                          {item.account?.display_name ?? "-"}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <RewardStatusBadge status={item.status} />
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <DetailItem label="보상 구분" value={<RewardTypeBadge type={item.reward_type} />} />
                      <DetailItem label="기준일" value={formatCompactDateTime(item.reward_date)} />
                      <DetailItem
                        label="보상 금액"
                        value={<span className={cn("tabular font-semibold", negative ? "text-rose-200" : "text-slate-100")}>{formatRewardAmountBase(item.amount_base)}</span>}
                      />
                      <DetailItem label="상품" value={item.product?.name ?? "-"} />
                    </dl>
                    {expanded ? (
                      <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4">
                        <DetailItem
                          label="보상 ID"
                          value={<CopyableValue label="보상 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem
                          label="계산 실행 ID"
                          value={<CalcRunLink calcRunId={item.calc_run_id} onOpenCalcRun={onOpenCalcRun} />}
                        />
                        <DetailItem
                          label="스테이킹 ID"
                          value={<CopyableValue label="스테이킹 ID" value={item.account_staking_id ?? item.source_account_staking_id} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem label="확정 일시" value={formatRewardDateTime(item.confirmed_at)} />
                        <DetailItem label="출금 가능 일시" value={formatRewardDateTime(item.available_at)} />
                        {item.reward_type === "DIRECT_REFERRAL" ? (
                          <DetailItem
                            label="발생 회원"
                            value={<CopyableValue label="발생 회원" value={item.source?.display_name ?? item.source?.login_id ?? item.source_account_id} />}
                          />
                        ) : null}
                      </dl>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={active ? "primary" : "secondary"}
                        className="flex-1"
                        onClick={() => {
                          openRewardDetail(item.id);
                          onSelectAccountId(item.account_id);
                          onSelectCalcRunId(item.calc_run_id);
                        }}
                      >
                        {active ? "선택됨" : "상세 보기"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-4"
                        onClick={() => toggleExpandedReward(item.id)}
                      >
                        {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                        {expanded ? "추가 정보 접기" : "추가 정보"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <Pagination page={page} limit={requestQuery.limit!} total={total} onChange={setPage} />
            </div>
          </>
        ) : null}
      </Card>

      <div className="space-y-6">
        {detailLoading ? <FeedbackState title="보상 상세를 불러오는 중" description="선택한 보상 정보를 조회하고 있습니다." /> : null}
        {detailError ? <FeedbackState title="보상 상세를 불러오지 못했습니다" description={detailError} tone="error" /> : null}
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
        title="기여 보상 실행"
        description="기준일에 해당하는 기여 보상을 계산합니다."
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
        title="사이드카 정산 실행"
        description="기준일의 사이드카 정산 내역을 계산합니다."
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
