import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { api, type CalcRunSummaryReportRow, type ReportSummary, type RewardByTypeReportRow, type RewardSummaryReport, type SessionRole } from "@/lib/api";
import { getDisplayLabel } from "@/lib/display";
import { formatRewardAmountBase, REWARD_STATUS_OPTIONS, REWARD_TYPE_OPTIONS } from "@/lib/rewards";
import { Button, Card, FeedbackState, FormField, SelectField, TableShell, TextField } from "@/components/ui";

const blank: ReportSummary = {
  total_stake_amount_base: "0",
  total_reward_amount_base: "0",
  total_fee_amount_base: "0",
  total_accounts: "0",
  total_ledger_events: "0",
  total_calc_runs: "0",
  finalized_calc_runs: "0",
};

export function ReportsTab({ actorId, role }: { actorId: string; role: SessionRole }) {
  const [summary, setSummary] = useState<ReportSummary>(blank);
  const [rewardSummary, setRewardSummary] = useState<RewardSummaryReport | null>(null);
  const [rewardByType, setRewardByType] = useState<RewardByTypeReportRow[]>([]);
  const [calcRunSummary, setCalcRunSummary] = useState<CalcRunSummaryReportRow[]>([]);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    policy_id: "",
    reward_type: "",
    reward_status: "",
    run_type: "",
    run_status: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"" | "rewards" | "calc-runs">("");

  async function load() {
    try {
      const [summaryResult, rewardSummaryResult, rewardByTypeResult, calcRunSummaryResult] = await Promise.all([
        api.getReportSummary(actorId, {
          from: filters.from || undefined,
          to: filters.to || undefined,
          policy_id: filters.policy_id || undefined,
        }),
        api.getRewardSummaryReport(actorId, {
          date_from: filters.from || undefined,
          date_to: filters.to || undefined,
          policy_version_id: filters.policy_id || undefined,
          reward_type: (filters.reward_type || undefined) as any,
          status: (filters.reward_status || undefined) as any,
        }),
        api.getRewardByTypeReport(actorId, {
          date_from: filters.from || undefined,
          date_to: filters.to || undefined,
          policy_version_id: filters.policy_id || undefined,
          reward_type: (filters.reward_type || undefined) as any,
          status: (filters.reward_status || undefined) as any,
        }),
        api.getCalcRunSummaryReport(actorId, {
          date_from: filters.from || undefined,
          date_to: filters.to || undefined,
          policy_version_id: filters.policy_id || undefined,
          run_type: (filters.run_type || undefined) as any,
          status: (filters.run_status || undefined) as any,
        }),
      ]);
      setSummary(summaryResult);
      setRewardSummary(rewardSummaryResult);
      setRewardByType(rewardByTypeResult.items);
      setCalcRunSummary(calcRunSummaryResult.items);
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "리포트 요약을 불러오지 못했습니다.");
    }
  }

  async function download(kind: "rewards" | "calc-runs") {
    try {
      setDownloading(kind);
      const blob =
        kind === "rewards"
          ? await api.downloadAdminRewardsCsv(actorId, {
              date_from: filters.from || undefined,
              date_to: filters.to || undefined,
              policy_version_id: filters.policy_id || undefined,
              reward_type: (filters.reward_type || undefined) as any,
              status: (filters.reward_status || undefined) as any,
            })
          : await api.downloadAdminCalcRunsCsv(actorId, {
              date_from: filters.from || undefined,
              date_to: filters.to || undefined,
              policy_version_id: filters.policy_id || undefined,
              run_type: (filters.run_type || undefined) as any,
              status: (filters.run_status || undefined) as any,
            });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = kind === "rewards" ? "rewards.csv" : "calc-runs.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError: any) {
      setError(downloadError.message ?? "CSV 다운로드에 실패했습니다.");
    } finally {
      setDownloading("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const cards = useMemo(
    () => [
      ["총 스테이킹 원금", summary.total_stake_amount_base],
      ["총 보상 금액", summary.total_reward_amount_base],
      ["총 수수료 금액", summary.total_fee_amount_base],
      ["회원 수", summary.total_accounts],
      ["원장 이벤트 수", summary.total_ledger_events],
      ["계산 실행 수", summary.total_calc_runs],
      ["확정 완료 건수", summary.finalized_calc_runs],
    ],
    [summary]
  );

  const rewardCards = useMemo(
    () =>
      rewardSummary
        ? [
            ["보상 발생액", formatRewardAmountBase(rewardSummary.reward_amount_base)],
            ["취소 금액", rewardSummary.reversal_amount_base],
            ["순보상 금액", rewardSummary.net_reward_amount_base],
            ["출금 예약 금액", rewardSummary.reserved_withdrawal_amount_base],
            ["출금 완료 금액", rewardSummary.completed_withdrawal_amount_base],
            ["중복/충돌/실패", `${rewardSummary.duplicate_skip_count} / ${rewardSummary.conflict_count} / ${rewardSummary.failed_count}`],
          ]
        : [],
    [rewardSummary]
  );

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid gap-4 xl:grid-cols-[1fr,auto]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FormField label="시작일">
              <TextField type="date" value={filters.from} onChange={(e) => setFilters((v) => ({ ...v, from: e.target.value }))} />
            </FormField>
            <FormField label="종료일">
              <TextField type="date" value={filters.to} onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))} />
            </FormField>
            <FormField label="정책 ID">
              <TextField placeholder="정책 ID를 입력하세요" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
            </FormField>
            <FormField label="보상 구분">
              <SelectField value={filters.reward_type} onChange={(e) => setFilters((v) => ({ ...v, reward_type: e.target.value }))}>
                <option value="">전체 보상 구분</option>
                {REWARD_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>
            </FormField>
            <FormField label="보상 상태">
              <SelectField value={filters.reward_status} onChange={(e) => setFilters((v) => ({ ...v, reward_status: e.target.value }))}>
                <option value="">전체 보상 상태</option>
                {REWARD_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </SelectField>
            </FormField>
            <FormField label="실행 구분">
              <SelectField value={filters.run_type} onChange={(e) => setFilters((v) => ({ ...v, run_type: e.target.value }))}>
                <option value="">전체 실행 구분</option>
                {["DAILY_REWARD", "DIRECT_REFERRAL", "RANK_QUALIFICATION", "RANK_BONUS", "CONTRIBUTION", "SIDECAR"].map((item) => (
                  <option key={item} value={item}>{getDisplayLabel(item)}</option>
                ))}
              </SelectField>
            </FormField>
            <FormField label="실행 상태">
              <SelectField value={filters.run_status} onChange={(e) => setFilters((v) => ({ ...v, run_status: e.target.value }))}>
                <option value="">전체 실행 상태</option>
                {["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "FINALIZED"].map((item) => (
                  <option key={item} value={item}>{getDisplayLabel(item)}</option>
                ))}
              </SelectField>
            </FormField>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end xl:self-end">
            <Button className="flex-1 sm:flex-none" onClick={() => void load()}>조회</Button>
            {role === "ADMIN" ? (
              <Button className="flex-1 sm:flex-none" variant="secondary" onClick={() => void download("rewards")} disabled={downloading !== ""}>
                <Download className="mr-2 h-4 w-4" />
                보상 CSV 다운로드
              </Button>
            ) : null}
            {role === "ADMIN" ? (
              <Button className="flex-1 sm:flex-none" variant="secondary" onClick={() => void download("calc-runs")} disabled={downloading !== ""}>
                <Download className="mr-2 h-4 w-4" />
                계산 실행 CSV 다운로드
              </Button>
            ) : null}
          </div>
        </div>
        {error ? <div className="mt-4"><FeedbackState title="오류" description={error} tone="error" /></div> : null}
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="overflow-hidden">
            <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
            <div className="mt-4 text-3xl font-extrabold tabular text-slate-50">{value}</div>
          </Card>
        ))}
      </div>
      {rewardCards.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rewardCards.map(([label, value]) => (
            <Card key={label} className="overflow-hidden">
              <div className="text-xs tracking-[0.16em] text-slate-500">{label}</div>
              <div className="mt-4 text-2xl font-extrabold tabular text-slate-50">{value}</div>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="mb-4 text-lg font-bold text-slate-50">보상 구분별 집계</div>
          <div className="hidden md:block">
            <TableShell height="max-h-[360px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>보상 구분</th>
                    <th>금액</th>
                    <th>건수</th>
                    <th>취소 금액</th>
                    <th>출금 예약액</th>
                    <th>출금 완료액</th>
                  </tr>
                </thead>
                <tbody>
                  {rewardByType.map((row) => (
                    <tr key={row.reward_type}>
                      <td>{getDisplayLabel(row.reward_type)}</td>
                      <td className="tabular text-right">{row.reward_amount_base}</td>
                      <td className="tabular text-right">{row.reward_count}</td>
                      <td className="tabular text-right">{row.reversal_amount_base}</td>
                      <td className="tabular text-right">{row.reserved_withdrawal_amount_base}</td>
                      <td className="tabular text-right">{row.completed_withdrawal_amount_base}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </div>
          <div className="space-y-3 md:hidden">
            {rewardByType.map((row) => (
              <div key={row.reward_type} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">{getDisplayLabel(row.reward_type)}</div>
                  <div className="tabular text-sm text-slate-400">{row.reward_count}건</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-slate-500">금액</div><div className="mt-1 tabular text-slate-100">{row.reward_amount_base}</div></div>
                  <div><div className="text-xs text-slate-500">취소 금액</div><div className="mt-1 tabular text-slate-100">{row.reversal_amount_base}</div></div>
                  <div><div className="text-xs text-slate-500">출금 예약액</div><div className="mt-1 tabular text-slate-100">{row.reserved_withdrawal_amount_base}</div></div>
                  <div><div className="text-xs text-slate-500">출금 완료액</div><div className="mt-1 tabular text-slate-100">{row.completed_withdrawal_amount_base}</div></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <div className="mb-4 text-lg font-bold text-slate-50">계산 실행 집계</div>
          <div className="hidden md:block">
            <TableShell height="max-h-[360px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>실행 구분</th>
                    <th>실행 수</th>
                    <th>성공</th>
                    <th>실패</th>
                    <th>생성</th>
                    <th>중복</th>
                    <th>충돌</th>
                  </tr>
                </thead>
                <tbody>
                  {calcRunSummary.map((row) => (
                    <tr key={row.run_type}>
                      <td>{getDisplayLabel(row.run_type)}</td>
                      <td className="tabular text-right">{row.total_run_count}</td>
                      <td className="tabular text-right">{row.succeeded_run_count}</td>
                      <td className="tabular text-right">{row.failed_run_count}</td>
                      <td className="tabular text-right">{row.created_count}</td>
                      <td className="tabular text-right">{row.duplicate_skip_count}</td>
                      <td className="tabular text-right">{row.conflict_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </div>
          <div className="space-y-3 md:hidden">
            {calcRunSummary.map((row) => (
              <div key={row.run_type} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="text-sm font-semibold text-slate-100">{getDisplayLabel(row.run_type)}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-xs text-slate-500">실행 수</div><div className="mt-1 tabular text-slate-100">{row.total_run_count}</div></div>
                  <div><div className="text-xs text-slate-500">성공</div><div className="mt-1 tabular text-slate-100">{row.succeeded_run_count}</div></div>
                  <div><div className="text-xs text-slate-500">실패</div><div className="mt-1 tabular text-slate-100">{row.failed_run_count}</div></div>
                  <div><div className="text-xs text-slate-500">생성</div><div className="mt-1 tabular text-slate-100">{row.created_count}</div></div>
                  <div><div className="text-xs text-slate-500">중복</div><div className="mt-1 tabular text-slate-100">{row.duplicate_skip_count}</div></div>
                  <div><div className="text-xs text-slate-500">충돌</div><div className="mt-1 tabular text-slate-100">{row.conflict_count}</div></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
