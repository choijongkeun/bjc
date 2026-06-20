import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { api, type AccountStakingSort, type AccountStakingStatus, type AdminStakingDetail, type AdminStakingListItem, type SessionRole } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { formatDailyInterestBps } from "@/lib/staking";
import { Button, Card, FeedbackState, Pagination, TableShell } from "@/components/ui";
import { StakingDetailPanel } from "@/components/StakingDetailPanel";
import { StakingStatusBadge } from "@/components/StakingStatusBadge";

type Filters = {
  q: string;
  account_id: string;
  product_id: string;
  status: "" | AccountStakingStatus;
  created_from: string;
  created_to: string;
  matures_from: string;
  matures_to: string;
};

const defaultFilters: Filters = {
  q: "",
  account_id: "",
  product_id: "",
  status: "",
  created_from: "",
  created_to: "",
  matures_from: "",
  matures_to: "",
};

export function StakingsTab({
  actorId,
  role,
  selectedAccountId,
  onSelectAccountId,
  onOpenReward,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  onSelectAccountId?: (accountId: string) => void;
  onOpenReward?: (rewardId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<AccountStakingSort>("created_at_desc");
  const [draftFilters, setDraftFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);
  const [items, setItems] = useState<AdminStakingListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminStakingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const activeSelectedId = useMemo(() => selectedId ?? items[0]?.id ?? null, [selectedId, items]);

  async function loadList(targetPage = page, targetLimit = limit, filters = appliedFilters, targetSort = sort) {
    try {
      const result = await api.listAdminStakings(actorId, {
        ...filters,
        q: filters.q || undefined,
        account_id: filters.account_id || undefined,
        product_id: filters.product_id || undefined,
        status: filters.status || undefined,
        created_from: filters.created_from || undefined,
        created_to: filters.created_to || undefined,
        matures_from: filters.matures_from || undefined,
        matures_to: filters.matures_to || undefined,
        page: targetPage,
        limit: targetLimit,
        sort: targetSort,
      });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
      const nextSelectedId = result.items.some((item) => item.id === selectedId) ? selectedId : (result.items[0]?.id ?? null);
      setSelectedId(nextSelectedId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "스테이킹 목록을 불러오지 못했습니다.");
    }
  }

  async function loadDetail(stakingId: string) {
    try {
      const result = await api.getAdminStaking(actorId, stakingId);
      setSelected(result.staking);
      setDetailError(null);
    } catch (loadError) {
      setSelected(null);
      setDetailError(loadError instanceof Error ? loadError.message : "스테이킹 상세를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    if (selectedAccountId && draftFilters.account_id !== selectedAccountId) {
      const next = { ...draftFilters, account_id: selectedAccountId };
      setDraftFilters(next);
      setAppliedFilters(next);
      setPage(1);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    void loadList();
  }, [actorId, page, limit, sort, appliedFilters]);

  useEffect(() => {
    if (!activeSelectedId) return;
    void loadDetail(activeSelectedId);
  }, [actorId, activeSelectedId]);

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setPage(1);
  }

  async function handleUpdated(nextStaking: AdminStakingDetail) {
    setSelected(nextStaking);
    await loadList();
    await loadDetail(nextStaking.id);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr,0.75fr]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">전체 스테이킹 목록</h2>
            <p className="text-sm text-slate-400">회원, 상품, 상태, 기간 조건으로 스테이킹 내역을 검색합니다.</p>
          </div>
          <Button variant="secondary" onClick={() => void loadList()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>

        {error ? <FeedbackState title="목록 조회 오류" description={error} tone="error" /> : null}

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="스테이킹 ID / 아이디 / 이름"
            value={draftFilters.q}
            onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="회원 ID"
            value={draftFilters.account_id}
            onChange={(event) => setDraftFilters((current) => ({ ...current, account_id: event.target.value }))}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            placeholder="상품 ID"
            value={draftFilters.product_id}
            onChange={(event) => setDraftFilters((current) => ({ ...current, product_id: event.target.value }))}
          />
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.status}
            onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as Filters["status"] }))}
          >
            <option value="">전체 상태</option>
            <option value="PENDING">대기</option>
            <option value="ACTIVE">활성</option>
            <option value="CANCEL_REQUESTED">취소 요청</option>
            <option value="CANCELLED">취소</option>
            <option value="MATURED">만기</option>
            <option value="CLOSED">종료</option>
          </select>
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            type="datetime-local"
            value={draftFilters.created_from}
            onChange={(event) => setDraftFilters((current) => ({ ...current, created_from: event.target.value }))}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            type="datetime-local"
            value={draftFilters.created_to}
            onChange={(event) => setDraftFilters((current) => ({ ...current, created_to: event.target.value }))}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            type="datetime-local"
            value={draftFilters.matures_from}
            onChange={(event) => setDraftFilters((current) => ({ ...current, matures_from: event.target.value }))}
          />
          <input
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            type="datetime-local"
            value={draftFilters.matures_to}
            onChange={(event) => setDraftFilters((current) => ({ ...current, matures_to: event.target.value }))}
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              조회
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const next = selectedAccountId ? { ...defaultFilters, account_id: selectedAccountId } : defaultFilters;
                setDraftFilters(next);
                setAppliedFilters(next);
                setPage(1);
              }}
            >
              초기화
            </Button>
          </div>

          <div className="flex gap-2">
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
              value={sort}
              onChange={(event) => setSort(event.target.value as AccountStakingSort)}
            >
              <option value="created_at_desc">생성일 최신순</option>
              <option value="created_at_asc">생성일 오래된순</option>
              <option value="matures_at_asc">만기일 빠른순</option>
              <option value="matures_at_desc">만기일 늦은순</option>
            </select>
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
              value={limit}
              onChange={(event) => {
                setLimit(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20개</option>
              <option value={50}>50개</option>
              <option value={100}>100개</option>
            </select>
          </div>
        </div>

        <div className="mb-4 text-sm text-slate-400">
          총 <span className="tabular text-slate-200">{total}</span>건
        </div>

        <TableShell height="max-h-[720px]">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>스테이킹 ID</th>
                <th>아이디</th>
                <th>이름</th>
                <th>상품명</th>
                <th>원금</th>
                <th>적용 이율</th>
                <th>적용 기간</th>
                <th>상태</th>
                <th>생성 일시</th>
                <th>시작 일시</th>
                <th>만기 일시</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const active = activeSelectedId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}
                    onClick={() => {
                      setSelectedId(item.id);
                      onSelectAccountId?.(item.account_id);
                    }}
                  >
                    <td className="font-mono text-xs text-slate-300">{item.id}</td>
                    <td>{item.account.login_id ?? "-"}</td>
                    <td>{item.account.display_name ?? "-"}</td>
                    <td>{item.product.name}</td>
                    <td className="tabular text-right">{formatBaseAmount(item.principal_amount_base, item.product.decimals)}</td>
                    <td>{formatDailyInterestBps(item.daily_interest_bps_snapshot)}</td>
                    <td>{item.duration_days_snapshot}일</td>
                    <td><StakingStatusBadge status={item.status} /></td>
                    <td className="text-slate-400">{formatDateTime(item.created_at)}</td>
                    <td className="text-slate-400">{formatDateTime(item.started_at)}</td>
                    <td className="text-slate-400">{formatDateTime(item.matures_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
        <div className="mt-4">
          <Pagination page={page} limit={limit} total={total} onChange={setPage} />
        </div>
      </Card>

      <div className="space-y-6">
        {detailError ? <FeedbackState title="상세 조회 오류" description={detailError} tone="error" /> : null}
        <StakingDetailPanel actorId={actorId} role={role} staking={selected} onUpdated={handleUpdated} onOpenReward={onOpenReward} />
      </div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}
