import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertCalcRunStatusTransitionAllowed, type CalcRunStatus } from "../domain/calcRunStatus.js";
import { conflictError, notFound, validationError } from "../domain/errors.js";
import { assertIntString, assertNonNegativeIntString } from "../domain/amount.js";
import { insertAdminAuditLog, listAdminAuditLogs } from "../repos/auditLogRepo.js";
import { getCalcRunForUpdate, insertCalcRun, listCalcRuns, updateCalcRunStatus } from "../repos/calcRunsRepo.js";
import {
  findExistingLedgerEventReferenceIds,
  insertLedgerEvent,
  insertLedgerEvents,
  listLedgerEvents
} from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById, insertPolicyVersion, listPolicyVersions, lockPolicyVersion, activatePolicyVersion } from "../repos/policyVersionsRepo.js";
import { getReportSummary } from "../repos/reportsRepo.js";
import { deleteSettlementItem, insertSettlementItem, listSettlementItems, updateSettlementItemAmount } from "../repos/settlementItemsRepo.js";
import { insertStakingProduct, listStakingProducts } from "../repos/stakingProductsRepo.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";
import { findDuplicateReferenceIds, parseLedgerEventsCsv } from "./ledgerEventsCsv.js";

import type { LedgerEventInput, LedgerEventType, SettlementType } from "../../shared/bjc-types.js";

const ledgerEventTypes = new Set([
  "STAKE",
  "UNSTAKE",
  "STAKING_REQUESTED",
  "STAKING_PRINCIPAL_LOCKED",
  "STAKING_ACTIVATED",
  "STAKING_CANCELLED",
  "STAKING_PRINCIPAL_RELEASED",
  "STAKING_MATURED",
  "DAILY_REWARD_ACCRUAL",
  "DAILY_REWARD_PAYOUT",
  "DIRECT_REFERRAL_BONUS",
  "RANK_BONUS",
  "CONTRIBUTION_BONUS",
  "WITHDRAWAL_REQUEST",
  "WITHDRAWAL_FEE",
  "WITHDRAWAL_RELEASE",
  "WITHDRAWAL_FREEZE",
  "WITHDRAWAL_UNFREEZE",
  "SIDECAR_TRIGGER",
  "SIDECAR_RELEASE",
  "ADJUSTMENT"
]);

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as any).code === "ER_DUP_ENTRY";
}

function assertDailyInterestBps(value: string): void {
  if (!/^\d+$/.test(value)) {
    throw validationError("daily_interest_bps must be a non-negative integer string", { daily_interest_bps: value });
  }
}

function validateLedgerEventInput(event: LedgerEventInput): void {
  if (!ledgerEventTypes.has(event.event_type)) {
    throw validationError("invalid event_type", { event_type: event.event_type });
  }

  assertIntString("amount_base", event.amount_base);
  if (event.amount_base.startsWith("-") && event.event_type !== "ADJUSTMENT") {
    throw validationError("negative amount_base is only allowed for ADJUSTMENT", {
      event_type: event.event_type,
      amount_base: event.amount_base
    });
  }
}

export class PolicyEngine {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  async createPolicyVersion(input: {
    actor_account_id: string;
    note?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
  }): Promise<{ policy_version_id: string }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const id = newId();
      await insertPolicyVersion(conn, {
        id,
        status: "DRAFT",
        note: input.note ?? null,
        effective_from: input.effective_from ?? null,
        effective_to: input.effective_to ?? null,
        created_by: actor.id
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "POLICY_VERSION_CREATE",
        target_table: "policy_versions",
        target_id: id,
        meta: {
          note: input.note ?? null,
          effective_from: input.effective_from ?? null,
          effective_to: input.effective_to ?? null
        }
      });

