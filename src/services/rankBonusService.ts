import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertCalcRunStatusTransitionAllowed } from "../domain/calcRunStatus.js";
import { AppError, conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import {
  RANK_BONUS_FORMULA_VERSION,
  RANK_BONUS_ORGANIZATION_SCOPE,
  buildRankBonusSourceReference,
  classifyExistingRankBonusReward,
  computeRankBonus
} from "../domain/rankBonus.js";
import { getRewardBySourceReference, insertAccountReward } from "../repos/accountRewardsRepo.js";
import { getAccountRankQualificationResultByDate } from "../repos/accountRankQualificationResultsRepo.js";
import {
  getAccountRankStatusByAccountId,
  getAccountRankStatusByAccountIdForUpdate,
  listRankBonusCandidateStatuses,
  updateAccountRankStatusLastBonusCalcRun
} from "../repos/accountRankStatusRepo.js";
import { getAccountAuthById, getAccountByIdForUpdate } from "../repos/accountsRepo.js";
import {
  insertAdminAuditLog,
  listAdminAuditLogs,
  type AdminAuditLogRow
} from "../repos/auditLogRepo.js";
import {
  getCalcRunById,
  getCalcRunByPolicyRunTypeDate,
  insertCalcRun,
  updateCalcRunStatus
} from "../repos/calcRunsRepo.js";
import { insertLedgerEvent } from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById } from "../repos/policyVersionsRepo.js";
import { getBatchRankBonusBaseDailyRewardAmounts } from "../repos/rankBonusMetricsRepo.js";
import { getRankRuleByLevel } from "../repos/rankRulesRepo.js";
import { getLedgerProductContextByPolicyVersion } from "../repos/rewardWithdrawalsRepo.js";
import { newId } from "../util/ids.js";
import { requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

const RANK_BONUS_RUN_TYPE = "RANK_BONUS";
const RANK_BONUS_RUN_ACTION = "ADMIN_RANK_BONUS_RUN";
const RULE_MISSING_REASON = "ACTIVE_RANK_RULE_NOT_FOUND";
const LEDGER_CONTEXT_MISSING_REASON = "RANK_BONUS_LEDGER_PRODUCT_CONTEXT_NOT_FOUND";

type RankBonusRunSummary = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  no_rank_skip_count: number;
  no_qualification_skip_count: number;
  zero_base_skip_count: number;
  zero_reward_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_base_daily_reward_amount_base: string;
  total_rank_bonus_amount_base: string;
  status: string;
};

type RankBonusSingleResultType =
  | "created"
  | "duplicate"
  | "no_rank"
  | "no_qualification"
  | "zero_base"
  | "zero_reward"
  | "conflict";

type RankBonusSingleResponse = {
  calc_run_id: string;
  status: string;
  result_type: RankBonusSingleResultType;
  reward_id: string | null;
  existing_reward_id: string | null;
  base_daily_reward_amount_base: string;
  rank_bonus_amount_base: string;
};

type AccountProcessOutcome = {
  result_type: RankBonusSingleResultType;
  reward_id: string | null;
  existing_reward_id: string | null;
  base_daily_reward_amount_base: string;
  rank_bonus_amount_base: string;
};

function assertCalculationDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("calculation_date must be YYYY-MM-DD", { calculation_date: value });
  }
}

function createEmptySummary(calc_run_id: string, status = "RUNNING"): RankBonusRunSummary {
  return {
    calc_run_id,
    target_count: 0,
    created_count: 0,
    no_rank_skip_count: 0,
    no_qualification_skip_count: 0,
    zero_base_skip_count: 0,
    zero_reward_skip_count: 0,
    duplicate_skip_count: 0,
    conflict_count: 0,
    failed_count: 0,
    total_base_daily_reward_amount_base: "0",
    total_rank_bonus_amount_base: "0",
    status
  };
}

