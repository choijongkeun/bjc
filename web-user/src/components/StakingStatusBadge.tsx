import type { AccountStakingStatus } from "@/lib/staking";
import { Badge } from "@/components/ui";
import { getStakingStatusLabel, getStakingStatusTone } from "@/lib/staking";

export function StakingStatusBadge({ status }: { status: AccountStakingStatus }) {
  return <Badge tone={getStakingStatusTone(status)}>{getStakingStatusLabel(status)}</Badge>;
}
