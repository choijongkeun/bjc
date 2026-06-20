import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertCalcRunStatusTransitionAllowed } from "../domain/calcRunStatus.js";
import { conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import {
  SIDECAR_FORMULA_VERSION,
  assertSidecarCalculationDate,
  buildSidecarFreezeReference,
  buildSidecarReleaseReference,
  calculateSidecarSplit
} from "../domain/sidecarReward.js";
import { getAccountAuthById } from "../repos/accountsRepo.js";
import { insertAdminAuditLog, listAdminAuditLogs, type AdminAuditLogRow } from "../repos/auditLogRepo.js";
import {
  getCalcRunById,
  getCalcRunByPolicyRunTypeDate,
  insertCalcRun,
  updateCalcRunStatus
} from "../repos/calcRunsRepo.js";
import { insertLedgerEvent, listLedgerEventsByReferenceIds } from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById } from "../repos/policyVersionsRepo.js";
import { getLatestSidecarEventRule } from "../repos/sidecarRulesRepo.js";
import { listSidecarWithdrawalRequests, type SidecarWithdrawalRequestRow } from "../repos/sidecarMetricsRepo.js";
import { insertSettlementItem } from "../repos/settlementItemsRepo.js";
import { newId } from "../util/ids.js";
import { requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

const SIDECAR_RUN_TYPE = "SIDECAR";
const SIDECAR_RUN_ACTION = "ADMIN_SIDECAR_RUN";
const ZERO = "0";

type SidecarRunSummary = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  zero_base_skip_count: number;
  ineligible_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_requested_amount_base: string;
  total_release_amount_base: string;
  total_freeze_amount_base: string;
  sidecar_status: string;
  status: string;
};

type SidecarSingleResultType = "created" | "duplicate" | "zero_base" | "ineligible" | "conflict";

type SidecarSingleResponse = {
  calc_run_id: string;
  status: string;
  result_type: SidecarSingleResultType;
  target_count: number;
  created_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  zero_base_skip_count: number;
  total_requested_amount_base: string;
  total_release_amount_base: string;
  total_freeze_amount_base: string;
  sidecar_status: string;
};

type SidecarProcessOutcome = {
  result_type: SidecarSingleResultType;
  requested_amount_base: string;
  release_amount_base: string;
  freeze_amount_base: string;
};

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

