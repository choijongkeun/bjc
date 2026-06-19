import type { WithdrawalStatus } from "@/lib/api";
import { getWithdrawalStatusLabel, getWithdrawalStatusTone } from "@/lib/withdrawals";
import { StatusBadge } from "@/components/ui";

export function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  return <StatusBadge value={getWithdrawalStatusLabel(status)} tone={getWithdrawalStatusTone(status)} />;
}
