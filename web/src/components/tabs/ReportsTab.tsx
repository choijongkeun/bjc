import { useEffect, useState } from "react";
import { api, type ReportSummary, type SessionRole } from "@/lib/api";
import { Button, Card, FeedbackState } from "@/components/ui";

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
  const [filters, setFilters] = useState({ from: "", to: "", policy_id: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const result = await api.getReportSummary(actorId, filters);
      setSummary(result);
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "리포트 요약을 불러오지 못했습니다.");
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

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-3 md:grid-cols-3">
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="from" value={filters.from} onChange={(e) => setFilters((v) => ({ ...v, from: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="to" value={filters.to} onChange={(e) => setFilters((v) => ({ ...v, to: e.target.value }))} />
            <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="policy_id" value={filters.policy_id} onChange={(e) => setFilters((v) => ({ ...v, policy_id: e.target.value }))} />
          </div>
          <Button onClick={() => void load()}>리포트 갱신</Button>
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
    </div>
  );
}
