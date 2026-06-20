import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertIntString } from "../domain/amount.js";
import { conflictError, notFound, validationError } from "../domain/errors.js";
import {
  type RewardListSort,
  type RewardStatus,
  type RewardType,
  type RewardViewRow,
  getMyRewardSummary,
  getReversalRewardByOriginalRewardId,
  getRewardById,
  getRewardByIdForUpdate,
  insertReversalReward,
  listAdminRewards,
  listMyRewards,
  listRewardsByCalcRun,
  markRewardReversed,
  updateRewardSourceLedgerEvent,
} from "../repos/accountRewardsRepo.js";
import { getAccountStakingById, getMyStakingSummary } from "../repos/accountStakingsRepo.js";
import { getAccountAuthById } from "../repos/accountsRepo.js";
import { insertAdminAuditLog } from "../repos/auditLogRepo.js";
import { getCalcRunById } from "../repos/calcRunsRepo.js";
import { insertLedgerEvent } from "../repos/ledgerEventsRepo.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

const USER_METADATA_KEYS = new Set([
  "principal_amount_base",
  "daily_interest_bps_snapshot",
  "duration_days_snapshot",
  "denominator",
  "formula_version",
  "source_principal_amount_base",
  "direct_referral_rate_bps",
  "referral_depth",
  "original_reward_id",
  "original_source_reference",
  "reason",
  "reward_type"
]);

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

export function sanitizeRewardMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (USER_METADATA_KEYS.has(key)) {
      result[key] = item;
    }
  }
  return result;
}

function toRewardResponse(row: RewardViewRow, options?: { includeMetadata?: boolean; includeAccount?: boolean }) {
  const visibleMetadata = sanitizeRewardMetadata(row.metadata_json);
  const sourcePrincipalAmountBase =
    row.source_staking_principal_amount_base ?? String(visibleMetadata.source_principal_amount_base ?? "");
  const directReferralRateBps =
    visibleMetadata.direct_referral_rate_bps !== undefined
      ? String(visibleMetadata.direct_referral_rate_bps)
      : null;

  return {
    id: row.id,
    account_id: row.account_id,
    reward_type: row.reward_type,
    reward_date: toApiDateOnly(row.reward_date),
    amount_base: row.amount_base,
    status: row.status,
    account_staking_id: row.account_staking_id,
    source_account_id: options?.includeAccount ? row.source_account_id : undefined,
    source_account_staking_id: row.source_account_staking_id,
    policy_version_id: row.policy_version_id,
    calc_run_id: row.calc_run_id,
    source_reference: row.source_reference,
    source_ledger_event_id: row.source_ledger_event_id,
    reversal_reward_id: row.reversal_reward_id,
    available_at: toApiDateTime(row.available_at),
    confirmed_at: toApiDateTime(row.confirmed_at),
    reversed_at: toApiDateTime(row.reversed_at),
    created_at: toApiDateTime(row.created_at),
    updated_at: toApiDateTime(row.updated_at),
    metadata: options?.includeMetadata ? visibleMetadata : undefined,
    staking: row.account_staking_id
      ? {
          id: row.account_staking_id,
          principal_amount_base: row.staking_principal_amount_base,
          daily_interest_bps_snapshot: row.staking_daily_interest_bps_snapshot,
          duration_days_snapshot: row.staking_duration_days_snapshot,
          status: row.staking_status
        }
      : null,
    source:
      row.source_account_id || row.source_account_staking_id
        ? {
            account_id: options?.includeAccount ? row.source_account_id : undefined,
            login_id: options?.includeAccount ? row.source_account_login_id : undefined,
            display_name: row.source_account_display_name,
            staking: row.source_account_staking_id
              ? {
                  id: row.source_account_staking_id,
                  principal_amount_base: sourcePrincipalAmountBase || null,
                  status: row.source_staking_status
                }
              : null,
            direct_referral_rate_bps: directReferralRateBps
          }
        : null,
    product: row.product_id
      ? {
          id: row.product_id,
          name: row.product_name,
          symbol: row.product_symbol,
          decimals: row.product_decimals
        }
      : null,
    account: options?.includeAccount
      ? {
          id: row.account_id,
          login_id: row.account_login_id,
          display_name: row.account_display_name
        }
      : undefined,
    calc_run: row.calc_run_id
      ? {
          id: row.calc_run_id,
          status: row.calc_run_status,
          run_type: row.calc_run_run_type,
          run_date: toApiDateOnly(row.calc_run_run_date)
        }
      : null
  };
}

function toCalcRunResponse(row: {
  id: string;
  policy_version_id: string;
  run_type: string;
  run_date: unknown;
  status: string;
  started_at: unknown;
  finished_at: unknown;
  finalized_at: unknown;
  error_message?: string | null;
  created_at?: unknown;
}) {
  return {
    id: row.id,
    policy_version_id: row.policy_version_id,
    run_type: row.run_type,
    run_date: toApiDateOnly(row.run_date),
    status: row.status,
    started_at: toApiDateTime(row.started_at),
    finished_at: toApiDateTime(row.finished_at),
    finalized_at: toApiDateTime(row.finalized_at),
    error_message: row.error_message ?? null,
    created_at: toApiDateTime(row.created_at ?? null),
  };
}