function addAmountStrings(...values: string[]): string {
  return values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

function toJsonObject(value: unknown): Record<string, unknown> {
  if (value instanceof Uint8Array) {
    try {
      const parsed = JSON.parse(Buffer.from(value).toString("utf8")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  if (typeof value === "string" && value.length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
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
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
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

function isPolicyFailure(err: unknown): boolean {
  return (
    err instanceof AppError &&
    err.code === "VALIDATION_ERROR" &&
    (err.details?.reason === RULE_MISSING_REASON || err.details?.reason === LEDGER_CONTEXT_MISSING_REASON)
  );
}

function buildRuleMissingError(input: { policy_version_id: string; rank_level: number }) {
  return validationError("active rank rule not found", {
    policy_version_id: input.policy_version_id,
    rank_level: input.rank_level,
    reason: RULE_MISSING_REASON
  });
}

function buildLedgerContextMissingError(policy_version_id: string) {
  return validationError("staking product context not found for rank bonus ledger event", {
    policy_version_id,
    reason: LEDGER_CONTEXT_MISSING_REASON
  });
}

export function assertCanRunRankBonus(role: "USER" | "READER" | "ADMIN"): void {
  if (role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: role });
  }
}

export class RankBonusService {
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
      assertCanRunRankBonus(actor.role);

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: RANK_BONUS_RUN_TYPE,
        run_date: input.calculation_date
      });

      if (existing) {
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("rank bonus calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "SUCCEEDED" || existing.status === "FINALIZED") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: RANK_BONUS_RUN_ACTION,
            target_table: "calc_runs",
            target_id: existing.id,
            meta: {
              calc_run_id: existing.id,
              status: existing.status,
              policy_version_id: input.policy_version_id,
              calculation_date: input.calculation_date,
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
          action: RANK_BONUS_RUN_ACTION,
          target_table: "calc_runs",
          target_id: existing.id,
          meta: {
            calc_run_id: existing.id,
            status: "RUNNING",
            policy_version_id: input.policy_version_id,
            calculation_date: input.calculation_date,
            retry: true
          }
        });
        return { calc_run_id: existing.id, should_execute: true };
      }

      const calc_run_id = newId();
      await insertCalcRun(conn, {
        id: calc_run_id,
        policy_version_id: input.policy_version_id,
        run_type: RANK_BONUS_RUN_TYPE,
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
        action: RANK_BONUS_RUN_ACTION,
        target_table: "calc_runs",
        target_id: calc_run_id,
        meta: {
          calc_run_id,
          status: "RUNNING",
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date
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
    summary: RankBonusRunSummary;
    error_message?: string | null;
    mode: "batch" | "single";
    account_id?: string;
  }): Promise<void> {
    await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankBonus(actor.role);
      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: input.status,
        finished_at: formatSqlDateTime(new Date()),
        error_message: input.error_message ?? null
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: RANK_BONUS_RUN_ACTION,
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

  private async getStoredSummary(conn: DbConn, calc_run_id: string): Promise<RankBonusRunSummary | null> {
    const audit = await listAdminAuditLogs(conn, {
      action: RANK_BONUS_RUN_ACTION,
      target_table: "calc_runs",
      target_id: calc_run_id,
      page: 1,
      limit: 20
    });

    for (const row of audit.items) {
      const meta = toJsonObject(row.meta);
      const target_count = toNumberMetric(meta.target_count);
      const created_count = toNumberMetric(meta.created_count);
      const no_rank_skip_count = toNumberMetric(meta.no_rank_skip_count);
      const no_qualification_skip_count = toNumberMetric(meta.no_qualification_skip_count);
      const zero_base_skip_count = toNumberMetric(meta.zero_base_skip_count);
      const zero_reward_skip_count = toNumberMetric(meta.zero_reward_skip_count);
      const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
      const conflict_count = toNumberMetric(meta.conflict_count);
      const failed_count = toNumberMetric(meta.failed_count);
      const total_base_daily_reward_amount_base = toStringMetric(meta.total_base_daily_reward_amount_base);
      const total_rank_bonus_amount_base = toStringMetric(meta.total_rank_bonus_amount_base);
      if (
        target_count !== null &&
        created_count !== null &&
        no_rank_skip_count !== null &&
        no_qualification_skip_count !== null &&
        zero_base_skip_count !== null &&
        zero_reward_skip_count !== null &&
        duplicate_skip_count !== null &&
        conflict_count !== null &&
        failed_count !== null &&
        total_base_daily_reward_amount_base !== null &&
        total_rank_bonus_amount_base !== null
      ) {
        return {
          calc_run_id,
          target_count,
          created_count,
          no_rank_skip_count,
          no_qualification_skip_count,
          zero_base_skip_count,
          zero_reward_skip_count,
          duplicate_skip_count,
          conflict_count,
          failed_count,
          total_base_daily_reward_amount_base,
          total_rank_bonus_amount_base,
          status: toStringMetric(meta.status) ?? "SUCCEEDED"
        };
      }
    }

    return null;
  }

  private async buildSummaryByCalcRun(conn: DbConn, calc_run_id: string, status: string): Promise<RankBonusRunSummary> {
    const stored = await this.getStoredSummary(conn, calc_run_id);
    return stored ?? createEmptySummary(calc_run_id, status);
  }

  private async ensureBatchPreconditions(conn: DbConn, input: {
    policy_version_id: string;
    actor_account_id: string;
  }): Promise<{
    actor_id: string;
    symbol: string;
    decimals: number;
  }> {
    const actor = await requireActor(conn, input.actor_account_id);
    assertCanRunRankBonus(actor.role);

    const policy = await getPolicyVersionById(conn, input.policy_version_id);
    if (!policy) {
      throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
    }

    const ledgerContext = await getLedgerProductContextByPolicyVersion(conn, input.policy_version_id);
    if (!ledgerContext) {
      throw buildLedgerContextMissingError(input.policy_version_id);
    }

    return {
      actor_id: actor.id,
      symbol: ledgerContext.symbol,
      decimals: ledgerContext.decimals
    };
  }

  private async processAccount(input: {
    actor_account_id: string;
    calc_run_id: string;
    policy_version_id: string;
    calculation_date: string;
    account_id: string;
    symbol: string;
    decimals: number;
    base_daily_reward_amount_base: string;
    audit_mode: "batch" | "single";
  }): Promise<AccountProcessOutcome> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankBonus(actor.role);

      const account = await getAccountByIdForUpdate(conn, input.account_id);
      if (!account || account.role !== "USER" || account.status !== "ACTIVE") {
        throw validationError("rank bonus target must be an ACTIVE USER", {
          account_id: input.account_id
        });
      }

      const rankStatus = await getAccountRankStatusByAccountId(conn, input.account_id);
      if (!rankStatus || rankStatus.policy_version_id !== input.policy_version_id || rankStatus.current_rank_level === null) {
        return {
          result_type: "no_rank",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: "0",
          rank_bonus_amount_base: "0"
        };
      }

      const qualification = await getAccountRankQualificationResultByDate(conn, {
        account_id: input.account_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date
      });
      if (!qualification || qualification.applied_rank_level === null) {
        return {
          result_type: "no_qualification",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: "0",
          rank_bonus_amount_base: "0"
        };
      }

      const rankRule = await getRankRuleByLevel(conn, {
        policy_version_id: input.policy_version_id,
        rank_level: qualification.applied_rank_level
      });
      if (!rankRule) {
        throw buildRuleMissingError({
          policy_version_id: input.policy_version_id,
          rank_level: qualification.applied_rank_level
        });
      }
      if (BigInt(rankRule.effective_bonus_bps) <= 0n) {
        await updateAccountRankStatusLastBonusCalcRun(conn, {
          account_id: input.account_id,
          calc_run_id: input.calc_run_id
        });
        return {
          result_type: "no_rank",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: "0",
          rank_bonus_amount_base: "0"
        };
      }

      if (BigInt(input.base_daily_reward_amount_base) <= 0n) {
        await updateAccountRankStatusLastBonusCalcRun(conn, {
          account_id: input.account_id,
          calc_run_id: input.calc_run_id
        });
        return {
          result_type: "zero_base",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: input.base_daily_reward_amount_base,
          rank_bonus_amount_base: "0"
        };
      }

      const computation = computeRankBonus({
        base_daily_reward_amount_base: input.base_daily_reward_amount_base,
        effective_bonus_bps: rankRule.effective_bonus_bps
      });
      if (BigInt(computation.rank_bonus_amount_base) <= 0n) {
        await updateAccountRankStatusLastBonusCalcRun(conn, {
          account_id: input.account_id,
          calc_run_id: input.calc_run_id
        });
        return {
          result_type: "zero_reward",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
          rank_bonus_amount_base: computation.rank_bonus_amount_base
        };
      }

      const source_reference = buildRankBonusSourceReference({
        calculation_date: input.calculation_date,
        account_id: input.account_id,
        rank_level: qualification.applied_rank_level
      });
      const existingReward = await getRewardBySourceReference(conn, {
        reward_type: "RANK_BONUS",
        source_reference
      });
      if (existingReward) {
        const existingType = classifyExistingRankBonusReward(existingReward, {
          account_id: input.account_id,
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          rank_level: qualification.applied_rank_level,
          effective_bonus_bps: rankRule.effective_bonus_bps,
          base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
          rank_bonus_amount_base: computation.rank_bonus_amount_base,
          qualification_result_id: qualification.id
        });
        await updateAccountRankStatusLastBonusCalcRun(conn, {
          account_id: input.account_id,
          calc_run_id: input.calc_run_id
        });
        if (existingType === "conflict") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: "RANK_BONUS_REWARD_CONFLICT",
            target_table: "account_rewards",
            target_id: existingReward.id,
            meta: {
              calc_run_id: input.calc_run_id,
              account_id: input.account_id,
              source_reference,
              qualification_result_id: qualification.id,
              rank_level: qualification.applied_rank_level,
              effective_bonus_bps: rankRule.effective_bonus_bps,
              base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
              rank_bonus_amount_base: computation.rank_bonus_amount_base
            }
          });
        } else if (input.audit_mode === "single") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: "RANK_BONUS_REWARD_DUPLICATE",
            target_table: "account_rewards",
            target_id: existingReward.id,
            meta: {
              calc_run_id: input.calc_run_id,
              account_id: input.account_id,
              source_reference,
              qualification_result_id: qualification.id,
              rank_level: qualification.applied_rank_level
            }
          });
        }
        return {
          result_type: existingType,
          reward_id: null,
          existing_reward_id: existingReward.id,
          base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
          rank_bonus_amount_base: computation.rank_bonus_amount_base
        };
      }

      const reward_id = newId();
      const ledger_event_id = newId();
      const event_time = new Date().toISOString();
      const metadata = {
        formula_version: RANK_BONUS_FORMULA_VERSION,
        organization_scope: RANK_BONUS_ORGANIZATION_SCOPE,
        rank_level: qualification.applied_rank_level,
        effective_bonus_bps: rankRule.effective_bonus_bps,
        base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
        qualification_calc_run_id: qualification.calc_run_id,
        qualification_result_id: qualification.id
      };

      try {
        await insertLedgerEvent(conn, {
          id: ledger_event_id,
          account_id: input.account_id,
          related_account_id: null,
          product_id: null,
          policy_version_id: input.policy_version_id,
          calc_run_id: input.calc_run_id,
          event_time,
          event_type: "RANK_BONUS",
          amount_base: computation.rank_bonus_amount_base,
          decimals: input.decimals,
          symbol: input.symbol,
          reference_id: source_reference,
          meta: metadata,
          created_by: actor.id
        });

        await insertAccountReward(conn, {
          id: reward_id,
          account_id: input.account_id,
          account_staking_id: null,
          source_account_id: null,
          source_account_staking_id: null,
          policy_version_id: input.policy_version_id,
          calc_run_id: input.calc_run_id,
          reward_type: "RANK_BONUS",
          reward_date: input.calculation_date,
          amount_base: computation.rank_bonus_amount_base,
          status: "CONFIRMED",
          source_reference,
          source_ledger_event_id: ledger_event_id,
          confirmed_at: new Date(),
          available_at: new Date(),
          metadata_json: metadata,
          created_at: new Date(),
          updated_at: new Date()
        });
      } catch (err) {
        if (!isMysqlDuplicateKeyError(err)) {
          throw err;
        }
        const reloaded = await getRewardBySourceReference(conn, {
          reward_type: "RANK_BONUS",
          source_reference
        });
        if (!reloaded) {
          throw err;
        }
        const existingType = classifyExistingRankBonusReward(reloaded, {
          account_id: input.account_id,
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          rank_level: qualification.applied_rank_level,
          effective_bonus_bps: rankRule.effective_bonus_bps,
          base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
          rank_bonus_amount_base: computation.rank_bonus_amount_base,
          qualification_result_id: qualification.id
        });
        await updateAccountRankStatusLastBonusCalcRun(conn, {
          account_id: input.account_id,
          calc_run_id: input.calc_run_id
        });
        if (input.audit_mode === "single") {
          if (existingType === "conflict") {
            await insertAdminAuditLog(conn, {
              actor_account_id: actor.id,
              action: "RANK_BONUS_REWARD_CONFLICT",
              target_table: "account_rewards",
              target_id: reloaded.id,
              meta: {
                calc_run_id: input.calc_run_id,
                account_id: input.account_id,
                source_reference,
                qualification_result_id: qualification.id,
                rank_level: qualification.applied_rank_level,
                effective_bonus_bps: rankRule.effective_bonus_bps,
                base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
                rank_bonus_amount_base: computation.rank_bonus_amount_base
              }
            });
          } else {
            await insertAdminAuditLog(conn, {
              actor_account_id: actor.id,
              action: "RANK_BONUS_REWARD_DUPLICATE",
              target_table: "account_rewards",
              target_id: reloaded.id,
              meta: {
                calc_run_id: input.calc_run_id,
                account_id: input.account_id,
                source_reference,
                qualification_result_id: qualification.id,
                rank_level: qualification.applied_rank_level,
                effective_bonus_bps: rankRule.effective_bonus_bps,
                base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
                rank_bonus_amount_base: computation.rank_bonus_amount_base
              }
            });
          }
        }
        return {
          result_type: existingType,
          reward_id: null,
          existing_reward_id: reloaded.id,
          base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
          rank_bonus_amount_base: computation.rank_bonus_amount_base
        };
      }

      await updateAccountRankStatusLastBonusCalcRun(conn, {
        account_id: input.account_id,
        calc_run_id: input.calc_run_id
      });
      if (input.audit_mode === "single") {
        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: "RANK_BONUS_REWARD_CREATED",
          target_table: "account_rewards",
          target_id: reward_id,
          meta: {
            calc_run_id: input.calc_run_id,
            account_id: input.account_id,
            source_reference,
            qualification_result_id: qualification.id,
            rank_level: qualification.applied_rank_level,
            effective_bonus_bps: rankRule.effective_bonus_bps,
            base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
            rank_bonus_amount_base: computation.rank_bonus_amount_base
          }
        });
      }
      return {
        result_type: "created",
        reward_id,
        existing_reward_id: null,
        base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
        rank_bonus_amount_base: computation.rank_bonus_amount_base
      };
    });
  }

  private async insertOutcomeAudit(input: {
    actor_account_id: string;
    action: "RANK_BONUS_REWARD_CREATED" | "RANK_BONUS_REWARD_DUPLICATE" | "RANK_BONUS_REWARD_CONFLICT";
    reward_id: string;
    calc_run_id: string;
    account_id: string;
    source_reference: string;
    qualification_result_id: string;
    rank_level: number;
    effective_bonus_bps?: string;
    base_daily_reward_amount_base?: string;
    rank_bonus_amount_base?: string;
  }): Promise<void> {
    await this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankBonus(actor.role);
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: input.action,
        target_table: "account_rewards",
        target_id: input.reward_id,
        meta: {
          calc_run_id: input.calc_run_id,
          account_id: input.account_id,
          source_reference: input.source_reference,
          qualification_result_id: input.qualification_result_id,
          rank_level: input.rank_level,
          effective_bonus_bps: input.effective_bonus_bps ?? null,
          base_daily_reward_amount_base: input.base_daily_reward_amount_base ?? null,
          rank_bonus_amount_base: input.rank_bonus_amount_base ?? null
        }
      });
    });
  }

  private applyOutcomeToSummary(summary: RankBonusRunSummary, outcome: AccountProcessOutcome): RankBonusRunSummary {
    const next = { ...summary };
    switch (outcome.result_type) {
      case "created":
        next.created_count += 1;
        next.total_base_daily_reward_amount_base = addAmountStrings(
          next.total_base_daily_reward_amount_base,
          outcome.base_daily_reward_amount_base
        );
        next.total_rank_bonus_amount_base = addAmountStrings(
          next.total_rank_bonus_amount_base,
          outcome.rank_bonus_amount_base
        );
        break;
      case "duplicate":
        next.duplicate_skip_count += 1;
        break;
      case "no_rank":
        next.no_rank_skip_count += 1;
        break;
      case "no_qualification":
        next.no_qualification_skip_count += 1;
        break;
      case "zero_base":
        next.zero_base_skip_count += 1;
        break;
      case "zero_reward":
        next.zero_reward_skip_count += 1;
        break;
      case "conflict":
        next.conflict_count += 1;
        break;
    }
    return next;
  }

  async runBatch(input: { actor_account_id: string; policy_version_id: string; calculation_date: string }) {
    assertCalculationDate(input.calculation_date);
    const prepared = await this.prepareCalcRun(input);
    if (!prepared.should_execute) {
      return this.withConnection((conn) => this.buildSummaryByCalcRun(conn, prepared.calc_run_id, "SUCCEEDED"));
    }

    let summary = createEmptySummary(prepared.calc_run_id, "RUNNING");
    try {
      const preconditions = await this.withConnection((conn) =>
        this.ensureBatchPreconditions(conn, {
          actor_account_id: input.actor_account_id,
          policy_version_id: input.policy_version_id
        })
      );
      const candidates = await this.withConnection((conn) =>
        listRankBonusCandidateStatuses(conn, {
          policy_version_id: input.policy_version_id
        })
      );
      summary.target_count = candidates.length;
      const baseAmounts = await this.withConnection((conn) =>
        getBatchRankBonusBaseDailyRewardAmounts(conn, {
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          account_ids: candidates.map((item) => item.account_id)
        })
      );

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
            base_daily_reward_amount_base: baseAmounts.get(candidate.account_id) ?? "0",
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
              action: "RANK_BONUS_REWARD_FAILED",
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
  }): Promise<RankBonusSingleResponse> {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankBonus(actor.role);

      const account = await getAccountAuthById(conn, input.account_id);
      if (!account || account.role !== "USER" || account.status !== "ACTIVE") {
        throw validationError("rank bonus target must be an ACTIVE USER", {
          account_id: input.account_id
        });
      }

      const rankStatus = await getAccountRankStatusByAccountIdForUpdate(conn, input.account_id);
      if (!rankStatus || rankStatus.policy_version_id !== input.policy_version_id || rankStatus.current_rank_level === null) {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "no_rank",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: "0",
          rank_bonus_amount_base: "0"
        };
      }

      const qualification = await getAccountRankQualificationResultByDate(conn, {
        account_id: input.account_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date
      });
      if (!qualification || qualification.applied_rank_level === null) {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "no_qualification",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: "0",
          rank_bonus_amount_base: "0"
        };
      }

      const rankRule = await getRankRuleByLevel(conn, {
        policy_version_id: input.policy_version_id,
        rank_level: qualification.applied_rank_level
      });
      if (!rankRule) {
        throw buildRuleMissingError({
          policy_version_id: input.policy_version_id,
          rank_level: qualification.applied_rank_level
        });
      }
      if (BigInt(rankRule.effective_bonus_bps) <= 0n) {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "no_rank",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: "0",
          rank_bonus_amount_base: "0"
        };
      }

      const baseAmounts = await getBatchRankBonusBaseDailyRewardAmounts(conn, {
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        account_ids: [input.account_id]
      });
      const base_daily_reward_amount_base = baseAmounts.get(input.account_id) ?? "0";
      if (BigInt(base_daily_reward_amount_base) <= 0n) {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "zero_base",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base,
          rank_bonus_amount_base: "0"
        };
      }

      const computation = computeRankBonus({
        base_daily_reward_amount_base,
        effective_bonus_bps: rankRule.effective_bonus_bps
      });
      if (BigInt(computation.rank_bonus_amount_base) <= 0n) {
        return {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          result_type: "zero_reward",
          reward_id: null,
          existing_reward_id: null,
          base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
          rank_bonus_amount_base: computation.rank_bonus_amount_base
        };
      }

      const source_reference = buildRankBonusSourceReference({
        calculation_date: input.calculation_date,
        account_id: input.account_id,
        rank_level: qualification.applied_rank_level
      });
      const existingReward = await getRewardBySourceReference(conn, {
        reward_type: "RANK_BONUS",
        source_reference
      });
      if (!existingReward) {
        throw conflictError("rank bonus run already exists for the date but no reward row was found for the account", {
          calc_run_id: input.calc_run_id,
          account_id: input.account_id,
          source_reference
        });
      }

      const result_type = classifyExistingRankBonusReward(existingReward, {
        account_id: input.account_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        rank_level: qualification.applied_rank_level,
        effective_bonus_bps: rankRule.effective_bonus_bps,
        base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
        rank_bonus_amount_base: computation.rank_bonus_amount_base,
        qualification_result_id: qualification.id
      });
      await this.insertOutcomeAudit({
        actor_account_id: input.actor_account_id,
        action: result_type === "duplicate" ? "RANK_BONUS_REWARD_DUPLICATE" : "RANK_BONUS_REWARD_CONFLICT",
        reward_id: existingReward.id,
        calc_run_id: input.calc_run_id,
        account_id: input.account_id,
        source_reference,
        qualification_result_id: qualification.id,
        rank_level: qualification.applied_rank_level,
        effective_bonus_bps: rankRule.effective_bonus_bps,
        base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
        rank_bonus_amount_base: computation.rank_bonus_amount_base
      });

      return {
        calc_run_id: input.calc_run_id,
        status: "SUCCEEDED",
        result_type,
        reward_id: null,
        existing_reward_id: existingReward.id,
        base_daily_reward_amount_base: computation.base_daily_reward_amount_base,
        rank_bonus_amount_base: computation.rank_bonus_amount_base
      };
    });
  }

  async runForAccount(input: {
    actor_account_id: string;
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }): Promise<RankBonusSingleResponse> {
    assertCalculationDate(input.calculation_date);
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
      const preconditions = await this.withConnection((conn) =>
        this.ensureBatchPreconditions(conn, {
          actor_account_id: input.actor_account_id,
          policy_version_id: input.policy_version_id
        })
      );
      const baseAmounts = await this.withConnection((conn) =>
        getBatchRankBonusBaseDailyRewardAmounts(conn, {
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          account_ids: [input.account_id]
        })
      );
      const outcome = await this.processAccount({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        account_id: input.account_id,
        symbol: preconditions.symbol,
        decimals: preconditions.decimals,
        base_daily_reward_amount_base: baseAmounts.get(input.account_id) ?? "0",
        audit_mode: "single"
      });
      const finalSummary = this.applyOutcomeToSummary(
        {
          ...summary,
          target_count: 1
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
        ...outcome
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
      if (calcRun.run_type !== RANK_BONUS_RUN_TYPE) {
        throw validationError("calc_run is not a rank bonus run", {
          calc_run_id: input.calc_run_id,
          run_type: calcRun.run_type
        });
      }
      return this.buildSummaryByCalcRun(conn, input.calc_run_id, calcRun.status);
    });
  }
}

