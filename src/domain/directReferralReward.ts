import { validationError } from "./errors.js";
import { assertIntString } from "./amount.js";

const BPS_DENOMINATOR = 10000n;
const ASIA_SEOUL_OFFSET_HOURS = 9;

export type DirectReferralRewardDuplicateCheckInput = {
  account_id: string;
  source_account_id: string;
  source_account_staking_id: string;
  policy_version_id: string;
  amount_base: string;
  direct_referral_rate_bps: string;
};

export type DirectReferralExistingRewardShape = {
  account_id: string;
  source_account_id: string | null;
  source_account_staking_id: string | null;
  policy_version_id: string;
  amount_base: string;
  metadata_json: unknown;
};

export type DirectReferralSponsorEligibility =
  | "eligible"
  | "no_sponsor"
  | "inactive_sponsor";

export type DirectReferralBatchSummary = {
  target_count: number;
  created_count: number;
  no_sponsor_skip_count: number;
  inactive_sponsor_skip_count: number;
  zero_reward_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_reward_amount_base: string;
};

export function assertDateOnlyString(value: string, fieldName: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(`${fieldName} must be YYYY-MM-DD`, { [fieldName]: value });
  }
}

function toUtcSqlDateTime(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function parseSqlDateTimeAsUtc(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw validationError("invalid SQL datetime", { value: String(value) });
    }
    return value;
  }
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  const normalized = iso.endsWith("Z") ? iso : `${iso}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError("invalid SQL datetime", { value });
  }
  return parsed;
}

export function calculateDirectReferralRewardAmountBase(
  principal_amount_base: string,
  direct_referral_rate_bps: string
): string {
  assertIntString("principal_amount_base", principal_amount_base);
  assertIntString("direct_referral_rate_bps", direct_referral_rate_bps);

  const principal = BigInt(principal_amount_base);
  const bps = BigInt(direct_referral_rate_bps);

  if (principal < 0n) {
    throw validationError("principal_amount_base must be non-negative", { principal_amount_base });
  }
  if (bps < 0n) {
    throw validationError("direct_referral_rate_bps must be non-negative", { direct_referral_rate_bps });
  }

  return ((principal * bps) / BPS_DENOMINATOR).toString();
}

export function buildDirectReferralSourceReference(source_account_staking_id: string, sponsor_account_id: string): string {
  return `direct_referral:${source_account_staking_id}:${sponsor_account_id}`;
}

export function classifyDirectReferralSponsorEligibility(input: {
  sponsor_account_id: string | null;
  sponsor_role: string | null;
  sponsor_status: string | null;
  source_account_id: string;
}): DirectReferralSponsorEligibility {
  if (!input.sponsor_account_id) {
    return "no_sponsor";
  }
  if (input.sponsor_account_id === input.source_account_id) {
    return "inactive_sponsor";
  }
  if (input.sponsor_role !== "USER") {
    return "inactive_sponsor";
  }
  if (input.sponsor_status !== "ACTIVE") {
    return "inactive_sponsor";
  }
  return "eligible";
}

export function isEligibleDirectReferralSponsor(input: {
  sponsor_account_id: string | null;
  sponsor_role: string | null;
  sponsor_status: string | null;
  source_account_id: string;
}): boolean {
  return classifyDirectReferralSponsorEligibility(input) === "eligible";
}

export function isEligibleDirectReferralSourceStaking(input: {
  status: string;
  activated_at: string | null;
  cancel_requested_at?: string | null;
}): boolean {
  return input.status === "ACTIVE" && Boolean(input.activated_at) && !input.cancel_requested_at;
}

export function createEmptyDirectReferralBatchSummary(): DirectReferralBatchSummary {
  return {
    target_count: 0,
    created_count: 0,
    no_sponsor_skip_count: 0,
    inactive_sponsor_skip_count: 0,
    zero_reward_skip_count: 0,
    duplicate_skip_count: 0,
    conflict_count: 0,
    failed_count: 0,
    total_reward_amount_base: "0"
  };
}

export function addDirectReferralSummaryCount(
  summary: DirectReferralBatchSummary,
  outcome:
    | { type: "created"; amount_base: string }
    | { type: "no_sponsor" }
    | { type: "inactive_sponsor" }
    | { type: "zero_reward" }
    | { type: "duplicate" }
    | { type: "conflict" }
    | { type: "failed" }
): DirectReferralBatchSummary {
  const next = { ...summary };

  if (outcome.type === "created") {
    next.created_count += 1;
    next.total_reward_amount_base = (BigInt(next.total_reward_amount_base) + BigInt(outcome.amount_base)).toString();
    return next;
  }
  if (outcome.type === "no_sponsor") {
    next.no_sponsor_skip_count += 1;
    return next;
  }
  if (outcome.type === "inactive_sponsor") {
    next.inactive_sponsor_skip_count += 1;
    return next;
  }
  if (outcome.type === "zero_reward") {
    next.zero_reward_skip_count += 1;
    return next;
  }
  if (outcome.type === "duplicate") {
    next.duplicate_skip_count += 1;
    return next;
  }
  if (outcome.type === "conflict") {
    next.conflict_count += 1;
    return next;
  }

  next.failed_count += 1;
  return next;
}

export function getKstDateWindowUtc(input: { from: string; to: string }): {
  start: Date;
  endExclusive: Date;
  startSql: string;
  endExclusiveSql: string;
  run_date: string;
} {
  assertDateOnlyString(input.from, "activated_from");
  assertDateOnlyString(input.to, "activated_to");

  const fromParts = input.from.split("-").map(Number);
  const toParts = input.to.split("-").map(Number);
  const fromYear = fromParts[0] as number;
  const fromMonth = fromParts[1] as number;
  const fromDay = fromParts[2] as number;
  const toYear = toParts[0] as number;
  const toMonth = toParts[1] as number;
  const toDay = toParts[2] as number;

  const start = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay, -ASIA_SEOUL_OFFSET_HOURS, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(toYear, toMonth - 1, toDay + 1, -ASIA_SEOUL_OFFSET_HOURS, 0, 0, 0));

  if (!(start < endExclusive)) {
    throw validationError("activated_from must be on or before activated_to", {
      activated_from: input.from,
      activated_to: input.to
    });
  }

  return {
    start,
    endExclusive,
    startSql: toUtcSqlDateTime(start),
    endExclusiveSql: toUtcSqlDateTime(endExclusive),
    run_date: input.to
  };
}

export function getKstDateFromSqlDateTime(value: string | Date): string {
  const utcDate = parseSqlDateTimeAsUtc(value);
  const kstMillis = utcDate.getTime() + ASIA_SEOUL_OFFSET_HOURS * 60 * 60 * 1000;
  const kstDate = new Date(kstMillis);

  return [
    kstDate.getUTCFullYear(),
    String(kstDate.getUTCMonth() + 1).padStart(2, "0"),
    String(kstDate.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function classifyExistingDirectReferralReward(
  existing: DirectReferralExistingRewardShape,
  expected: DirectReferralRewardDuplicateCheckInput
): "duplicate" | "conflict" {
  const metadata =
    existing.metadata_json && typeof existing.metadata_json === "object" && !Array.isArray(existing.metadata_json)
      ? (existing.metadata_json as Record<string, unknown>)
      : {};

  const metadataRate = metadata.direct_referral_rate_bps;

  if (
    existing.account_id === expected.account_id &&
    existing.source_account_id === expected.source_account_id &&
    existing.source_account_staking_id === expected.source_account_staking_id &&
    existing.policy_version_id === expected.policy_version_id &&
    existing.amount_base === expected.amount_base &&
    String(metadataRate ?? "") === expected.direct_referral_rate_bps
  ) {
    return "duplicate";
  }

  return "conflict";
}