export function negateAmountBase(value: string): string {
  assertIntString("amount_base", value);
  const amount = BigInt(value);
  if (amount <= 0n) {
    throw validationError("amount_base must be positive to reverse", { amount_base: value });
  }
  return (-amount).toString();
}

export class AccountRewardService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  async listMyRewards(input: {
    account_id: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    reward_date_from?: string;
    reward_date_to?: string;
    staking_id?: string;
    page: number;
    limit: number;
    sort: RewardListSort;
  }) {
    const result = await this.withConnection((conn) =>
      listMyRewards(conn, {
        account_id: input.account_id,
        reward_type: input.reward_type,
        status: input.status,
        reward_date_from: input.reward_date_from,
        reward_date_to: input.reward_date_to,
        staking_id: input.staking_id,
        page: input.page,
        limit: input.limit,
        sort: input.sort
      })
    );

    return {
      items: result.items.map((row) => toRewardResponse(row)),
      total: result.total
    };
  }

  async getMyReward(input: { account_id: string; reward_id: string }) {
    const reward = await this.withConnection(async (conn) => {
      const row = await getRewardById(conn, input.reward_id);
      if (!row || row.account_id !== input.account_id) {
        throw notFound("reward not found", { reward_id: input.reward_id });
      }
      const reversal = await getReversalRewardByOriginalRewardId(conn, row.id);
      return { row, reversal };
    });

    return {
      reward: {
        ...toRewardResponse(reward.row, { includeMetadata: true }),
        reversal: reward.reversal ? { id: reward.reversal.id, amount_base: reward.reversal.amount_base } : null
      }
    };
  }

  async listMyStakingRewards(input: {
    account_id: string;
    staking_id: string;
    status?: RewardStatus;
    reward_date_from?: string;
    reward_date_to?: string;
    page: number;
    limit: number;
    sort: RewardListSort;
  }) {
    return this.withConnection(async (conn) => {
      const staking = await getAccountStakingById(conn, input.staking_id);
      if (!staking || staking.account_id !== input.account_id) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }

      const result = await listMyRewards(conn, {
        account_id: input.account_id,
        staking_id: input.staking_id,
        status: input.status,
        reward_date_from: input.reward_date_from,
        reward_date_to: input.reward_date_to,
        page: input.page,
        limit: input.limit,
        sort: input.sort
      });

      return {
        items: result.items.map((row) => toRewardResponse(row)),
        total: result.total
      };
    });
  }

  async getMyRewardSummary(input: { account_id: string }) {
    return this.withConnection((conn) =>
      getMyRewardSummary(conn, {
        account_id: input.account_id,
        now: formatSqlDateTime(new Date())
      })
    );
  }

  async getMyStakingSummary(input: { account_id: string }) {
    return this.withConnection((conn) => getMyStakingSummary(conn, input.account_id));
  }

  async listAdminRewards(input: {
    actor_account_id: string;
    q?: string;
    account_id?: string;
    staking_id?: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    calc_run_id?: string;
    reward_date_from?: string;
    reward_date_to?: string;
    page: number;
    limit: number;
    sort: RewardListSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const result = await listAdminRewards(conn, input);
      return {
        items: result.items.map((row) => toRewardResponse(row, { includeAccount: true })),
        total: result.total
      };
    });
  }

  async getAdminReward(input: { actor_account_id: string; reward_id: string }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const row = await getRewardById(conn, input.reward_id);
      if (!row) {
        throw notFound("reward not found", { reward_id: input.reward_id });
      }

      const reversal = await getReversalRewardByOriginalRewardId(conn, row.id);
      const original =
        row.reward_type === "REVERSAL" && row.reversal_reward_id ? await getRewardById(conn, row.reversal_reward_id) : null;

      return {
        reward: {
          ...toRewardResponse(row, { includeMetadata: true, includeAccount: true }),
          reversal: reversal ? { id: reversal.id, amount_base: reversal.amount_base } : null,
          original_reward:
            original ? { id: original.id, reward_type: original.reward_type, amount_base: original.amount_base } : null
        }
      };
    });
  }

  async listAdminAccountRewards(input: {
    actor_account_id: string;
    account_id: string;
    staking_id?: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    calc_run_id?: string;
    reward_date_from?: string;
    reward_date_to?: string;
    page: number;
    limit: number;
    sort: RewardListSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }

      const result = await listAdminRewards(conn, {
        account_id: input.account_id,
        staking_id: input.staking_id,
        reward_type: input.reward_type,
        status: input.status,
        calc_run_id: input.calc_run_id,
        reward_date_from: input.reward_date_from,
        reward_date_to: input.reward_date_to,
        page: input.page,
        limit: input.limit,
        sort: input.sort
      });

      return {
        items: result.items.map((row) => toRewardResponse(row, { includeAccount: true })),
        total: result.total
      };
    });
  }

  async listCalcRunRewards(input: {
    actor_account_id: string;
    calc_run_id: string;
    reward_type?: RewardType;
    status?: RewardStatus;
    page: number;
    limit: number;
    sort: RewardListSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const calc_run = await getCalcRunById(conn, input.calc_run_id);
      if (!calc_run) {
        throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      }

      const result = await listRewardsByCalcRun(conn, input);
      return {
        calc_run: toCalcRunResponse(calc_run),
        items: result.items.map((row) => toRewardResponse(row, { includeAccount: true })),
        total: result.total
      };
    });
  }

  async reverseReward(input: { actor_account_id: string; reward_id: string; reason: string }) {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      throw validationError("reason is required", { field: "reason" });
    }

    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const original = await getRewardByIdForUpdate(conn, input.reward_id);
      if (!original) {
        throw notFound("reward not found", { reward_id: input.reward_id });
      }
      if (original.reward_type === "REVERSAL") {
        throw conflictError("reversal reward cannot be reversed", { reward_id: input.reward_id });
      }
      if (original.status !== "CONFIRMED") {
        throw conflictError("only CONFIRMED reward can be reversed", {
          reward_id: input.reward_id,
          status: original.status
        });
      }

      const existingReversal = await getReversalRewardByOriginalRewardId(conn, original.id);
      if (existingReversal) {
        throw conflictError("reward is already reversed", {
          reward_id: input.reward_id,
          reversal_reward_id: existingReversal.id
        });
      }

      if (!original.account_staking_id) {
        throw validationError("reward is not reversible by current policy", {
          reward_id: input.reward_id,
          reason: "account_staking_id is required"
        });
      }

      const staking = await getAccountStakingById(conn, original.account_staking_id);
      if (!staking) {
        throw notFound("staking not found", { account_staking_id: original.account_staking_id });
      }
      if (staking.account_id !== original.account_id) {
        throw validationError("reward account/staking ownership mismatch", {
          reward_id: input.reward_id,
          reward_account_id: original.account_id,
          staking_account_id: staking.account_id
        });
      }
      if (staking.policy_version_id !== original.policy_version_id) {
        throw validationError("reward policy/staking mismatch", {
          reward_id: input.reward_id,
          reward_policy_version_id: original.policy_version_id,
          staking_policy_version_id: staking.policy_version_id
        });
      }

      const now = new Date();
      const reversal_reward_id = newId();
      const reversal_ledger_event_id = newId();
      const negative_amount_base = negateAmountBase(original.amount_base);

      await insertReversalReward(conn, {
        id: reversal_reward_id,
        account_id: original.account_id,
        account_staking_id: original.account_staking_id,
        policy_version_id: original.policy_version_id,
        calc_run_id: original.calc_run_id,
        reward_type: "REVERSAL",
        reward_date: original.reward_date,
        amount_base: negative_amount_base,
        status: "CONFIRMED",
        source_reference: `reward.reversal:${original.id}`,
        reversal_reward_id: original.id,
        confirmed_at: now,
        available_at: now,
        metadata_json: {
          reward_type: "REVERSAL",
          original_reward_id: original.id,
          original_source_reference: original.source_reference,
          reason: trimmedReason
        },
        created_at: now,
        updated_at: now
      });

      await insertLedgerEvent(conn, {
        id: reversal_ledger_event_id,
        account_id: original.account_id,
        product_id: staking.staking_product_id,
        policy_version_id: original.policy_version_id,
        calc_run_id: original.calc_run_id,
        event_time: now.toISOString(),
        event_type: "ADJUSTMENT",
        amount_base: negative_amount_base,
        decimals: staking.product_decimals,
        symbol: staking.product_symbol,
        reference_id: `reward.reversal:${original.id}`,
        meta: {
          reward_id: reversal_reward_id,
          original_reward_id: original.id,
          original_source_reference: original.source_reference,
          reward_type: "REVERSAL",
          reason: trimmedReason
        },
        created_by: actor.id
      });

      await updateRewardSourceLedgerEvent(conn, {
        id: reversal_reward_id,
        source_ledger_event_id: reversal_ledger_event_id,
        updated_at: now
      });

      await markRewardReversed(conn, {
        id: original.id,
        reversed_at: now,
        updated_at: now
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_REWARD_REVERSE",
        target_table: "account_rewards",
        target_id: original.id,
        meta: {
          reward_id: original.id,
          reversal_reward_id,
          calc_run_id: original.calc_run_id,
          policy_version_id: original.policy_version_id,
          amount_base: original.amount_base,
          reversal_amount_base: negative_amount_base,
          reason: trimmedReason
        }
      });

      const detail = await getRewardById(conn, original.id);
      const reversal = await getRewardById(conn, reversal_reward_id);
      if (!detail || !reversal) {
        throw notFound("reward not found after reversal", {
          reward_id: original.id,
          reversal_reward_id
        });
      }

      return {
        reward: {
          ...toRewardResponse(detail, { includeMetadata: true, includeAccount: true }),
          reversal: { id: reversal.id, amount_base: reversal.amount_base }
        }
      };
    });
  }
}
