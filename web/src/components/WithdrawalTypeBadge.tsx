import type { WithdrawalType } from "@/lib/api";
import { getWithdrawalTypeLabel, getWithdrawalTypeTone } from "@/lib/withdrawals";
import { StatusBadge } from "@/components/ui";

export function WithdrawalTypeBadge({ type }: { type: WithdrawalType }) {
  return <StatusBadge value={getWithdrawalTypeLabel(type)} tone={getWithdrawalTypeTone(type)} />;
}
