import { useEffect, useState } from "react";
import { CheckCircle2, PauseCircle, Play, ShieldAlert } from "lucide-react";
import { api, type AnyCalcRunSummary, type CalcRun, type SessionRole, type SettlementItem } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { getDisplayLabel } from "@/lib/display";
import { Button, Card, FeedbackState, JsonPanel, Pagination, StatusBadge, TableShell } from "@/components/ui";

export function CalcSettlementTab({
  actorId,
  role,
  selectedCalcRunId,
  onSelectCalcRunId,
  onOpenRewards,
  onOpenRanks,
}: {
  actorId: string;
  role: SessionRole;
  selectedCalcRunId: string | null;
  onSelectCalcRunId: (calcRunId: string | null) => void;
  onOpenRewards: (calcRunId: string) => void;
  onOpenRanks: (target: { calcRunId?: string | null; accountId?: string | null }) => void;
}) {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ policy_id: "", run_type: "", status: "" });
  const [runs, setRuns] = useState<CalcRun[]>([]);
  const [selected, setSelected] = useState<CalcRun | null>(null);
  const [settlements, setSettlements] = useState<SettlementItem[]>([]);
  const [settlementTotal, setSettlementTotal] = useState(0);
  const [runSummaries, setRunSummaries] = useState<Record<string, AnyCalcRunSummary>>({});
  const [selectedSummary, setSelectedSummary] = useState<AnyCalcRunSummary | null>(null);
  const [selectedSummaryError, setSelectedSummaryError] = useState<string | null>(null);
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
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "계산 실행 내역을 불러오지 못했습니다.");
    }
  }

  async function loadSettlements(calcRunId: string) {
    try {
      const result = await api.listSettlementItems(actorId, { calc_run_id: calcRunId, page: 1, limit: 20 });
      setSettlements(result.settlement_items);
      setSettlementTotal(result.total);
    } catch (loadError: any) {
      setError(loadError.message ?? "정산 내역을 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void loadRuns();
  }, [page, selectedCalcRunId]);

  useEffect(() => {
    if (selected) void loadSettlements(selected.id);
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedSummary() {
      if (!selected) {
        setSelectedSummary(null);
        setSelectedSummaryError(null);
        return;
      }

      try {
        const result = await api.getCalcRunSummary(actorId, selected.id);
        if (cancelled) {
          return;
        }
        setSelectedSummary(result);
        setSelectedSummaryError(null);
      } catch (error: any) {
        if (cancelled) {
          return;
        }
        setSelectedSummary(null);
        setSelectedSummaryError(error.message ?? "계산 실행 결과를 불러오지 못했습니다.");
      }
    }

    void loadSelectedSummary();

    return () => {
      cancelled = true;
    };
  }, [actorId, selected]);

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
      setNotice("계산 실행을 생성했습니다.");
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

  async function loadRunSummaries(runList: CalcRun[]) {
    const targets = runList.filter((run) =>
      ["DAILY_REWARD", "DIRECT_REFERRAL", "RANK_QUALIFICATION", "RANK_BONUS", "CONTRIBUTION", "SIDECAR"].includes(run.run_type)
    );
    const entries = await Promise.all(
      targets.map(async (run) => {
        try {
          const summary = await api.getCalcRunSummary(actorId, run.id);
          return [run.id, summary] as const;
        } catch {
          return [run.id, null] as const;
        }
      })
    );

    setRunSummaries((current) => {
      const next = { ...current };
      for (const [runId, summary] of entries) {
        if (summary) {
          next[runId] = summary;
        }
      }
      return next;
    });
  }

  useEffect(() => {
    void loadRunSummaries(runs);
  }, [actorId, runs]);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div className="space-y-6">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-50">계산 실행 목록</h2>
            </div>
            <Button variant="secondary" onClick={() => void loadRuns()}>새로고침</Button>
          </div>
          {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="정책 버전 ID" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="실행 구분" value={filters.run_type} onChange={(e) => setFilters((v) => ({ ...v, run_type: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="상태" value={filters.status} onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))} />
            <Button onClick={() => void loadRuns()}>조회</Button>
          </div>
          <TableShell>
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>실행일</th>
                  <th>실행 구분</th>
                  <th>상태</th>
                  <th>정책 버전</th>
                  <th>생성</th>
                  <th>중복</th>
                  <th>실패</th>
                  <th>총 금액</th>
                  <th>에러</th>
                  <th>연결</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const summary = runSummaries[run.id];
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
                          <span>{getDisplayLabel(run.run_type)}</span>
                          {run.run_type === "DAILY_REWARD" ? <StatusBadge value="DAILY_REWARD" tone="blue" /> : null}
                          {run.run_type === "DIRECT_REFERRAL" ? <StatusBadge value="DIRECT_REFERRAL" tone="emerald" /> : null}
                        </div>
                      </td>
                      <td><StatusBadge value={run.status} /></td>
                      <td className="font-mono text-xs text-slate-400">{run.policy_version_id}</td>
                      <td className="tabular text-right">{getSummaryMetric(summary, "created_count")}</td>
                      <td className="tabular text-right">{getSummaryMetric(summary, "duplicate_skip_count")}</td>
                      <td className={`tabular text-right ${getNumericSummaryMetric(summary, "failed_count") > 0 ? "text-rose-300" : ""}`}>
                        {getSummaryMetric(summary, "failed_count")}
                      </td>
                      <td className="tabular text-right">{getSummaryAmount(summary)}</td>
                      <td className="text-slate-500">{run.error_message ?? "-"}</td>
                      <td>
                        {run.run_type === "RANK_BONUS" ? (
                          <Button variant="ghost" onClick={(event) => {
                            event.stopPropagation();
                            onOpenRewards(run.id);
                          }}>
                            보상 보기
                          </Button>
                        ) : run.run_type === "RANK_QUALIFICATION" ? (
                          <Button
                            variant="ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenRanks({ calcRunId: run.id });
                            }}
                          >
                            결과 보기
                          </Button>
                        ) : (
                          <Button variant="ghost" onClick={(event) => {
                            event.stopPropagation();
                            onOpenRewards(run.id);
                          }}>
                            보상 보기
                          </Button>
                        )}
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
          <h3 className="text-lg font-bold text-slate-50">계산 실행 생성</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER는 생성과 상태 변경 버튼이 숨겨집니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="정책 버전 ID" value={form.policy_id} onChange={(e) => setForm((v) => ({ ...v, policy_id: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="실행 구분" value={form.run_type} onChange={(e) => setForm((v) => ({ ...v, run_type: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" type="date" value={form.run_date} onChange={(e) => setForm((v) => ({ ...v, run_date: e.target.value }))} />
              </div>
              <Button onClick={() => void createRun()}><Play className="mr-2 h-4 w-4" />계산 실행 생성</Button>
            </div>
          )}
        </Card>

        {selected ? (
          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-50">계산 실행 상세</h3>
              <StatusBadge value={selected.status} />
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="font-mono text-xs text-slate-400">{selected.id}</div>
              <div>실행 구분: {getDisplayLabel(selected.run_type)}</div>
              <div>정책 버전: <span className="font-mono text-xs text-slate-400">{selected.policy_version_id}</span></div>
              {selectedSummary ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {formatCalcRunSummary(selectedSummary).map((item) => (
                    <div key={item.label}>
                      {item.label}: {item.value}
                    </div>
                  ))}
                </div>
              ) : null}
              {selectedSummaryError ? <FeedbackState title="실행 결과를 불러오지 못했습니다" description={selectedSummaryError} tone="error" /> : null}
              {selected.status === "FINALIZED" ? <FeedbackState title="확정 완료" description="확정된 계산 실행은 더 이상 수정할 수 없습니다." /> : null}
            </div>
            <div className="mt-4">
              {selected.run_type === "RANK_BONUS" ? (
                <Button variant="secondary" onClick={() => onOpenRewards(selected.id)}>
                  보상 내역으로 이동
                </Button>
              ) : selected.run_type === "RANK_QUALIFICATION" ? (
                <Button variant="secondary" onClick={() => onOpenRanks({ calcRunId: selected.id })}>
                  직급 관리로 이동
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => onOpenRewards(selected.id)}>
                  보상 내역으로 이동
                </Button>
              )}
            </div>
            {role === "ADMIN" ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void transition("start", selected)}><Play className="mr-2 h-4 w-4" />처리 시작</Button>
                  <Button variant="secondary" onClick={() => void transition("succeed", selected)}><CheckCircle2 className="mr-2 h-4 w-4" />성공 처리</Button>
                  <Button variant="danger" onClick={() => void transition("fail", selected)}><PauseCircle className="mr-2 h-4 w-4" />실패 처리</Button>
                  <Button onClick={() => void transition("finalize", selected)}><ShieldAlert className="mr-2 h-4 w-4" />확정 처리</Button>
                </div>
                <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="실패 사유" value={failReason} onChange={(e) => setFailReason(e.target.value)} />
              </div>
            ) : null}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-200">정산 내역</div>
                <div className="text-xs text-slate-500">총 {settlementTotal}건</div>
              </div>
              <TableShell height="max-h-[260px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>정산 구분</th>
                      <th>회원 ID</th>
                      <th>금액</th>
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
              {settlements[0] ? <div className="mt-4"><JsonPanel title="첫 정산 메타" value={settlements[0].meta} /></div> : null}
            </div>
          </Card>
        ) : (
          <Card><FeedbackState title="선택된 계산 실행이 없습니다" description="계산 실행을 선택하면 정산 내역을 확인할 수 있습니다." /></Card>
        )}
      </div>
    </div>
  );
}

function getSummaryMetric(summary: AnyCalcRunSummary | null | undefined, key: string): string {
  if (!summary) {
    return "-";
  }
  const value = (summary as Record<string, unknown>)[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "-";
}

function getNumericSummaryMetric(summary: AnyCalcRunSummary | null | undefined, key: string): number {
  const value = getSummaryMetric(summary, key);
  return /^\d+$/.test(value) ? Number(value) : 0;
}

function getSummaryAmount(summary: AnyCalcRunSummary | null | undefined): string {
  const keys = [
    "total_reward_amount_base",
    "total_rank_bonus_amount_base",
    "total_base_daily_reward_amount_base",
    "total_base_amount_base",
    "total_requested_amount_base",
    "total_release_amount_base",
    "total_freeze_amount_base"
  ];
  for (const key of keys) {
    const value = getSummaryMetric(summary, key);
    if (value !== "-") {
      return value;
    }
  }
  return "-";
}

function formatCalcRunSummary(summary: AnyCalcRunSummary): Array<{ label: string; value: string }> {
  return Object.entries(summary as Record<string, unknown>)
    .filter(([key]) => key !== "calc_run_id")
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      label: key,
      value: String(value)
    }));
}
