import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { api, type CalcRunSummaryReportRow, type ReportSummary, type RewardByTypeReportRow, type RewardSummaryReport, type SessionRole } from "@/lib/api";
import { formatRewardAmountBase, REWARD_STATUS_OPTIONS, REWARD_TYPE_OPTIONS } from "@/lib/rewards";
import { Button, Card, FeedbackState, TableShell } from "@/components/ui";

const blank: ReportSummary = {
  total_stake_amount_base: "0",
  total_reward_amount_base: "0",
  total_fee_amount_base: "0",
  total_accounts: "0",
  total_ledger_events: "0",
  total_calc_runs: "0",
  finalized_calc_runs: "0",
};

export function ReportsTab({ actorId }: { actorId: string; role: SessionRole }) {
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

  const cards = [
    ["TVL(base)", summary.total_stake_amount_base],
    ["보상 총액(base)", summary.total_reward_amount_base],
    ["수수료 총액(base)", summary.total_fee_amount_base],
    ["계정 수", summary.total_accounts],
    ["원장 이벤트 수", summary.total_ledger_events],
    ["정산 실행 수", summary.total_calc_runs],
    ["확정 정산 수", summary.finalized_calc_runs],
  ];

  const rewardCards = rewardSummary
    ? [
        ["보상 발생액", formatRewardAmountBase(rewardSummary.reward_amount_base)],
        ["역분개 금액", rewardSummary.reversal_amount_base],
        ["순액", rewardSummary.net_reward_amount_base],
        ["출금 예약액", rewardSummary.reserved_withdrawal_amount_base],
        ["출금 완료액", rewardSummary.completed_withdrawal_amount_base],
        ["중복/충돌/실패", `${rewardSummary.duplicate_skip_count} / ${rewardSummary.conflict_count} / ${rewardSummary.failed_count}`],
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <input type="date" className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="from" value={filters.from} onChange={(e) => setFilters((v) => ({ ...v, from: e.target.value }))} />
            <input type="date" className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="to" value={filters.to} onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="policy_id" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
            <select className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={filters.reward_type} onChange={(e) => setFilters((v) => ({ ...v, reward_type: e.target.value }))}>
              <option value="">전체 reward_type</option>
              {REWARD_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={filters.reward_status} onChange={(e) => setFilters((v) => ({ ...v, reward_status: e.target.value }))}>
              <option value="">전체 reward status</option>
              {REWARD_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={filters.run_type} onChange={(e) => setFilters((v) => ({ ...v, run_type: e.target.value }))}>
              <option value="">전체 run_type</option>
              {["DAILY_REWARD", "DIRECT_REFERRAL", "RANK_QUALIFICATION", "RANK_BONUS", "CONTRIBUTION", "SIDECAR"].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <select className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={filters.run_status} onChange={(e) => setFilters((v) => ({ ...v, run_status: e.target.value }))}>
              <option value="">전체 run status</option>
              {["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "FINALIZED"].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void load()}>리포트 갱신</Button>
            <Button variant="secondary" onClick={() => void download("rewards")} disabled={downloading !== ""}>
              <Download className="mr-2 h-4 w-4" />
              rewards.csv
            </Button>
            <Button variant="secondary" onClick={() => void download("calc-runs")} disabled={downloading !== ""}>
              <Download className="mr-2 h-4 w-4" />
              calc-runs.csv
            </Button>
          </div>
        </div>
        {error ? <div className="mt-4"><FeedbackState title="오류" description={error} tone="error" /></div> : null}
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="overflow-hidden">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
            <div className="mt-4 text-3xl font-extrabold tabular text-slate-50">{value}</div>
            <div className="mt-2 text-xs text-slate-500">리포트 API 기준 원본 값</div>
          </Card>
        ))}
      </div>
      {rewardCards.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rewardCards.map(([label, value]) => (
            <Card key={label} className="overflow-hidden">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
              <div className="mt-4 text-2xl font-extrabold tabular text-slate-50">{value}</div>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <div className="mb-4 text-lg font-bold text-slate-50">Reward By Type</div>
          <TableShell height="max-h-[360px]">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>reward_type</th>
                  <th>amount</th>
                  <th>count</th>
                  <th>reversal</th>
                  <th>reserved</th>
                  <th>completed</th>
                </tr>
              </thead>
              <tbody>
                {rewardByType.map((row) => (
                  <tr key={row.reward_type}>
                    <td>{row.reward_type}</td>
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
        </Card>
        <Card>
          <div className="mb-4 text-lg font-bold text-slate-50">Calc Run Summary</div>
          <TableShell height="max-h-[360px]">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>run_type</th>
                  <th>runs</th>
                  <th>succeeded</th>
                  <th>failed</th>
                  <th>created</th>
                  <th>duplicate</th>
                  <th>conflict</th>
                </tr>
              </thead>
              <tbody>
                {calcRunSummary.map((row) => (
                  <tr key={row.run_type}>
                    <td>{row.run_type}</td>
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
        </Card>
      </div>
    </div>
  );
}