      return { policy_version_id: id };
    });
  }

  async activatePolicyVersion(input: { actor_account_id: string; policy_version_id: string }): Promise<void> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const pv = await lockPolicyVersion(conn, input.policy_version_id);
      if (!pv) throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      if (pv.status === "RETIRED") throw validationError("cannot activate retired policy_version");

      try {
        await activatePolicyVersion(conn, input.policy_version_id);
      } catch (err) {
        if (isMysqlDuplicateKeyError(err)) {
          throw conflictError("ACTIVE policy_version already exists");
        }
        throw err;
      }

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "POLICY_VERSION_ACTIVATE",
        target_table: "policy_versions",
        target_id: input.policy_version_id,
        meta: {}
      });
    });
  }

  async getPolicyVersion(input: { actor_account_id: string; policy_version_id: string }) {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      const pv = await getPolicyVersionById(conn, input.policy_version_id);
      if (!pv) throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      return pv;
    });
  }

  async listPolicyVersions(input: {
    actor_account_id: string;
    status?: "DRAFT" | "ACTIVE" | "RETIRED";
    effective_from?: string;
    effective_to?: string;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return listPolicyVersions(conn, input);
    });
  }

  async createStakingProduct(input: {
    actor_account_id: string;
    policy_version_id: string;
    name: string;
    symbol: string;
    decimals: number;
    min_stake_amount_base: string;
    max_stake_amount_base: string;
    staking_days: number;
    daily_interest_bps: string;
    is_active: boolean;
  }): Promise<{ staking_product_id: string }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const policyVersion = await lockPolicyVersion(conn, input.policy_version_id);
      if (!policyVersion) {
        throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      }

      assertNonNegativeIntString("min_stake_amount_base", input.min_stake_amount_base);
      assertNonNegativeIntString("max_stake_amount_base", input.max_stake_amount_base);
      assertDailyInterestBps(input.daily_interest_bps);
      if (BigInt(input.min_stake_amount_base) > BigInt(input.max_stake_amount_base)) {
        throw validationError("min_stake_amount_base must be less than or equal to max_stake_amount_base", {
          min_stake_amount_base: input.min_stake_amount_base,
          max_stake_amount_base: input.max_stake_amount_base
        });
      }

      const id = newId();
      await insertStakingProduct(conn, {
        id,
        policy_version_id: input.policy_version_id,
        name: input.name,
        symbol: input.symbol,
        decimals: input.decimals,
        min_stake_amount_base: input.min_stake_amount_base,
        max_stake_amount_base: input.max_stake_amount_base,
        staking_days: input.staking_days,
        daily_interest_bps: input.daily_interest_bps,
        is_active: input.is_active
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "STAKING_PRODUCT_CREATE",
        target_table: "staking_products",
        target_id: id,
        meta: {
          policy_version_id: input.policy_version_id,
          name: input.name,
          symbol: input.symbol,
          is_active: input.is_active
        }
      });

      return { staking_product_id: id };
    });
  }

  async upsertStakingProducts(input: {
    actor_account_id: string;
    policy_version_id: string;
    products: Array<{
      id?: string | null;
      name: string;
      symbol: string;
      decimals: number;
      min_stake_amount_base: string;
      max_stake_amount_base: string;
      staking_days: number;
      daily_interest_bps: string;
      is_active: boolean;
    }>;
  }): Promise<{ upserted: number; ids: string[] }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const policyVersion = await lockPolicyVersion(conn, input.policy_version_id);
      if (!policyVersion) {
        throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      }

      const ids: string[] = [];
      for (const product of input.products) {
        assertNonNegativeIntString("min_stake_amount_base", product.min_stake_amount_base);
        assertNonNegativeIntString("max_stake_amount_base", product.max_stake_amount_base);
        assertDailyInterestBps(product.daily_interest_bps);
        if (BigInt(product.min_stake_amount_base) > BigInt(product.max_stake_amount_base)) {
          throw validationError("min_stake_amount_base must be less than or equal to max_stake_amount_base", {
            min_stake_amount_base: product.min_stake_amount_base,
            max_stake_amount_base: product.max_stake_amount_base
          });
        }

        const id = product.id ?? newId();
        await insertStakingProduct(conn, {
          id,
          policy_version_id: input.policy_version_id,
          name: product.name,
          symbol: product.symbol,
          decimals: product.decimals,
          min_stake_amount_base: product.min_stake_amount_base,
          max_stake_amount_base: product.max_stake_amount_base,
          staking_days: product.staking_days,
          daily_interest_bps: product.daily_interest_bps,
          is_active: product.is_active
        });
        ids.push(id);
      }

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "STAKING_PRODUCTS_UPSERT",
        target_table: "staking_products",
        target_id: input.policy_version_id,
        meta: { policy_version_id: input.policy_version_id, upserted: ids.length, ids }
      });

      return { upserted: ids.length, ids };
    });
  }

  async listStakingProducts(input: {
    actor_account_id: string;
    policy_version_id?: string;
    is_active?: boolean;
    symbol?: string;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return listStakingProducts(conn, input);
    });
  }

  async createLedgerEvent(input: { actor_account_id: string; event: LedgerEventInput }): Promise<{ ledger_event_id: string }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      validateLedgerEventInput(input.event);

      const id = newId();
      await insertLedgerEvent(conn, {
        id,
        account_id: input.event.account_id,
        product_id: input.event.product_id,
        policy_version_id: input.event.policy_version_id,
        calc_run_id: input.event.calc_run_id ?? null,
        event_time: input.event.event_time,
        event_type: input.event.event_type,
        amount_base: input.event.amount_base,
        decimals: input.event.decimals,
        symbol: input.event.symbol,
        reference_id: input.event.reference_id,
        related_account_id: input.event.related_account_id ?? null,
        meta: input.event.meta ?? {},
        created_by: actor.id
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "LEDGER_EVENT_CREATE",
        target_table: "ledger_events",
        target_id: id,
        meta: { reference_id: input.event.reference_id, event_type: input.event.event_type }
      });

      return { ledger_event_id: id };
    });
  }

  async importLedgerEventsCsv(input: {
    actor_account_id: string;
    csv_text: string;
  }): Promise<{ inserted_count: number; rejected_count: number; errors: string[] }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const events = parseLedgerEventsCsv(input.csv_text);
      const duplicateInCsv = findDuplicateReferenceIds(events.map((event) => event.reference_id));
      if (duplicateInCsv.length) {
        throw conflictError("duplicate reference_id found in csv", { reference_ids: duplicateInCsv });
      }

      for (const event of events) {
        validateLedgerEventInput(event);
      }

      const existingReferenceIds = await findExistingLedgerEventReferenceIds(
        conn,
        events.map((event) => event.reference_id)
      );
      if (existingReferenceIds.length) {
        throw conflictError("reference_id already exists", { reference_ids: existingReferenceIds });
      }

      const inserts = events.map((event) => ({
        id: newId(),
        account_id: event.account_id,
        product_id: event.product_id,
        policy_version_id: event.policy_version_id,
        calc_run_id: event.calc_run_id ?? null,
        event_time: event.event_time,
        event_type: event.event_type,
        amount_base: event.amount_base,
        decimals: event.decimals,
        symbol: event.symbol,
        reference_id: event.reference_id,
        related_account_id: event.related_account_id ?? null,
        meta: event.meta ?? {},
        created_by: actor.id
      }));

      await insertLedgerEvents(conn, inserts);
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "LEDGER_EVENTS_IMPORT_CSV",
        target_table: "ledger_events",
        target_id: null,
        meta: {
          inserted_count: inserts.length,
          reference_ids: inserts.map((event) => event.reference_id)
        }
      });

      return { inserted_count: inserts.length, rejected_count: 0, errors: [] };
    });
  }

  async listLedgerEvents(input: {
    actor_account_id: string;
    account_id?: string;
    product_id?: string;
    policy_version_id?: string;
    calc_run_id?: string;
    event_type?: LedgerEventType;
    reference_id?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return listLedgerEvents(conn, input);
    });
  }

  async createCalcRun(input: {
    actor_account_id: string;
    policy_version_id: string;
    run_type: string;
    run_date: string;
  }): Promise<{ calc_run_id: string }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const id = newId();
      await insertCalcRun(conn, {
        id,
        policy_version_id: input.policy_version_id,
        run_type: input.run_type,
        run_date: input.run_date,
        status: "PENDING",
        created_by: actor.id
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "CALC_RUN_CREATE",
        target_table: "calc_runs",
        target_id: id,
        meta: { policy_version_id: input.policy_version_id, run_type: input.run_type, run_date: input.run_date }
      });

      return { calc_run_id: id };
    });
  }

  async transitionCalcRunStatus(input: {
    actor_account_id: string;
    calc_run_id: string;
    to_status: CalcRunStatus;
    allow_failed_retry: boolean;
    set_finalized_at: boolean;
    error_message?: string | null;
  }): Promise<{ from_status: CalcRunStatus; to_status: CalcRunStatus }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const row = await getCalcRunForUpdate(conn, input.calc_run_id);
      if (!row) throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });

      assertCalcRunStatusTransitionAllowed({
        from: row.status,
        to: input.to_status,
        allowFailedRetry: input.allow_failed_retry
      });

      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: input.to_status,
        finalized_at:
          input.to_status === "FINALIZED" && input.set_finalized_at
            ? new Date().toISOString().slice(0, 19).replace("T", " ")
            : null,
        error_message: input.error_message ?? null
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "CALC_RUN_STATUS_TRANSITION",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        meta: { from: row.status, to: input.to_status, error_message: input.error_message ?? null }
      });

      return { from_status: row.status, to_status: input.to_status };
    });
  }

  async listCalcRuns(input: {
    actor_account_id: string;
    policy_version_id?: string;
    run_type?: string;
    status?: CalcRunStatus;
    run_date_from?: string;
    run_date_to?: string;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return listCalcRuns(conn, input);
    });
  }

  async insertSettlementItem(input: {
    actor_account_id: string;
    calc_run_id: string;
    settlement_type: SettlementType;
    account_id: string;
    amount_base: string;
    decimals: number;
    symbol: string;
    reference_id?: string | null;
    meta?: object;
  }): Promise<{ settlement_item_id: string }> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      assertNonNegativeIntString("amount_base", input.amount_base);

      const run = await getCalcRunForUpdate(conn, input.calc_run_id);
      if (!run) throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      if (run.status === "FINALIZED" || run.finalized_at) {
        throw validationError("settlement_items is locked after finalize", { calc_run_id: input.calc_run_id });
      }

      const id = newId();
      await insertSettlementItem(conn, {
        id,
        calc_run_id: input.calc_run_id,
        settlement_type: input.settlement_type,
        account_id: input.account_id,
        amount_base: input.amount_base,
        decimals: input.decimals,
        symbol: input.symbol,
        reference_id: input.reference_id ?? null,
        meta: input.meta ?? {}
      });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "SETTLEMENT_ITEM_INSERT",
        target_table: "settlement_items",
        target_id: id,
        meta: { calc_run_id: input.calc_run_id, settlement_type: input.settlement_type }
      });

      return { settlement_item_id: id };
    });
  }

  async updateSettlementItemAmount(input: {
    actor_account_id: string;
    calc_run_id: string;
    settlement_item_id: string;
    amount_base: string;
    meta?: object;
  }): Promise<void> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      assertNonNegativeIntString("amount_base", input.amount_base);

      const [itemRows] = await conn.query(
        "select id, calc_run_id from settlement_items where id = ? for update",
        [input.settlement_item_id]
      );
      const item = (itemRows as any[])[0] as { id: string; calc_run_id: string } | undefined;
      if (!item) throw notFound("settlement_item not found", { settlement_item_id: input.settlement_item_id });
      if (item.calc_run_id !== input.calc_run_id) {
        throw validationError("calc_run_id mismatch for settlement_item", {
          expected_calc_run_id: item.calc_run_id,
          provided_calc_run_id: input.calc_run_id
        });
      }

      const run = await getCalcRunForUpdate(conn, input.calc_run_id);
      if (!run) throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      if (run.status === "FINALIZED" || run.finalized_at) {
        throw validationError("settlement_items is locked after finalize", { calc_run_id: input.calc_run_id });
      }

      await updateSettlementItemAmount(conn, { id: input.settlement_item_id, amount_base: input.amount_base, meta: input.meta });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "SETTLEMENT_ITEM_UPDATE",
        target_table: "settlement_items",
        target_id: input.settlement_item_id,
        meta: { calc_run_id: input.calc_run_id }
      });
    });
  }

  async deleteSettlementItem(input: {
    actor_account_id: string;
    calc_run_id: string;
    settlement_item_id: string;
  }): Promise<void> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const [itemRows] = await conn.query(
        "select id, calc_run_id from settlement_items where id = ? for update",
        [input.settlement_item_id]
      );
      const item = (itemRows as any[])[0] as { id: string; calc_run_id: string } | undefined;
      if (!item) throw notFound("settlement_item not found", { settlement_item_id: input.settlement_item_id });
      if (item.calc_run_id !== input.calc_run_id) {
        throw validationError("calc_run_id mismatch for settlement_item", {
          expected_calc_run_id: item.calc_run_id,
          provided_calc_run_id: input.calc_run_id
        });
      }

      const run = await getCalcRunForUpdate(conn, input.calc_run_id);
      if (!run) throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      if (run.status === "FINALIZED" || run.finalized_at) {
        throw validationError("settlement_items is locked after finalize", { calc_run_id: input.calc_run_id });
      }

      await deleteSettlementItem(conn, input.settlement_item_id);

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "SETTLEMENT_ITEM_DELETE",
        target_table: "settlement_items",
        target_id: input.settlement_item_id,
        meta: { calc_run_id: input.calc_run_id }
      });
    });
  }

  async listSettlementItems(input: {
    actor_account_id: string;
    calc_run_id?: string;
    account_id?: string;
    settlement_type?: SettlementType;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return listSettlementItems(conn, input);
    });
  }

  async getSummaryReport(input: { actor_account_id: string; from?: string; to?: string; policy_version_id?: string }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return getReportSummary(conn, input);
    });
  }

  async listAuditLogs(input: {
    actor_account_id: string;
    actor_account_id_filter?: string;
    action?: string;
    target_table?: string;
    target_id?: string;
    from?: string;
    to?: string;
    page: number;
    limit: number;
  }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      return listAdminAuditLogs(conn, {
        actor_account_id: input.actor_account_id_filter,
        action: input.action,
        target_table: input.target_table,
        target_id: input.target_id,
        from: input.from,
        to: input.to,
        page: input.page,
        limit: input.limit
      });
    });
  }
}
