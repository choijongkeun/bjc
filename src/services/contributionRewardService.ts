import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertCalcRunStatusTransitionAllowed } from "../domain/calcRunStatus.js";
import { AppError, conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import {
  CONTRIBUTION_FORMULA_VERSION,
  CONTRIBUTION_ORGANIZATION_SCOPE,
  assertContributionCalculationDate,
  buildContributionSourceReference,
  calculateContributionPoolAmountBase,
  classifyExistingContributionReward,
  computeContributionReward
} from "../domain/contributionReward.js";
import { getRewardBySourceReference, insertAccountReward } from "../repos/accountRewardsRepo.js";
import { getAccountAuthById, getAccountByIdForUpdate } from "../repos/accountsRepo.js";
import { insertAdminAuditLog, listAdminAuditLogs, type AdminAuditLogRow } from "../repos/auditLogRepo.js";
import {
  getCalcRunById,
  getCalcRunByPolicyRunTypeDate,
  insertCalcRun,
  updateCalcRunStatus
} from "../repos/calcRunsRepo.js";
import {
  getContributionDailyPoolByDate,
  getContributionRewardByCalcRunAccount,
  getContributionWithdrawalTotalByDate,
  insertContributionDailyPool,
  insertContributionReward,
  listContributionCandidateAccounts,
  listContributionDepthVolumes
} from "../repos/contributionMetricsRepo.js";
import { listContributionWeightRules } from "../repos/contributionRulesRepo.js";
import { insertLedgerEvent } from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById } from "../repos/policyVersionsRepo.js";
import { getLedgerProductContextByPolicyVersion } from "../repos/rewardWithdrawalsRepo.js";
import { insertSettlementItem } from "../repos/settlementItemsRepo.js";
import { newId } from "../util/ids.js";
import { requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

const CONTRIBUTION_RUN_TYPE = "CONTRIBUTION";
const CONTRIBUTION_RUN_ACTION = "ADMIN_CONTRIBUTION_RUN";
const RULE_MISSING_REASON = "CONTRIBUTION_WEIGHT_RULES_NOT_FOUND";
const LEDGER_CONTEXT_MISSING_REASON = "CONTRIBUTION_LEDGER_PRODUCT_CONTEXT_NOT_FOUND";
const ZERO = "0";

type ContributionRunSummary = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  zero_base_skip_count: number;
  zero_reward_skip_count: number;
  ineligible_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_base_amount_base: string;
  total_reward_amount_base: string;
  pool_amount_base: string;
  total_score: string;
  status: string;
};

type ContributionSingleResultType =
  | "created"
  | "duplicate"
  | "zero_base"
  | "zero_reward"
  | "ineligible"
  | "conflict";

type ContributionSingleResponse = {
  calc_run_id: string;
  status: string;
  result_type: ContributionSingleResultType;
  reward_id: string | null;
  existing_reward_id: string | null;
  base_amount_base: string;
  reward_amount_base: string;
  pool_amount_base: string;
  total_score: string;
};

type ContributionProcessOutcome = {
  result_type: ContributionSingleResultType;
  reward_id: string | null;
  existing_reward_id: string | null;
  base_amount_base: string;
  reward_amount_base: string;
};

type ContributionDepthMetric = {
  depth: number;
  weight_bps: string;
  volume_base: string;
};

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

