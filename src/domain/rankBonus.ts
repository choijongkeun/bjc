import type { RewardViewRow } from "../repos/accountRewardsRepo.js";

export const RANK_BONUS_FORMULA_VERSION = "rank_bonus_v1";
export const RANK_BONUS_ORGANIZATION_SCOPE = "binary_subtree_daily_reward_net_v1";

export type RankBonusComputation = {
  base_daily_reward_amount_base: string;
  effective_bonus_bps: string;
  rank_bonus_amount_base: string;
};

type RankBonusExistingShape = {
  rank_level: number;
  effective_bonus_bps: string;
  base_daily_reward_amount_base: string;
  qualification_result_id: string | null;
};

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value instanceof Uint8Array) {
    try {
      const parsed = JSON.parse(Buffer.from(value).toString("utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value);
}

function toDateOnlyString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRankBonusSourceReference(input: {
  calculation_date: string;
  account_id: string;
  rank_level: number;
}): string {
  return `rank_bonus:${input.calculation_date}:${input.account_id}:${input.rank_level}`;
}

export function calculateRankBonusAmountBase(input: {
  base_daily_reward_amount_base: string;
  effective_bonus_bps: string;
}): string {
  const base = BigInt(input.base_daily_reward_amount_base);
  const rate = BigInt(input.effective_bonus_bps);
  return ((base * rate) / 10000n).toString();
}

export function computeRankBonus(input: {
  base_daily_reward_amount_base: string;
  effective_bonus_bps: string;
}): RankBonusComputation {
  return {
    base_daily_reward_amount_base: input.base_daily_reward_amount_base,
    effective_bonus_bps: input.effective_bonus_bps,
    rank_bonus_amount_base: calculateRankBonusAmountBase(input)
  };
}

export function getRankBonusExistingShape(reward: RewardViewRow): RankBonusExistingShape {
  const metadata = toJsonObject(reward.metadata_json);
  return {
    rank_level: toNumberOrNull(metadata.rank_level) ?? 0,
    effective_bonus_bps: toStringOrNull(metadata.effective_bonus_bps) ?? "0",
    base_daily_reward_amount_base: toStringOrNull(metadata.base_daily_reward_amount_base) ?? "0",
    qualification_result_id: toStringOrNull(metadata.qualification_result_id)
  };
}

export function classifyExistingRankBonusReward(
  reward: RewardViewRow,
  expected: {
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
    rank_level: number;
    effective_bonus_bps: string;
    base_daily_reward_amount_base: string;
    rank_bonus_amount_base: string;
    qualification_result_id: string;
  }
): "duplicate" | "conflict" {
  const existing = getRankBonusExistingShape(reward);
  const identical =
    reward.account_id === expected.account_id &&
    reward.policy_version_id === expected.policy_version_id &&
    toDateOnlyString(reward.reward_date) === expected.calculation_date &&
    reward.reward_type === "RANK_BONUS" &&
    reward.amount_base === expected.rank_bonus_amount_base &&
    reward.account_staking_id === null &&
    reward.source_account_id === null &&
    reward.source_account_staking_id === null &&
    existing.rank_level === expected.rank_level &&
    existing.effective_bonus_bps === expected.effective_bonus_bps &&
    existing.base_daily_reward_amount_base === expected.base_daily_reward_amount_base &&
    existing.qualification_result_id === expected.qualification_result_id;

  return identical ? "duplicate" : "conflict";
}
