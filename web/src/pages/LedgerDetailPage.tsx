import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { api, type LedgerEvent, type SettlementItem } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { Card, FeedbackState, JsonPanel, TableShell, cn } from "@/components/ui";
import { useSessionStore } from "@/store/sessionStore";

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

  async function handleCopy() {
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
            <div className="mt-2 max-w-xl">
              <CopyableValue label="계정 ID" value={accountId} textClassName="font-mono text-xs text-slate-400" />
            </div>
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
                          <div className="mt-1 max-w-full">
                            <CopyableValue label="참조 ID" value={item.reference_id} textClassName="font-mono text-xs text-slate-500" />
                          </div>
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
              <div className="hidden md:block">
                <TableShell height="max-h-[360px]">
                  <table className="data-table min-w-full">
                    <thead>
                      <tr>
                        <th>정산 구분</th>
                        <th>계산 실행</th>
                        <th>금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((item) => (
                        <tr key={item.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelected(item)}>
                          <td>{item.settlement_type}</td>
                          <td className="max-w-[220px]">
                            <CopyableValue label="계산 실행 ID" value={item.calc_run_id} textClassName="font-mono text-xs text-slate-500" />
                          </td>
                          <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              </div>
              <div className="space-y-3 md:hidden">
                {settlements.length === 0 ? (
                  <FeedbackState title="정산 없음" description="연결된 정산 항목이 없습니다." />
                ) : (
                  settlements.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-left hover:border-blue-400/30 hover:bg-slate-900/80"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-100">{item.settlement_type}</div>
                          <CopyableValue label="계산 실행 ID" value={item.calc_run_id} textClassName="mt-1 font-mono text-xs text-slate-500" />
                        </div>
                        <div className="tabular text-right text-sm text-slate-100">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="text-lg font-bold text-slate-50">이벤트 상세 / JSON</h2>
            {selected ? (
              <div className="mt-4 space-y-4">
                {"event_type" in selected ? (
                  <>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <DetailItem label="표시 금액" value={<span className="tabular">{formatTokenAmount(selected.amount_base, selected.decimals, selected.symbol)}</span>} />
                      <DetailItem
                        label="원본 amount_base"
                        value={<CopyableValue label="amount_base" value={selected.amount_base} textClassName="font-mono text-xs text-slate-400" />}
                      />
                      <DetailItem label="이벤트 구분" value={selected.event_type} />
                      <DetailItem
                        label="참조 ID"
                        value={<CopyableValue label="참조 ID" value={selected.reference_id} textClassName="font-mono text-xs text-slate-400" />}
                      />
                    </dl>
                    <JsonPanel title="ledger meta" value={selected.meta} />
                  </>
                ) : (
                  <>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <DetailItem label="정산 금액" value={<span className="tabular">{formatTokenAmount(selected.amount_base, selected.decimals, selected.symbol)}</span>} />
                      <DetailItem label="정산 구분" value={selected.settlement_type} />
                      <DetailItem
                        label="계산 실행 ID"
                        value={<CopyableValue label="계산 실행 ID" value={selected.calc_run_id} textClassName="font-mono text-xs text-slate-400" />}
                      />
                      <DetailItem
                        label="참조 ID"
                        value={<CopyableValue label="참조 ID" value={selected.reference_id ?? "-"} textClassName="font-mono text-xs text-slate-400" />}
                      />
                    </dl>
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
