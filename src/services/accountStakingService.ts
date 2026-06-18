import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertIntString } from "../domain/amount.js";
import { conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import type {
  AccountStakingSort,
  AccountStakingStatus,
  AccountStakingViewRow,
} from "../repos/accountStakingsRepo.js";
import {
  getAccountStakingById,
  getAccountStakingByIdForUpdate,
  getAccountStakingByIdempotencyKey,
  getAccountStakingByIdempotencyKeyForUpdate,
  insertAccountStaking,
  listAccountStakings,
  updateAccountStaking,
} from "../repos/accountStakingsRepo.js";
import { getAccountAuthById, getAccountByIdForUpdate } from "../repos/accountsRepo.js";
import { insertAdminAuditLog } from "../repos/auditLogRepo.js";
import { insertLedgerEvent } from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById, lockPolicyVersion } from "../repos/policyVersionsRepo.js";
import {
  getStakingProductById,
  getStakingProductByIdForUpdate,
  listStakingProducts,
  type StakingProductRow,
} from "../repos/stakingProductsRepo.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";

export type AdminReadableRole = "READER" | "ADMIN";
export type AdminWritableRole = "ADMIN";

type CreateStakingInput = {
  account_id: string;
  staking_product_id: string;
  principal_amount_base: string;
  idempotency_key: string;
};

type CancelMyStakingInput = {
  account_id: string;
  staking_id: string;
  idempotency_key: string;
  reason?: string | null;
};

type AdminTransitionInput = {
  actor_account_id: string;
  staking_id: string;
  reason?: string | null;
};

type ProductSummary = {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  min_stake_amount_base: string;
  max_stake_amount_base: string;
  staking_days: number;
  daily_interest_bps: string;
  is_active: boolean;
};

type StakingResponse = {
  id: string;
  account_id: string;
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  status: AccountStakingStatus;
  started_at: string | null;
  matures_at: string | null;
  activated_at: string | null;
  cancel_requested_at: string | null;
  cancelled_at: string | null;
  matured_at: string | null;
  closed_at: string | null;
  source_ledger_event_id: string | null;
  cancellation_ledger_event_id: string | null;
  created_at: string;
  updated_at: string;
  product: ProductSummary;
};

type AdminStakingResponse = StakingResponse & {
  account: {
    id: string;
    login_id: string | null;
    display_name: string | null;
  };
};

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

export function isPositiveIntegerString(value: string): boolean {
  return /^\d+$/.test(value) && value !== "0";
}

export function calculateMaturesAt(startedAt: Date, durationDays: number): Date {
  return new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
}

export function assertAmountWithinRange(amountBase: string, minAmountBase: string, maxAmountBase: string): void {
  if (BigInt(amountBase) < BigInt(minAmountBase)) {
    throw validationError("principal_amount_base is below minimum", {
      principal_amount_base: amountBase,
      min_stake_amount_base: minAmountBase,
    });
  }
  if (BigInt(amountBase) > BigInt(maxAmountBase)) {
    throw validationError("principal_amount_base exceeds maximum", {
      principal_amount_base: amountBase,
      max_stake_amount_base: maxAmountBase,
    });
  }
}

export function evaluateCreateIdempotency(
  existing: Pick<AccountStakingViewRow, "account_id" | "staking_product_id" | "principal_amount_base">,
  next: CreateStakingInput
): "match" | "conflict" {
  if (
    existing.account_id === next.account_id &&
    existing.staking_product_id === next.staking_product_id &&
    existing.principal_amount_base === next.principal_amount_base
  ) {
    return "match";
  }
  return "conflict";
}

export function isOwnedByAccount(ownerAccountId: string, actorAccountId: string): boolean {
  return ownerAccountId === actorAccountId;
}

export function assertCanReadAdminStakings(role: AdminReadableRole | "USER"): void {
  if (role === "USER") {
    throw forbidden("reader permission required", { actorRole: role });
  }
}

export function assertCanWriteAdminStakings(role: AdminWritableRole | "READER" | "USER"): void {
  if (role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: role });
  }
}

export function resolveUserCancelTransition(
  status: AccountStakingStatus
): "ALREADY_REQUESTED" | "CANCELLED" | "CANCEL_REQUESTED" {
  if (status === "PENDING") {
    return "CANCELLED";
  }
  if (status === "ACTIVE") {
    return "CANCEL_REQUESTED";
  }
  if (status === "CANCEL_REQUESTED") {
    return "ALREADY_REQUESTED";
  }
  throw conflictError("staking cannot be cancelled in current status", { status });
}

