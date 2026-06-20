import type { RankHistoryItem } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { Card, TableShell } from "@/components/ui";

export function RankHistoryTable({
  items,
}: {
  items: RankHistoryItem[];
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Rank History</div>
          <h3 className="mt-2 text-lg font-bold text-slate-50">최근 직급 이력</h3>
        </div>
        <div className="text-sm text-slate-400">총 {items.length}건</div>
      </div>
      <div className="mt-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">직급 이력이 없습니다.</div>
        ) : (
          <TableShell>
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">effective_date</th>
                  <th className="px-4 py-3">change_type</th>
                  <th className="px-4 py-3">previous</th>
                  <th className="px-4 py-3">calculated</th>
                  <th className="px-4 py-3">final</th>
                  <th className="px-4 py-3">direct active</th>
                  <th className="px-4 py-3">weak volume</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-800/80">
                    <td className="px-4 py-3">{item.effective_date}</td>
                    <td className="px-4 py-3">{item.change_type}</td>
                    <td className="px-4 py-3 tabular">{item.previous_rank_level ?? "-"}</td>
                    <td className="px-4 py-3 tabular">{item.calculated_rank_level ?? "-"}</td>
                    <td className="px-4 py-3 tabular">{item.final_rank_level ?? "-"}</td>
                    <td className="px-4 py-3 tabular">{item.direct_active_referral_count}</td>
                    <td className="px-4 py-3 tabular">{formatBaseAmount(item.weak_leg_volume_base, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </div>
    </Card>
  );
}
