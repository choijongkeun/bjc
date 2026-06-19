import type { RewardStatus } from "@/lib/api";
import { getRewardStatusLabel, getRewardStatusTone } from "@/lib/rewards";
import { Badge } from "@/components/ui";

export function RewardStatusBadge({ status }: { status: RewardStatus }) {
  return <Badge tone={getRewardStatusTone(status)}>{getRewardStatusLabel(status)}</Badge>;
}
