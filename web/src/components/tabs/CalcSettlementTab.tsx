import { useEffect, useState } from "react";
import { CheckCircle2, PauseCircle, Play, ShieldAlert } from "lucide-react";
import { api, type AuditLog, type CalcRun, type SessionRole, type SettlementItem } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { Button, Card, FeedbackState, JsonPanel, Pagination, StatusBadge, TableShell } from "@/components/ui";

export function CalcSettlementTab({
  actorId,
  role,
  selectedCalcRunId,
  onSelectCalcRunId,
  onOpenRewards,
}: {
  actorId: string;
  role: SessionRole;
  selectedCalcRunId: string | null;
  onSelectCalcRunId: (calcRunId: string | null) => void;
  onOpenRewards: (calcRunId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ policy_id: "", run_type: "", status: "" });
  const [runs, setRuns] = useState<CalcRun[]>([]);
  const [selected, setSelected] = useState<CalcRun | null>(null);
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [settlementTotal, setSettlementTotal] = useState(0);
  const [runMetrics, setRunMetrics] = useState<Record<string, DirectRunAuditSummary>>({});
  const [form, setForm] = useState({ policy_id: "", run_type: "DAILY_REWARD", run_date: new Date().toISOString().slice(0, 10) });
  const [failReason, setFailReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadRuns() {
    try {
      const result = await api.listCalcRuns(actorId, { ...filters, page, limit: 10 });
      setRuns(result.calc_runs);
      setTotal(result.total);
      setSelected((current) => {
        if (selectedCalcRunId) {
          return result.calc_runs.find((run) => run.id === selectedCalcRunId) ?? current ?? result.calc_runs[0] ?? null;
        }
        return current && result.calc_runs.some((run) => run.id === current.id) ? current : result.calc_runs[0] ?? null;
      });
      await loadRunMetrics(result.calc_runs);
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "calc runs를 불러오지 못했습니다.");
    }
  }

  async function loadSettlements(calcRunId: string) {
    try {
      const result = await api.listSettlementItems(actorId, { calc_run_id: calcRunId, page: 1, limit: 20 });
      setSettlements(result.settlement_items);
      setSettlementTotal(result.total);
    } catch (loadError: any) {
      setError(loadError.message ?? "settlement items를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void loadRuns();
  }, [page, selectedCalcRunId]);

  useEffect(() => {
    if (selected) void loadSettlements(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedCalcRunId) {
      return;
    }
    const matched = runs.find((run) => run.id === selectedCalcRunId);
    if (matched && matched.id !== selected?.id) {
      setSelected(matched);
    }
  }, [runs, selected?.id, selectedCalcRunId]);

  async function createRun() {
    try {
      await api.createCalcRun(actorId, form);
      setNotice("calc run을 생성했습니다.");
      await loadRuns();
    } catch (actionError: any) {
      setError(actionError.message ?? "calc run 생성에 실패했습니다.");
    }
  }

  async function transition(action: "start" | "succeed" | "fail" | "finalize", calcRun: CalcRun) {
    try {
      await api.transitionCalcRun(actorId, calcRun.id, action, action === "fail" ? { error_message: failReason || null } : undefined);
      setNotice(`${calcRun.id} -> ${action} 완료`);
      await loadRuns();
      await loadSettlements(calcRun.id);
    } catch (actionError: any) {
      setError(actionError.message ?? "상태 전이에 실패했습니다.");
    }
  }

  async function loadRunMetrics(runList: CalcRun[]) {
    const targets = runList.filter((run) => run.run_type === "DAILY_REWARD" || run.run_type === "DIRECT_REFERRAL");
    const entries = await Promise.all(
      targets.map(async (run) => {
        try {
          const result = await api.listAuditLogs(actorId, {
            target_table: "calc_runs",
            target_id: run.id,
            page: 1,
            limit: 20,
          });
          const summary = extractAuditSummary(result.audit_logs);
          return [run.id, summary] as const;
        } catch {
          return [run.id, null] as const;
        }
      })
    );

    setRunMetrics((current) => {
      const next = { ...current };
      for (const [runId, summary] of entries) {
        if (summary) {
          next[runId] = summary;
        }
      }
      return next;
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div className="space-y-6">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-50">계산 실행 목록</h2>
              <p className="text-sm text-slate-400">run_type, 정책, 상태 기준으로 조회합니다.</p>
            </div>
            <Button variant="secondary" onClick={() => void loadRuns()}>새로고침</Button>
          </div>
          {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="policy_id" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="run_type" value={filters.run_type} onChange={(e) => setFilters((v) => ({ ...v, run_type: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="status" value={filters.status} onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))} />
            <Button onClick={() => void loadRuns()}>조회</Button>
          </div>
          <TableShell>
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>run_date</th>
                  <th>run_type</th>
                  <th>status</th>
                  <th>policy</th>
                  <th>created</th>
                  <th>duplicate</th>
                  <th>failed</th>
                  <th>total amount</th>
                  <th>에러</th>
                  <th>연결</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const metrics = runMetrics[run.id];
                  return (
                    <tr
                      key={run.id}
                      className={selected?.id === run.id ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}
                      onClick={() => {
                        setSelected(run);
                        onSelectCalcRunId(run.id);
                      }}
                    >
                      <td>{run.run_date}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span>{run.run_type}</span>
                          {run.run_type === "DAILY_REWARD" ? <StatusBadge value="DAILY_REWARD" tone="blue" /> : null}
                          {run.run_type === "DIRECT_REFERRAL" ? <StatusBadge value="DIRECT_REFERRAL" tone="emerald" /> : null}
                        </div>
                      </td>
                      <td><StatusBadge value={run.status} /></td>
                      <td className="font-mono text-xs text-slate-400">{run.policy_version_id}</td>
                      <td className="tabular text-right">{metrics?.created_count ?? "-"}</td>
                      <td className="tabular text-right">{metrics?.duplicate_skip_count ?? "-"}</td>
                      <td className={`tabular text-right ${Number(metrics?.failed_count ?? 0) > 0 ? "text-rose-300" : ""}`}>{metrics?.failed_count ?? "-"}</td>
                      <td className="tabular text-right">{metrics?.total_reward_amount_base ?? "-"}</td>
                      <td className="text-slate-500">{run.error_message ?? "-"}</td>
                      <td>
                        <Button variant="ghost" onClick={(event) => {
                          event.stopPropagation();
                          onOpenRewards(run.id);
                        }}>
                          보상 보기
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableShell>
          <div className="mt-4"><Pagination page={page} limit={10} total={total} onChange={setPage} /></div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="text-lg font-bold text-slate-50">calc run 생성</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER는 생성과 상태 변경 버튼이 숨겨집니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="policy_id" value={form.policy_id} onChange={(e) => setForm((v) => ({ ...v, policy_id: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="run_type" value={form.run_type} onChange={(e) => setForm((v) => ({ ...v, run_type: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" type="date" value={form.run_date} onChange={(e) => setForm((v) => ({ ...v, run_date: e.target.value }))} />
              </div>
              <Button onClick={() => void createRun()}><Play className="mr-2 h-4 w-4" />계산 실행 생성</Button>
            </div>
          )}
        </Card>

        {selected ? (
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-50">선택 run 상세</h3>
              <StatusBadge value={selected.status} />
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="font-mono text-xs text-slate-400">{selected.id}</div>
              <div>run_type: {selected.run_type}</div>
              <div>policy_id: <span className="font-mono text-xs text-slate-400">{selected.policy_version_id}</span></div>
              {runMetrics[selected.id] ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>created_count: {runMetrics[selected.id].created_count}</div>
                  <div>duplicate_skip_count: {runMetrics[selected.id].duplicate_skip_count}</div>
                  <div>failed_count: {runMetrics[selected.id].failed_count}</div>
                  <div>total_reward_amount_base: {runMetrics[selected.id].total_reward_amount_base}</div>
                </div>
              ) : null}
              {selected.status === "FINALIZED" ? <FeedbackState title="FINALIZED 잠금" description="정산이 확정된 calc_run은 settlement_items 수정이 불가합니다." /> : null}
            </div>
            <div className="mt-4">
              <Button variant="secondary" onClick={() => onOpenRewards(selected.id)}>
                rewards 탭 이동
              </Button>
            </div>
            {role === "ADMIN" ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void transition("start", selected)}><Play className="mr-2 h-4 w-4" />START</Button>
                  <Button variant="secondary" onClick={() => void transition("succeed", selected)}><CheckCircle2 className="mr-2 h-4 w-4" />SUCCEED</Button>
                  <Button variant="danger" onClick={() => void transition("fail", selected)}><PauseCircle className="mr-2 h-4 w-4" />FAIL</Button>
                  <Button onClick={() => void transition("finalize", selected)}><ShieldAlert className="mr-2 h-4 w-4" />FINALIZE</Button>
                </div>
                <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="fail error_message" value={failReason} onChange={(e) => setFailReason(e.target.value)} />
              </div>
            ) : null}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-200">settlement items</div>
                <div className="text-xs text-slate-500">총 {settlementTotal}건</div>
              </div>
              <TableShell height="max-h-[260px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>type</th>
                      <th>account</th>
                      <th>amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settlements.map((item) => (
                      <tr key={item.id}>
                        <td>{item.settlement_type}</td>
                        <td className="font-mono text-xs text-slate-400">{item.account_id}</td>
                        <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
              {settlements[0] ? <div className="mt-4"><JsonPanel title="첫 settlement meta" value={settlements[0].meta} /></div> : null}
            </div>
          </Card>
        ) : (
          <Card><FeedbackState title="선택된 run 없음" description="calc run을 선택하면 settlement 결과와 상태 변경 버튼이 표시됩니다." /></Card>
        )}
      </div>
    </div>
  );
}

type DirectRunAuditSummary = {
  created_count: string;
  duplicate_skip_count: string;
  failed_count: string;
  total_reward_amount_base: string;
};

function extractAuditSummary(auditLogs: AuditLog[]): DirectRunAuditSummary | null {
  for (const log of auditLogs) {
    const meta = (log.meta ?? {}) as Record<string, unknown>;
    const createdCount = toMetricValue(meta.created_count);
    const duplicateCount = toMetricValue(meta.duplicate_skip_count);
    const failedCount = toMetricValue(meta.failed_count);
    const totalAmount = toMetricValue(meta.total_reward_amount_base);

    if (createdCount || duplicateCount || failedCount || totalAmount) {
      return {
        created_count: createdCount ?? "-",
        duplicate_skip_count: duplicateCount ?? "-",
        failed_count: failedCount ?? "-",
        total_reward_amount_base: totalAmount ?? "-",
      };
    }
  }

  return null;
}

function toMetricValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
