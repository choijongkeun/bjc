import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, type LedgerEvent, type SettlementItem } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { Card, FeedbackState, JsonPanel, TableShell } from "@/components/ui";
import { useSessionStore } from "@/store/sessionStore";

export default function LedgerDetailPage() {
  const account = useSessionStore((state) => state.account)!;
  const actorId = account.id;
  const role = account.role;
  const { accountId = "" } = useParams();
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [selected, setSelected] = useState<LedgerEvent | SettlementItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [events, settlementResult] = await Promise.all([
          api.listLedgerEvents(actorId, { account_id: accountId, page: 1, limit: 50 }),
          api.listSettlementItems(actorId, { account_id: accountId, page: 1, limit: 50 }),
        ]);
        setLedgerEvents(events.ledger_events);
        setSettlements(settlementResult.settlement_items);
        setSelected(events.ledger_events[0] ?? settlementResult.settlement_items[0] ?? null);
      } catch (loadError: any) {
        setError(loadError.message ?? "계정별 원장 상세를 불러오지 못했습니다.");
      }
    }
    void load();
  }, [accountId, actorId]);

  const totalBase = useMemo(() => ledgerEvents.reduce((sum, item) => sum + BigInt(item.amount_base), BigInt(0)).toString(), [ledgerEvents]);

  return (
    <div className="app-shell min-h-screen px-6 py-6">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex items-center justify-between rounded-[28px] border border-slate-800/80 bg-slate-950/70 px-6 py-5">
          <div>
            <Link to="/admin?tab=ledger" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-100">
              <ArrowLeft className="h-4 w-4" />
              관리자 콘솔로 돌아가기
            </Link>
            <h1 className="mt-3 text-2xl font-extrabold text-slate-50">계정별 원장 타임라인</h1>
            <p className="mt-1 font-mono text-xs text-slate-400">{accountId}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-right text-sm text-slate-300">
            <div>권한: {role}</div>
            <div className="mt-1 tabular">누적 원장 base: {totalBase}</div>
          </div>
        </div>

        {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-bold text-slate-50">원장 이벤트 타임라인</h2>
              <div className="mt-4 space-y-3">
                {ledgerEvents.length === 0 ? (
                  <FeedbackState title="이벤트 없음" description="해당 계정의 원장 이벤트가 없습니다." />
                ) : (
                  ledgerEvents.map((item) => (
                    <button key={item.id} onClick={() => setSelected(item)} className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left hover:border-blue-400/30 hover:bg-slate-900/80">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.event_time}</div>
                          <div className="mt-2 text-sm font-semibold text-slate-100">{item.event_type}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">{item.reference_id}</div>
                        </div>
                        <div className="tabular text-right text-sm text-slate-100">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <h2 className="text-lg font-bold text-slate-50">정산 스냅샷</h2>
              <TableShell height="max-h-[360px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>settlement_type</th>
                      <th>calc_run</th>
                      <th>amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((item) => (
                      <tr key={item.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelected(item)}>
                        <td>{item.settlement_type}</td>
                        <td className="font-mono text-xs text-slate-500">{item.calc_run_id}</td>
                        <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            </Card>
          </div>

          <Card>
            <h2 className="text-lg font-bold text-slate-50">이벤트 상세 / JSON</h2>
            {selected ? (
              <div className="mt-4 space-y-4">
                {"event_type" in selected ? (
                  <>
                    <div className="text-sm text-slate-300">
                      표시 금액: <span className="tabular">{formatTokenAmount(selected.amount_base, selected.decimals, selected.symbol)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      원본 amount_base: <span className="font-mono">{selected.amount_base}</span>
                    </div>
                    <JsonPanel title="ledger meta" value={selected.meta} />
                  </>
                ) : (
                  <>
                    <div className="text-sm text-slate-300">
                      정산 금액: <span className="tabular">{formatTokenAmount(selected.amount_base, selected.decimals, selected.symbol)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      reference_id: <span className="font-mono">{selected.reference_id ?? "-"}</span>
                    </div>
                    <JsonPanel title="settlement meta" value={selected.meta} />
                  </>
                )}
              </div>
            ) : (
              <FeedbackState title="상세 없음" description="좌측의 원장 이벤트 또는 정산 항목을 선택하세요." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