function toStringMetric(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toNumberMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function addAmountStrings(...values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

function createEmptySummary(calc_run_id: string, status = "RUNNING", sidecar_status = "NORMAL"): SidecarRunSummary {
  return {
    calc_run_id,
    target_count: 0,
    created_count: 0,
    zero_base_skip_count: 0,
    ineligible_skip_count: 0,
    duplicate_skip_count: 0,
    conflict_count: 0,
    failed_count: 0,
    total_requested_amount_base: ZERO,
    total_release_amount_base: ZERO,
    total_freeze_amount_base: ZERO,
    sidecar_status,
    status
  };
}

function buildDateWindow(calculation_date: string): { start_sql: string; end_exclusive_sql: string } {
  const start = new Date(`${calculation_date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw validationError("invalid calculation_date", { calculation_date });
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start_sql: formatSqlDateTime(start),
    end_exclusive_sql: formatSqlDateTime(end)
  };
}

export function assertCanRunSidecar(role: "USER" | "READER" | "ADMIN"): void {
  if (role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: role });
  }
}

export class SidecarRewardService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async prepareCalcRun(input: {
    actor_account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }): Promise<{ calc_run_id: string; should_execute: boolean }> {
    const now = new Date();
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunSidecar(actor.role);

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: SIDECAR_RUN_TYPE,
        run_date: input.calculation_date
      });

      if (existing) {
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("sidecar calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "SUCCEEDED" || existing.status === "FINALIZED") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: SIDECAR_RUN_ACTION,
            target_table: "calc_runs",
            target_id: existing.id,
            meta: {
              calc_run_id: existing.id,
              policy_version_id: input.policy_version_id,
              calculation_date: input.calculation_date,
              status: existing.status,
              reused_existing_run: true
            }
          });
          return { calc_run_id: existing.id, should_execute: false };
        }

        assertCalcRunStatusTransitionAllowed({
          from: existing.status,
          to: "RUNNING",
          allowFailedRetry: true
        });
        await updateCalcRunStatus(conn, {
          id: existing.id,
          status: "RUNNING",
          started_at: formatSqlDateTime(now),
          finished_at: null,
          finalized_at: null,
          error_message: null
        });
        return { calc_run_id: existing.id, should_execute: true };
      }

      const calc_run_id = newId();
      await insertCalcRun(conn, {
        id: calc_run_id,
        policy_version_id: input.policy_version_id,
        run_type: SIDECAR_RUN_TYPE,
        run_date: input.calculation_date,
        status: "PENDING",
        created_by: actor.id
      });
      await updateCalcRunStatus(conn, {
        id: calc_run_id,
        status: "RUNNING",
        started_at: formatSqlDateTime(now),
        error_message: null
      });
      return { calc_run_id, should_execute: true };
    });
  }

  private async completeCalcRun(input: {
    actor_account_id: string;
    calc_run_id: string;
    policy_version_id: string;
    calculation_date: string;
    status: "SUCCEEDED" | "FAILED";
    summary: SidecarRunSummary;
    error_message?: string | null;
    mode: "batch" | "single";
    account_id?: string;
  }): Promise<void> {
    await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunSidecar(actor.role);
      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: input.status,
        finished_at: formatSqlDateTime(new Date()),
        error_message: input.error_message ?? null
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: SIDECAR_RUN_ACTION,
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        meta: {
          ...input.summary,
          mode: input.mode,
          account_id: input.account_id ?? null,
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          error_message: input.error_message ?? null
        }
      });
    });
  }

  private async getStoredSummary(conn: DbConn, calc_run_id: string): Promise<SidecarRunSummary | null> {
    const audit = await listAdminAuditLogs(conn, {
      action: SIDECAR_RUN_ACTION,
      target_table: "calc_runs",
      target_id: calc_run_id,
      page: 1,
      limit: 20
    });
    for (const row of audit.items) {
      const meta = toJsonObject(row.meta);
      const target_count = toNumberMetric(meta.target_count);
      const created_count = toNumberMetric(meta.created_count);
      const zero_base_skip_count = toNumberMetric(meta.zero_base_skip_count);
      const ineligible_skip_count = toNumberMetric(meta.ineligible_skip_count);
      const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
      const conflict_count = toNumberMetric(meta.conflict_count);
      const failed_count = toNumberMetric(meta.failed_count);
      const total_requested_amount_base = toStringMetric(meta.total_requested_amount_base);
      const total_release_amount_base = toStringMetric(meta.total_release_amount_base);
      const total_freeze_amount_base = toStringMetric(meta.total_freeze_amount_base);
      const sidecar_status = toStringMetric(meta.sidecar_status);
      if (
        target_count !== null &&
        created_count !== null &&
        zero_base_skip_count !== null &&
        ineligible_skip_count !== null &&
        duplicate_skip_count !== null &&
        conflict_count !== null &&
        failed_count !== null &&
        total_requested_amount_base !== null &&
        total_release_amount_base !== null &&
        total_freeze_amount_base !== null &&
        sidecar_status !== null
      ) {
        return {
          calc_run_id,
          target_count,
          created_count,
          zero_base_skip_count,
          ineligible_skip_count,
          duplicate_skip_count,
          conflict_count,
          failed_count,
          total_requested_amount_base,
          total_release_amount_base,
          total_freeze_amount_base,
          sidecar_status,
          status: toStringMetric(meta.status) ?? "SUCCEEDED"
        };
      }
    }
    return null;
  }

  private async buildSummaryByCalcRun(conn: DbConn, calc_run_id: string, status: string): Promise<SidecarRunSummary> {
    const stored = await this.getStoredSummary(conn, calc_run_id);
    return stored ?? createEmptySummary(calc_run_id, status);
  }

  private async getSidecarRuleSnapshot(conn: DbConn, policy_version_id: string) {
    const rule = await getLatestSidecarEventRule(conn, policy_version_id);
    if (!rule) {
      return {
        id: null as string | null,
        status: "NORMAL" as const,
        release_bps: "10000",
        freeze_bps: "0"
      };
    }
    if (rule.status === "NORMAL" || rule.status === "RELEASED") {
      return {
        id: rule.id,
        status: rule.status,
        release_bps: "10000",
        freeze_bps: "0"
      };
    }
    return {
      id: rule.id,
      status: rule.status,
      release_bps: rule.release_bps,
      freeze_bps: rule.freeze_bps
    };
  }

  private async ensurePreconditions(conn: DbConn, input: { actor_account_id: string; policy_version_id: string }) {
    const actor = await requireActor(conn, input.actor_account_id);
    assertCanRunSidecar(actor.role);
    const policy = await getPolicyVersionById(conn, input.policy_version_id);
    if (!policy) {
      throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
    }
    return {
      actor_id: actor.id,
      sidecar: await this.getSidecarRuleSnapshot(conn, input.policy_version_id)
    };
  }

  private async processWithdrawalRequest(input: {
    actor_account_id: string;
    calc_run_id: string;
    calculation_date: string;
    request: SidecarWithdrawalRequestRow;
    sidecar_rule: { id: string | null; status: string; release_bps: string; freeze_bps: string };
    audit_mode: "batch" | "single";
  }): Promise<SidecarProcessOutcome> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunSidecar(actor.role);

      const account = await getAccountAuthById(conn, input.request.account_id);
      if (!account || account.role !== "USER" || account.status !== "ACTIVE") {
        return {
          result_type: "ineligible",
          requested_amount_base: ZERO,
          release_amount_base: ZERO,
          freeze_amount_base: ZERO
        };
      }

      if (BigInt(input.request.requested_amount_base) <= 0n) {
        return {
          result_type: "zero_base",
          requested_amount_base: input.request.requested_amount_base,
          release_amount_base: ZERO,
          freeze_amount_base: ZERO
        };
      }

      const split = calculateSidecarSplit({
        requested_amount_base: input.request.requested_amount_base,
        release_bps: input.sidecar_rule.release_bps,
        freeze_bps: input.sidecar_rule.freeze_bps
      });

      const releaseReference = buildSidecarReleaseReference({
        calculation_date: input.calculation_date,
        calc_run_id: input.calc_run_id,
        source_reference: input.request.source_reference
      });
      const freezeReference = buildSidecarFreezeReference({
        calculation_date: input.calculation_date,
        calc_run_id: input.calc_run_id,
        source_reference: input.request.source_reference
      });
      const existingEvents = await listLedgerEventsByReferenceIds(conn, [releaseReference, freezeReference]);
      if (existingEvents.length > 0) {
        const releaseEvent = existingEvents.find((item) => item.reference_id === releaseReference);
        const freezeEvent = existingEvents.find((item) => item.reference_id === freezeReference);
        const releaseMatches = !releaseEvent || releaseEvent.amount_base === split.release_amount_base;
        const freezeMatches =
          (BigInt(split.freeze_amount_base) === 0n && !freezeEvent) ||
          (freezeEvent?.amount_base === split.freeze_amount_base);
        const result_type = releaseMatches && freezeMatches ? "duplicate" : "conflict";
        if (result_type === "conflict" || input.audit_mode === "single") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: result_type === "conflict" ? "SIDECAR_CONFLICT" : "SIDECAR_DUPLICATE",
            target_table: "ledger_events",
            target_id: releaseEvent?.id ?? freezeEvent?.id ?? input.request.ledger_event_id,
            meta: {
              calc_run_id: input.calc_run_id,
              source_event_id: input.request.ledger_event_id,
              source_reference: input.request.source_reference,
              release_reference: releaseReference,
              freeze_reference: freezeReference,
              requested_amount_base: input.request.requested_amount_base,
              release_amount_base: split.release_amount_base,
              freeze_amount_base: split.freeze_amount_base
            }
          });
        }
        return {
          result_type,
          requested_amount_base: input.request.requested_amount_base,
          release_amount_base: split.release_amount_base,
          freeze_amount_base: split.freeze_amount_base
        };
      }

      const baseMeta = {
        formula_version: SIDECAR_FORMULA_VERSION,
        sidecar_event_id: input.sidecar_rule.id,
        sidecar_status: input.sidecar_rule.status,
        source_event_id: input.request.ledger_event_id,
        source_reference: input.request.source_reference,
        requested_amount_base: input.request.requested_amount_base,
        release_bps: input.sidecar_rule.release_bps,
        freeze_bps: input.sidecar_rule.freeze_bps
      };

      const releaseLedgerId = newId();
      await insertLedgerEvent(conn, {
        id: releaseLedgerId,
        account_id: input.request.account_id,
        related_account_id: input.request.related_account_id,
        product_id: null,
        policy_version_id: input.request.policy_version_id,
        calc_run_id: input.calc_run_id,
        event_time: new Date().toISOString(),
        event_type: "WITHDRAWAL_RELEASE",
        amount_base: split.release_amount_base,
        decimals: input.request.decimals,
        symbol: input.request.symbol,
        reference_id: releaseReference,
        meta: baseMeta,
        created_by: actor.id
      });
      await insertSettlementItem(conn, {
        id: newId(),
        calc_run_id: input.calc_run_id,
        settlement_type: "WITHDRAWAL_RELEASE",
        account_id: input.request.account_id,
        ledger_event_id: releaseLedgerId,
        amount_base: split.release_amount_base,
        decimals: input.request.decimals,
        symbol: input.request.symbol,
        reference_id: releaseReference,
        meta: baseMeta
      });

      if (BigInt(split.freeze_amount_base) > 0n) {
        const freezeLedgerId = newId();
        await insertLedgerEvent(conn, {
          id: freezeLedgerId,
          account_id: input.request.account_id,
          related_account_id: input.request.related_account_id,
          product_id: null,
          policy_version_id: input.request.policy_version_id,
          calc_run_id: input.calc_run_id,
          event_time: new Date().toISOString(),
          event_type: "WITHDRAWAL_FREEZE",
          amount_base: split.freeze_amount_base,
          decimals: input.request.decimals,
          symbol: input.request.symbol,
          reference_id: freezeReference,
          meta: baseMeta,
          created_by: actor.id
        });
        await insertSettlementItem(conn, {
          id: newId(),
          calc_run_id: input.calc_run_id,
          settlement_type: "WITHDRAWAL_FREEZE",
          account_id: input.request.account_id,
          ledger_event_id: freezeLedgerId,
          amount_base: split.freeze_amount_base,
          decimals: input.request.decimals,
          symbol: input.request.symbol,
          reference_id: freezeReference,
          meta: baseMeta
        });
      }

      return {
        result_type: "created",
        requested_amount_base: input.request.requested_amount_base,
        release_amount_base: split.release_amount_base,
        freeze_amount_base: split.freeze_amount_base
      };
    });
  }

  private applyOutcomeToSummary(summary: SidecarRunSummary, outcome: SidecarProcessOutcome): SidecarRunSummary {
    const next = { ...summary };
    switch (outcome.result_type) {
      case "created":
        next.created_count += 1;
        next.total_requested_amount_base = addAmountStrings(next.total_requested_amount_base, outcome.requested_amount_base);
        next.total_release_amount_base = addAmountStrings(next.total_release_amount_base, outcome.release_amount_base);
        next.total_freeze_amount_base = addAmountStrings(next.total_freeze_amount_base, outcome.freeze_amount_base);
        break;
      case "zero_base":
        next.zero_base_skip_count += 1;
        break;
      case "ineligible":
        next.ineligible_skip_count += 1;
        break;
      case "duplicate":
        next.duplicate_skip_count += 1;
        break;
      case "conflict":
        next.conflict_count += 1;
        break;
    }
    return next;
  }

  async runBatch(input: { actor_account_id: string; policy_version_id: string; calculation_date: string }) {
    assertSidecarCalculationDate(input.calculation_date);
    const prepared = await this.prepareCalcRun(input);
    if (!prepared.should_execute) {
      return this.withConnection((conn) => this.buildSummaryByCalcRun(conn, prepared.calc_run_id, "SUCCEEDED"));
    }

    let summary = createEmptySummary(prepared.calc_run_id, "RUNNING");
    try {
      const window = buildDateWindow(input.calculation_date);
      const preconditions = await this.withConnection((conn) =>
        this.ensurePreconditions(conn, {
          actor_account_id: input.actor_account_id,
          policy_version_id: input.policy_version_id
        })
      );
      summary.sidecar_status = preconditions.sidecar.status;

      const requests = await this.withConnection((conn) =>
        listSidecarWithdrawalRequests(conn, {
          policy_version_id: input.policy_version_id,
          ...window
        })
      );
      summary.target_count = requests.length;

      for (const request of requests) {
        try {
          const outcome = await this.processWithdrawalRequest({
            actor_account_id: input.actor_account_id,
            calc_run_id: prepared.calc_run_id,
            calculation_date: input.calculation_date,
            request,
            sidecar_rule: preconditions.sidecar,
            audit_mode: "batch"
          });
          summary = this.applyOutcomeToSummary(summary, outcome);
        } catch (err) {
          summary.failed_count += 1;
          await this.withConnection(async (conn) => {
            const actor = await requireActor(conn, input.actor_account_id);
            await insertAdminAuditLog(conn, {
              actor_account_id: actor.id,
              action: "SIDECAR_FAILED",
              target_table: "ledger_events",
              target_id: request.ledger_event_id,
              meta: {
                calc_run_id: prepared.calc_run_id,
                source_event_id: request.ledger_event_id,
                source_reference: request.source_reference,
                error_message: err instanceof Error ? err.message : String(err)
              }
            });
          });
        }
      }

      summary.status = "SUCCEEDED";
      await this.completeCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        status: "SUCCEEDED",
        summary,
        mode: "batch"
      });
      return summary;
    } catch (err) {
      summary.status = "FAILED";
      await this.completeCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        status: "FAILED",
        summary,
        error_message: err instanceof Error ? err.message : String(err),
        mode: "batch"
      });
      throw err;
    }
  }

  async runForAccount(input: {
    actor_account_id: string;
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }): Promise<SidecarSingleResponse> {
    assertSidecarCalculationDate(input.calculation_date);
    const prepared = await this.prepareCalcRun({
      actor_account_id: input.actor_account_id,
      policy_version_id: input.policy_version_id,
      calculation_date: input.calculation_date
    });

    if (!prepared.should_execute) {
      const stored = await this.withConnection((conn) =>
        this.buildSummaryByCalcRun(conn, prepared.calc_run_id, "SUCCEEDED")
      );
      return {
        calc_run_id: prepared.calc_run_id,
        status: "SUCCEEDED",
        result_type: "duplicate",
        target_count: stored.target_count,
        created_count: stored.created_count,
        duplicate_skip_count: stored.duplicate_skip_count,
        conflict_count: stored.conflict_count,
        zero_base_skip_count: stored.zero_base_skip_count,
        total_requested_amount_base: stored.total_requested_amount_base,
        total_release_amount_base: stored.total_release_amount_base,
        total_freeze_amount_base: stored.total_freeze_amount_base,
        sidecar_status: stored.sidecar_status
      };
    }

    let summary = createEmptySummary(prepared.calc_run_id, "RUNNING");
    try {
      const window = buildDateWindow(input.calculation_date);
      const preconditions = await this.withConnection((conn) =>
        this.ensurePreconditions(conn, {
          actor_account_id: input.actor_account_id,
          policy_version_id: input.policy_version_id
        })
      );
      summary.sidecar_status = preconditions.sidecar.status;
      const requests = await this.withConnection((conn) =>
        listSidecarWithdrawalRequests(conn, {
          policy_version_id: input.policy_version_id,
          ...window,
          account_id: input.account_id
        })
      );
      summary.target_count = requests.length;

      let lastOutcome: SidecarProcessOutcome = {
        result_type: "zero_base",
        requested_amount_base: ZERO,
        release_amount_base: ZERO,
        freeze_amount_base: ZERO
      };
      for (const request of requests) {
        lastOutcome = await this.processWithdrawalRequest({
          actor_account_id: input.actor_account_id,
          calc_run_id: prepared.calc_run_id,
          calculation_date: input.calculation_date,
          request,
          sidecar_rule: preconditions.sidecar,
          audit_mode: "single"
        });
        summary = this.applyOutcomeToSummary(summary, lastOutcome);
      }

      summary.status = "SUCCEEDED";
      await this.completeCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        status: "SUCCEEDED",
        summary,
        mode: "single",
        account_id: input.account_id
      });

      return {
        calc_run_id: prepared.calc_run_id,
        status: "SUCCEEDED",
        result_type: requests.length === 0 ? "zero_base" : lastOutcome.result_type,
        target_count: summary.target_count,
        created_count: summary.created_count,
        duplicate_skip_count: summary.duplicate_skip_count,
        conflict_count: summary.conflict_count,
        zero_base_skip_count: summary.zero_base_skip_count,
        total_requested_amount_base: summary.total_requested_amount_base,
        total_release_amount_base: summary.total_release_amount_base,
        total_freeze_amount_base: summary.total_freeze_amount_base,
        sidecar_status: summary.sidecar_status
      };
    } catch (err) {
      summary.failed_count = 1;
      summary.status = "FAILED";
      await this.completeCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        status: "FAILED",
        summary,
        error_message: err instanceof Error ? err.message : String(err),
        mode: "single",
        account_id: input.account_id
      });
      throw err;
    }
  }

  async getCalcRunSummary(input: { actor_account_id: string; calc_run_id: string }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      if (actor.role === "USER") {
        throw forbidden("reader permission required", { actorRole: actor.role });
      }
      const calcRun = await getCalcRunById(conn, input.calc_run_id);
      if (!calcRun) {
        throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      }
      if (calcRun.run_type !== SIDECAR_RUN_TYPE) {
        throw validationError("calc_run is not a sidecar run", {
          calc_run_id: input.calc_run_id,
          run_type: calcRun.run_type
        });
      }
      return this.buildSummaryByCalcRun(conn, input.calc_run_id, calcRun.status);
    });
  }
}

export function extractSidecarSummaryFromAuditLogs(
  auditLogs: AdminAuditLogRow[],
  calc_run_id: string
): SidecarRunSummary | null {
  for (const row of auditLogs) {
    const meta = toJsonObject(row.meta);
    const target_count = toNumberMetric(meta.target_count);
    const created_count = toNumberMetric(meta.created_count);
    const zero_base_skip_count = toNumberMetric(meta.zero_base_skip_count);
    const ineligible_skip_count = toNumberMetric(meta.ineligible_skip_count);
    const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
    const conflict_count = toNumberMetric(meta.conflict_count);
    const failed_count = toNumberMetric(meta.failed_count);
    const total_requested_amount_base = toStringMetric(meta.total_requested_amount_base);
    const total_release_amount_base = toStringMetric(meta.total_release_amount_base);
    const total_freeze_amount_base = toStringMetric(meta.total_freeze_amount_base);
    const sidecar_status = toStringMetric(meta.sidecar_status);
    if (
      target_count !== null &&
      created_count !== null &&
      zero_base_skip_count !== null &&
      ineligible_skip_count !== null &&
      duplicate_skip_count !== null &&
      conflict_count !== null &&
      failed_count !== null &&
      total_requested_amount_base !== null &&
      total_release_amount_base !== null &&
      total_freeze_amount_base !== null &&
      sidecar_status !== null
    ) {
      return {
        calc_run_id,
        target_count,
        created_count,
        zero_base_skip_count,
        ineligible_skip_count,
        duplicate_skip_count,
        conflict_count,
        failed_count,
        total_requested_amount_base,
        total_release_amount_base,
        total_freeze_amount_base,
        sidecar_status,
        status: toStringMetric(meta.status) ?? "SUCCEEDED"
      };
    }
  }
  return null;
}
