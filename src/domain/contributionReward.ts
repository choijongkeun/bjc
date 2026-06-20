import { assertIntString, assertNonNegativeIntString } from "./amount.js";
import { validationError } from "./errors.js";

export const CONTRIBUTION_FORMULA_VERSION = "contribution_v1";
export const CONTRIBUTION_ORGANIZATION_SCOPE = "REFERRAL";
export const CONTRIBUTION_POOL_RATE_BPS = "2000";
const BPS_DENOMINATOR = 10000n;

export type ContributionDepthBreakdown = {
  depth: number;
  weight_bps: string;
  volume_base: string;
  score_base: string;
};

export type ContributionComputation = {
  base_amount_base: string;
  account_score: string;
  reward_amount_base: string;
  depth_breakdown: ContributionDepthBreakdown[];
};

export type ContributionExistingRewardShape = {
  account_id: string;
  policy_version_id: string;
  amount_base: string;
  metadata_json: unknown;
};

export function assertContributionCalculationDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("calculation_date must be YYYY-MM-DD", { calculation_date: value });
  }
}

export function buildContributionSourceReference(input: {
  calculation_date: string;
  account_id: string;
}): string {
  return `calc:CONTRIBUTION:${input.calculation_date}:acct:${input.account_id}`;
}

export function calculateContributionPoolAmountBase(total_withdrawal_amount_base: string): string {
  assertNonNegativeIntString("total_withdrawal_amount_base", total_withdrawal_amount_base);
  return ((BigInt(total_withdrawal_amount_base) * BigInt(CONTRIBUTION_POOL_RATE_BPS)) / BPS_DENOMINATOR).toString();
}

export function calculateContributionScoreBase(volume_base: string, weight_bps: string): string {
  assertNonNegativeIntString("volume_base", volume_base);
  assertNonNegativeIntString("weight_bps", weight_bps);
  return ((BigInt(volume_base) * BigInt(weight_bps)) / BPS_DENOMINATOR).toString();
}

export function computeContributionReward(input: {
  depth_breakdown: Array<{ depth: number; weight_bps: string; volume_base: string }>;
  pool_amount_base: string;
  total_score: string;
}): ContributionComputation {
  assertNonNegativeIntString("pool_amount_base", input.pool_amount_base);
  assertNonNegativeIntString("total_score", input.total_score);

  let baseAmount = 0n;
  let accountScore = 0n;
  const breakdown: ContributionDepthBreakdown[] = [];

  for (const item of input.depth_breakdown) {
    if (!Number.isInteger(item.depth) || item.depth < 1 || item.depth > 45) {
      throw validationError("contribution depth must be between 1 and 45", { depth: item.depth });
    }
    const scoreBase = BigInt(calculateContributionScoreBase(item.volume_base, item.weight_bps));
    baseAmount += BigInt(item.volume_base);
    accountScore += scoreBase;
    breakdown.push({
      depth: item.depth,
      weight_bps: item.weight_bps,
      volume_base: item.volume_base,
      score_base: scoreBase.toString()
    });
  }

  const totalScore = BigInt(input.total_score);
  const rewardAmount =
    accountScore > 0n && totalScore > 0n
      ? ((BigInt(input.pool_amount_base) * accountScore) / totalScore).toString()
      : "0";

  return {
    base_amount_base: baseAmount.toString(),
    account_score: accountScore.toString(),
    reward_amount_base: rewardAmount,
    depth_breakdown: breakdown
  };
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value instanceof Uint8Array) {
    try {
      return toJsonObject(JSON.parse(Buffer.from(value).toString("utf8")) as unknown);
    } catch {
      return {};
    }
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      return toJsonObject(JSON.parse(value) as unknown);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function classifyExistingContributionReward(
  existing: ContributionExistingRewardShape,
  expected: {
    account_id: string;
    policy_version_id: string;
    amount_base: string;
    pool_amount_base: string;
    account_score: string;
    total_score: string;
    calculation_date: string;
  }
): "duplicate" | "conflict" {
  if (
    existing.account_id !== expected.account_id ||
    existing.policy_version_id !== expected.policy_version_id ||
    existing.amount_base !== expected.amount_base
  ) {
    return "conflict";
  }

  const metadata = toJsonObject(existing.metadata_json);
  const actualPool = typeof metadata.pool_amount_base === "string" ? metadata.pool_amount_base : null;
  const actualAccountScore = typeof metadata.account_score === "string" ? metadata.account_score : null;
  const actualTotalScore = typeof metadata.total_score === "string" ? metadata.total_score : null;
  const actualCalculationDate = typeof metadata.calculation_date === "string" ? metadata.calculation_date : null;

  if (
    actualPool !== expected.pool_amount_base ||
    actualAccountScore !== expected.account_score ||
    actualTotalScore !== expected.total_score ||
    actualCalculationDate !== expected.calculation_date
  ) {
    return "conflict";
  }

  return "duplicate";
}
