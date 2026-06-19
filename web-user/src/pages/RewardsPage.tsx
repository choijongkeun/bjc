import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCcw, Search, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getErrorMessage, type RewardListResponse, type RewardSort, type RewardStatus, type RewardType } from "@/lib/api";
import {
  buildRewardListQuery,
  formatRewardAmountBase,
  formatRewardDate,
  formatRewardDateTime,
  isNegativeRewardAmount,
  REWARD_SORT_OPTIONS,
  REWARD_STATUS_OPTIONS,
  REWARD_TYPE_OPTIONS,
  type RewardFilters,
} from "@/lib/rewards";
import { useSessionStore } from "@/store/sessionStore";
import { FeedbackState } from "@/components/FeedbackState";
import { Pagination } from "@/components/Pagination";
import { RewardStatusBadge } from "@/components/RewardStatusBadge";
import { RewardSummaryCards } from "@/components/RewardSummaryCards";
import { RewardTypeBadge } from "@/components/RewardTypeBadge";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle, SelectField, TableShell, TextField } from "@/components/ui";

const DEFAULT_FILTERS: RewardFilters = {
  reward_type: "",
  status: "",
  reward_date_from: "",
  reward_date_to: "",
  staking_id: "",
  page: 1,
  limit: 20,
  sort: "reward_date_desc",
};

