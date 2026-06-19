export type PolicyVersionStatus = "DRAFT" | "ACTIVE" | "RETIRED";

export type SidecarStatus = "NORMAL" | "SIDECAR_ACTIVE" | "RELEASED";

export type WithdrawalSourceType = "DAILY_REWARD" | "BONUS";

export type WithdrawalFeeMode = "DEDUCT_FROM_WITHDRAWAL" | "PREPAY_BJC";

export type SettlementType =
  | "DAILY_REWARD"
  | "DIRECT_REFERRAL"
  | "RANK_BONUS"
  | "CONTRIBUTION"
  | "WITHDRAWAL_FEE"
  | "WITHDRAWAL_FREEZE"
  | "WITHDRAWAL_RELEASE"
  | "ADJUSTMENT";

export type LedgerEventType =
  | "STAKE"
  | "UNSTAKE"
  | "STAKING_REQUESTED"
  | "STAKING_PRINCIPAL_LOCKED"
  | "STAKING_ACTIVATED"
  | "STAKING_CANCELLED"
  | "STAKING_PRINCIPAL_RELEASED"
  | "STAKING_MATURED"
  | "DAILY_REWARD_ACCRUAL"
  | "DAILY_REWARD_PAYOUT"
  | "DIRECT_REFERRAL_BONUS"
  | "RANK_BONUS"
  | "CONTRIBUTION_BONUS"
  | "WITHDRAWAL_REQUEST"
  | "WITHDRAWAL_FEE"
  | "WITHDRAWAL_RELEASE"
  | "WITHDRAWAL_FREEZE"
  | "WITHDRAWAL_UNFREEZE"
  | "WITHDRAWAL_REQUESTED"
  | "WITHDRAWAL_RESERVED"
  | "WITHDRAWAL_APPROVED"
  | "WITHDRAWAL_PROCESSING"
  | "WITHDRAWAL_COMPLETED"
  | "WITHDRAWAL_REJECTED"
  | "WITHDRAWAL_FAILED"
  | "WITHDRAWAL_CANCELLED"
  | "WITHDRAWAL_FEE_CHARGED"
  | "SIDECAR_TRIGGER"
  | "SIDECAR_RELEASE"
  | "ADJUSTMENT";

export type Amount = {
  amount_base: string;
  decimals: number;
  symbol: string;
};

export type LedgerEventInput = {
  account_id: string;
  product_id: string;
  policy_version_id: string;
  calc_run_id?: string | null;
  event_time: string;
  event_type: LedgerEventType;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string;
  related_account_id?: string | null;
  meta?: Record<string, unknown>;
};
