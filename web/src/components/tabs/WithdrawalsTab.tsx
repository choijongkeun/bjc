import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import {
  api,
  getErrorMessage,
  type AdminWithdrawalDetail,
  type AdminWithdrawalListItem,
  type SessionRole,
} from "@/lib/api";
import {
  buildAdminWithdrawalListQuery,
  buildAdminWithdrawalSummaryQuery,
  formatWithdrawalAmountBase,
  formatWithdrawalDateTime,
  getWithdrawalSummaryCardItems,
  maskWalletAddress,
  shortenTxHash,
  WITHDRAWAL_SORT_OPTIONS,
  WITHDRAWAL_STATUS_OPTIONS,
  WITHDRAWAL_TYPE_OPTIONS,
  type AdminWithdrawalFilters,
} from "@/lib/withdrawals";
import { WithdrawalStatusBadge } from "@/components/WithdrawalStatusBadge";
import { WithdrawalTypeBadge } from "@/components/WithdrawalTypeBadge";
import { WithdrawalDetailPanel } from "@/components/withdrawals/WithdrawalDetailPanel";
import { Button, Card, FeedbackState, Pagination, SelectField, TableShell, TextField } from "@/components/ui";

const DEFAULT_FILTERS: AdminWithdrawalFilters = {
  q: "",
  account_id: "",
  withdrawal_type: "",
  status: "",
  network: "",
  requested_from: "",
  requested_to: "",
  completed_from: "",
  completed_to: "",
  date_from: "",
  date_to: "",
  page: 1,
  limit: 20,
  sort: "requested_at_desc",
};

