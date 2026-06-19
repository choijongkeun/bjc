import type { WithdrawalType } from "@/lib/api";
import { getWithdrawalTypeLabel, getWithdrawalTypeTone } from "@/lib/withdrawals";
import { Badge } from "@/components/ui";

export function WithdrawalTypeBadge({ type }: { type: WithdrawalType }) {
  return <Badge tone={getWithdrawalTypeTone(type)}>{getWithdrawalTypeLabel(type)}</Badge>;
}
