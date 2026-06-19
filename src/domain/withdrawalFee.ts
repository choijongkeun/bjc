import { assertIntString } from "./amount.js";
import { validationError } from "./errors.js";

export const WITHDRAWAL_FEE_BPS_DENOMINATOR = 10000n;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WithdrawalFeeRuleLike = {
  schedule_days: number;
  fee_bps: string;
  fee_mode: "DEDUCT_FROM_WITHDRAWAL" | "PREPAY_BJC";
};

export function toAmountBigInt(name: string, value: string): bigint {
  assertIntString(name, value);
  return BigInt(value);
}

export function calculateWithdrawalFeeAmountBase(amountBase: string, feeBps: string): string {
  const amount = toAmountBigInt("amount_base", amountBase);
  const bps = toAmountBigInt("fee_bps", feeBps);
  if (amount < 0n) {
    throw validationError("amount_base must be non-negative", { amount_base: amountBase });
  }
  if (bps < 0n || bps > WITHDRAWAL_FEE_BPS_DENOMINATOR) {
    throw validationError("fee_bps must be between 0 and 10000", { fee_bps: feeBps });
  }
  return ((amount * bps) / WITHDRAWAL_FEE_BPS_DENOMINATOR).toString();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toKstDateOnly(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError("invalid datetime for KST conversion", { value: String(value) });
  }
  const kst = new Date(parsed.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
}

export function parseDateOnlyToEpochDay(dateOnly: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) {
    throw validationError("invalid date format", { value: dateOnly });
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function calculateHoldingDays(confirmedAt: Date | string, requestedKstDate: string): number {
  const confirmedKstDate = toKstDateOnly(confirmedAt);
  return parseDateOnlyToEpochDay(requestedKstDate) - parseDateOnlyToEpochDay(confirmedKstDate);
}

export function selectApplicableWithdrawalFeeRule<T extends WithdrawalFeeRuleLike>(
  rules: T[],
  holdingDays: number
): T | null {
  if (holdingDays < 0) {
    throw validationError("holding_days must be non-negative", { holding_days: holdingDays });
  }
  let selected: T | null = null;
  for (const rule of rules) {
    if (rule.schedule_days <= holdingDays && (!selected || rule.schedule_days > selected.schedule_days)) {
      selected = rule;
    }
  }
  return selected;
}
