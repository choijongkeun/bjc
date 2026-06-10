import { useEffect, useState } from "react";
import { api, type AuditLog, type SessionRole } from "@/lib/api";
import { Button, Card, FeedbackState, JsonPanel, Pagination, TableShell } from "@/components/ui";

export function AuditLogsTab({ actorId, role }: { actorId: string; role: SessionRole }) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ actor_account_id: "", action: "", target_table: "" });
  const [items, setItems] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    return <Card><FeedbackState title="관리자 전용 메뉴" description="감사 로그에는 정책 변경, 정산 확정, CSV 업로드, 실패 사유가 포함되므로 1차 MVP에서는 ADMIN만 조회할 수 있습니다." /></Card>;
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="actor_account_id" value={filters.actor_account_id} onChange={(e) => setFilters((v) => ({ ...v, actor_account_id: e.target.value }))} />
          <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="action" value={filters.action} onChange={(e) => setFilters((v) => ({ ...v, action: e.target.value }))} />
          <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="target_table" value={filters.target_table} onChange={(e) => setFilters((v) => ({ ...v, target_table: e.target.value }))} />
          <Button onClick={() => void load()}>조회</Button>
        </div>
        {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
        <TableShell>
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>시간</th>
                <th>actor</th>
                <th>action</th>
                <th>target</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelected(item)}>
                  <td>{item.created_at}</td>
                  <td className="font-mono text-xs text-slate-400">{item.actor_account_id}</td>
                  <td>{item.action}</td>
                  <td>{item.target_table ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
        <div className="mt-4"><Pagination page={page} limit={10} total={total} onChange={setPage} /></div>
      </Card>
      <Card>
        <h3 className="text-lg font-bold text-slate-50">payload</h3>
        {selected ? <div className="mt-4"><JsonPanel title={selected.action} value={selected.meta} /></div> : <FeedbackState title="선택된 로그 없음" description="좌측 테이블에서 로그를 선택해 주세요." />}
      </Card>
    </div>
  );
}