export function resolveAdminActivateTransition(status: AccountStakingStatus): "ACTIVE" {
  if (status !== "PENDING") {
    throw conflictError("only PENDING staking can be activated", { status });
  }
  return "ACTIVE";
}

export function resolveAdminRejectTransition(status: AccountStakingStatus): "CANCELLED" {
  if (status !== "PENDING") {
    throw conflictError("only PENDING staking can be rejected", { status });
  }
  return "CANCELLED";
}

export function resolveAdminCancelTransition(status: AccountStakingStatus): "CANCELLED" {
  if (status !== "ACTIVE" && status !== "CANCEL_REQUESTED") {
    throw conflictError("only ACTIVE or CANCEL_REQUESTED staking can be cancelled by admin", { status });
  }
  return "CANCELLED";
}

function assertIdempotencyKey(value: string): void {
  const trimmed = value.trim();
  if (!trimmed) {
    throw validationError("idempotency_key is required", { field: "idempotency_key" });
  }
  if (trimmed.length > 128) {
    throw validationError("idempotency_key must be 128 characters or fewer", {
      field: "idempotency_key",
      length: trimmed.length,
    });
  }
}

function assertActiveAccount(account: { id: string; status: string }): void {
  if (account.status !== "ACTIVE") {
    throw forbidden("account is not active", { account_id: account.id, status: account.status });
  }
}

function assertUsablePolicyStatus(status: string): void {
  // Existing fixtures still use DRAFT policies for active staking products.
  // Disallow only retired policies in this phase.
  if (status === "RETIRED") {
    throw validationError("staking product policy is retired", { policy_status: status });
  }
}

function normalizePrincipalAmount(principalAmountBase: string): string {
  assertIntString("principal_amount_base", principalAmountBase);
  if (!isPositiveIntegerString(principalAmountBase)) {
    throw validationError("principal_amount_base must be a positive integer string", {
      principal_amount_base: principalAmountBase,
    });
  }
  return principalAmountBase;
}

function toProductSummary(row: AccountStakingViewRow): ProductSummary {
  return {
    id: row.staking_product_id,
    name: row.product_name,
    symbol: row.product_symbol,
    decimals: row.product_decimals,
    min_stake_amount_base: row.product_min_stake_amount_base,
    max_stake_amount_base: row.product_max_stake_amount_base,
    staking_days: row.product_staking_days,
    daily_interest_bps: row.product_daily_interest_bps,
    is_active: Boolean(row.product_is_active),
  };
}

function toStakingResponse(row: AccountStakingViewRow): StakingResponse {
  return {
    id: row.id,
    account_id: row.account_id,
    principal_amount_base: row.principal_amount_base,
    daily_interest_bps_snapshot: row.daily_interest_bps_snapshot,
    duration_days_snapshot: row.duration_days_snapshot,
    status: row.status,
    started_at: row.started_at,
    matures_at: row.matures_at,
    activated_at: row.activated_at,
    cancel_requested_at: row.cancel_requested_at,
    cancelled_at: row.cancelled_at,
    matured_at: row.matured_at,
    closed_at: row.closed_at,
    source_ledger_event_id: row.source_ledger_event_id,
    cancellation_ledger_event_id: row.cancellation_ledger_event_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    product: toProductSummary(row),
  };
}

function toAdminStakingResponse(row: AccountStakingViewRow): AdminStakingResponse {
  return {
    ...toStakingResponse(row),
    account: {
      id: row.account_id,
      login_id: row.account_login_id,
      display_name: row.account_display_name,
    },
  };
}

function toPublicProduct(row: StakingProductRow): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    min_stake_amount_base: row.min_stake_amount_base,
    max_stake_amount_base: row.max_stake_amount_base,
    staking_days: row.staking_days,
    daily_interest_bps: row.daily_interest_bps,
    is_active: Boolean(row.is_active),
  };
}