export function WithdrawalsTab({
  actorId,
  role,
  selectedAccountId,
  onSelectAccountId,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  onSelectAccountId: (accountId: string | null) => void;
}) {
  const [draftFilters, setDraftFilters] = useState<AdminWithdrawalFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AdminWithdrawalFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminWithdrawalListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedWithdrawalId, setSelectedWithdrawalId] = useState<string | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminWithdrawalDetail | null>(null);
  const [summaryCards, setSummaryCards] = useState<Array<{ label: string; value: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const requestQuery = useMemo(
    () =>
      buildAdminWithdrawalListQuery({
        ...appliedFilters,
        page,
      }),
    [appliedFilters, page]
  );

  const summaryQuery = useMemo(() => buildAdminWithdrawalSummaryQuery(appliedFilters), [appliedFilters]);

  const activeSelectedId = useMemo(() => selectedWithdrawalId ?? items[0]?.id ?? null, [items, selectedWithdrawalId]);

  useEffect(() => {
    const nextAccountId = selectedAccountId ?? "";
    setDraftFilters((current) => {
      if ((current.account_id ?? "") === nextAccountId) return current;
      return { ...current, account_id: nextAccountId };
    });
    setAppliedFilters((current) => {
      if ((current.account_id ?? "") === nextAccountId) return current;
      return { ...current, account_id: nextAccountId };
    });
    setPage(1);
  }, [selectedAccountId]);

  useEffect(() => {
    let cancelled = false;

    async function loadWithdrawals() {
      try {
        setLoading(true);
        const result = await api.listAdminWithdrawals(actorId, requestQuery);
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setError(null);
        const nextSelectedId = result.items.some((item) => item.id === selectedWithdrawalId) ? selectedWithdrawalId : (result.items[0]?.id ?? null);
        setSelectedWithdrawalId(nextSelectedId);
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError));
        setItems([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWithdrawals();

    return () => {
      cancelled = true;
    };
  }, [actorId, requestQuery, refreshTick, selectedWithdrawalId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        setSummaryLoading(true);
        const result = await api.getAdminWithdrawalSummary(actorId, summaryQuery);
        if (cancelled) return;
        setSummaryCards(getWithdrawalSummaryCardItems(result));
        setSummaryError(null);
      } catch (loadError) {
        if (cancelled) return;
        setSummaryError(getErrorMessage(loadError));
        setSummaryCards([]);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }

    void loadSummary();

    return () => {
      cancelled = true;
    };
  }, [actorId, summaryQuery, refreshTick]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!activeSelectedId) {
        setSelectedWithdrawal(null);
        return;
      }

      try {
        setDetailLoading(true);
        const result = await api.getAdminWithdrawal(actorId, activeSelectedId);
        if (cancelled) return;
        setSelectedWithdrawal(result.withdrawal);
        setDetailError(null);
      } catch (loadError) {
        if (cancelled) return;
        setSelectedWithdrawal(null);
        setDetailError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [activeSelectedId, actorId, refreshTick]);

  function updateDraft<K extends keyof AdminWithdrawalFilters>(key: K, value: AdminWithdrawalFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setPage(1);
    onSelectAccountId(draftFilters.account_id || null);
  }

  function resetFilters() {
    const next = { ...DEFAULT_FILTERS, account_id: selectedAccountId ?? "" };
    setDraftFilters(next);
    setAppliedFilters(next);
    setPage(1);
  }

  function refreshAll() {
    setRefreshTick((current) => current + 1);
  }

  async function handleUpdated(nextWithdrawal: AdminWithdrawalDetail) {
    setSelectedWithdrawal(nextWithdrawal);
    setSelectedWithdrawalId(nextWithdrawal.id);
    refreshAll();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">출금 관리</h2>
            <p className="text-sm text-slate-400">전체 출금 내역과 상태별 처리 현황을 확인합니다.</p>
          </div>
          <Button variant="secondary" onClick={refreshAll} disabled={loading || summaryLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>

        {selectedAccountId ? (
          <div className="mb-4">
            <FeedbackState title="회원 필터 적용" description={`현재 회원 ID ${selectedAccountId} 기준으로 출금 목록을 조회 중입니다.`} />
          </div>
        ) : null}

        {summaryError ? <div className="mb-4"><FeedbackState title="통계 조회 오류" description={summaryError} tone="error" /></div> : null}
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {summaryLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="h-3 w-20 rounded bg-slate-800" />
                  <div className="mt-3 h-6 w-28 rounded bg-slate-800" />
                </div>
              ))
            : summaryCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs tracking-[0.16em] text-slate-500">{card.label}</div>
                  <div className="mt-2 text-xl font-bold text-slate-50">{card.value}</div>
                </div>
              ))}
        </div>

        {error ? <FeedbackState title="출금 목록 조회 오류" description={error} tone="error" /> : null}

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextField
            placeholder="출금 ID / 아이디 / 이름"
            value={draftFilters.q ?? ""}
            onChange={(event) => updateDraft("q", event.target.value)}
          />
          <TextField
            placeholder="회원 ID"
            value={draftFilters.account_id ?? ""}
            onChange={(event) => updateDraft("account_id", event.target.value)}
          />
          <SelectField
            value={draftFilters.withdrawal_type ?? ""}
            onChange={(event) => updateDraft("withdrawal_type", event.target.value as AdminWithdrawalFilters["withdrawal_type"])}
          >
            <option value="">전체 출금 구분</option>
            {WITHDRAWAL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            value={draftFilters.status ?? ""}
            onChange={(event) => updateDraft("status", event.target.value as AdminWithdrawalFilters["status"])}
          >
            <option value="">전체 상태</option>
            {WITHDRAWAL_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <TextField
            placeholder="네트워크"
            value={draftFilters.network ?? ""}
            onChange={(event) => updateDraft("network", event.target.value)}
          />
          <TextField
            type="date"
            value={draftFilters.requested_from ?? ""}
            onChange={(event) => updateDraft("requested_from", event.target.value)}
          />
          <TextField
            type="date"
            value={draftFilters.requested_to ?? ""}
            onChange={(event) => updateDraft("requested_to", event.target.value)}
          />
          <TextField
            type="date"
            value={draftFilters.completed_from ?? ""}
            onChange={(event) => updateDraft("completed_from", event.target.value)}
          />
          <TextField
            type="date"
            value={draftFilters.completed_to ?? ""}
            onChange={(event) => updateDraft("completed_to", event.target.value)}
          />
          <TextField
            type="date"
            value={draftFilters.date_from ?? ""}
            onChange={(event) => updateDraft("date_from", event.target.value)}
          />
          <TextField
            type="date"
            value={draftFilters.date_to ?? ""}
            onChange={(event) => updateDraft("date_to", event.target.value)}
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
            <SelectField
              className="min-w-[190px]"
              value={draftFilters.sort ?? "requested_at_desc"}
              onChange={(event) => updateDraft("sort", event.target.value as AdminWithdrawalFilters["sort"])}
            >
              {WITHDRAWAL_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              className="min-w-[120px]"
              value={String(draftFilters.limit ?? 20)}
              onChange={(event) => {
                const nextLimit = event.target.value === "100" ? 100 : event.target.value === "50" ? 50 : 20;
                updateDraft("limit", nextLimit);
                setAppliedFilters((current) => ({ ...current, limit: nextLimit }));
                setPage(1);
              }}
            >
              <option value="20">20개</option>
              <option value="50">50개</option>
              <option value="100">100개</option>
            </SelectField>
          </div>
        </div>

        <div className="mb-4 text-sm text-slate-400">
          총 <span className="tabular text-slate-200">{total}</span>건
        </div>

        {loading ? <FeedbackState title="출금 목록 불러오는 중" description="출금 목록을 불러오고 있습니다." /> : null}
        {!loading && items.length === 0 ? <FeedbackState title="출금 내역 없음" description="현재 조건에 맞는 출금 내역이 없습니다." /> : null}

        {items.length > 0 ? (
          <>
            <TableShell height="max-h-[760px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>신청일</th>
                    <th>회원</th>
                    <th>출금 구분</th>
                    <th>신청 금액</th>
                    <th>수수료</th>
                    <th>실수령액</th>
                    <th>상태</th>
                    <th>네트워크</th>
                    <th>지갑 주소</th>
                    <th>거래 해시</th>
                    <th>상세</th>
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
                          setSelectedWithdrawalId(item.id);
                          onSelectAccountId(item.account_id);
                        }}
                      >
                        <td className="text-slate-400">{formatWithdrawalDateTime(item.requested_at ?? item.created_at)}</td>
                        <td>
                          <div>{item.account?.login_id ?? "-"}</div>
                          <div className="text-xs text-slate-500">{item.account?.display_name ?? "-"}</div>
                        </td>
                        <td><WithdrawalTypeBadge type={item.withdrawal_type} /></td>
                        <td className="tabular text-right">{formatWithdrawalAmountBase(item.requested_amount_base)}</td>
                        <td className="tabular text-right">{formatWithdrawalAmountBase(item.fee_amount_base)}</td>
                        <td className="tabular text-right">{formatWithdrawalAmountBase(item.net_amount_base)}</td>
                        <td><WithdrawalStatusBadge status={item.status} /></td>
                        <td>{item.network ?? "-"}</td>
                        <td className="font-mono text-xs text-slate-400">{maskWalletAddress(item.wallet_address)}</td>
                        <td className="font-mono text-xs text-slate-400">{shortenTxHash(item.tx_hash)}</td>
                        <td className="text-xs text-blue-300">{active ? "선택됨" : "열기"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
            <div className="mt-4">
              <Pagination page={page} limit={requestQuery.limit ?? 20} total={total} onChange={setPage} />
            </div>
          </>
        ) : null}
      </Card>

      <div className="space-y-6">
        {detailLoading ? <FeedbackState title="출금 상세 불러오는 중" description="선택한 출금 상세를 불러오고 있습니다." /> : null}
        {detailError ? <FeedbackState title="출금 상세 조회 오류" description={detailError} tone="error" /> : null}
        <WithdrawalDetailPanel actorId={actorId} role={role} withdrawal={selectedWithdrawal} onUpdated={handleUpdated} />
      </div>
    </div>
  );
}
