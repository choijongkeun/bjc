import type { RewardType } from "@/lib/api";
import { getRewardTypeLabel, getRewardTypeTone } from "@/lib/rewards";
import { StatusBadge } from "@/components/ui";

export function RewardTypeBadge({ type }: { type: RewardType }) {
  return <StatusBadge value={getRewardTypeLabel(type)} tone={getRewardTypeTone(type)} />;
}