export class AccountStakingService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  async listPublicStakingProducts(input: { page: number; limit: number; symbol?: string }) {
    return this.withConnection(async (conn) => {
      const result = await listStakingProducts(conn, {
        is_active: true,
        symbol: input.symbol,
        page: input.page,
        limit: input.limit,
      });
      return {
        items: result.items.map(toPublicProduct),
        total: result.total,
      };
    });
  }

  async createMyStaking(input: CreateStakingInput): Promise<{ staking: StakingResponse }> {
    const principalAmountBase = normalizePrincipalAmount(input.principal_amount_base);
    assertIdempotencyKey(input.idempotency_key);

    return withTx(this.pool, async (conn) => {
      const account = await getAccountByIdForUpdate(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      assertActiveAccount(account);

      const existingByKey = await getAccountStakingByIdempotencyKeyForUpdate(conn, input.idempotency_key);
      if (existingByKey) {
        const existingDetail = await getAccountStakingById(conn, existingByKey.id);
        if (!existingDetail) {
          throw conflictError("idempotency_key already exists");
        }
        const match = evaluateCreateIdempotency(existingDetail, {
          account_id: input.account_id,
          staking_product_id: input.staking_product_id,
          principal_amount_base: principalAmountBase,
          idempotency_key: input.idempotency_key,
        });
        if (match === "match") {
          return { staking: toStakingResponse(existingDetail) };
        }
        throw conflictError("idempotency_key conflicts with existing staking request", {
          staking_id: existingDetail.id,
        });
      }

      const product = await getStakingProductByIdForUpdate(conn, input.staking_product_id);
      if (!product) {
        throw notFound("staking_product not found", { staking_product_id: input.staking_product_id });
      }
      if (!Boolean(product.is_active)) {
        throw validationError("staking_product is inactive", { staking_product_id: input.staking_product_id });
      }

      const policy = await lockPolicyVersion(conn, product.policy_version_id);
      if (!policy) {
        throw notFound("policy_version not found", { policy_version_id: product.policy_version_id });
      }
      assertUsablePolicyStatus(policy.status);
      assertAmountWithinRange(principalAmountBase, product.min_stake_amount_base, product.max_stake_amount_base);

      const now = new Date();
      const stakingId = newId();
      const requestLedgerEventId = newId();

      await insertAccountStaking(conn, {
        id: stakingId,
        account_id: account.id,
        staking_product_id: product.id,
        policy_version_id: product.policy_version_id,
        principal_amount_base: principalAmountBase,
        daily_interest_bps_snapshot: product.daily_interest_bps,
        duration_days_snapshot: product.staking_days,
        status: "PENDING",
        idempotency_key: input.idempotency_key,
        source_ledger_event_id: null,
        cancellation_ledger_event_id: null,
        created_at: now,
        updated_at: now,
      });

      await insertLedgerEvent(conn, {
        id: requestLedgerEventId,
        account_id: account.id,
        product_id: product.id,
        policy_version_id: product.policy_version_id,
        event_time: now.toISOString(),
        event_type: "STAKING_REQUESTED",
        amount_base: principalAmountBase,
        decimals: product.decimals,
        symbol: product.symbol,
        reference_id: `staking.request:${stakingId}`,
        meta: {
          staking_id: stakingId,
          transition: { from: null, to: "PENDING" },
        },
        created_by: account.id,
      });

      await updateAccountStaking(conn, {
        id: stakingId,
        source_ledger_event_id: requestLedgerEventId,
        updated_at: now,
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: account.id,
        action: "USER_STAKING_REQUEST",
        target_table: "account_stakings",
        target_id: stakingId,
        meta: {
          staking_id: stakingId,
          account_id: account.id,
          product_id: product.id,
          previous_status: null,
          next_status: "PENDING",
          idempotency_key_hint: input.idempotency_key.slice(0, 12),
        },
      });

      const detail = await getAccountStakingById(conn, stakingId);
      if (!detail) {
        throw notFound("staking not found after create", { staking_id: stakingId });
      }
      return { staking: toStakingResponse(detail) };
    }).catch(async (err) => {
      if (!isMysqlDuplicateKeyError(err)) {
        throw err;
      }
      const existing = await this.withConnection((conn) => getAccountStakingByIdempotencyKey(conn, input.idempotency_key));
      if (!existing) {
        throw err;
      }
      const match = evaluateCreateIdempotency(existing, {
        account_id: input.account_id,
        staking_product_id: input.staking_product_id,
        principal_amount_base: principalAmountBase,
        idempotency_key: input.idempotency_key,
      });
      if (match === "match") {
        return { staking: toStakingResponse(existing) };
      }
      throw conflictError("idempotency_key conflicts with existing staking request", {
        staking_id: existing.id,
      });
    });
  }

  async listMyStakings(input: {
    account_id: string;
    status?: AccountStakingStatus;
    product_id?: string;
    page: number;
    limit: number;
    sort: AccountStakingSort;
  }) {
    return this.withConnection(async (conn) => {
      const result = await listAccountStakings(conn, {
        account_id: input.account_id,
        status: input.status,
        product_id: input.product_id,
        page: input.page,
        limit: input.limit,
        sort: input.sort,
      });
      return {
        items: result.items.map(toStakingResponse),
        total: result.total,
      };
    });
  }

  async getMyStaking(input: { account_id: string; staking_id: string }) {
    return this.withConnection(async (conn) => {
      const staking = await getAccountStakingById(conn, input.staking_id);
      if (!staking || !isOwnedByAccount(staking.account_id, input.account_id)) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      return { staking: toStakingResponse(staking) };
    });
  }

  async cancelMyStaking(input: CancelMyStakingInput) {
    assertIdempotencyKey(input.idempotency_key);

    return withTx(this.pool, async (conn) => {
      const account = await getAccountByIdForUpdate(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      assertActiveAccount(account);

      const staking = await getAccountStakingByIdForUpdate(conn, input.staking_id);
      if (!staking || !isOwnedByAccount(staking.account_id, input.account_id)) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }

      const transition = resolveUserCancelTransition(staking.status);
      if (transition === "ALREADY_REQUESTED") {
        const existing = await getAccountStakingById(conn, staking.id);
        if (!existing) {
          throw notFound("staking not found", { staking_id: staking.id });
        }
        return { staking: toStakingResponse(existing) };
      }

      const product = await getStakingProductById(conn, staking.staking_product_id);
      if (!product) {
        throw notFound("staking_product not found", { staking_product_id: staking.staking_product_id });
      }

      const now = new Date();

      if (transition === "CANCELLED") {
        const cancelLedgerEventId = newId();
        await insertLedgerEvent(conn, {
          id: cancelLedgerEventId,
          account_id: staking.account_id,
          product_id: staking.staking_product_id,
          policy_version_id: staking.policy_version_id,
          event_time: now.toISOString(),
          event_type: "STAKING_CANCELLED",
          amount_base: staking.principal_amount_base,
          decimals: product.decimals,
          symbol: product.symbol,
          reference_id: `staking.cancel:${staking.id}`,
          meta: {
            staking_id: staking.id,
            transition: { from: staking.status, to: "CANCELLED" },
            reason: input.reason ?? null,
            idempotency_key_hint: input.idempotency_key.slice(0, 12),
          },
          created_by: account.id,
        });

        await updateAccountStaking(conn, {
          id: staking.id,
          status: "CANCELLED",
          cancelled_at: now,
          cancellation_ledger_event_id: cancelLedgerEventId,
          updated_at: now,
        });

        await insertAdminAuditLog(conn, {
          actor_account_id: account.id,
          action: "USER_STAKING_CANCELLED",
          target_table: "account_stakings",
          target_id: staking.id,
          meta: {
            staking_id: staking.id,
            account_id: account.id,
            product_id: staking.staking_product_id,
            previous_status: staking.status,
            next_status: "CANCELLED",
            reason: input.reason ?? null,
            idempotency_key_hint: input.idempotency_key.slice(0, 12),
          },
        });
      } else {
        await updateAccountStaking(conn, {
          id: staking.id,
          status: "CANCEL_REQUESTED",
          cancel_requested_at: now,
          updated_at: now,
        });

        await insertAdminAuditLog(conn, {
          actor_account_id: account.id,
          action: "USER_STAKING_CANCEL_REQUEST",
          target_table: "account_stakings",
          target_id: staking.id,
          meta: {
            staking_id: staking.id,
            account_id: account.id,
            product_id: staking.staking_product_id,
            previous_status: staking.status,
            next_status: "CANCEL_REQUESTED",
            reason: input.reason ?? null,
            idempotency_key_hint: input.idempotency_key.slice(0, 12),
          },
        });
      }

      const detail = await getAccountStakingById(conn, staking.id);
      if (!detail) {
        throw notFound("staking not found after cancel", { staking_id: staking.id });
      }
      return { staking: toStakingResponse(detail) };
    });
  }

  async listAdminStakings(input: {
    actor_account_id: string;
    q?: string;
    account_id?: string;
    product_id?: string;
    status?: AccountStakingStatus;
    created_from?: string;
    created_to?: string;
    matures_from?: string;
    matures_to?: string;
    page: number;
    limit: number;
    sort: AccountStakingSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const result = await listAccountStakings(conn, {
        q: input.q,
        account_id: input.account_id,
        product_id: input.product_id,
        status: input.status,
        created_from: input.created_from,
        created_to: input.created_to,
        matures_from: input.matures_from,
        matures_to: input.matures_to,
        page: input.page,
        limit: input.limit,
        sort: input.sort,
      });
      return {
        items: result.items.map(toAdminStakingResponse),
        total: result.total,
      };
    });
  }

  async getAdminStaking(input: { actor_account_id: string; staking_id: string }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const staking = await getAccountStakingById(conn, input.staking_id);
      if (!staking) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      return { staking: toAdminStakingResponse(staking) };
    });
  }

  async activateAdminStaking(input: AdminTransitionInput) {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const staking = await getAccountStakingByIdForUpdate(conn, input.staking_id);
      if (!staking) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      resolveAdminActivateTransition(staking.status);

      const account = await getAccountByIdForUpdate(conn, staking.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: staking.account_id });
      }
      assertActiveAccount(account);

      const product = await getStakingProductByIdForUpdate(conn, staking.staking_product_id);
      if (!product) {
        throw notFound("staking_product not found", { staking_product_id: staking.staking_product_id });
      }
      if (!Boolean(product.is_active)) {
        throw validationError("staking_product is inactive", { staking_product_id: staking.staking_product_id });
      }

      const policy = await lockPolicyVersion(conn, staking.policy_version_id);
      if (!policy) {
        throw notFound("policy_version not found", { policy_version_id: staking.policy_version_id });
      }
      assertUsablePolicyStatus(policy.status);

      const now = new Date();
      const maturesAt = calculateMaturesAt(now, staking.duration_days_snapshot);
      const lockLedgerEventId = newId();
      const activateLedgerEventId = newId();

      await insertLedgerEvent(conn, {
        id: lockLedgerEventId,
        account_id: staking.account_id,
        product_id: staking.staking_product_id,
        policy_version_id: staking.policy_version_id,
        event_time: now.toISOString(),
        event_type: "STAKING_PRINCIPAL_LOCKED",
        amount_base: staking.principal_amount_base,
        decimals: product.decimals,
        symbol: product.symbol,
        reference_id: `staking.lock:${staking.id}`,
        meta: {
          staking_id: staking.id,
          transition: { from: staking.status, to: "ACTIVE" },
          note: "off-chain principal lock event only; balance deduction is not implemented in this phase",
        },
        created_by: actor.id,
      });

      await insertLedgerEvent(conn, {
        id: activateLedgerEventId,
        account_id: staking.account_id,
        product_id: staking.staking_product_id,
        policy_version_id: staking.policy_version_id,
        event_time: now.toISOString(),
        event_type: "STAKING_ACTIVATED",
        amount_base: staking.principal_amount_base,
        decimals: product.decimals,
        symbol: product.symbol,
        reference_id: `staking.activate:${staking.id}`,
        meta: {
          staking_id: staking.id,
          transition: { from: staking.status, to: "ACTIVE" },
          lock_ledger_event_id: lockLedgerEventId,
        },
        created_by: actor.id,
      });

      await updateAccountStaking(conn, {
        id: staking.id,
        status: "ACTIVE",
        activated_at: now,
        started_at: now,
        matures_at: maturesAt,
        updated_at: now,
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_STAKING_ACTIVATE",
        target_table: "account_stakings",
        target_id: staking.id,
        meta: {
          staking_id: staking.id,
          account_id: staking.account_id,
          product_id: staking.staking_product_id,
          previous_status: staking.status,
          next_status: "ACTIVE",
          lock_ledger_event_id: lockLedgerEventId,
          activate_ledger_event_id: activateLedgerEventId,
        },
      });

      const detail = await getAccountStakingById(conn, staking.id);
      if (!detail) {
        throw notFound("staking not found after activate", { staking_id: staking.id });
      }
      return { staking: toAdminStakingResponse(detail) };
    });
  }

  async rejectAdminStaking(input: Required<Pick<AdminTransitionInput, "actor_account_id" | "staking_id" | "reason">>) {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const staking = await getAccountStakingByIdForUpdate(conn, input.staking_id);
      if (!staking) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      resolveAdminRejectTransition(staking.status);

      const product = await getStakingProductById(conn, staking.staking_product_id);
      if (!product) {
        throw notFound("staking_product not found", { staking_product_id: staking.staking_product_id });
      }

      const now = new Date();
      const cancelLedgerEventId = newId();

      await insertLedgerEvent(conn, {
        id: cancelLedgerEventId,
        account_id: staking.account_id,
        product_id: staking.staking_product_id,
        policy_version_id: staking.policy_version_id,
        event_time: now.toISOString(),
        event_type: "STAKING_CANCELLED",
        amount_base: staking.principal_amount_base,
        decimals: product.decimals,
        symbol: product.symbol,
        reference_id: `staking.cancel:${staking.id}`,
        meta: {
          staking_id: staking.id,
          transition: { from: staking.status, to: "CANCELLED" },
          reason: input.reason,
          action: "REJECT",
        },
        created_by: actor.id,
      });

      await updateAccountStaking(conn, {
        id: staking.id,
        status: "CANCELLED",
        cancelled_at: now,
        cancellation_ledger_event_id: cancelLedgerEventId,
        updated_at: now,
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_STAKING_REJECT",
        target_table: "account_stakings",
        target_id: staking.id,
        meta: {
          staking_id: staking.id,
          account_id: staking.account_id,
          product_id: staking.staking_product_id,
          previous_status: staking.status,
          next_status: "CANCELLED",
          reason: input.reason,
          cancellation_ledger_event_id: cancelLedgerEventId,
          action: "REJECT",
        },
      });

      const detail = await getAccountStakingById(conn, staking.id);
      if (!detail) {
        throw notFound("staking not found after reject", { staking_id: staking.id });
      }
      return { staking: toAdminStakingResponse(detail) };
    });
  }

  async cancelAdminStaking(input: AdminTransitionInput) {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const staking = await getAccountStakingByIdForUpdate(conn, input.staking_id);
      if (!staking) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      resolveAdminCancelTransition(staking.status);

      const product = await getStakingProductById(conn, staking.staking_product_id);
      if (!product) {
        throw notFound("staking_product not found", { staking_product_id: staking.staking_product_id });
      }

      const now = new Date();
      const cancelLedgerEventId = newId();
      const releaseLedgerEventId = newId();

      await insertLedgerEvent(conn, {
        id: cancelLedgerEventId,
        account_id: staking.account_id,
        product_id: staking.staking_product_id,
        policy_version_id: staking.policy_version_id,
        event_time: now.toISOString(),
        event_type: "STAKING_CANCELLED",
        amount_base: staking.principal_amount_base,
        decimals: product.decimals,
        symbol: product.symbol,
        reference_id: `staking.cancel:${staking.id}`,
        meta: {
          staking_id: staking.id,
          transition: { from: staking.status, to: "CANCELLED" },
          reason: input.reason ?? null,
        },
        created_by: actor.id,
      });

      await insertLedgerEvent(conn, {
        id: releaseLedgerEventId,
        account_id: staking.account_id,
        product_id: staking.staking_product_id,
        policy_version_id: staking.policy_version_id,
        event_time: now.toISOString(),
        event_type: "STAKING_PRINCIPAL_RELEASED",
        amount_base: staking.principal_amount_base,
        decimals: product.decimals,
        symbol: product.symbol,
        reference_id: `staking.release:${staking.id}`,
        meta: {
          staking_id: staking.id,
          reason: input.reason ?? null,
          note: "off-chain principal release event only; balance return is not implemented in this phase",
          cancellation_ledger_event_id: cancelLedgerEventId,
        },
        created_by: actor.id,
      });

      await updateAccountStaking(conn, {
        id: staking.id,
        status: "CANCELLED",
        cancelled_at: now,
        cancellation_ledger_event_id: cancelLedgerEventId,
        updated_at: now,
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_STAKING_CANCEL",
        target_table: "account_stakings",
        target_id: staking.id,
        meta: {
          staking_id: staking.id,
          account_id: staking.account_id,
          product_id: staking.staking_product_id,
          previous_status: staking.status,
          next_status: "CANCELLED",
          reason: input.reason ?? null,
          cancellation_ledger_event_id: cancelLedgerEventId,
          principal_release_ledger_event_id: releaseLedgerEventId,
        },
      });

      const detail = await getAccountStakingById(conn, staking.id);
      if (!detail) {
        throw notFound("staking not found after cancel", { staking_id: staking.id });
      }
      return { staking: toAdminStakingResponse(detail) };
    });
  }

  async listAdminAccountStakings(input: {
    actor_account_id: string;
    account_id: string;
    status?: AccountStakingStatus;
    product_id?: string;
    page: number;
    limit: number;
    sort: AccountStakingSort;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }

      const result = await listAccountStakings(conn, {
        account_id: input.account_id,
        status: input.status,
        product_id: input.product_id,
        page: input.page,
        limit: input.limit,
        sort: input.sort,
      });
      return {
        items: result.items.map(toAdminStakingResponse),
        total: result.total,
      };
    });
  }
}