export default function RewardsPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.getMyRewardsSummary>> | null>(null);
  const [listState, setListState] = useState<RewardListResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<RewardFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<RewardFilters>(DEFAULT_FILTERS);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const appliedQuery = useMemo(() => buildRewardListQuery(appliedFilters), [appliedFilters]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      if (!accessToken) return;
      try {
        setSummaryLoading(true);
        const result = await api.getMyRewardsSummary(accessToken);
        if (cancelled) return;
        setSummary(result);
        setSummaryError(null);
      } catch (error) {
        if (cancelled) return;
        setSummaryError(getErrorMessage(error));
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshNonce]);

  useEffect(() => {
    let cancelled = false;

    async function loadRewards() {
      if (!accessToken) return;
      try {
        setListLoading(true);
        const result = await api.getMyRewards(appliedQuery, accessToken);
        if (cancelled) return;
        setListState(result);
        setListError(null);
      } catch (error) {
        if (cancelled) return;
        setListError(getErrorMessage(error));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    void loadRewards();

    return () => {
      cancelled = true;
    };
  }, [accessToken, appliedQuery, refreshNonce]);

  function updateDraft<K extends keyof RewardFilters>(key: K, value: RewardFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters({ ...draftFilters, page: 1 });
  }

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  function changePage(page: number) {
    setAppliedFilters((current) => ({ ...current, page }));
  }

  function changeLimit(limit: number) {
    const next = { ...draftFilters, limit, page: 1 };
    setDraftFilters(next);
    setAppliedFilters(next);
  }

  return (
    <UserShell
      title="Rewards"
      subtitle="보상 요약, 필터, 상세 조회를 통해 내 reward 흐름을 확인합니다."
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="blue">Rewards API 연결</Badge>
          <Link to="/withdrawals">
            <Button variant="secondary">출금 화면 이동</Button>
          </Link>
          <Button
            variant="secondary"
            onClick={() => setRefreshNonce((current) => current + 1)}
            disabled={summaryLoading || listLoading}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {summaryError ? <FeedbackState title="보상 요약 조회 오류" description={summaryError} tone="error" /> : null}
        {listError ? <FeedbackState title="보상 목록 조회 오류" description={listError} tone="error" /> : null}

        <Card className="p-6">
          <SectionTitle
            eyebrow="Rewards Overview"
            title="내 보상 요약"
            description="출금 가능 보상과 출금 완료 보상은 실제 withdrawal allocation 집계와 연결됩니다."
          />
          <div className="mt-6">
            <RewardSummaryCards summary={summary} loading={summaryLoading} withdrawalsHref="/withdrawals" />
          </div>
          <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-400">
            <Link to="/withdrawals" className="font-semibold text-blue-200 hover:text-blue-100">
              DAILY_REWARD / BONUS 출금 안내 보기
            </Link>
            <span>출금 신청 전 미리보기에서 예상 수수료와 실수령액을 확인할 수 있습니다.</span>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle
              eyebrow="Rewards List"
              title="보상 목록"
              description="보상 유형, 상태, 날짜 범위, 스테이킹 ID 기준으로 조회합니다."
            />
            <div className="text-sm text-slate-400">
              전체 건수 <span className="tabular text-slate-100">{listState?.total ?? 0}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="보상 유형">
              <SelectField
                value={draftFilters.reward_type ?? ""}
                onChange={(event) => updateDraft("reward_type", event.target.value as RewardType | "")}
              >
                <option value="">전체</option>
                {REWARD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="상태">
              <SelectField
                value={draftFilters.status ?? ""}
                onChange={(event) => updateDraft("status", event.target.value as RewardStatus | "")}
              >
                <option value="">전체</option>
                {REWARD_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="시작 보상일">
              <TextField
                type="date"
                value={draftFilters.reward_date_from ?? ""}
                onChange={(event) => updateDraft("reward_date_from", event.target.value)}
              />
            </FilterField>

            <FilterField label="종료 보상일">
              <TextField
                type="date"
                value={draftFilters.reward_date_to ?? ""}
                onChange={(event) => updateDraft("reward_date_to", event.target.value)}
              />
            </FilterField>

            <FilterField label="staking_id">
              <TextField
                placeholder="스테이킹 ID 입력"
                value={draftFilters.staking_id ?? ""}
                onChange={(event) => updateDraft("staking_id", event.target.value)}
              />
            </FilterField>

            <FilterField label="정렬">
              <SelectField
                value={draftFilters.sort ?? "reward_date_desc"}
                onChange={(event) => updateDraft("sort", event.target.value as RewardSort)}
              >
                {REWARD_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="페이지 크기">
              <SelectField
                value={String(draftFilters.limit ?? 20)}
                onChange={(event) => changeLimit(Number(event.target.value))}
              >
                {[10, 20, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}개
                  </option>
                ))}
              </SelectField>
            </FilterField>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              필터 적용
            </Button>
            <Button variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              초기화
            </Button>
          </div>

          <div className="mt-5">
            {listLoading ? <FeedbackState title="보상 목록 로딩 중" description="내 rewards 목록을 불러오고 있습니다." /> : null}
            {!listLoading && !listError && (listState?.items.length ?? 0) === 0 ? (
              <FeedbackState title="보상 내역 없음" description="현재 필터 조건에 맞는 보상이 없습니다." />
            ) : null}
            {listState?.items.length ? (
              <>
                <TableShell>
                  <table className="min-w-full text-left text-sm text-slate-300">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">reward_date</th>
                        <th className="px-4 py-3">reward_type</th>
                        <th className="px-4 py-3">amount_base</th>
                        <th className="px-4 py-3">status</th>
                        <th className="px-4 py-3">staking / product</th>
                        <th className="px-4 py-3">available_at</th>
                        <th className="px-4 py-3">confirmed_at</th>
                        <th className="px-4 py-3 text-right">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listState.items.map((reward) => {
                        const negative = reward.reward_type === "REVERSAL" || isNegativeRewardAmount(reward.amount_base);
                        return (
                          <tr key={reward.id} className="border-t border-slate-800/80">
                            <td className="px-4 py-3 text-slate-200">{formatRewardDate(reward.reward_date)}</td>
                            <td className="px-4 py-3">
                              <RewardTypeBadge type={reward.reward_type} />
                            </td>
                            <td className={`tabular px-4 py-3 font-semibold ${negative ? "text-rose-200" : "text-slate-100"}`}>
                              {formatRewardAmountBase(reward.amount_base)}
                              {negative ? <div className="mt-1 text-xs text-rose-300">역분개 음수 금액</div> : null}
                            </td>
                            <td className="px-4 py-3">
                              <RewardStatusBadge status={reward.status} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-100">{reward.product?.name ?? "상품 정보 없음"}</div>
                              <div className="text-xs text-slate-500">
                                {reward.account_staking_id ? `staking ${reward.account_staking_id}` : "staking 연결 없음"}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-400">{formatRewardDateTime(reward.available_at)}</td>
                            <td className="px-4 py-3 text-slate-400">{formatRewardDateTime(reward.confirmed_at)}</td>
                            <td className="px-4 py-3 text-right">
                              <Link to={`/rewards/${reward.id}`}>
                                <Button variant="secondary">
                                  상세 보기
                                  <ArrowUpRight className="ml-2 h-4 w-4" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableShell>
                <div className="mt-4">
                  <Pagination page={listState.page} limit={listState.limit} total={listState.total} onChange={changePage} />
                </div>
              </>
            ) : null}
          </div>
        </Card>
      </div>
    </UserShell>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}
