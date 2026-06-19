import { validationError } from "./errors.js";

export type WithdrawalType = "DAILY_REWARD" | "BONUS";

export type WithdrawalEligibleRewardType =
  | "DAILY_REWARD"
  | "DIRECT_REFERRAL"
  | "RANK_BONUS"
  | "CONTRIBUTION"
  | "SIDECAR";

export type RewardTypeWithReversal =
  | WithdrawalEligibleRewardType
  | "WITHDRAWAL_FEE"
  | "ADJUSTMENT"
  | "REVERSAL";

export function classifyRewardTypeToWithdrawalBucket(
  rewardType: RewardTypeWithReversal
): WithdrawalType | null {
  switch (rewardType) {
    case "DAILY_REWARD":
      return "DAILY_REWARD";
    case "DIRECT_REFERRAL":
    case "RANK_BONUS":
    case "CONTRIBUTION":
    case "SIDECAR":
      return "BONUS";
    case "WITHDRAWAL_FEE":
    case "ADJUSTMENT":
    case "REVERSAL":
      return null;
    default:
      return null;
  }
}

export function classifyReversalOriginalRewardTypeToWithdrawalBucket(
  originalRewardType: RewardTypeWithReversal | null | undefined
): WithdrawalType | null {
  if (!originalRewardType) {
    return null;
  }
  return classifyRewardTypeToWithdrawalBucket(originalRewardType);
}

export function isEligiblePositiveRewardForWithdrawalType(
  rewardType: RewardTypeWithReversal,
  withdrawalType: WithdrawalType
): boolean {
  return classifyRewardTypeToWithdrawalBucket(rewardType) === withdrawalType;
}

export function assertWithdrawalType(value: string): WithdrawalType {
  if (value !== "DAILY_REWARD" && value !== "BONUS") {
    throw validationError("invalid withdrawal_type", { withdrawal_type: value });
  }
  return value;
}
