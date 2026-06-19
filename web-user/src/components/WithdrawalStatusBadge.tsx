import type { WithdrawalStatus } from "@/lib/api";
import { getWithdrawalStatusLabel, getWithdrawalStatusTone } from "@/lib/withdrawals";
import { Badge } from "@/components/ui";

export function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  return <Badge tone={getWithdrawalStatusTone(status)}>{getWithdrawalStatusLabel(status)}</Badge>;
}
