import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronUp, Copy, PauseCircle, Play, ShieldAlert } from "lucide-react";
import { api, type AnyCalcRunSummary, type CalcRun, type SessionRole, type SettlementItem } from "@/lib/api";
import { formatTokenAmount } from "@/lib/amount";
import { getDisplayLabel } from "@/lib/display";
import { Button, Card, FeedbackState, FormField, JsonPanel, Pagination, SelectField, StatusBadge, TableShell, TextField, cn } from "@/components/ui";

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
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

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
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="정책 버전 ID">
              <TextField placeholder="정책 버전 ID를 입력하세요" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
            </FormField>
            <FormField label="실행 구분">
              <SelectField value={filters.run_type} onChange={(e) => setFilters((v) => ({ ...v, run_type: e.target.value }))}>
                <option value="">전체 실행 구분</option>
                {["DAILY_REWARD", "DIRECT_REFERRAL", "RANK_QUALIFICATION", "RANK_BONUS", "CONTRIBUTION", "SIDECAR"].map((item) => (
                  <option key={item} value={item}>{getDisplayLabel(item)}</option>
                ))}
              </SelectField>
            </FormField>
            <FormField label="상태">
              <SelectField value={filters.status} onChange={(e) => setFilters((v) => ({ ...v, status: e.target.value }))}>
                <option value="">전체 상태</option>
                {["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "FINALIZED"].map((item) => (
                  <option key={item} value={item}>{getDisplayLabel(item)}</option>
                ))}
              </SelectField>
            </FormField>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => void loadRuns()}>조회</Button>
            </div>
          </div>
          <div className="hidden xl:block">
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
                        <td className="max-w-[220px]"><CopyableValue label="정책 버전 ID" value={run.policy_version_id} textClassName="font-mono text-xs text-slate-400" /></td>
                        <td className="tabular text-right">{getSummaryMetric(summary, "created_count")}</td>
                        <td className="tabular text-right">{getSummaryMetric(summary, "duplicate_skip_count")}</td>
                        <td className={`tabular text-right ${getNumericSummaryMetric(summary, "failed_count") > 0 ? "text-rose-300" : ""}`}>
                          {getSummaryMetric(summary, "failed_count")}
                        </td>
                        <td className="tabular text-right">{getSummaryAmount(summary)}</td>
                        <td className="max-w-[180px] truncate text-slate-500" title={run.error_message ?? "-"}>{run.error_message ?? "-"}</td>
                        <td>{renderCalcRunLinkButton(run, onOpenRewards, onOpenRanks)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableShell>
          </div>
          <div className="hidden md:block xl:hidden">
            <TableShell>
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>실행</th>
                    <th>상태</th>
                    <th>요약</th>
                    <th className="w-[120px]">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const summary = runSummaries[run.id];
                    const expanded = expandedRunId === run.id;
                    return (
                      <Fragment key={run.id}>
                        <tr className={selected?.id === run.id ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}>
                          <td onClick={() => { setSelected(run); onSelectCalcRunId(run.id); }}>
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-100">{getDisplayLabel(run.run_type)}</div>
                              <div className="text-xs text-slate-500">{run.run_date}</div>
                              <CopyableValue label="정책 버전 ID" value={run.policy_version_id} textClassName="font-mono text-xs text-slate-500" />
                            </div>
                          </td>
                          <td><StatusBadge value={run.status} /></td>
                          <td className="text-sm">
                            <div>생성 {getSummaryMetric(summary, "created_count")}</div>
                            <div className="text-slate-500">총액 {getSummaryAmount(summary)}</div>
                          </td>
                          <td>
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" className="px-3 py-2 text-xs" onClick={() => { setSelected(run); onSelectCalcRunId(run.id); }}>
                                선택
                              </Button>
                              <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setExpandedRunId((current) => current === run.id ? null : run.id)}>
                                {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                                {expanded ? "접기" : "열기"}
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="bg-slate-950/70">
                            <td colSpan={4} className="px-4 py-4">
                              <dl className="grid gap-3 sm:grid-cols-2">
                                <DetailItem label="중복" value={getSummaryMetric(summary, "duplicate_skip_count")} />
                                <DetailItem label="실패" value={getSummaryMetric(summary, "failed_count")} />
                                <DetailItem label="에러" value={run.error_message ?? "-"} className="sm:col-span-2" />
                              </dl>
                              <div className="mt-4">{renderCalcRunLinkButton(run, onOpenRewards, onOpenRanks)}</div>
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
            {runs.map((run) => {
              const summary = runSummaries[run.id];
              const expanded = expandedRunId === run.id;
              const active = selected?.id === run.id;
              return (
                <div key={run.id} className={cn("rounded-[24px] border border-slate-800 bg-slate-950/60 p-4", active && "border-blue-500/40 bg-blue-500/10")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-100">{getDisplayLabel(run.run_type)}</div>
                      <div className="mt-1 text-xs text-slate-500">{run.run_date}</div>
                    </div>
                    <StatusBadge value={run.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <DetailItem label="생성" value={getSummaryMetric(summary, "created_count")} />
                    <DetailItem label="총 금액" value={<span className="tabular">{getSummaryAmount(summary)}</span>} />
                  </dl>
                  {expanded ? (
                    <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4">
                      <DetailItem label="정책 버전 ID" value={<CopyableValue label="정책 버전 ID" value={run.policy_version_id} textClassName="font-mono text-xs text-slate-400" />} />
                      <DetailItem label="중복" value={getSummaryMetric(summary, "duplicate_skip_count")} />
                      <DetailItem label="실패" value={getSummaryMetric(summary, "failed_count")} />
                      <DetailItem label="에러" value={run.error_message ?? "-"} />
                    </dl>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant={active ? "primary" : "secondary"} className="flex-1" onClick={() => { setSelected(run); onSelectCalcRunId(run.id); }}>
                      {active ? "선택됨" : "상세 보기"}
                    </Button>
                    <Button variant="ghost" className="px-4" onClick={() => setExpandedRunId((current) => current === run.id ? null : run.id)}>
                      {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                      {expanded ? "접기" : "추가 정보"}
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
        <Card>
          <h3 className="text-lg font-bold text-slate-50">계산 실행 생성</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER는 생성과 상태 변경 버튼이 숨겨집니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <FormField label="정책 버전 ID">
                <TextField placeholder="정책 버전 ID를 입력하세요" value={form.policy_id} onChange={(e) => setForm((v) => ({ ...v, policy_id: e.target.value }))} />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="실행 구분">
                  <SelectField value={form.run_type} onChange={(e) => setForm((v) => ({ ...v, run_type: e.target.value }))}>
                    {["DAILY_REWARD", "DIRECT_REFERRAL", "RANK_QUALIFICATION", "RANK_BONUS", "CONTRIBUTION", "SIDECAR"].map((item) => (
                      <option key={item} value={item}>{getDisplayLabel(item)}</option>
                    ))}
                  </SelectField>
                </FormField>
                <FormField label="실행일">
                  <TextField type="date" value={form.run_date} onChange={(e) => setForm((v) => ({ ...v, run_date: e.target.value }))} />
                </FormField>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="계산 실행 ID" value={<CopyableValue label="계산 실행 ID" value={selected.id} textClassName="font-mono text-xs text-slate-400" />} className="sm:col-span-2" />
                <DetailItem label="실행 구분" value={getDisplayLabel(selected.run_type)} />
                <DetailItem label="정책 버전" value={<CopyableValue label="정책 버전 ID" value={selected.policy_version_id} textClassName="font-mono text-xs text-slate-400" />} />
              </div>
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
                <FormField label="실패 사유">
                  <TextField placeholder="실패 사유를 입력하세요" value={failReason} onChange={(e) => setFailReason(e.target.value)} />
                </FormField>
              </div>
            ) : null}
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-200">정산 내역</div>
                <div className="text-xs text-slate-500">총 {settlementTotal}건</div>
              </div>
              <div className="hidden md:block">
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
                          <td className="max-w-[220px]"><CopyableValue label="회원 ID" value={item.account_id} textClassName="font-mono text-xs text-slate-400" /></td>
                          <td className="tabular text-right">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
              </div>
              <div className="space-y-3 md:hidden">
                {settlements.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-100">{item.settlement_type}</div>
                        <CopyableValue label="회원 ID" value={item.account_id} textClassName="mt-1 font-mono text-xs text-slate-400" />
                      </div>
                      <div className="tabular text-sm text-slate-100">{formatTokenAmount(item.amount_base, item.decimals, item.symbol)}</div>
                    </div>
                  </div>
                ))}
              </div>
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

function renderCalcRunLinkButton(
  run: CalcRun,
  onOpenRewards: (calcRunId: string) => void,
  onOpenRanks: (target: { calcRunId?: string | null; accountId?: string | null }) => void
) {
  if (run.run_type === "RANK_QUALIFICATION") {
    return (
      <Button
        variant="ghost"
        onClick={(event) => {
          event.stopPropagation();
          onOpenRanks({ calcRunId: run.id });
        }}
      >
        결과 보기
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={(event) => {
        event.stopPropagation();
        onOpenRewards(run.id);
      }}
    >
      보상 보기
    </Button>
  );
}
