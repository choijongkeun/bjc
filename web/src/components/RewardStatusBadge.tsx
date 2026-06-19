import type { RewardStatus } from "@/lib/api";
import { getRewardStatusLabel, getRewardStatusTone } from "@/lib/rewards";
import { StatusBadge } from "@/components/ui";

export function RewardStatusBadge({ status }: { status: RewardStatus }) {
  return <StatusBadge value={getRewardStatusLabel(status)} tone={getRewardStatusTone(status)} />;
}