function isPolicyFailure(err: unknown): boolean {
  return (
    err instanceof AppError &&
    err.code === "VALIDATION_ERROR" &&
    (err.details?.reason === RULE_MISSING_REASON || err.details?.reason === LEDGER_CONTEXT_MISSING_REASON)
  );
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

function toStringMetric(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toNumberMetric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function addAmountStrings(...values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

function createEmptySummary(calc_run_id: string, status = "RUNNING"): ContributionRunSummary {
  return {
    calc_run_id,
    target_count: 0,
    created_count: 0,
    zero_base_skip_count: 0,
    zero_reward_skip_count: 0,
    ineligible_skip_count: 0,
    duplicate_skip_count: 0,
    conflict_count: 0,
    failed_count: 0,
    total_base_amount_base: ZERO,
    total_reward_amount_base: ZERO,
    pool_amount_base: ZERO,
    total_score: ZERO,
    status
  };
}

function buildRuleMissingError(policy_version_id: string) {
  return validationError("contribution weight rules not found", {
    policy_version_id,
    reason: RULE_MISSING_REASON
  });
}

function buildLedgerContextMissingError(policy_version_id: string) {
  return validationError("staking product context not found for contribution ledger event", {
    policy_version_id,
    reason: LEDGER_CONTEXT_MISSING_REASON
  });
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

export function assertCanRunContribution(role: "USER" | "READER" | "ADMIN"): void {
  if (role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: role });
  }
}

export class ContributionRewardService {
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
      assertCanRunContribution(actor.role);

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: CONTRIBUTION_RUN_TYPE,
        run_date: input.calculation_date
      });

      if (existing) {
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("contribution calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "SUCCEEDED" || existing.status === "FINALIZED") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: CONTRIBUTION_RUN_ACTION,
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
        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: CONTRIBUTION_RUN_ACTION,
          target_table: "calc_runs",
          target_id: existing.id,
          meta: {
            calc_run_id: existing.id,
            policy_version_id: input.policy_version_id,
            calculation_date: input.calculation_date,
            status: "RUNNING",
            retry: true
          }
        });
        return { calc_run_id: existing.id, should_execute: true };
      }

      const calc_run_id = newId();
      await insertCalcRun(conn, {
        id: calc_run_id,
        policy_version_id: input.policy_version_id,
        run_type: CONTRIBUTION_RUN_TYPE,
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
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: CONTRIBUTION_RUN_ACTION,
        target_table: "calc_runs",
        target_id: calc_run_id,
        meta: {
          calc_run_id,
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          status: "RUNNING"
        }
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
    summary: ContributionRunSummary;
    error_message?: string | null;
    mode: "batch" | "single";
    account_id?: string;
  }): Promise<void> {
    await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunContribution(actor.role);
      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: input.status,
        finished_at: formatSqlDateTime(new Date()),
        error_message: input.error_message ?? null
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: CONTRIBUTION_RUN_ACTION,
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

  private async getStoredSummary(conn: DbConn, calc_run_id: string): Promise<ContributionRunSummary | null> {
    const audit = await listAdminAuditLogs(conn, {
      action: CONTRIBUTION_RUN_ACTION,
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
      const zero_reward_skip_count = toNumberMetric(meta.zero_reward_skip_count);
      const ineligible_skip_count = toNumberMetric(meta.ineligible_skip_count);
      const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
      const conflict_count = toNumberMetric(meta.conflict_count);
      const failed_count = toNumberMetric(meta.failed_count);
      const total_base_amount_base = toStringMetric(meta.total_base_amount_base);
      const total_reward_amount_base = toStringMetric(meta.total_reward_amount_base);
      const pool_amount_base = toStringMetric(meta.pool_amount_base);
      const total_score = toStringMetric(meta.total_score);
      if (
        target_count !== null &&
        created_count !== null &&
        zero_base_skip_count !== null &&
        zero_reward_skip_count !== null &&
        ineligible_skip_count !== null &&
        duplicate_skip_count !== null &&
        conflict_count !== null &&
        failed_count !== null &&
        total_base_amount_base !== null &&
        total_reward_amount_base !== null &&
        pool_amount_base !== null &&
        total_score !== null
      ) {
        return {
          calc_run_id,
          target_count,
          created_count,
          zero_base_skip_count,
          zero_reward_skip_count,
          ineligible_skip_count,
          duplicate_skip_count,
          conflict_count,
          failed_count,
          total_base_amount_base,
          total_reward_amount_base,
          pool_amount_base,
          total_score,
          status: toStringMetric(meta.status) ?? "SUCCEEDED"
        };
      }
    }

    return null;
  }

  private async buildSummaryByCalcRun(conn: DbConn, calc_run_id: string, status: string): Promise<ContributionRunSummary> {
    const stored = await this.getStoredSummary(conn, calc_run_id);
    return stored ?? createEmptySummary(calc_run_id, status);
  }

  private async ensurePreconditions(conn: DbConn, input: {
    actor_account_id: string;
    policy_version_id: string;
  }): Promise<{ actor_id: string; symbol: string; decimals: number; rules: Map<number, string> }> {
    const actor = await requireActor(conn, input.actor_account_id);
    assertCanRunContribution(actor.role);

    const policy = await getPolicyVersionById(conn, input.policy_version_id);
    if (!policy) {
      throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
    }

    const rules = await listContributionWeightRules(conn, input.policy_version_id);
    if (!rules.length) {
      throw buildRuleMissingError(input.policy_version_id);
    }

    const ledgerContext = await getLedgerProductContextByPolicyVersion(conn, input.policy_version_id);
    if (!ledgerContext) {
      throw buildLedgerContextMissingError(input.policy_version_id);
    }

    return {
      actor_id: actor.id,
      symbol: ledgerContext.symbol,
      decimals: ledgerContext.decimals,
      rules: new Map(rules.map((rule) => [rule.depth, rule.weight_bps]))
    };
  }

  private async upsertPoolRow(input: {
    calc_run_id: string;
    policy_version_id: string;
    calculation_date: string;
    total_withdrawal_amount_base: string;
    pool_amount_base: string;
    decimals: number;
    symbol: string;
  }): Promise<void> {
    await withTx(this.pool, async (conn) => {
      const existing = await getContributionDailyPoolByDate(conn, {
        policy_version_id: input.policy_version_id,
        pool_date: input.calculation_date
      });
      if (existing) {
        if (
          existing.calc_run_id !== input.calc_run_id ||
          existing.pool_amount_base !== input.pool_amount_base ||
          existing.total_withdrawal_amount_base !== input.total_withdrawal_amount_base
        ) {
          throw conflictError("contribution pool row conflicts with existing snapshot", {
            calc_run_id: input.calc_run_id,
            existing_calc_run_id: existing.calc_run_id,
            calculation_date: input.calculation_date,
            existing_total_withdrawal_amount_base: existing.total_withdrawal_amount_base,
            total_withdrawal_amount_base: input.total_withdrawal_amount_base,
            existing_pool_amount_base: existing.pool_amount_base,
            pool_amount_base: input.pool_amount_base
          });
        }
        return;
      }
      await insertContributionDailyPool(conn, {
        id: newId(),
        calc_run_id: input.calc_run_id,
        policy_version_id: input.policy_version_id,
        pool_date: input.calculation_date,
        total_withdrawal_amount_base: input.total_withdrawal_amount_base,
        pool_amount_base: input.pool_amount_base,
        decimals: input.decimals,
        symbol: input.symbol
      });
    });
  }

  private async processAccount(input: {
    actor_account_id: string;
    calc_run_id: string;
    policy_version_id: string;
    calculation_date: string;
    account_id: string;
    symbol: string;
    decimals: number;
    pool_amount_base: string;
    total_score: string;
    depth_metrics: ContributionDepthMetric[];
    audit_mode: "batch" | "single";
  }): Promise<ContributionProcessOutcome> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunContribution(actor.role);

      const account = await getAccountByIdForUpdate(conn, input.account_id);
      if (!account || account.role !== "USER" || account.status !== "ACTIVE") {
        return {
          result_type: "ineligible",
          reward_id: null,
          existing_reward_id: null,
          base_amount_base: ZERO,
          reward_amount_base: ZERO
        };
      }

      const computation = computeContributionReward({
        depth_breakdown: input.depth_metrics,
        pool_amount_base: input.pool_amount_base,
        total_score: input.total_score
      });

      if (BigInt(computation.base_amount_base) <= 0n) {
        return {
          result_type: "zero_base",
          reward_id: null,
          existing_reward_id: null,
          base_amount_base: computation.base_amount_base,
          reward_amount_base: ZERO
        };
      }
      if (BigInt(computation.reward_amount_base) <= 0n) {
        return {
          result_type: "zero_reward",
          reward_id: null,
          existing_reward_id: null,
          base_amount_base: computation.base_amount_base,
          reward_amount_base: computation.reward_amount_base
        };
      }

      const source_reference = buildContributionSourceReference({
        calculation_date: input.calculation_date,
        account_id: input.account_id
      });
      const existingReward = await getRewardBySourceReference(conn, {
        reward_type: "CONTRIBUTION",
        source_reference
      });
      if (existingReward) {
        const existingType = classifyExistingContributionReward(existingReward, {
          account_id: input.account_id,
          policy_version_id: input.policy_version_id,
          amount_base: computation.reward_amount_base,
          pool_amount_base: input.pool_amount_base,
          account_score: computation.account_score,
          total_score: input.total_score,
          calculation_date: input.calculation_date
        });
        if (existingType === "conflict" || input.audit_mode === "single") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action:
              existingType === "conflict" ? "CONTRIBUTION_REWARD_CONFLICT" : "CONTRIBUTION_REWARD_DUPLICATE",
            target_table: "account_rewards",
            target_id: existingReward.id,
            meta: {
              calc_run_id: input.calc_run_id,
              account_id: input.account_id,
              source_reference,
              pool_amount_base: input.pool_amount_base,
              account_score: computation.account_score,
              total_score: input.total_score,
              reward_amount_base: computation.reward_amount_base
            }
          });
        }
        return {
          result_type: existingType,
          reward_id: null,
          existing_reward_id: existingReward.id,
          base_amount_base: computation.base_amount_base,
          reward_amount_base: computation.reward_amount_base
        };
      }

      const existingContribution = await getContributionRewardByCalcRunAccount(conn, {
        calc_run_id: input.calc_run_id,
        account_id: input.account_id
      });
      if (existingContribution) {
        return {
          result_type: "duplicate",
          reward_id: null,
          existing_reward_id: existingContribution.id,
          base_amount_base: computation.base_amount_base,
          reward_amount_base: computation.reward_amount_base
        };
      }

      const now = new Date();
      const reward_id = newId();
      const ledger_event_id = newId();
      const settlement_item_id = newId();
      const contribution_reward_id = newId();
      const metadata = {
        formula_version: CONTRIBUTION_FORMULA_VERSION,
        organization_scope: CONTRIBUTION_ORGANIZATION_SCOPE,
        calculation_date: input.calculation_date,
        pool_amount_base: input.pool_amount_base,
        account_score: computation.account_score,
        total_score: input.total_score,
        base_amount_base: computation.base_amount_base,
        depth_breakdown: computation.depth_breakdown
      };

      try {
        await insertLedgerEvent(conn, {
          id: ledger_event_id,
          account_id: input.account_id,
          related_account_id: null,
          product_id: null,
          policy_version_id: input.policy_version_id,
          calc_run_id: input.calc_run_id,
          event_time: now.toISOString(),
          event_type: "CONTRIBUTION_BONUS",
          amount_base: computation.reward_amount_base,
          decimals: input.decimals,
          symbol: input.symbol,
          reference_id: source_reference,
          meta: {
            reward_id,
            settlement_item_id,
            contribution_reward_id,
            ...metadata
          },
          created_by: actor.id
        });

        await insertSettlementItem(conn, {
          id: settlement_item_id,
          calc_run_id: input.calc_run_id,
          settlement_type: "CONTRIBUTION",
          account_id: input.account_id,
          ledger_event_id,
          amount_base: computation.reward_amount_base,
          decimals: input.decimals,
          symbol: input.symbol,
          reference_id: source_reference,
          meta: metadata
        });

        await insertContributionReward(conn, {
          id: contribution_reward_id,
          calc_run_id: input.calc_run_id,
          account_id: input.account_id,
          score: computation.account_score,
          total_score: input.total_score,
          reward_amount_base: computation.reward_amount_base,
          decimals: input.decimals,
          symbol: input.symbol
        });

        await insertAccountReward(conn, {
          id: reward_id,
          account_id: input.account_id,
          account_staking_id: null,
          source_account_id: null,
          source_account_staking_id: null,
          policy_version_id: input.policy_version_id,
          calc_run_id: input.calc_run_id,
          reward_type: "CONTRIBUTION",
          reward_date: input.calculation_date,
          amount_base: computation.reward_amount_base,
          status: "CONFIRMED",
          source_reference,
          source_ledger_event_id: ledger_event_id,
          confirmed_at: now,
          available_at: now,
          metadata_json: metadata,
          created_at: now,
          updated_at: now
        });
      } catch (err) {
        if (!isMysqlDuplicateKeyError(err)) {
          throw err;
        }

        const reloaded = await getRewardBySourceReference(conn, {
          reward_type: "CONTRIBUTION",
          source_reference
        });
        if (!reloaded) {
          throw err;
        }
        const existingType = classifyExistingContributionReward(reloaded, {
          account_id: input.account_id,
          policy_version_id: input.policy_version_id,
          amount_base: computation.reward_amount_base,
          pool_amount_base: input.pool_amount_base,
          account_score: computation.account_score,
          total_score: input.total_score,
          calculation_date: input.calculation_date
        });
        return {
          result_type: existingType,
          reward_id: null,
          existing_reward_id: reloaded.id,
          base_amount_base: computation.base_amount_base,
          reward_amount_base: computation.reward_amount_base
        };
      }

      if (input.audit_mode === "single") {
        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: "CONTRIBUTION_REWARD_CREATED",
          target_table: "account_rewards",
          target_id: reward_id,
          meta: {
            calc_run_id: input.calc_run_id,
            account_id: input.account_id,
            source_reference,
            base_amount_base: computation.base_amount_base,
            reward_amount_base: computation.reward_amount_base,
            pool_amount_base: input.pool_amount_base,
            account_score: computation.account_score,
            total_score: input.total_score
          }
        });
      }

      return {
        result_type: "created",
        reward_id,
        existing_reward_id: null,
        base_amount_base: computation.base_amount_base,
        reward_amount_base: computation.reward_amount_base
      };
    });
  }

  private applyOutcomeToSummary(summary: ContributionRunSummary, outcome: ContributionProcessOutcome): ContributionRunSummary {
    const next = { ...summary };
    switch (outcome.result_type) {
      case "created":
        next.created_count += 1;
        next.total_base_amount_base = addAmountStrings(next.total_base_amount_base, outcome.base_amount_base);
        next.total_reward_amount_base = addAmountStrings(next.total_reward_amount_base, outcome.reward_amount_base);
        break;
      case "zero_base":
        next.zero_base_skip_count += 1;
        break;
      case "zero_reward":
        next.zero_reward_skip_count += 1;
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
    assertContributionCalculationDate(input.calculation_date);
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
      const totalWithdrawalAmountBase = await this.withConnection((conn) =>
        getContributionWithdrawalTotalByDate(conn, {
          policy_version_id: input.policy_version_id,
          ...window
        })
      );
      const pool_amount_base = calculateContributionPoolAmountBase(totalWithdrawalAmountBase);
      summary.pool_amount_base = pool_amount_base;
      await this.upsertPoolRow({
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        total_withdrawal_amount_base: totalWithdrawalAmountBase,
        pool_amount_base,
        decimals: preconditions.decimals,
        symbol: preconditions.symbol
      });

      const candidates = await this.withConnection((conn) =>
        listContributionCandidateAccounts(conn, input.policy_version_id)
      );
      summary.target_count = candidates.length;

      const depthVolumes = await this.withConnection((conn) =>
        listContributionDepthVolumes(conn, {
          policy_version_id: input.policy_version_id,
          ...window,
          max_depth: 45
        })
      );

      const depthVolumeMap = new Map<string, ContributionDepthMetric[]>();
      const accountScoreMap = new Map<string, string>();
      let totalScore = 0n;
      for (const row of depthVolumes) {
        const weight = preconditions.rules.get(row.depth);
        if (!weight) {
          continue;
        }
        const current = depthVolumeMap.get(row.account_id) ?? [];
        current.push({
          depth: row.depth,
          weight_bps: weight,
          volume_base: row.volume_base
        });
        depthVolumeMap.set(row.account_id, current);
      }
      for (const candidate of candidates) {
        const metrics = depthVolumeMap.get(candidate.account_id) ?? [];
        const computation = computeContributionReward({
          depth_breakdown: metrics,
          pool_amount_base,
          total_score: "1"
        });
        accountScoreMap.set(candidate.account_id, computation.account_score);
        totalScore += BigInt(computation.account_score);
      }
      summary.total_score = totalScore.toString();

      for (const candidate of candidates) {
        try {
          const outcome = await this.processAccount({
            actor_account_id: input.actor_account_id,
            calc_run_id: prepared.calc_run_id,
            policy_version_id: input.policy_version_id,
            calculation_date: input.calculation_date,
            account_id: candidate.account_id,
            symbol: preconditions.symbol,
            decimals: preconditions.decimals,
            pool_amount_base,
            total_score: totalScore.toString(),
            depth_metrics: depthVolumeMap.get(candidate.account_id) ?? [],
            audit_mode: "batch"
          });
          summary = this.applyOutcomeToSummary(summary, outcome);
        } catch (err) {
          if (isPolicyFailure(err)) {
            throw err;
          }
          summary.failed_count += 1;
          await this.withConnection(async (conn) => {
            const actor = await requireActor(conn, input.actor_account_id);
            await insertAdminAuditLog(conn, {
              actor_account_id: actor.id,
              action: "CONTRIBUTION_REWARD_FAILED",
              target_table: "account_rewards",
              target_id: candidate.account_id,
              meta: {
                calc_run_id: prepared.calc_run_id,
                account_id: candidate.account_id,
                policy_version_id: input.policy_version_id,
                calculation_date: input.calculation_date,
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

  private async inspectExistingAccountResult(input: {
    calc_run_id: string;
    actor_account_id: string;
    policy_version_id: string;
    calculation_date: string;
    account_id: string;
  }): Promise<ContributionSingleResponse> {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunContribution(actor.role);

      const account = await getAccountAuthById(conn, input.account_id);
      if (!account || account.role !== "USER" || account.status !== "ACTIVE") {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "ineligible",
          reward_id: null,
          existing_reward_id: null,
          base_amount_base: ZERO,
          reward_amount_base: ZERO,
          pool_amount_base: ZERO,
          total_score: ZERO
        };
      }

      const summary = await this.buildSummaryByCalcRun(conn, input.calc_run_id, "SUCCEEDED");
      const source_reference = buildContributionSourceReference({
        calculation_date: input.calculation_date,
        account_id: input.account_id
      });
      const existingReward = await getRewardBySourceReference(conn, {
        reward_type: "CONTRIBUTION",
        source_reference
      });
      if (!existingReward) {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "zero_base",
          reward_id: null,
          existing_reward_id: null,
          base_amount_base: ZERO,
          reward_amount_base: ZERO,
          pool_amount_base: summary.pool_amount_base,
          total_score: summary.total_score
        };
      }

      const metadata = toJsonObject(existingReward.metadata_json);
      return {
        calc_run_id: input.calc_run_id,
        status: "SUCCEEDED",
        result_type: "duplicate",
        reward_id: null,
        existing_reward_id: existingReward.id,
        base_amount_base: toStringMetric(metadata.base_amount_base) ?? ZERO,
        reward_amount_base: existingReward.amount_base,
        pool_amount_base: toStringMetric(metadata.pool_amount_base) ?? summary.pool_amount_base,
        total_score: toStringMetric(metadata.total_score) ?? summary.total_score
      };
    });
  }

  async runForAccount(input: {
    actor_account_id: string;
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }): Promise<ContributionSingleResponse> {
    assertContributionCalculationDate(input.calculation_date);
    const prepared = await this.prepareCalcRun({
      actor_account_id: input.actor_account_id,
      policy_version_id: input.policy_version_id,
      calculation_date: input.calculation_date
    });

    if (!prepared.should_execute) {
      return this.inspectExistingAccountResult({
        calc_run_id: prepared.calc_run_id,
        actor_account_id: input.actor_account_id,
        account_id: input.account_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date
      });
    }

    const summary = createEmptySummary(prepared.calc_run_id, "RUNNING");
    try {
      const window = buildDateWindow(input.calculation_date);
      const preconditions = await this.withConnection((conn) =>
        this.ensurePreconditions(conn, {
          actor_account_id: input.actor_account_id,
          policy_version_id: input.policy_version_id
        })
      );
      const totalWithdrawalAmountBase = await this.withConnection((conn) =>
        getContributionWithdrawalTotalByDate(conn, {
          policy_version_id: input.policy_version_id,
          ...window
        })
      );
      const pool_amount_base = calculateContributionPoolAmountBase(totalWithdrawalAmountBase);
      await this.upsertPoolRow({
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        total_withdrawal_amount_base: totalWithdrawalAmountBase,
        pool_amount_base,
        decimals: preconditions.decimals,
        symbol: preconditions.symbol
      });
      const depthVolumes = await this.withConnection((conn) =>
        listContributionDepthVolumes(conn, {
          policy_version_id: input.policy_version_id,
          ...window,
          max_depth: 45
        })
      );
      const depthMetrics = depthVolumes
        .filter((row) => row.account_id === input.account_id)
        .flatMap((row) => {
          const weight = preconditions.rules.get(row.depth);
          return weight
            ? [
                {
                  depth: row.depth,
                  weight_bps: weight,
                  volume_base: row.volume_base
                }
              ]
            : [];
        });

      let totalScore = 0n;
      const allCandidates = await this.withConnection((conn) =>
        listContributionCandidateAccounts(conn, input.policy_version_id)
      );
      const grouped = new Map<string, ContributionDepthMetric[]>();
      for (const row of depthVolumes) {
        const weight = preconditions.rules.get(row.depth);
        if (!weight) continue;
        const current = grouped.get(row.account_id) ?? [];
        current.push({ depth: row.depth, weight_bps: weight, volume_base: row.volume_base });
        grouped.set(row.account_id, current);
      }
      for (const candidate of allCandidates) {
        const computation = computeContributionReward({
          depth_breakdown: grouped.get(candidate.account_id) ?? [],
          pool_amount_base,
          total_score: "1"
        });
        totalScore += BigInt(computation.account_score);
      }

      const outcome = await this.processAccount({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        account_id: input.account_id,
        symbol: preconditions.symbol,
        decimals: preconditions.decimals,
        pool_amount_base,
        total_score: totalScore.toString(),
        depth_metrics: depthMetrics,
        audit_mode: "single"
      });

      const finalSummary = this.applyOutcomeToSummary(
        {
          ...summary,
          target_count: 1,
          pool_amount_base,
          total_score: totalScore.toString()
        },
        outcome
      );
      finalSummary.status = "SUCCEEDED";
      await this.completeCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        status: "SUCCEEDED",
        summary: finalSummary,
        mode: "single",
        account_id: input.account_id
      });
      return {
        calc_run_id: prepared.calc_run_id,
        status: "SUCCEEDED",
        result_type: outcome.result_type,
        reward_id: outcome.reward_id,
        existing_reward_id: outcome.existing_reward_id,
        base_amount_base: outcome.base_amount_base,
        reward_amount_base: outcome.reward_amount_base,
        pool_amount_base,
        total_score: totalScore.toString()
      };
    } catch (err) {
      summary.failed_count = 1;
      summary.target_count = 1;
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
      if (calcRun.run_type !== CONTRIBUTION_RUN_TYPE) {
        throw validationError("calc_run is not a contribution run", {
          calc_run_id: input.calc_run_id,
          run_type: calcRun.run_type
        });
      }
      return this.buildSummaryByCalcRun(conn, input.calc_run_id, calcRun.status);
    });
  }
}

export function extractContributionSummaryFromAuditLogs(
  auditLogs: AdminAuditLogRow[],
  calc_run_id: string
): ContributionRunSummary | null {
  for (const row of auditLogs) {
    const meta = toJsonObject(row.meta);
    const target_count = toNumberMetric(meta.target_count);
    const created_count = toNumberMetric(meta.created_count);
    const zero_base_skip_count = toNumberMetric(meta.zero_base_skip_count);
    const zero_reward_skip_count = toNumberMetric(meta.zero_reward_skip_count);
    const ineligible_skip_count = toNumberMetric(meta.ineligible_skip_count);
    const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
    const conflict_count = toNumberMetric(meta.conflict_count);
    const failed_count = toNumberMetric(meta.failed_count);
    const total_base_amount_base = toStringMetric(meta.total_base_amount_base);
    const total_reward_amount_base = toStringMetric(meta.total_reward_amount_base);
    const pool_amount_base = toStringMetric(meta.pool_amount_base);
    const total_score = toStringMetric(meta.total_score);
    if (
      target_count !== null &&
      created_count !== null &&
      zero_base_skip_count !== null &&
      zero_reward_skip_count !== null &&
      ineligible_skip_count !== null &&
      duplicate_skip_count !== null &&
      conflict_count !== null &&
      failed_count !== null &&
      total_base_amount_base !== null &&
      total_reward_amount_base !== null &&
      pool_amount_base !== null &&
      total_score !== null
    ) {
      return {
        calc_run_id,
        target_count,
        created_count,
        zero_base_skip_count,
        zero_reward_skip_count,
        ineligible_skip_count,
        duplicate_skip_count,
        conflict_count,
        failed_count,
        total_base_amount_base,
        total_reward_amount_base,
        pool_amount_base,
        total_score,
        status: toStringMetric(meta.status) ?? "SUCCEEDED"
      };
    }
  }
  return null;
}
