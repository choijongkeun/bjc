import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileUp, Plus, RefreshCcw } from "lucide-react";
import { api, type LedgerEvent, type SessionRole } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { Button, Card, FeedbackState, JsonPanel, Pagination, TableShell } from "@/components/ui";

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
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="account_id" value={filters.account_id} onChange={(e) => setFilters((v) => ({ ...v, account_id: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="policy_id" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="event_type" value={filters.event_type} onChange={(e) => setFilters((v) => ({ ...v, event_type: e.target.value }))} />
            <div className="flex gap-2">
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="reference_id" value={filters.reference_id} onChange={(e) => setFilters((v) => ({ ...v, reference_id: e.target.value }))} />
              <Button onClick={() => void load()}>조회</Button>
            </div>
          </div>
          <TableShell>
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>타입</th>
                  <th>계정</th>
                  <th>금액</th>
                  <th>reference_id</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelected(item)}>
                    <td className="text-slate-400">{item.event_time}</td>
                    <td>{item.event_type}</td>
                    <td><Link className="text-blue-300 hover:text-blue-200" to={`/admin/ledger/${item.account_id}`}>{item.account_id.slice(0, 8)}...</Link></td>
                    <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                    <td className="font-mono text-xs text-slate-400">{item.reference_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <div className="mt-4"><Pagination page={page} limit={10} total={total} onChange={setPage} /></div>
        </Card>
      </div>

      <div className="space-y-6">
        {selected ? (
          <Card>
            <h3 className="text-lg font-bold text-slate-50">이벤트 상세</h3>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div><span className="text-slate-500">표시 금액</span><div className="tabular mt-1">{formatTokenAmount(selected.amount_base, selected.decimals, selected.symbol)}</div></div>
              <div><span className="text-slate-500">원본 amount_base</span><div className="mt-1 font-mono text-xs text-slate-400">{selected.amount_base}</div></div>
              <div><span className="text-slate-500">reference_id</span><div className="mt-1 font-mono text-xs text-slate-400">{selected.reference_id}</div></div>
            </div>
            <div className="mt-4"><JsonPanel title="meta JSON" value={selected.meta} /></div>
          </Card>
        ) : null}

        <Card>
          <h3 className="text-lg font-bold text-slate-50">수동 이벤트 등록</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER는 단건 생성과 CSV 업로드 버튼이 숨겨집니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="account_id" value={form.account_id} onChange={(e) => setForm((v) => ({ ...v, account_id: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="product_id" value={form.product_id} onChange={(e) => setForm((v) => ({ ...v, product_id: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="policy_id" value={form.policy_id} onChange={(e) => setForm((v) => ({ ...v, policy_id: e.target.value }))} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="event_type" value={form.event_type} onChange={(e) => setForm((v) => ({ ...v, event_type: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono" placeholder="amount_base" value={form.amount_base} onChange={(e) => setForm((v) => ({ ...v, amount_base: e.target.value }))} />
              </div>
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="reference_id" value={form.reference_id} onChange={(e) => setForm((v) => ({ ...v, reference_id: e.target.value }))} />
              <textarea className="min-h-[120px] w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono text-xs" placeholder='{"reason":"manual"}' value={form.meta} onChange={(e) => setForm((v) => ({ ...v, meta: e.target.value }))} />
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
