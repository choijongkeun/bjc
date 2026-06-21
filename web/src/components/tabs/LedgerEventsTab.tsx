import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Copy, FileUp, Plus, RefreshCcw } from "lucide-react";
import { api, type LedgerEvent, type SessionRole } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { Button, Card, FeedbackState, FormField, JsonPanel, Pagination, TableShell, TextAreaField, TextField, cn } from "@/components/ui";

const baseEvent = {
  account_id: "",
  product_id: "",
  policy_id: "",
  calc_run_id: "",
  event_time: new Date().toISOString().slice(0, 19).replace("T", " "),
  event_type: "STAKE",
  amount_base: "",
  decimals: 6,
  symbol: "USDC",
  reference_id: "",
  related_account_id: "",
  meta: "{}",
};

function formatCompactDateTime(value: string | null | undefined) {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
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

export function LedgerEventsTab({ actorId, role }: { actorId: string; role: SessionRole }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ account_id: "", policy_id: "", event_type: "", reference_id: "" });
  const [items, setItems] = useState<LedgerEvent[]>([]);
  const [selected, setSelected] = useState<LedgerEvent | null>(null);
  const [form, setForm] = useState(baseEvent);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null);

  const activeSelectedId = useMemo(() => selected?.id ?? null, [selected?.id]);

  async function load() {
    try {
      const result = await api.listLedgerEvents(actorId, { ...filters, page, limit: 10 });
      setItems(result.ledger_events);
      setSelected(result.ledger_events[0] ?? null);
      setTotal(result.total);
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "원장 이벤트를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load();
  }, [page]);

  async function createEvent() {
    try {
      await api.createLedgerEvent(actorId, {
        event: {
          ...form,
          calc_run_id: form.calc_run_id || null,
          related_account_id: form.related_account_id || null,
          meta: JSON.parse(form.meta),
        },
      });
      setNotice("원장 이벤트를 생성했습니다.");
      setForm(baseEvent);
      await load();
    } catch (actionError: any) {
      setError(actionError.message ?? "원장 이벤트 생성에 실패했습니다.");
    }
  }

  async function uploadCsv() {
    if (!csvFile) return;
    try {
      const result = await api.importLedgerCsv(actorId, csvFile);
      setNotice(`CSV 업로드 완료: ${result.inserted_count}건 반영`);
      setCsvFile(null);
      await load();
    } catch (actionError: any) {
      setError(actionError.message ?? "CSV 업로드에 실패했습니다. 중복 reference_id가 1건이라도 있으면 전체 롤백됩니다.");
    }
  }

  function toggleExpandedLedger(ledgerId: string) {
    setExpandedLedgerId((current) => (current === ledgerId ? null : ledgerId));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <div className="space-y-6">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-50">원장 이벤트</h2>
              <p className="text-sm text-slate-400">계정, 정책, reference_id 기준으로 필터링합니다.</p>
            </div>
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
          {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="회원 ID">
              <TextField
                placeholder="회원 ID를 입력하세요"
                value={filters.account_id}
                onChange={(e) => setFilters((v) => ({ ...v, account_id: e.target.value }))}
              />
            </FormField>
            <FormField label="정책 ID">
              <TextField
                placeholder="정책 ID를 입력하세요"
                value={filters.policy_id}
                onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))}
              />
            </FormField>
            <FormField label="이벤트 구분">
              <TextField
                placeholder="예: STAKE"
                value={filters.event_type}
                onChange={(e) => setFilters((v) => ({ ...v, event_type: e.target.value }))}
              />
            </FormField>
            <FormField label="참조 ID">
              <div className="flex gap-2">
                <TextField
                  className="flex-1"
                  placeholder="reference_id를 입력하세요"
                  value={filters.reference_id}
                  onChange={(e) => setFilters((v) => ({ ...v, reference_id: e.target.value }))}
                />
                <Button onClick={() => void load()}>조회</Button>
              </div>
            </FormField>
          </div>
          <div className="hidden xl:block">
            <TableShell>
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>이벤트 구분</th>
                    <th>회원</th>
                    <th>금액</th>
                    <th>참조 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className={cn(activeSelectedId === item.id ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60")}
                      onClick={() => setSelected(item)}
                    >
                      <td className="max-w-[168px] truncate text-slate-400" title={item.event_time}>
                        {item.event_time}
                      </td>
                      <td>{item.event_type}</td>
                      <td className="max-w-[220px]">
                        <Link className="block truncate text-blue-300 hover:text-blue-200" to={`/admin/ledger/${item.account_id}`} title={item.account_id}>
                          {item.account_id}
                        </Link>
                      </td>
                      <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                      <td className="max-w-[260px]">
                        <CopyableValue label="참조 ID" value={item.reference_id} textClassName="font-mono text-xs text-slate-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </div>
          <div className="hidden md:block xl:hidden">
            <TableShell>
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>이벤트</th>
                    <th>금액</th>
                    <th>시간</th>
                    <th className="w-[120px]">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const expanded = expandedLedgerId === item.id;
                    const active = activeSelectedId === item.id;
                    return (
                      <Fragment key={item.id}>
                        <tr
                          className={cn(active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60", expanded && "border-b-0")}
                          onClick={() => setSelected(item)}
                        >
                          <td className="max-w-[320px]">
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-100">{item.event_type}</div>
                              <Link className="block truncate text-sm text-blue-300 hover:text-blue-200" to={`/admin/ledger/${item.account_id}`} title={item.account_id}>
                                {item.account_id}
                              </Link>
                              <div className="font-mono text-xs text-slate-500">{item.id}</div>
                            </div>
                          </td>
                          <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                          <td className="text-slate-400">{formatCompactDateTime(item.event_time)}</td>
                          <td>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                className="px-3 py-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelected(item);
                                }}
                              >
                                선택
                              </Button>
                              <Button
                                variant="secondary"
                                className="px-3 py-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleExpandedLedger(item.id);
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
                            <td colSpan={4} className="px-4 py-4">
                              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <DetailItem
                                  label="이벤트 ID"
                                  value={<CopyableValue label="이벤트 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                                />
                                <DetailItem
                                  label="회원 ID"
                                  value={<CopyableValue label="회원 ID" value={item.account_id} textClassName="font-mono text-xs text-slate-400" />}
                                />
                                <DetailItem
                                  label="참조 ID"
                                  value={<CopyableValue label="참조 ID" value={item.reference_id} textClassName="font-mono text-xs text-slate-400" />}
                                />
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
              const expanded = expandedLedgerId === item.id;
              const active = activeSelectedId === item.id;
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
                      <div className="font-semibold text-slate-100">{item.event_type}</div>
                      <Link className="mt-1 block truncate text-sm text-blue-300 hover:text-blue-200" to={`/admin/ledger/${item.account_id}`} title={item.account_id}>
                        {item.account_id}
                      </Link>
                    </div>
                    <div className="shrink-0 tabular text-sm text-slate-100">
                      {formatTokenAmount(item.amount_base, item.decimals, item.symbol)}
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <DetailItem label="발생 시각" value={formatCompactDateTime(item.event_time)} />
                    <DetailItem
                      label="참조 ID"
                      value={<CopyableValue label="참조 ID" value={item.reference_id} textClassName="font-mono text-xs text-slate-400" />}
                    />
                  </dl>
                  {expanded ? (
                    <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4">
                      <DetailItem
                        label="이벤트 ID"
                        value={<CopyableValue label="이벤트 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                      />
                      <DetailItem
                        label="회원 ID"
                        value={<CopyableValue label="회원 ID" value={item.account_id} textClassName="font-mono text-xs text-slate-400" />}
                      />
                    </dl>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant={active ? "primary" : "secondary"}
                      className="flex-1"
                      onClick={() => setSelected(item)}
                    >
                      {active ? "선택됨" : "상세 보기"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="px-4"
                      onClick={() => toggleExpandedLedger(item.id)}
                    >
                      {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                      {expanded ? "추가 정보 접기" : "추가 정보"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4"><Pagination page={page} limit={10} total={total} onChange={setPage} /></div>
        </Card>
      </div>

      <div className="space-y-6">
        {selected ? (
          <Card>
            <h3 className="text-lg font-bold text-slate-50">이벤트 상세</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailItem label="표시 금액" value={<span className="tabular">{formatTokenAmount(selected.amount_base, selected.decimals, selected.symbol)}</span>} />
              <DetailItem
                label="원본 amount_base"
                value={<CopyableValue label="amount_base" value={selected.amount_base} textClassName="font-mono text-xs text-slate-400" />}
              />
              <DetailItem
                label="참조 ID"
                value={<CopyableValue label="참조 ID" value={selected.reference_id} textClassName="font-mono text-xs text-slate-400" />}
                className="sm:col-span-2"
              />
            </dl>
            <div className="mt-4"><JsonPanel title="meta JSON" value={selected.meta} /></div>
          </Card>
        ) : null}

        <Card>
          <h3 className="text-lg font-bold text-slate-50">수동 이벤트 등록</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER는 단건 생성과 CSV 업로드 버튼이 숨겨집니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <FormField label="회원 ID">
                <TextField
                  placeholder="회원 ID를 입력하세요"
                  value={form.account_id}
                  onChange={(e) => setForm((v) => ({ ...v, account_id: e.target.value }))}
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="상품 ID">
                  <TextField
                    placeholder="상품 ID를 입력하세요"
                    value={form.product_id}
                    onChange={(e) => setForm((v) => ({ ...v, product_id: e.target.value }))}
                  />
                </FormField>
                <FormField label="정책 ID">
                  <TextField
                    placeholder="정책 ID를 입력하세요"
                    value={form.policy_id}
                    onChange={(e) => setForm((v) => ({ ...v, policy_id: e.target.value }))}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="이벤트 구분">
                  <TextField
                    placeholder="예: STAKE"
                    value={form.event_type}
                    onChange={(e) => setForm((v) => ({ ...v, event_type: e.target.value }))}
                  />
                </FormField>
                <FormField label="원본 금액">
                  <TextField
                    className="font-mono"
                    placeholder="amount_base를 입력하세요"
                    value={form.amount_base}
                    onChange={(e) => setForm((v) => ({ ...v, amount_base: e.target.value }))}
                  />
                </FormField>
              </div>
              <FormField label="참조 ID">
                <TextField
                  placeholder="reference_id를 입력하세요"
                  value={form.reference_id}
                  onChange={(e) => setForm((v) => ({ ...v, reference_id: e.target.value }))}
                />
              </FormField>
              <FormField label="메타 JSON">
                <TextAreaField
                  className="font-mono text-xs"
                  placeholder='{"reason":"manual"}'
                  value={form.meta}
                  onChange={(e) => setForm((v) => ({ ...v, meta: e.target.value }))}
                />
              </FormField>
              <Button onClick={() => void createEvent()}><Plus className="mr-2 h-4 w-4" />단건 생성</Button>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-slate-50">CSV 업로드</h3>
          <p className="mt-1 text-sm text-slate-400">중복 `reference_id`가 1건이라도 있으면 전체 롤백됩니다.</p>
          {role !== "ADMIN" ? (
            <FeedbackState title="관리자 전용" description="CSV 업로드는 ADMIN 권한에서만 가능합니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <input type="file" accept=".csv,text/csv" onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-2xl file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-slate-100" />
              <Button disabled={!csvFile} onClick={() => void uploadCsv()}><FileUp className="mr-2 h-4 w-4" />CSV 업로드</Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
