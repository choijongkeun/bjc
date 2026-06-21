import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Copy, RefreshCcw, Search } from "lucide-react";
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
import { Button, Card, FeedbackState, FormField, Pagination, SelectField, TableShell, TextField, cn } from "@/components/ui";

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

function formatCompactDate(value: string | null | undefined) {
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
  const [expandedWithdrawalId, setExpandedWithdrawalId] = useState<string | null>(null);

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

  function toggleExpandedWithdrawal(withdrawalId: string) {
    setExpandedWithdrawalId((current) => (current === withdrawalId ? null : withdrawalId));
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

        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="검색" className="sm:col-span-2">
            <TextField
              placeholder="출금 ID / 아이디 / 이름을 입력하세요"
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
          <FormField label="출금 구분">
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
          </FormField>
          <FormField label="상태">
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
          </FormField>
          <FormField label="네트워크">
            <TextField
              placeholder="네트워크를 입력하세요"
              value={draftFilters.network ?? ""}
              onChange={(event) => updateDraft("network", event.target.value)}
            />
          </FormField>
          <FormField label="신청 시작일">
            <TextField
              type="date"
              value={draftFilters.requested_from ?? ""}
              onChange={(event) => updateDraft("requested_from", event.target.value)}
            />
          </FormField>
          <FormField label="신청 종료일">
            <TextField
              type="date"
              value={draftFilters.requested_to ?? ""}
              onChange={(event) => updateDraft("requested_to", event.target.value)}
            />
          </FormField>
          <FormField label="완료 시작일">
            <TextField
              type="date"
              value={draftFilters.completed_from ?? ""}
              onChange={(event) => updateDraft("completed_from", event.target.value)}
            />
          </FormField>
          <FormField label="완료 종료일">
            <TextField
              type="date"
              value={draftFilters.completed_to ?? ""}
              onChange={(event) => updateDraft("completed_to", event.target.value)}
            />
          </FormField>
          <FormField label="통계 시작일">
            <TextField
              type="date"
              value={draftFilters.date_from ?? ""}
              onChange={(event) => updateDraft("date_from", event.target.value)}
            />
          </FormField>
          <FormField label="통계 종료일">
            <TextField
              type="date"
              value={draftFilters.date_to ?? ""}
              onChange={(event) => updateDraft("date_to", event.target.value)}
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
                value={draftFilters.sort ?? "requested_at_desc"}
                onChange={(event) => updateDraft("sort", event.target.value as AdminWithdrawalFilters["sort"])}
              >
                {WITHDRAWAL_SORT_OPTIONS.map((option) => (
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
            </FormField>
          </div>
        </div>

        <div className="mb-4 text-sm text-slate-400">
          총 <span className="tabular text-slate-200">{total}</span>건
        </div>

        {loading ? <FeedbackState title="출금 목록 불러오는 중" description="출금 목록을 불러오고 있습니다." /> : null}
        {!loading && items.length === 0 ? <FeedbackState title="출금 내역 없음" description="현재 조건에 맞는 출금 내역이 없습니다." /> : null}

        {items.length > 0 ? (
          <>
            <div className="hidden xl:block">
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
                          <td className="max-w-[148px] truncate text-slate-400" title={formatWithdrawalDateTime(item.requested_at ?? item.created_at)}>
                            {formatWithdrawalDateTime(item.requested_at ?? item.created_at)}
                          </td>
                          <td className="max-w-[220px]">
                            <div>
                              <CopyableValue label="회원 아이디" value={item.account?.login_id} />
                            </div>
                            <div className="truncate text-xs text-slate-500" title={item.account?.display_name ?? "-"}>
                              {item.account?.display_name ?? "-"}
                            </div>
                          </td>
                          <td><WithdrawalTypeBadge type={item.withdrawal_type} /></td>
                          <td className="tabular text-right">{formatWithdrawalAmountBase(item.requested_amount_base)}</td>
                          <td className="tabular text-right">{formatWithdrawalAmountBase(item.fee_amount_base)}</td>
                          <td className="tabular text-right">{formatWithdrawalAmountBase(item.net_amount_base)}</td>
                          <td><WithdrawalStatusBadge status={item.status} /></td>
                          <td>{item.network ?? "-"}</td>
                          <td className="max-w-[220px]">
                            <CopyableValue label="지갑 주소" value={item.wallet_address} textClassName="font-mono text-xs text-slate-400" />
                          </td>
                          <td className="max-w-[180px]">
                            <CopyableValue label="거래 해시" value={item.tx_hash} textClassName="font-mono text-xs text-slate-400" />
                          </td>
                          <td className="text-xs text-blue-300">{active ? "선택됨" : "열기"}</td>
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
                      <th>회원 / 출금</th>
                      <th>구분</th>
                      <th>신청 금액</th>
                      <th>상태</th>
                      <th>신청일</th>
                      <th className="w-[120px]">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const active = activeSelectedId === item.id;
                      const expanded = expandedWithdrawalId === item.id;
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className={cn(active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60", expanded && "border-b-0")}
                            onClick={() => {
                              setSelectedWithdrawalId(item.id);
                              onSelectAccountId(item.account_id);
                            }}
                          >
                            <td className="max-w-[320px]">
                              <div className="space-y-1">
                                <CopyableValue label="회원 아이디" value={item.account?.login_id} textClassName="font-semibold text-slate-100" />
                                <div className="truncate text-sm text-slate-400" title={item.account?.display_name ?? "-"}>
                                  {item.account?.display_name ?? "-"}
                                </div>
                                <div className="font-mono text-xs text-slate-500">{item.id}</div>
                              </div>
                            </td>
                            <td><WithdrawalTypeBadge type={item.withdrawal_type} /></td>
                            <td className="tabular text-right">{formatWithdrawalAmountBase(item.requested_amount_base)}</td>
                            <td><WithdrawalStatusBadge status={item.status} /></td>
                            <td className="text-slate-400">{formatCompactDate(item.requested_at ?? item.created_at)}</td>
                            <td>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  className="px-3 py-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedWithdrawalId(item.id);
                                    onSelectAccountId(item.account_id);
                                  }}
                                >
                                  선택
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="px-3 py-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleExpandedWithdrawal(item.id);
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
                                    label="출금 ID"
                                    value={<CopyableValue label="출금 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem label="네트워크" value={item.network ?? "-"} />
                                  <DetailItem
                                    label="지갑 주소"
                                    value={<CopyableValue label="지갑 주소" value={item.wallet_address} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem
                                    label="거래 해시"
                                    value={<CopyableValue label="거래 해시" value={item.tx_hash} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem label="수수료" value={<span className="tabular">{formatWithdrawalAmountBase(item.fee_amount_base)}</span>} />
                                  <DetailItem label="실수령액" value={<span className="tabular">{formatWithdrawalAmountBase(item.net_amount_base)}</span>} />
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
                const active = activeSelectedId === item.id;
                const expanded = expandedWithdrawalId === item.id;
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
                        <WithdrawalStatusBadge status={item.status} />
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <DetailItem label="출금 구분" value={<WithdrawalTypeBadge type={item.withdrawal_type} />} />
                      <DetailItem label="신청일" value={formatCompactDate(item.requested_at ?? item.created_at)} />
                      <DetailItem label="신청 금액" value={<span className="tabular">{formatWithdrawalAmountBase(item.requested_amount_base)}</span>} />
                      <DetailItem label="실수령액" value={<span className="tabular">{formatWithdrawalAmountBase(item.net_amount_base)}</span>} />
                    </dl>
                    {expanded ? (
                      <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4">
                        <DetailItem
                          label="출금 ID"
                          value={<CopyableValue label="출금 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem label="네트워크" value={item.network ?? "-"} />
                        <DetailItem
                          label="지갑 주소"
                          value={<CopyableValue label="지갑 주소" value={item.wallet_address} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem
                          label="거래 해시"
                          value={<CopyableValue label="거래 해시" value={item.tx_hash} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem label="수수료" value={<span className="tabular">{formatWithdrawalAmountBase(item.fee_amount_base)}</span>} />
                      </dl>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={active ? "primary" : "secondary"}
                        className="flex-1"
                        onClick={() => {
                          setSelectedWithdrawalId(item.id);
                          onSelectAccountId(item.account_id);
                        }}
                      >
                        {active ? "선택됨" : "상세 보기"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-4"
                        onClick={() => toggleExpandedWithdrawal(item.id)}
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
