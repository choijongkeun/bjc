import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertIntString } from "../domain/amount.js";
import { AppError, conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import type { WithdrawalType } from "../domain/rewardBucket.js";
import { calculateHoldingDays, calculateWithdrawalFeeAmountBase, selectApplicableWithdrawalFeeRule, toAmountBigInt, toKstDateOnly } from "../domain/withdrawalFee.js";
import {
  assertCanApproveWithdrawal,
  assertCanCompleteWithdrawal,
  assertCanFailWithdrawal,
  assertCanMarkProcessingWithdrawal,
  assertCanRejectWithdrawal,
  assertCanUserCancelWithdrawal,
  type RewardWithdrawalStatus
} from "../domain/withdrawalStatus.js";
import { getAccountAuthById, getAccountByIdForUpdate } from "../repos/accountsRepo.js";
import { getMyRewardSummary } from "../repos/accountRewardsRepo.js";
import { insertAdminAuditLog, listAdminAuditLogs } from "../repos/auditLogRepo.js";
import { insertLedgerEvent, listLedgerEventsByReferenceIds } from "../repos/ledgerEventsRepo.js";
import {
  aggregateAccountWithdrawalBalances,
  getAllocatedTotalsByRewardIds,
  insertAllocations,
  listActiveAllocationRowsByRewardIdsForUpdate,
  listActiveWithdrawalFeeRules,
  listAllocationsByWithdrawalId,
  listAllocationsByWithdrawalIdForUpdate,
  listEligibleRewards,
  listEligibleRewardsForUpdate,
  type EligibleRewardWithdrawalRow,
  type RewardWithdrawalAllocationViewRow,
  updateAllocationStatus
} from "../repos/rewardWithdrawalAllocationsRepo.js";
import {
  countAdminWithdrawals,
  countMyWithdrawals,
  findByAccountIdempotencyKey,
  getLedgerProductContextByPolicyVersion,
  getSummary,
  getWithdrawalById,
  getWithdrawalByIdForUpdate,
  insertWithdrawal,
  listAdminWithdrawals,
  listMyWithdrawals,
  type RewardWithdrawalRow,
  type RewardWithdrawalSort,
  type RewardWithdrawalViewRow,
  updateStatusAndTimestamps
} from "../repos/rewardWithdrawalsRepo.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

type PreviewAllocation = {
  reward_id: string;
  reward_type: string;
  reward_date: string;
  confirmed_at: string | null;
  allocated_amount_base: string;
  holding_days: number;
  fee_schedule_days: number;
  fee_rate_bps: string;
  fee_amount_base: string;
  net_amount_base: string;
  fee_policy_version_id: string;
  product_id: string | null;
  product_symbol: string | null;
  product_decimals: number | null;
};

export type PreviewAllocationCandidate = {
  id: string;
  reward_type: string;
  reward_date: string | Date;
  confirmed_at: string | Date | null;
  available_at: string | Date | null;
  amount_base: string;
  policy_version_id: string;
  active_allocated_amount_base: string;
  fee_rules: Array<{
    schedule_days: number;
    fee_bps: string;
    fee_mode: "DEDUCT_FROM_WITHDRAWAL" | "PREPAY_BJC";
  }>;
  staking_product_id: string | null;
  product_symbol: string | null;
  product_decimals: number | null;
};

type PreviewBuildResult = {
  fee_policy_version_id: string;
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  fee_amount_base: string;
  net_amount_base: string;
  available_amount_base: string;
  requested_kst_date: string;
  allocations: PreviewAllocation[];
  ledger_product: {
    product_id: string;
    symbol: string;
    decimals: number;
  };
};

type CreateWithdrawalInput = {
  account_id: string;
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  idempotency_key: string;
  wallet_address?: string | null;
  network?: string | null;
};

type AdminTransitionInput = {
  actor_account_id: string;
  withdrawal_id: string;
};

const WITHDRAWAL_REFERENCE_PREFIXES = [
  "request",
  "reserve",
  "approve",
  "processing",
  "complete",
  "reject",
  "fail",
  "cancel",
  "fee"
] as const;

function toApiDateTime(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function toApiDateOnly(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toBigIntAmountOrThrow(name: string, value: string): bigint {
  assertIntString(name, value);
  return BigInt(value);
}

function addAmountStrings(values: string[]): string {
  return values.reduce((sum, value) => sum + toBigIntAmountOrThrow("amount_base", value), 0n).toString();
}

function subtractAmounts(base: string, ...subtractors: string[]): string {
  let result = toBigIntAmountOrThrow("base", base);
  for (const value of subtractors) {
    result -= toBigIntAmountOrThrow("amount_base", value);
  }
  return result.toString();
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function toSortableTime(value: unknown): number {
  if (value === null || value === undefined) {
    return Number.NEGATIVE_INFINITY;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = new Date(String(value));
  const time = parsed.getTime();
  if (!Number.isNaN(time)) {
    return time;
  }
  return Number.NEGATIVE_INFINITY;
}

function toSortableDateOnly(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value ?? "");
}

function assertPositiveIntegerString(name: string, value: string): string {
  assertIntString(name, value);
  if (BigInt(value) <= 0n) {
    throw validationError(`${name} must be a positive integer string`, { [name]: value });
  }
  return value;
}

function assertTrimmedString(name: string, value: string | null | undefined, options?: { required?: boolean; maxLength?: number }): string | null {
  if (value === null || value === undefined) {
    if (options?.required) {
      throw validationError(`${name} is required`, { field: name });
    }
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (options?.required) {
      throw validationError(`${name} is required`, { field: name });
    }
    return null;
  }
  if (options?.maxLength && trimmed.length > options.maxLength) {
    throw validationError(`${name} must be ${options.maxLength} characters or fewer`, {
      field: name,
      length: trimmed.length
    });
  }
  return trimmed;
}

function assertActiveAccount(account: { id: string; status: string }): void {
  if (account.status !== "ACTIVE") {
    throw forbidden("account is not active", { account_id: account.id, status: account.status });
  }
}

function assertNonNegativeAvailable(label: string, value: string): void {
  if (toBigIntAmountOrThrow(label, value) < 0n) {
    throw new AppError("INTERNAL", "withdrawal balance consistency error", 500, {
      bucket: label,
      available_amount_base: value
    });
  }
}

export function sortEligibleRewardsFifo(rows: EligibleRewardWithdrawalRow[]): EligibleRewardWithdrawalRow[] {
  return [...rows].sort((a, b) => {
    const confirmedCompare = toSortableTime(a.confirmed_at) - toSortableTime(b.confirmed_at);
    if (confirmedCompare !== 0) return confirmedCompare;
    const rewardDateCompare = toSortableDateOnly(a.reward_date).localeCompare(toSortableDateOnly(b.reward_date));
    if (rewardDateCompare !== 0) return rewardDateCompare;
    return a.id.localeCompare(b.id);
  });
}

export function evaluateCreateWithdrawalIdempotency(
  existing: Pick<RewardWithdrawalRow | RewardWithdrawalViewRow, "withdrawal_type" | "requested_amount_base" | "wallet_address" | "network">,
  next: Pick<CreateWithdrawalInput, "withdrawal_type" | "requested_amount_base" | "wallet_address" | "network">
): "match" | "conflict" {
  if (
    existing.withdrawal_type === next.withdrawal_type &&
    existing.requested_amount_base === next.requested_amount_base &&
    (existing.wallet_address ?? null) === (next.wallet_address ?? null) &&
    (existing.network ?? null) === (next.network ?? null)
  ) {
    return "match";
  }
  return "conflict";
}

export function maskWalletAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 10) {
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }
  return `${value.slice(0, 6)}****${value.slice(-4)}`;
}

function buildReferenceId(kind: (typeof WITHDRAWAL_REFERENCE_PREFIXES)[number], withdrawalId: string): string {
  return `withdrawal.${kind}:${withdrawalId}`;
}

function ensureReservedAllocations(rows: Array<{ status: string }>): void {
  const invalid = rows.find((row) => row.status !== "RESERVED");
  if (invalid) {
    throw conflictError("withdrawal allocations are not in RESERVED status", { allocation_status: invalid.status });
  }
}

export function assertWithdrawalOwnedByAccount(withdrawalAccountId: string, requesterAccountId: string, withdrawalId: string): void {
  if (withdrawalAccountId !== requesterAccountId) {
    throw notFound("withdrawal not found", { withdrawal_id: withdrawalId });
  }
}

export function buildWithdrawalBalanceResponse(aggregate: {
  daily_confirmed_amount_base: string;
  daily_reserved_amount_base: string;
  daily_completed_amount_base: string;
  bonus_confirmed_amount_base: string;
  bonus_reserved_amount_base: string;
  bonus_completed_amount_base: string;
  total_reserved_amount_base: string;
  total_completed_amount_base: string;
}) {
  const dailyAvailable = subtractAmounts(
    aggregate.daily_confirmed_amount_base,
    aggregate.daily_reserved_amount_base,
    aggregate.daily_completed_amount_base
  );
  const bonusAvailable = subtractAmounts(
    aggregate.bonus_confirmed_amount_base,
    aggregate.bonus_reserved_amount_base,
    aggregate.bonus_completed_amount_base
  );
  assertNonNegativeAvailable("daily_reward", dailyAvailable);
  assertNonNegativeAvailable("bonus", bonusAvailable);
  return {
    daily_reward: {
      confirmed_amount_base: aggregate.daily_confirmed_amount_base,
      reserved_amount_base: aggregate.daily_reserved_amount_base,
      completed_amount_base: aggregate.daily_completed_amount_base,
      available_amount_base: dailyAvailable
    },
    bonus: {
      confirmed_amount_base: aggregate.bonus_confirmed_amount_base,
      reserved_amount_base: aggregate.bonus_reserved_amount_base,
      completed_amount_base: aggregate.bonus_completed_amount_base,
      available_amount_base: bonusAvailable
    },
    total: {
      reserved_amount_base: aggregate.total_reserved_amount_base,
      completed_amount_base: aggregate.total_completed_amount_base
    }
  };
}

export function buildPreviewAllocationsFromCandidates(input: {
  candidates: PreviewAllocationCandidate[];
  requested_amount_base: string;
  requested_kst_date: string;
}): { allocations: PreviewAllocation[]; remaining_amount_base: string } {
  let remaining = toBigIntAmountOrThrow("requested_amount_base", input.requested_amount_base);
  const allocations: PreviewAllocation[] = [];

  for (const reward of input.candidates) {
    if (remaining <= 0n) {
      break;
    }

    const rewardRemaining =
      toBigIntAmountOrThrow("amount_base", reward.amount_base) -
      toBigIntAmountOrThrow("active_amount_base", reward.active_allocated_amount_base);
    if (rewardRemaining <= 0n) {
      continue;
    }

    const holdingDays = calculateHoldingDays(
      reward.confirmed_at ?? reward.available_at ?? input.requested_kst_date,
      input.requested_kst_date
    );
    const feeRule = selectApplicableWithdrawalFeeRule(reward.fee_rules, holdingDays);
    if (!feeRule) {
      continue;
    }
    if (feeRule.fee_mode !== "DEDUCT_FROM_WITHDRAWAL") {
      throw validationError("PREPAY_BJC fee mode is not implemented in V1", {
        fee_mode: feeRule.fee_mode,
        policy_version_id: reward.policy_version_id
      });
    }

    const allocated = minBigInt(rewardRemaining, remaining).toString();
    const feeAmountBase = calculateWithdrawalFeeAmountBase(allocated, feeRule.fee_bps);
    const netAmountBase =
      (toBigIntAmountOrThrow("allocated_amount_base", allocated) -
        toBigIntAmountOrThrow("fee_amount_base", feeAmountBase)).toString();

    allocations.push({
      reward_id: reward.id,
      reward_type: reward.reward_type,
      reward_date: toSortableDateOnly(reward.reward_date),
      confirmed_at: reward.confirmed_at instanceof Date ? reward.confirmed_at.toISOString() : reward.confirmed_at,
      allocated_amount_base: allocated,
      holding_days: holdingDays,
      fee_schedule_days: feeRule.schedule_days,
      fee_rate_bps: feeRule.fee_bps,
      fee_amount_base: feeAmountBase,
      net_amount_base: netAmountBase,
      fee_policy_version_id: reward.policy_version_id,
      product_id: reward.staking_product_id,
      product_symbol: reward.product_symbol,
      product_decimals: reward.product_decimals
    });
    remaining -= toBigIntAmountOrThrow("allocated_amount_base", allocated);
  }

  return {
    allocations,
    remaining_amount_base: remaining.toString()
  };
}

function toAllocationResponse(row: RewardWithdrawalAllocationViewRow) {
  return {
    id: row.id,
    withdrawal_id: row.withdrawal_id,
    reward_id: row.reward_id,
    allocated_amount_base: row.allocated_amount_base,
    fee_policy_version_id: row.fee_policy_version_id,
    fee_schedule_days_snapshot: row.fee_schedule_days_snapshot,
    fee_rate_snapshot: row.fee_rate_snapshot,
    fee_mode_snapshot: row.fee_mode_snapshot,
    holding_days_snapshot: row.holding_days_snapshot,
    fee_amount_base: row.fee_amount_base,
    net_amount_base: row.net_amount_base,
    status: row.status,
    reserved_at: toApiDateTime(row.reserved_at),
    consumed_at: toApiDateTime(row.consumed_at),
    released_at: toApiDateTime(row.released_at),
    created_at: toApiDateTime(row.created_at),
    reward: {
      id: row.reward_id,
      account_id: row.reward_account_id,
      account_staking_id: row.reward_account_staking_id,
      policy_version_id: row.reward_policy_version_id,
      reward_type: row.reward_type,
      reward_date: toApiDateOnly(row.reward_date),
      amount_base: row.reward_amount_base,
      status: row.reward_status,
      source_reference: row.reward_source_reference,
      available_at: toApiDateTime(row.reward_available_at),
      confirmed_at: toApiDateTime(row.reward_confirmed_at),
      reversed_at: toApiDateTime(row.reward_reversed_at)
    }
  };
}

function toWithdrawalListItem(row: RewardWithdrawalViewRow, options?: { includeAccount?: boolean; maskWallet?: boolean }) {
  return {
    id: row.id,
    account_id: row.account_id,
    fee_policy_version_id: row.fee_policy_version_id,
    withdrawal_type: row.withdrawal_type,
    requested_amount_base: row.requested_amount_base,
    fee_amount_base: row.fee_amount_base,
    net_amount_base: row.net_amount_base,
    fee_mode_snapshot: row.fee_mode_snapshot,
    status: row.status,
    idempotency_key: row.idempotency_key,
    wallet_address: options?.maskWallet ? maskWalletAddress(row.wallet_address) : row.wallet_address,
    network: row.network,
    tx_hash: row.tx_hash,
    requested_kst_date: toApiDateOnly(row.requested_kst_date),
    requested_at: toApiDateTime(row.requested_at),
    approved_at: toApiDateTime(row.approved_at),
    processing_at: toApiDateTime(row.processing_at),
    completed_at: toApiDateTime(row.completed_at),
    rejected_at: toApiDateTime(row.rejected_at),
    failed_at: toApiDateTime(row.failed_at),
    cancelled_at: toApiDateTime(row.cancelled_at),
    reject_reason: row.reject_reason,
    failure_reason: row.failure_reason,
    created_at: toApiDateTime(row.created_at),
    updated_at: toApiDateTime(row.updated_at),
    account: options?.includeAccount
      ? {
          id: row.account_id,
          login_id: row.account_login_id,
          display_name: row.account_display_name,
          status: row.account_status
        }
      : undefined
  };
}

async function appendWithdrawalLedgerEvent(
  conn: DbConn,
  input: {
    withdrawal_id: string;
    account_id: string;
    policy_version_id: string;
    product_id: string;
    symbol: string;
    decimals: number;
    created_by: string;
    event_time: Date;
    event_type:
      | "WITHDRAWAL_REQUESTED"
      | "WITHDRAWAL_RESERVED"
      | "WITHDRAWAL_APPROVED"
      | "WITHDRAWAL_PROCESSING"
      | "WITHDRAWAL_COMPLETED"
      | "WITHDRAWAL_REJECTED"
      | "WITHDRAWAL_FAILED"
      | "WITHDRAWAL_CANCELLED"
      | "WITHDRAWAL_FEE_CHARGED";
    amount_base: string;
    reference_id: string;
    meta: Record<string, unknown>;
  }
): Promise<void> {
  await insertLedgerEvent(conn, {
    id: newId(),
    account_id: input.account_id,
    product_id: input.product_id,
    policy_version_id: input.policy_version_id,
    event_time: input.event_time.toISOString(),
    event_type: input.event_type,
    amount_base: input.amount_base,
    decimals: input.decimals,
    symbol: input.symbol,
    reference_id: input.reference_id,
    meta: input.meta,
    created_by: input.created_by
  });
}

export class RewardWithdrawalService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async getWithdrawalDetail(
    conn: DbConn,
    withdrawalId: string,
    options?: { includeAccount?: boolean; includeAdminDebug?: boolean; maskWallet?: boolean }
  ) {
    const withdrawal = await getWithdrawalById(conn, withdrawalId);
    if (!withdrawal) {
      throw notFound("withdrawal not found", { withdrawal_id: withdrawalId });
    }
    const allocations = await listAllocationsByWithdrawalId(conn, withdrawalId);
    const allocationSummary = {
      allocation_count: allocations.length,
      reserved_amount_base: addAmountStrings(
        allocations.filter((item) => item.status === "RESERVED").map((item) => item.allocated_amount_base)
      ),
      consumed_amount_base: addAmountStrings(
        allocations.filter((item) => item.status === "CONSUMED").map((item) => item.allocated_amount_base)
      ),
      released_amount_base: addAmountStrings(
        allocations.filter((item) => item.status === "RELEASED").map((item) => item.allocated_amount_base)
      )
    };

    const response: Record<string, unknown> = {
      ...toWithdrawalListItem(withdrawal, {
        includeAccount: options?.includeAccount,
        maskWallet: options?.maskWallet
      }),
      allocation_summary: allocationSummary,
      allocations: allocations.map((row) => toAllocationResponse(row))
    };

    if (options?.includeAdminDebug) {
      const ledgerReferenceIds = WITHDRAWAL_REFERENCE_PREFIXES.map((kind) => buildReferenceId(kind, withdrawalId));
      const ledgerEvents = await listLedgerEventsByReferenceIds(conn, ledgerReferenceIds);
      const auditLogs = await listAdminAuditLogs(conn, {
        target_table: "reward_withdrawals",
        target_id: withdrawalId,
        page: 1,
        limit: 20
      });
      response.ledger_events = ledgerEvents.map((item) => ({
        id: item.id,
        event_type: item.event_type,
        amount_base: item.amount_base,
        reference_id: item.reference_id,
        event_time: toApiDateTime(item.event_time),
        created_at: toApiDateTime(item.created_at)
      }));
      response.audit_logs = auditLogs.items.map((item) => ({
        id: item.id,
        actor_account_id: item.actor_account_id,
        action: item.action,
        target_table: item.target_table,
        target_id: item.target_id,
        created_at: toApiDateTime(item.created_at)
      }));
    }

    return { withdrawal: response };
  }

  private async buildPreviewModel(
    conn: DbConn,
    input: {
      account_id: string;
      withdrawal_type: WithdrawalType;
      requested_amount_base: string;
      now: Date;
      lockRows: boolean;
    }
  ): Promise<PreviewBuildResult> {
    const requestedAmountBase = assertPositiveIntegerString("requested_amount_base", input.requested_amount_base);
    const nowSql = formatSqlDateTime(input.now);
    const requestedKstDate = toKstDateOnly(input.now);
    const aggregate = await aggregateAccountWithdrawalBalances(conn, {
      account_id: input.account_id,
      now: nowSql
    });
    const balance = buildWithdrawalBalanceResponse(aggregate);
    const availableAmountBase =
      input.withdrawal_type === "DAILY_REWARD"
        ? balance.daily_reward.available_amount_base
        : balance.bonus.available_amount_base;

    if (toBigIntAmountOrThrow("available_amount_base", availableAmountBase) < toBigIntAmountOrThrow("requested_amount_base", requestedAmountBase)) {
      throw conflictError("insufficient available withdrawal balance", {
        withdrawal_type: input.withdrawal_type,
        available_amount_base: availableAmountBase,
        requested_amount_base: requestedAmountBase
      });
    }

    const eligibleRewards = sortEligibleRewardsFifo(
      input.lockRows
        ? await listEligibleRewardsForUpdate(conn, {
            account_id: input.account_id,
            withdrawal_type: input.withdrawal_type,
            now: nowSql
          })
        : await listEligibleRewards(conn, {
            account_id: input.account_id,
            withdrawal_type: input.withdrawal_type,
            now: nowSql
          })
    );
    const rewardIds = eligibleRewards.map((row) => row.id);
    if (input.lockRows) {
      await listActiveAllocationRowsByRewardIdsForUpdate(conn, rewardIds);
    }
    const allocatedTotals = await getAllocatedTotalsByRewardIds(conn, rewardIds);
    const allocatedMap = new Map(allocatedTotals.map((row) => [row.reward_id, row]));

    const previewPlan = buildPreviewAllocationsFromCandidates({
      candidates: await Promise.all(
        eligibleRewards.map(async (reward) => ({
          id: reward.id,
          reward_type: reward.reward_type,
          reward_date: reward.reward_date,
          confirmed_at: reward.confirmed_at,
          available_at: reward.available_at,
          amount_base: reward.amount_base,
          policy_version_id: reward.policy_version_id,
          active_allocated_amount_base: allocatedMap.get(reward.id)?.active_amount_base ?? "0",
          fee_rules: await listActiveWithdrawalFeeRules(conn, {
            policy_version_id: reward.policy_version_id,
            withdrawal_type: input.withdrawal_type
          }),
          staking_product_id: reward.staking_product_id,
          product_symbol: reward.product_symbol,
          product_decimals: reward.product_decimals
        }))
      ),
      requested_amount_base: requestedAmountBase,
      requested_kst_date: requestedKstDate
    });

    if (toBigIntAmountOrThrow("remaining_amount_base", previewPlan.remaining_amount_base) > 0n || !previewPlan.allocations.length) {
      throw conflictError("insufficient allocatable reward balance", {
        withdrawal_type: input.withdrawal_type,
        requested_amount_base: requestedAmountBase,
        remaining_amount_base: previewPlan.remaining_amount_base
      });
    }

    const allocations = previewPlan.allocations;
    const firstAllocation = allocations[0];
    if (!firstAllocation) {
      throw conflictError("insufficient allocatable reward balance", {
        withdrawal_type: input.withdrawal_type,
        requested_amount_base: requestedAmountBase
      });
    }
    const feePolicyVersionId = firstAllocation.fee_policy_version_id;
    if (allocations.some((item) => item.fee_policy_version_id !== feePolicyVersionId)) {
      throw conflictError("mixed policy_version rewards are not supported in one withdrawal request", {
        withdrawal_type: input.withdrawal_type
      });
    }

    const feeAmountBase = addAmountStrings(allocations.map((item) => item.fee_amount_base));
    const netAmountBase = addAmountStrings(allocations.map((item) => item.net_amount_base));
    if (
      toBigIntAmountOrThrow("requested_amount_base", requestedAmountBase) !==
      toBigIntAmountOrThrow("fee_amount_base", feeAmountBase) + toBigIntAmountOrThrow("net_amount_base", netAmountBase)
    ) {
      throw new AppError("INTERNAL", "withdrawal fee calculation mismatch", 500, {
        requested_amount_base: requestedAmountBase,
        fee_amount_base: feeAmountBase,
        net_amount_base: netAmountBase
      });
    }

    const firstProduct = allocations.find((item) => item.product_id && item.product_symbol && item.product_decimals !== null);
    const fallbackProduct = await getLedgerProductContextByPolicyVersion(conn, feePolicyVersionId);
    const ledgerProduct = firstProduct
      ? {
          product_id: firstProduct.product_id as string,
          symbol: firstProduct.product_symbol as string,
          decimals: firstProduct.product_decimals as number
        }
      : fallbackProduct;
    if (!ledgerProduct) {
      throw validationError("no staking product context found for withdrawal ledger event", {
        policy_version_id: feePolicyVersionId
      });
    }

    return {
      fee_policy_version_id: feePolicyVersionId,
      withdrawal_type: input.withdrawal_type,
      requested_amount_base: requestedAmountBase,
      fee_amount_base: feeAmountBase,
      net_amount_base: netAmountBase,
      available_amount_base: availableAmountBase,
      requested_kst_date: requestedKstDate,
      allocations,
      ledger_product: ledgerProduct
    };
  }

  async getMyWithdrawalBalance(input: { account_id: string }) {
    return this.withConnection(async (conn) => {
      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      assertActiveAccount(account);
      const aggregate = await aggregateAccountWithdrawalBalances(conn, {
        account_id: input.account_id,
        now: formatSqlDateTime(new Date())
      });
      return buildWithdrawalBalanceResponse(aggregate);
    });
  }

  async previewMyWithdrawal(input: { account_id: string; withdrawal_type: WithdrawalType; requested_amount_base: string }) {
    return this.withConnection(async (conn) => {
      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      assertActiveAccount(account);
      const preview = await this.buildPreviewModel(conn, {
        account_id: input.account_id,
        withdrawal_type: input.withdrawal_type,
        requested_amount_base: input.requested_amount_base,
        now: new Date(),
        lockRows: false
      });
      return {
        withdrawal_type: preview.withdrawal_type,
        requested_amount_base: preview.requested_amount_base,
        fee_amount_base: preview.fee_amount_base,
        net_amount_base: preview.net_amount_base,
        available_amount_base: preview.available_amount_base,
        allocations: preview.allocations.map((item) => ({
          reward_id: item.reward_id,
          allocated_amount_base: item.allocated_amount_base,
          holding_days: item.holding_days,
          fee_schedule_days: item.fee_schedule_days,
          fee_rate_bps: item.fee_rate_bps,
          fee_amount_base: item.fee_amount_base,
          net_amount_base: item.net_amount_base
        })),
        preview_only: true
      };
    });
  }

  async createMyWithdrawal(input: CreateWithdrawalInput) {
    const walletAddress = assertTrimmedString("wallet_address", input.wallet_address, { required: true, maxLength: 255 });
    const network = assertTrimmedString("network", input.network, { required: true, maxLength: 64 });
    const idempotencyKey = assertTrimmedString("idempotency_key", input.idempotency_key, { required: true, maxLength: 128 }) as string;

    return withTx(this.pool, async (conn) => {
      const account = await getAccountByIdForUpdate(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      assertActiveAccount(account);

      const existing = await findByAccountIdempotencyKey(conn, {
        account_id: input.account_id,
        idempotency_key: idempotencyKey
      });
      if (existing) {
        const idempotencyResult = evaluateCreateWithdrawalIdempotency(existing, {
          ...input,
          wallet_address: walletAddress,
          network
        });
        if (idempotencyResult === "conflict") {
          throw conflictError("idempotency_key conflicts with existing withdrawal request", {
            withdrawal_id: existing.id,
            idempotency_key: idempotencyKey
          });
        }
        return {
          created: false,
          result: await this.getWithdrawalDetail(conn, existing.id)
        };
      }

      const now = new Date();
      const preview = await this.buildPreviewModel(conn, {
        account_id: input.account_id,
        withdrawal_type: input.withdrawal_type,
        requested_amount_base: input.requested_amount_base,
        now,
        lockRows: true
      });
      const withdrawalId = newId();

      await insertWithdrawal(conn, {
        id: withdrawalId,
        account_id: input.account_id,
        fee_policy_version_id: preview.fee_policy_version_id,
        withdrawal_type: input.withdrawal_type,
        requested_amount_base: preview.requested_amount_base,
        fee_amount_base: preview.fee_amount_base,
        net_amount_base: preview.net_amount_base,
        fee_mode_snapshot: "DEDUCT_FROM_WITHDRAWAL",
        status: "REQUESTED",
        idempotency_key: idempotencyKey,
        wallet_address: walletAddress,
        network,
        tx_hash: null,
        requested_kst_date: preview.requested_kst_date,
        requested_at: now,
        created_at: now,
        updated_at: now
      });

      await insertAllocations(
        conn,
        preview.allocations.map((item) => ({
          withdrawal_id: withdrawalId,
          reward_id: item.reward_id,
          allocated_amount_base: item.allocated_amount_base,
          fee_policy_version_id: item.fee_policy_version_id,
          fee_schedule_days_snapshot: item.fee_schedule_days,
          fee_rate_snapshot: item.fee_rate_bps,
          fee_mode_snapshot: "DEDUCT_FROM_WITHDRAWAL" as const,
          holding_days_snapshot: item.holding_days,
          fee_amount_base: item.fee_amount_base,
          net_amount_base: item.net_amount_base,
          status: "RESERVED" as const,
          reserved_at: now,
          created_at: now
        }))
      );

      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawalId,
        account_id: input.account_id,
        policy_version_id: preview.fee_policy_version_id,
        product_id: preview.ledger_product.product_id,
        symbol: preview.ledger_product.symbol,
        decimals: preview.ledger_product.decimals,
        created_by: input.account_id,
        event_time: now,
        event_type: "WITHDRAWAL_REQUESTED",
        amount_base: preview.requested_amount_base,
        reference_id: buildReferenceId("request", withdrawalId),
        meta: {
          withdrawal_id: withdrawalId,
          withdrawal_type: input.withdrawal_type,
          requested_amount_base: preview.requested_amount_base,
          fee_amount_base: preview.fee_amount_base,
          net_amount_base: preview.net_amount_base,
          wallet_address: walletAddress,
          network
        }
      });

      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawalId,
        account_id: input.account_id,
        policy_version_id: preview.fee_policy_version_id,
        product_id: preview.ledger_product.product_id,
        symbol: preview.ledger_product.symbol,
        decimals: preview.ledger_product.decimals,
        created_by: input.account_id,
        event_time: now,
        event_type: "WITHDRAWAL_RESERVED",
        amount_base: preview.requested_amount_base,
        reference_id: buildReferenceId("reserve", withdrawalId),
        meta: {
          withdrawal_id: withdrawalId,
          allocation_count: preview.allocations.length,
          requested_amount_base: preview.requested_amount_base
        }
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: input.account_id,
        action: "USER_WITHDRAWAL_CREATE",
        target_table: "reward_withdrawals",
        target_id: withdrawalId,
        meta: {
          withdrawal_id: withdrawalId,
          withdrawal_type: input.withdrawal_type,
          requested_amount_base: preview.requested_amount_base,
          fee_amount_base: preview.fee_amount_base,
          net_amount_base: preview.net_amount_base
        }
      });

      return {
        created: true,
        result: await this.getWithdrawalDetail(conn, withdrawalId)
      };
    });
  }

  async listMyWithdrawals(input: {
    account_id: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    requested_from?: string;
    requested_to?: string;
    page: number;
    limit: number;
    sort: RewardWithdrawalSort;
  }) {
    return this.withConnection(async (conn) => {
      const items = await listMyWithdrawals(conn, input);
      const total = await countMyWithdrawals(conn, input);
      return {
        items: items.map((row) => toWithdrawalListItem(row)),
        total
      };
    });
  }

  async getMyWithdrawal(input: { account_id: string; withdrawal_id: string }) {
    return this.withConnection(async (conn) => {
      const row = await getWithdrawalById(conn, input.withdrawal_id);
      if (!row) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertWithdrawalOwnedByAccount(row.account_id, input.account_id, input.withdrawal_id);
      return this.getWithdrawalDetail(conn, input.withdrawal_id);
    });
  }

  async cancelMyWithdrawal(input: { account_id: string; withdrawal_id: string }) {
    return withTx(this.pool, async (conn) => {
      const withdrawal = await getWithdrawalByIdForUpdate(conn, input.withdrawal_id);
      if (!withdrawal) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertWithdrawalOwnedByAccount(withdrawal.account_id, input.account_id, input.withdrawal_id);
      assertCanUserCancelWithdrawal(withdrawal.status);
      const allocations = await listAllocationsByWithdrawalIdForUpdate(conn, withdrawal.id);
      ensureReservedAllocations(allocations);
      const now = new Date();

      await updateStatusAndTimestamps(conn, {
        id: withdrawal.id,
        status: "CANCELLED",
        cancelled_at: now,
        network: withdrawal.network,
        tx_hash: withdrawal.tx_hash,
        updated_at: now
      });
      await updateAllocationStatus(conn, {
        withdrawal_id: withdrawal.id,
        next_status: "RELEASED",
        changed_at: now
      });

      const productContext = await getLedgerProductContextByPolicyVersion(conn, withdrawal.fee_policy_version_id);
      if (!productContext) {
        throw validationError("no staking product context found for withdrawal ledger event", {
          policy_version_id: withdrawal.fee_policy_version_id
        });
      }

      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: input.account_id,
        event_time: now,
        event_type: "WITHDRAWAL_CANCELLED",
        amount_base: withdrawal.requested_amount_base,
        reference_id: buildReferenceId("cancel", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id,
          status: "CANCELLED"
        }
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: input.account_id,
        action: "USER_WITHDRAWAL_CANCEL",
        target_table: "reward_withdrawals",
        target_id: withdrawal.id,
        meta: {
          withdrawal_id: withdrawal.id
        }
      });

      return this.getWithdrawalDetail(conn, withdrawal.id);
    });
  }

  async listAdminWithdrawals(input: {
    actor_account_id: string;
    q?: string;
    account_id?: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    network?: string;
    requested_from?: string;
    requested_to?: string;
    completed_from?: string;
    completed_to?: string;
    page: number;
    limit: number;
    sort: RewardWithdrawalSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      const items = await listAdminWithdrawals(conn, input);
      const total = await countAdminWithdrawals(conn, input);
      return {
        items: items.map((row) => toWithdrawalListItem(row, { includeAccount: true, maskWallet: true })),
        total
      };
    });
  }

  async getAdminWithdrawal(input: { actor_account_id: string; withdrawal_id: string }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      const row = await getWithdrawalById(conn, input.withdrawal_id);
      if (!row) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      return this.getWithdrawalDetail(conn, input.withdrawal_id, {
        includeAccount: true,
        includeAdminDebug: true
      });
    });
  }

  async approveWithdrawal(input: AdminTransitionInput) {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      const withdrawal = await getWithdrawalByIdForUpdate(conn, input.withdrawal_id);
      if (!withdrawal) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertCanApproveWithdrawal(withdrawal.status);
      const allocations = await listAllocationsByWithdrawalIdForUpdate(conn, withdrawal.id);
      ensureReservedAllocations(allocations);
      const productContext = await getLedgerProductContextByPolicyVersion(conn, withdrawal.fee_policy_version_id);
      if (!productContext) {
        throw validationError("no staking product context found for withdrawal ledger event", {
          policy_version_id: withdrawal.fee_policy_version_id
        });
      }
      const now = new Date();
      await updateStatusAndTimestamps(conn, {
        id: withdrawal.id,
        status: "APPROVED",
        approved_at: now,
        network: withdrawal.network,
        tx_hash: withdrawal.tx_hash,
        updated_at: now
      });
      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: actor.id,
        event_time: now,
        event_type: "WITHDRAWAL_APPROVED",
        amount_base: withdrawal.requested_amount_base,
        reference_id: buildReferenceId("approve", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id
        }
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_WITHDRAWAL_APPROVE",
        target_table: "reward_withdrawals",
        target_id: withdrawal.id,
        meta: { withdrawal_id: withdrawal.id }
      });
      return this.getWithdrawalDetail(conn, withdrawal.id, { includeAccount: true, includeAdminDebug: true });
    });
  }

  async rejectWithdrawal(input: AdminTransitionInput & { reason: string }) {
    const reason = assertTrimmedString("reason", input.reason, { required: true, maxLength: 500 }) as string;
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      const withdrawal = await getWithdrawalByIdForUpdate(conn, input.withdrawal_id);
      if (!withdrawal) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertCanRejectWithdrawal(withdrawal.status);
      const allocations = await listAllocationsByWithdrawalIdForUpdate(conn, withdrawal.id);
      ensureReservedAllocations(allocations);
      const productContext = await getLedgerProductContextByPolicyVersion(conn, withdrawal.fee_policy_version_id);
      if (!productContext) {
        throw validationError("no staking product context found for withdrawal ledger event", {
          policy_version_id: withdrawal.fee_policy_version_id
        });
      }
      const now = new Date();
      await updateStatusAndTimestamps(conn, {
        id: withdrawal.id,
        status: "REJECTED",
        rejected_at: now,
        reject_reason: reason,
        network: withdrawal.network,
        tx_hash: withdrawal.tx_hash,
        updated_at: now
      });
      await updateAllocationStatus(conn, {
        withdrawal_id: withdrawal.id,
        next_status: "RELEASED",
        changed_at: now
      });
      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: actor.id,
        event_time: now,
        event_type: "WITHDRAWAL_REJECTED",
        amount_base: withdrawal.requested_amount_base,
        reference_id: buildReferenceId("reject", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id,
          reason
        }
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_WITHDRAWAL_REJECT",
        target_table: "reward_withdrawals",
        target_id: withdrawal.id,
        meta: { withdrawal_id: withdrawal.id, reason }
      });
      return this.getWithdrawalDetail(conn, withdrawal.id, { includeAccount: true, includeAdminDebug: true });
    });
  }

  async markWithdrawalProcessing(input: AdminTransitionInput & { network: string }) {
    const network = assertTrimmedString("network", input.network, { required: true, maxLength: 64 }) as string;
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      const withdrawal = await getWithdrawalByIdForUpdate(conn, input.withdrawal_id);
      if (!withdrawal) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertCanMarkProcessingWithdrawal(withdrawal.status);
      const allocations = await listAllocationsByWithdrawalIdForUpdate(conn, withdrawal.id);
      ensureReservedAllocations(allocations);
      const productContext = await getLedgerProductContextByPolicyVersion(conn, withdrawal.fee_policy_version_id);
      if (!productContext) {
        throw validationError("no staking product context found for withdrawal ledger event", {
          policy_version_id: withdrawal.fee_policy_version_id
        });
      }
      const now = new Date();
      await updateStatusAndTimestamps(conn, {
        id: withdrawal.id,
        status: "PROCESSING",
        approved_at: withdrawal.approved_at,
        processing_at: now,
        network,
        tx_hash: withdrawal.tx_hash,
        updated_at: now
      });
      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: actor.id,
        event_time: now,
        event_type: "WITHDRAWAL_PROCESSING",
        amount_base: withdrawal.requested_amount_base,
        reference_id: buildReferenceId("processing", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id,
          network
        }
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_WITHDRAWAL_PROCESSING",
        target_table: "reward_withdrawals",
        target_id: withdrawal.id,
        meta: { withdrawal_id: withdrawal.id, network }
      });
      return this.getWithdrawalDetail(conn, withdrawal.id, { includeAccount: true, includeAdminDebug: true });
    });
  }

  async completeWithdrawal(input: AdminTransitionInput & { tx_hash: string; network: string }) {
    const txHash = assertTrimmedString("tx_hash", input.tx_hash, { required: true, maxLength: 255 }) as string;
    const network = assertTrimmedString("network", input.network, { required: true, maxLength: 64 }) as string;
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      const withdrawal = await getWithdrawalByIdForUpdate(conn, input.withdrawal_id);
      if (!withdrawal) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertCanCompleteWithdrawal(withdrawal.status);
      const allocations = await listAllocationsByWithdrawalIdForUpdate(conn, withdrawal.id);
      ensureReservedAllocations(allocations);
      const requestedTotal = addAmountStrings(allocations.map((item) => item.allocated_amount_base));
      const feeTotal = addAmountStrings(allocations.map((item) => item.fee_amount_base));
      const netTotal = addAmountStrings(allocations.map((item) => item.net_amount_base));
      if (
        requestedTotal !== withdrawal.requested_amount_base ||
        feeTotal !== withdrawal.fee_amount_base ||
        netTotal !== withdrawal.net_amount_base
      ) {
        throw new AppError("INTERNAL", "withdrawal allocation totals do not match header totals", 500, {
          withdrawal_id: withdrawal.id
        });
      }
      const productContext = await getLedgerProductContextByPolicyVersion(conn, withdrawal.fee_policy_version_id);
      if (!productContext) {
        throw validationError("no staking product context found for withdrawal ledger event", {
          policy_version_id: withdrawal.fee_policy_version_id
        });
      }
      const now = new Date();
      await updateStatusAndTimestamps(conn, {
        id: withdrawal.id,
        status: "COMPLETED",
        approved_at: withdrawal.approved_at,
        processing_at: withdrawal.processing_at,
        completed_at: now,
        network,
        tx_hash: txHash,
        updated_at: now
      });
      await updateAllocationStatus(conn, {
        withdrawal_id: withdrawal.id,
        next_status: "CONSUMED",
        changed_at: now
      });
      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: actor.id,
        event_time: now,
        event_type: "WITHDRAWAL_COMPLETED",
        amount_base: withdrawal.net_amount_base,
        reference_id: buildReferenceId("complete", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id,
          tx_hash: txHash,
          network,
          net_amount_base: withdrawal.net_amount_base
        }
      });
      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: actor.id,
        event_time: now,
        event_type: "WITHDRAWAL_FEE_CHARGED",
        amount_base: withdrawal.fee_amount_base,
        reference_id: buildReferenceId("fee", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id,
          fee_amount_base: withdrawal.fee_amount_base
        }
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_WITHDRAWAL_COMPLETE",
        target_table: "reward_withdrawals",
        target_id: withdrawal.id,
        meta: { withdrawal_id: withdrawal.id, tx_hash: txHash, network }
      });
      return this.getWithdrawalDetail(conn, withdrawal.id, { includeAccount: true, includeAdminDebug: true });
    });
  }

  async failWithdrawal(input: AdminTransitionInput & { reason: string }) {
    const reason = assertTrimmedString("reason", input.reason, { required: true, maxLength: 500 }) as string;
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      const withdrawal = await getWithdrawalByIdForUpdate(conn, input.withdrawal_id);
      if (!withdrawal) {
        throw notFound("withdrawal not found", { withdrawal_id: input.withdrawal_id });
      }
      assertCanFailWithdrawal(withdrawal.status);
      const allocations = await listAllocationsByWithdrawalIdForUpdate(conn, withdrawal.id);
      ensureReservedAllocations(allocations);
      const productContext = await getLedgerProductContextByPolicyVersion(conn, withdrawal.fee_policy_version_id);
      if (!productContext) {
        throw validationError("no staking product context found for withdrawal ledger event", {
          policy_version_id: withdrawal.fee_policy_version_id
        });
      }
      const now = new Date();
      await updateStatusAndTimestamps(conn, {
        id: withdrawal.id,
        status: "FAILED",
        approved_at: withdrawal.approved_at,
        processing_at: withdrawal.processing_at,
        failed_at: now,
        failure_reason: reason,
        network: withdrawal.network,
        tx_hash: withdrawal.tx_hash,
        updated_at: now
      });
      await updateAllocationStatus(conn, {
        withdrawal_id: withdrawal.id,
        next_status: "RELEASED",
        changed_at: now
      });
      await appendWithdrawalLedgerEvent(conn, {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.account_id,
        policy_version_id: withdrawal.fee_policy_version_id,
        product_id: productContext.product_id,
        symbol: productContext.symbol,
        decimals: productContext.decimals,
        created_by: actor.id,
        event_time: now,
        event_type: "WITHDRAWAL_FAILED",
        amount_base: withdrawal.requested_amount_base,
        reference_id: buildReferenceId("fail", withdrawal.id),
        meta: {
          withdrawal_id: withdrawal.id,
          reason
        }
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_WITHDRAWAL_FAIL",
        target_table: "reward_withdrawals",
        target_id: withdrawal.id,
        meta: { withdrawal_id: withdrawal.id, reason }
      });
      return this.getWithdrawalDetail(conn, withdrawal.id, { includeAccount: true, includeAdminDebug: true });
    });
  }

  async listAdminAccountWithdrawals(input: {
    actor_account_id: string;
    account_id: string;
    withdrawal_type?: WithdrawalType;
    status?: RewardWithdrawalStatus;
    network?: string;
    requested_from?: string;
    requested_to?: string;
    completed_from?: string;
    completed_to?: string;
    page: number;
    limit: number;
    sort: RewardWithdrawalSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      const items = await listAdminWithdrawals(conn, {
        ...input,
        q: undefined
      });
      const total = await countAdminWithdrawals(conn, {
        ...input,
        q: undefined
      });
      return {
        account: {
          id: account.id,
          login_id: account.login_id,
          display_name: account.display_name,
          status: account.status
        },
        items: items.map((row) => toWithdrawalListItem(row, { includeAccount: true, maskWallet: true })),
        total
      };
    });
  }

  async getAdminWithdrawalSummary(input: {
    actor_account_id: string;
    date_from?: string;
    date_to?: string;
    withdrawal_type?: WithdrawalType;
    network?: string;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      const summary = await getSummary(conn, input);
      return {
        ...summary,
        requested_count: Number(summary.requested_count),
        completed_count: Number(summary.completed_count)
      };
    });
  }

  async getEnhancedRewardSummary(input: { account_id: string }) {
    return this.withConnection((conn) =>
      getMyRewardSummary(conn, {
        account_id: input.account_id,
        now: formatSqlDateTime(new Date())
      })
    );
  }
}
