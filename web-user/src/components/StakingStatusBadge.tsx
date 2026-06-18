import type { AccountStakingStatus } from "@/lib/staking";
import { Badge } from "@/components/ui";
import { getStakingStatusTone } from "@/lib/staking";

const statusLabelMap: Record<AccountStakingStatus, string> = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  CANCEL_REQUESTED: "CANCEL_REQUESTED",
  CANCELLED: "CANCELLED",
  MATURED: "MATURED",
  CLOSED: "CLOSED",
};

export function StakingStatusBadge({ status }: { status: AccountStakingStatus }) {
  return <Badge tone={getStakingStatusTone(status)}>{statusLabelMap[status]}</Badge>;
}
