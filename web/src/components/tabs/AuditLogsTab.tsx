import { Fragment, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { api, type AuditLog, type SessionRole } from "@/lib/api";
import { Button, Card, FeedbackState, FormField, JsonPanel, Pagination, TableShell, TextField, cn } from "@/components/ui";

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

function formatCompactDateTime(value: string | null | undefined) {
  return value ? value.slice(0, 16).replace("T", " ") : "-";
}

export function AuditLogsTab({ actorId, role }: { actorId: string; role: SessionRole }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ actor_account_id: "", action: "", target_table: "" });
  const [items, setItems] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.listAuditLogs(actorId, { ...filters, page, limit: 10 });
      setItems(result.audit_logs);
      setTotal(result.total);
      setSelected(result.audit_logs[0] ?? null);
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "감사 로그를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    if (role === "ADMIN") void load();
  }, [page, role]);

  if (role !== "ADMIN") {
    return <Card><FeedbackState title="관리자 전용 메뉴" description="감사 로그는 관리자만 조회할 수 있습니다." /></Card>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <FormField label="처리자 ID">
            <TextField placeholder="처리자 ID를 입력하세요" value={filters.actor_account_id} onChange={(e) => setFilters((v) => ({ ...v, actor_account_id: e.target.value }))} />
          </FormField>
          <FormField label="동작">
            <TextField placeholder="동작을 입력하세요" value={filters.action} onChange={(e) => setFilters((v) => ({ ...v, action: e.target.value }))} />
          </FormField>
          <FormField label="대상 테이블">
            <TextField placeholder="대상 테이블을 입력하세요" value={filters.target_table} onChange={(e) => setFilters((v) => ({ ...v, target_table: e.target.value }))} />
          </FormField>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void load()}>조회</Button>
          </div>
        </div>
        {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
        <div className="hidden md:block">
          <TableShell>
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>처리자</th>
                  <th>동작</th>
                  <th>대상</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={selected?.id === item.id ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"} onClick={() => setSelected(item)}>
                    <td className="text-slate-400">{formatCompactDateTime(item.created_at)}</td>
                    <td className="max-w-[240px]"><CopyableValue label="처리자 ID" value={item.actor_account_id} textClassName="font-mono text-xs text-slate-400" /></td>
                    <td>{item.action}</td>
                    <td className="max-w-[180px] truncate" title={item.target_table ?? "-"}>{item.target_table ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        </div>
        <div className="space-y-3 md:hidden">
          {items.map((item) => {
            const expanded = expandedLogId === item.id;
            const active = selected?.id === item.id;
            return (
              <div key={item.id} className={cn("rounded-[24px] border border-slate-800 bg-slate-950/60 p-4", active && "border-blue-500/40 bg-blue-500/10")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-100">{item.action}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatCompactDateTime(item.created_at)}</div>
                  </div>
                  <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => setExpandedLogId((current) => current === item.id ? null : item.id)}>
                    {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                    {expanded ? "접기" : "열기"}
                  </Button>
                </div>
                <div className="mt-3">
                  <CopyableValue label="처리자 ID" value={item.actor_account_id} textClassName="font-mono text-xs text-slate-400" />
                </div>
                {expanded ? (
                  <div className="mt-4 space-y-3 border-t border-slate-800 pt-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">대상 테이블</div>
                      <div className="mt-1 text-slate-200">{item.target_table ?? "-"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">로그 ID</div>
                      <CopyableValue label="로그 ID" value={item.id} textClassName="mt-1 font-mono text-xs text-slate-400" />
                    </div>
                  </div>
                ) : null}
                <div className="mt-4">
                  <Button variant={active ? "primary" : "secondary"} className="w-full" onClick={() => setSelected(item)}>
                    {active ? "선택됨" : "상세 보기"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4"><Pagination page={page} limit={10} total={total} onChange={setPage} /></div>
      </Card>
      <Card>
        <h3 className="text-lg font-bold text-slate-50">상세 내용</h3>
        {selected ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">처리자 ID</div>
                <CopyableValue label="처리자 ID" value={selected.actor_account_id} textClassName="mt-1 font-mono text-xs text-slate-400" />
              </div>
              <div>
                <div className="text-xs text-slate-500">대상 테이블</div>
                <div className="mt-1 text-sm text-slate-200">{selected.target_table ?? "-"}</div>
              </div>
            </div>
            <JsonPanel title={selected.action} value={selected.meta} />
          </div>
        ) : <FeedbackState title="선택된 로그 없음" description="좌측 목록에서 로그를 선택해 주세요." />}
      </Card>
    </div>
  );
}