export function extractRankBonusSummaryFromAuditLogs(auditLogs: AdminAuditLogRow[], calc_run_id: string): RankBonusRunSummary | null {
  for (const row of auditLogs) {
    const meta = toJsonObject(row.meta);
    const target_count = toNumberMetric(meta.target_count);
    const created_count = toNumberMetric(meta.created_count);
    const no_rank_skip_count = toNumberMetric(meta.no_rank_skip_count);
    const no_qualification_skip_count = toNumberMetric(meta.no_qualification_skip_count);
    const zero_base_skip_count = toNumberMetric(meta.zero_base_skip_count);
    const zero_reward_skip_count = toNumberMetric(meta.zero_reward_skip_count);
    const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
    const conflict_count = toNumberMetric(meta.conflict_count);
    const failed_count = toNumberMetric(meta.failed_count);
    const total_base_daily_reward_amount_base = toStringMetric(meta.total_base_daily_reward_amount_base);
    const total_rank_bonus_amount_base = toStringMetric(meta.total_rank_bonus_amount_base);
    if (
      target_count !== null &&
      created_count !== null &&
      no_rank_skip_count !== null &&
      no_qualification_skip_count !== null &&
      zero_base_skip_count !== null &&
      zero_reward_skip_count !== null &&
      duplicate_skip_count !== null &&
      conflict_count !== null &&
      failed_count !== null &&
      total_base_daily_reward_amount_base !== null &&
      total_rank_bonus_amount_base !== null
    ) {
      return {
        calc_run_id,
        target_count,
        created_count,
        no_rank_skip_count,
        no_qualification_skip_count,
        zero_base_skip_count,
        zero_reward_skip_count,
        duplicate_skip_count,
        conflict_count,
        failed_count,
        total_base_daily_reward_amount_base,
        total_rank_bonus_amount_base,
        status: toStringMetric(meta.status) ?? "SUCCEEDED"
      };
    }
  }
  return null;
}
