import type { RewardType } from "@/lib/api";
import { getRewardTypeLabel, getRewardTypeTone } from "@/lib/rewards";
import { Badge } from "@/components/ui";

export function RewardTypeBadge({ type }: { type: RewardType }) {
  return <Badge tone={getRewardTypeTone(type)}>{getRewardTypeLabel(type)}</Badge>;
}
