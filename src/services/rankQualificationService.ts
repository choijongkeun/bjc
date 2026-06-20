import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertCalcRunStatusTransitionAllowed } from "../domain/calcRunStatus.js";
import { conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import {
  assertHasActiveRankRules,
  buildNextRankProgress,
  decideRankQualification,
  selectHighestQualifiedRank,
  type RankQualificationMetrics,
  type RankRule
} from "../domain/rankQualification.js";
import { getAccountRankHistory, insertAccountRankHistory, listAccountRankHistory } from "../repos/accountRankHistoryRepo.js";
import {
  getAccountRankQualificationResultByRunAccount,
  getLatestAccountRankQualificationResult,
  insertAccountRankQualificationResult,
  listRankQualificationResultsByCalcRun,
  summarizeRankQualificationResults
} from "../repos/accountRankQualificationResultsRepo.js";
import {
  getAccountRankStatusByAccountId,
  getAccountRankStatusByAccountIdForUpdate,
  upsertAccountRankStatus
} from "../repos/accountRankStatusRepo.js";
import { getAccountAuthById, getAccountByIdForUpdate } from "../repos/accountsRepo.js";
import { insertAdminAuditLog } from "../repos/auditLogRepo.js";
import {
  getCalcRunById,
  getCalcRunByPolicyRunTypeDate,
  insertCalcRun,
  updateCalcRunStatus
} from "../repos/calcRunsRepo.js";
import { getPolicyVersionById } from "../repos/policyVersionsRepo.js";
import { listRankQualificationTargetAccounts, getBatchRankQualificationMetrics } from "../repos/rankQualificationMetricsRepo.js";
import { listActiveRankRules } from "../repos/rankRulesRepo.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

const RANK_QUALIFICATION_RUN_TYPE = "RANK_QUALIFICATION";
const RANK_QUALIFICATION_FORMULA_VERSION = "rank_qualification_v1";

type RankQualificationSummary = {
  calc_run_id: string;
  target_count: number;
  initial_count: number;
  promoted_count: number;
  maintained_count: number;
  demotion_deferred_count: number;
  unqualified_count: number;
  failed_count: number;
  status: string;
};

function assertCalculationDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("calculation_date must be YYYY-MM-DD", { calculation_date: value });
  }
}

function toDateOnly(value: unknown): string {
  if (value instanceof Date) {
    const year = String(value.getFullYear());
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

function toNullableDateTime(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
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
    run_date: toDateOnly(row.run_date),
    status: row.status,
    started_at: toNullableDateTime(row.started_at),
    finished_at: toNullableDateTime(row.finished_at),
    finalized_at: toNullableDateTime(row.finalized_at),
    error_message: row.error_message ?? null,
    created_at: toNullableDateTime(row.created_at)
  };
}

function toRankStatusResponse(
  status: {
    account_id: string;
    policy_version_id: string;
    current_rank_level: number | null;
    qualified_at: unknown;
    maintained_until: unknown;
    last_qualification_calc_run_id: string | null;
    last_bonus_calc_run_id: string | null;
    last_change_type: "INITIAL" | "PROMOTED" | "MAINTAINED" | "DEMOTED" | null;
    created_at: unknown;
    updated_at: unknown;
  } | null
) {
  if (!status) {
    return null;
  }
  return {
    account_id: status.account_id,
    policy_version_id: status.policy_version_id,
    current_rank_level: status.current_rank_level,
    qualified_at: toNullableDateTime(status.qualified_at),
    maintained_until: status.maintained_until === null || status.maintained_until === undefined ? null : toDateOnly(status.maintained_until),
    last_qualification_calc_run_id: status.last_qualification_calc_run_id,
    last_bonus_calc_run_id: status.last_bonus_calc_run_id,
    last_change_type: status.last_change_type,
    created_at: toNullableDateTime(status.created_at),
    updated_at: toNullableDateTime(status.updated_at)
  };
}

function toQualificationResultResponse(
  row: {
    id: string;
    calc_run_id: string;
    account_id: string;
    policy_version_id: string;
    calculation_date: unknown;
    period_from: unknown;
    period_to: unknown;
    previous_rank_level: number | null;
    qualified_rank_level: number | null;
    applied_rank_level: number | null;
    result_status: "QUALIFIED" | "UNQUALIFIED" | "DEMOTION_CANDIDATE" | "NO_CHANGE";
    personal_active_stake_amount_base: string;
    personal_cumulative_stake_amount_base: string;
    direct_referral_count: number;
    direct_active_referral_count: number;
    left_leg_volume_base: string;
    right_leg_volume_base: string;
    weak_leg_volume_base: string;
    strong_leg_volume_base: string;
    downline_daily_reward_amount_base: string;
    qualification_snapshot_json: unknown;
    created_at: unknown;
  }
) {
  return {
    id: row.id,
    calc_run_id: row.calc_run_id,
    account_id: row.account_id,
    policy_version_id: row.policy_version_id,
    calculation_date: toDateOnly(row.calculation_date),
    period_from: toDateOnly(row.period_from),
    period_to: toDateOnly(row.period_to),
    previous_rank_level: row.previous_rank_level,
    qualified_rank_level: row.qualified_rank_level,
    applied_rank_level: row.applied_rank_level,
    result_status: row.result_status,
    personal_active_stake_amount_base: row.personal_active_stake_amount_base,
    personal_cumulative_stake_amount_base: row.personal_cumulative_stake_amount_base,
    direct_referral_count: row.direct_referral_count,
    direct_active_referral_count: row.direct_active_referral_count,
    left_leg_volume_base: row.left_leg_volume_base,
    right_leg_volume_base: row.right_leg_volume_base,
    weak_leg_volume_base: row.weak_leg_volume_base,
    strong_leg_volume_base: row.strong_leg_volume_base,
    downline_daily_reward_amount_base: row.downline_daily_reward_amount_base,
    qualification_snapshot: row.qualification_snapshot_json,
    created_at: toNullableDateTime(row.created_at)
  };
}

function toRankHistoryResponse(
  row: {
    id: string;
    account_id: string;
    policy_version_id: string;
    calc_run_id: string;
    qualification_result_id: string | null;
    effective_date: unknown;
    previous_rank_level: number | null;
    calculated_rank_level: number | null;
    final_rank_level: number | null;
    change_type: "INITIAL" | "PROMOTED" | "MAINTAINED" | "DEMOTED";
    personal_active_stake_amount_base: string;
    personal_cumulative_stake_amount_base: string;
    direct_referral_count: number;
    direct_active_referral_count: number;
    left_leg_volume_base: string;
    right_leg_volume_base: string;
    weak_leg_volume_base: string;
    strong_leg_volume_base: string;
    downline_daily_reward_amount_base: string;
    qualification_snapshot_json: unknown;
    created_at: unknown;
  }
) {
  return {
    id: row.id,
    account_id: row.account_id,
    policy_version_id: row.policy_version_id,
    calc_run_id: row.calc_run_id,
    qualification_result_id: row.qualification_result_id,
    effective_date: toDateOnly(row.effective_date),
    previous_rank_level: row.previous_rank_level,
    calculated_rank_level: row.calculated_rank_level,
    final_rank_level: row.final_rank_level,
    change_type: row.change_type,
    personal_active_stake_amount_base: row.personal_active_stake_amount_base,
    personal_cumulative_stake_amount_base: row.personal_cumulative_stake_amount_base,
    direct_referral_count: row.direct_referral_count,
    direct_active_referral_count: row.direct_active_referral_count,
    left_leg_volume_base: row.left_leg_volume_base,
    right_leg_volume_base: row.right_leg_volume_base,
    weak_leg_volume_base: row.weak_leg_volume_base,
    strong_leg_volume_base: row.strong_leg_volume_base,
    downline_daily_reward_amount_base: row.downline_daily_reward_amount_base,
    qualification_snapshot: row.qualification_snapshot_json,
    created_at: toNullableDateTime(row.created_at)
  };
}

function createEmptyMetrics(): RankQualificationMetrics {
  return {
    personal_active_stake_amount_base: "0",
    personal_cumulative_stake_amount_base: "0",
    direct_referral_count: 0,
    direct_active_referral_count: 0,
    left_leg_volume_base: "0",
    right_leg_volume_base: "0",
    weak_leg_volume_base: "0",
    strong_leg_volume_base: "0",
    downline_daily_reward_amount_base: "0"
  };
}

function toDomainRules(
  rows: Array<{
    id: string;
    policy_version_id: string;
    rank_level: number;
    required_lines: number;
    required_weak_volume_base: string;
    rank_share_bps: string;
    effective_bonus_bps: string;
  }>
): RankRule[] {
  return rows.map((row) => ({
    id: row.id,
    policy_version_id: row.policy_version_id,
    rank_level: row.rank_level,
    required_lines: row.required_lines,
    required_weak_volume_base: row.required_weak_volume_base,
    rank_share_bps: row.rank_share_bps,
    effective_bonus_bps: row.effective_bonus_bps
  }));
}

export function assertCanRunRankQualification(role: "USER" | "READER" | "ADMIN"): void {
  if (role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: role });
  }
}

function buildQualificationSnapshot(input: {
  metrics: RankQualificationMetrics;
  policy_version_id: string;
  evaluated_rules: Array<{
    rule_id: string;
    rank_level: number;
    qualified: boolean;
    unmet_conditions: string[];
  }>;
  demotion_deferred: boolean;
}): Record<string, unknown> {
  return {
    formula_version: RANK_QUALIFICATION_FORMULA_VERSION,
    policy_version_id: input.policy_version_id,
    rule_shape: {
      required_lines: "direct_active_referral_count",
      required_weak_volume_base: "weak_leg_volume_base"
    },
    metrics: {
      personal_active_stake_amount_base: input.metrics.personal_active_stake_amount_base,
      personal_cumulative_stake_amount_base: input.metrics.personal_cumulative_stake_amount_base,
      direct_referral_count: input.metrics.direct_referral_count,
      direct_active_referral_count: input.metrics.direct_active_referral_count,
      left_leg_volume_base: input.metrics.left_leg_volume_base,
      right_leg_volume_base: input.metrics.right_leg_volume_base,
      weak_leg_volume_base: input.metrics.weak_leg_volume_base,
      strong_leg_volume_base: input.metrics.strong_leg_volume_base,
      downline_daily_reward_amount_base: input.metrics.downline_daily_reward_amount_base
    },
    evaluated_rules: input.evaluated_rules,
    demotion_deferred: input.demotion_deferred
  };
}

export class RankQualificationService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async buildSummaryByCalcRun(conn: DbConn, calc_run_id: string, status: string): Promise<RankQualificationSummary> {
    const qualificationSummary = await summarizeRankQualificationResults(conn, calc_run_id);
    const historyRows = await getAccountRankHistory(conn, calc_run_id);
    const maintained_count = Math.max(0, historyRows.maintained_count - qualificationSummary.demotion_deferred_count);
    return {
      calc_run_id,
      target_count: qualificationSummary.target_count,
      initial_count: historyRows.initial_count,
      promoted_count: historyRows.promoted_count,
      maintained_count,
      demotion_deferred_count: qualificationSummary.demotion_deferred_count,
      unqualified_count: qualificationSummary.unqualified_count,
      failed_count: 0,
      status
    };
  }

  private async prepareCalcRun(input: {
    actor_account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }): Promise<{ calc_run_id: string; should_execute: boolean }> {
    const now = new Date();
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankQualification(actor.role);

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: RANK_QUALIFICATION_RUN_TYPE,
        run_date: input.calculation_date
      });

      if (existing) {
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("rank qualification calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "SUCCEEDED" || existing.status === "FINALIZED") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: "ADMIN_RANK_QUALIFICATION_RUN",
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
          action: "ADMIN_RANK_QUALIFICATION_RUN",
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
        run_type: RANK_QUALIFICATION_RUN_TYPE,
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
        action: "ADMIN_RANK_QUALIFICATION_RUN",
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

  private async markCalcRunFailed(input: {
    actor_account_id: string;
    calc_run_id: string;
    policy_version_id: string;
    calculation_date: string;
    error_message: string;
  }): Promise<void> {
    const finishedAt = new Date();
    await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankQualification(actor.role);
      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: "FAILED",
        finished_at: formatSqlDateTime(finishedAt),
        error_message: input.error_message
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_RANK_QUALIFICATION_RUN",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        meta: {
          calc_run_id: input.calc_run_id,
          status: "FAILED",
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          error_message: input.error_message
        }
      });
    });
  }

  private async executeRun(input: {
    actor_account_id: string;
    calc_run_id: string;
    policy_version_id: string;
    calculation_date: string;
    target_account_id?: string;
  }): Promise<RankQualificationSummary> {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertCanRunRankQualification(actor.role);

      const policy = await getPolicyVersionById(conn, input.policy_version_id);
      if (!policy) {
        throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      }

      const calcRun = await getCalcRunById(conn, input.calc_run_id);
      if (!calcRun) {
        throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      }
      if (calcRun.run_type !== RANK_QUALIFICATION_RUN_TYPE) {
        throw validationError("calc_run is not a rank qualification run", {
          calc_run_id: input.calc_run_id,
          run_type: calcRun.run_type
        });
      }

      const rules = toDomainRules(await listActiveRankRules(conn, input.policy_version_id));
      assertHasActiveRankRules(rules, input.policy_version_id);

      const targetAccounts = await listRankQualificationTargetAccounts(conn, {
        policy_version_id: input.policy_version_id,
        account_id: input.target_account_id
      });
      if (input.target_account_id && targetAccounts.length === 0) {
        throw validationError("qualification target must be an ACTIVE USER", {
          account_id: input.target_account_id
        });
      }

      const targetIds = targetAccounts.map((account) => account.id);
      const metricsMap = await getBatchRankQualificationMetrics(conn, {
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        account_ids: targetIds
      });

      for (const target of targetAccounts) {
        const lockedAccount = await getAccountByIdForUpdate(conn, target.id);
        if (!lockedAccount || lockedAccount.role !== "USER" || lockedAccount.status !== "ACTIVE") {
          throw validationError("qualification target must remain an ACTIVE USER during execution", {
            account_id: target.id
          });
        }

        const existingStatus = await getAccountRankStatusByAccountIdForUpdate(conn, target.id);
        const previous_rank_level = existingStatus?.current_rank_level ?? null;
        const metrics = metricsMap.get(target.id) ?? createEmptyMetrics();
        const highestQualified = selectHighestQualifiedRank(metrics, rules);
        const decision = decideRankQualification({
          previous_rank_level,
          qualified_rank_level: highestQualified.qualified_rank_level,
          evaluated_rules: highestQualified.evaluated_rules
        });

        const qualification_snapshot_json = buildQualificationSnapshot({
          metrics,
          policy_version_id: input.policy_version_id,
          evaluated_rules: decision.evaluated_rules,
          demotion_deferred: decision.demotion_deferred
        });

        const qualification_result_id = newId();
        await insertAccountRankQualificationResult(conn, {
          id: qualification_result_id,
          calc_run_id: input.calc_run_id,
          account_id: target.id,
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          period_from: input.calculation_date,
          period_to: input.calculation_date,
          previous_rank_level: decision.previous_rank_level,
          qualified_rank_level: decision.qualified_rank_level,
          applied_rank_level: decision.applied_rank_level,
          result_status: decision.result_status,
          personal_active_stake_amount_base: metrics.personal_active_stake_amount_base,
          personal_cumulative_stake_amount_base: metrics.personal_cumulative_stake_amount_base,
          direct_referral_count: metrics.direct_referral_count,
          direct_active_referral_count: metrics.direct_active_referral_count,
          left_leg_volume_base: metrics.left_leg_volume_base,
          right_leg_volume_base: metrics.right_leg_volume_base,
          weak_leg_volume_base: metrics.weak_leg_volume_base,
          strong_leg_volume_base: metrics.strong_leg_volume_base,
          downline_daily_reward_amount_base: metrics.downline_daily_reward_amount_base,
          qualification_snapshot_json
        });

        const nextQualifiedAt =
          decision.applied_rank_level === null
            ? null
            : decision.change_type === "INITIAL" || decision.change_type === "PROMOTED"
              ? `${input.calculation_date} 00:00:00`
              : existingStatus?.qualified_at ?? `${input.calculation_date} 00:00:00`;

        await upsertAccountRankStatus(conn, {
          account_id: target.id,
          policy_version_id: input.policy_version_id,
          current_rank_level: decision.applied_rank_level,
          qualified_at: nextQualifiedAt,
          maintained_until: existingStatus?.maintained_until ?? null,
          last_qualification_calc_run_id: input.calc_run_id,
          last_change_type: decision.change_type
        });

        const history_id = newId();
        await insertAccountRankHistory(conn, {
          id: history_id,
          account_id: target.id,
          policy_version_id: input.policy_version_id,
          calc_run_id: input.calc_run_id,
          qualification_result_id,
          effective_date: input.calculation_date,
          previous_rank_level: decision.previous_rank_level,
          calculated_rank_level: decision.qualified_rank_level,
          final_rank_level: decision.applied_rank_level,
          change_type: decision.change_type,
          personal_active_stake_amount_base: metrics.personal_active_stake_amount_base,
          personal_cumulative_stake_amount_base: metrics.personal_cumulative_stake_amount_base,
          direct_referral_count: metrics.direct_referral_count,
          direct_active_referral_count: metrics.direct_active_referral_count,
          left_leg_volume_base: metrics.left_leg_volume_base,
          right_leg_volume_base: metrics.right_leg_volume_base,
          weak_leg_volume_base: metrics.weak_leg_volume_base,
          strong_leg_volume_base: metrics.strong_leg_volume_base,
          downline_daily_reward_amount_base: metrics.downline_daily_reward_amount_base,
          qualification_snapshot_json
        });

        const action = decision.demotion_deferred
          ? "ACCOUNT_RANK_DEMOTION_DEFERRED"
          : decision.change_type === "INITIAL"
            ? "ACCOUNT_RANK_INITIALIZED"
            : decision.change_type === "PROMOTED"
              ? "ACCOUNT_RANK_PROMOTED"
              : "ACCOUNT_RANK_MAINTAINED";

        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action,
          target_table: "account_rank_status",
          target_id: target.id,
          meta: {
            calc_run_id: input.calc_run_id,
            policy_version_id: input.policy_version_id,
            account_id: target.id,
            previous_rank_level: decision.previous_rank_level,
            qualified_rank_level: decision.qualified_rank_level,
            applied_rank_level: decision.applied_rank_level,
            result_status: decision.result_status,
            demotion_deferred: decision.demotion_deferred
          }
        });
      }

      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: "SUCCEEDED",
        finished_at: formatSqlDateTime(new Date()),
        error_message: null
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_RANK_QUALIFICATION_RUN",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        meta: {
          calc_run_id: input.calc_run_id,
          status: "SUCCEEDED",
          policy_version_id: input.policy_version_id,
          calculation_date: input.calculation_date,
          target_count: targetIds.length,
          mode: input.target_account_id ? "single" : "batch"
        }
      });

      return this.buildSummaryByCalcRun(conn, input.calc_run_id, "SUCCEEDED");
    });
  }

  async runBatch(input: { actor_account_id: string; policy_version_id: string; calculation_date: string }) {
    assertCalculationDate(input.calculation_date);
    const prepared = await this.prepareCalcRun(input);
    if (!prepared.should_execute) {
      return this.withConnection(async (conn) => this.buildSummaryByCalcRun(conn, prepared.calc_run_id, "SUCCEEDED"));
    }
    try {
      return await this.executeRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date
      });
    } catch (err) {
      await this.markCalcRunFailed({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        error_message: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }
  }

  async runForAccount(input: {
    actor_account_id: string;
    account_id: string;
    policy_version_id: string;
    calculation_date: string;
  }) {
    assertCalculationDate(input.calculation_date);
    const prepared = await this.prepareCalcRun({
      actor_account_id: input.actor_account_id,
      policy_version_id: input.policy_version_id,
      calculation_date: input.calculation_date
    });

    if (!prepared.should_execute) {
      return this.withConnection(async (conn) => {
        const result = await getAccountRankQualificationResultByRunAccount(conn, {
          calc_run_id: prepared.calc_run_id,
          account_id: input.account_id
        });
        if (!result) {
          throw conflictError("rank qualification run already exists for the date and cannot be reused for this account", {
            calc_run_id: prepared.calc_run_id,
            account_id: input.account_id
          });
        }
        const calc_run = await getCalcRunById(conn, prepared.calc_run_id);
        return {
          calc_run: calc_run ? toCalcRunResponse(calc_run) : null,
          qualification_result: toQualificationResultResponse(result)
        };
      });
    }

    try {
      await this.executeRun({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        target_account_id: input.account_id
      });
    } catch (err) {
      await this.markCalcRunFailed({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        policy_version_id: input.policy_version_id,
        calculation_date: input.calculation_date,
        error_message: err instanceof Error ? err.message : String(err)
      });
      throw err;
    }

    return this.withConnection(async (conn) => {
      const calc_run = await getCalcRunById(conn, prepared.calc_run_id);
      const result = await getAccountRankQualificationResultByRunAccount(conn, {
        calc_run_id: prepared.calc_run_id,
        account_id: input.account_id
      });
      if (!calc_run || !result) {
        throw notFound("qualification result not found after execution", {
          calc_run_id: prepared.calc_run_id,
          account_id: input.account_id
        });
      }
      return {
        calc_run: toCalcRunResponse(calc_run),
        qualification_result: toQualificationResultResponse(result)
      };
    });
  }

  private async buildRankReadModel(input: { account_id: string }) {
    return this.withConnection(async (conn) => {
      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }

      const status = await getAccountRankStatusByAccountId(conn, input.account_id);
      const latestResult = await getLatestAccountRankQualificationResult(conn, input.account_id);
      const policy_version_id = status?.policy_version_id ?? latestResult?.policy_version_id ?? null;

      let next_rank = null;
      let next_rank_progress: Array<{
        metric: "direct_active_referral_count" | "weak_leg_volume_base";
        current: number | string;
        required: number | string;
        met: boolean;
      }> = [];

      if (policy_version_id && latestResult) {
        const rules = toDomainRules(await listActiveRankRules(conn, policy_version_id));
        const progress = buildNextRankProgress({
          current_rank_level: status?.current_rank_level ?? latestResult.applied_rank_level,
          rules,
          metrics: {
            personal_active_stake_amount_base: latestResult.personal_active_stake_amount_base,
            personal_cumulative_stake_amount_base: latestResult.personal_cumulative_stake_amount_base,
            direct_referral_count: latestResult.direct_referral_count,
            direct_active_referral_count: latestResult.direct_active_referral_count,
            left_leg_volume_base: latestResult.left_leg_volume_base,
            right_leg_volume_base: latestResult.right_leg_volume_base,
            weak_leg_volume_base: latestResult.weak_leg_volume_base,
            strong_leg_volume_base: latestResult.strong_leg_volume_base,
            downline_daily_reward_amount_base: latestResult.downline_daily_reward_amount_base
          }
        });
        next_rank = progress.next_rank_level === null ? null : { rank_level: progress.next_rank_level };
        next_rank_progress = progress.progress_items.map((item) =>
          item.metric === "direct_active_referral_count"
            ? item
            : {
                metric: item.metric,
                current: item.current,
                required: item.required,
                met: item.met
              }
        );
      }

      return {
        account: {
          id: account.id,
          login_id: account.login_id,
          display_name: account.display_name,
          role: account.role,
          status: account.status
        },
        rank_status: toRankStatusResponse(status),
        latest_qualification_result: latestResult ? toQualificationResultResponse(latestResult) : null,
        next_rank,
        next_rank_progress
      };
    });
  }

  async getMyRank(input: { account_id: string }) {
    return this.buildRankReadModel(input);
  }

  async listMyRankHistory(input: { account_id: string; page: number; limit: number }) {
    return this.withConnection(async (conn) => {
      const result = await listAccountRankHistory(conn, input);
      return {
        items: result.items.map((row) => toRankHistoryResponse(row)),
        total: result.total
      };
    });
  }

  async getAdminAccountRank(input: { actor_account_id: string; account_id: string }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      return this.buildRankReadModel({ account_id: input.account_id });
    });
  }

  async listAdminAccountRankHistory(input: { actor_account_id: string; account_id: string; page: number; limit: number }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");
      const account = await getAccountAuthById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      const result = await listAccountRankHistory(conn, {
        account_id: input.account_id,
        page: input.page,
        limit: input.limit
      });
      return {
        account: {
          id: account.id,
          login_id: account.login_id,
          display_name: account.display_name,
          role: account.role,
          status: account.status
        },
        items: result.items.map((row) => toRankHistoryResponse(row)),
        total: result.total
      };
    });
  }

  async listCalcRunRankResults(input: { actor_account_id: string; calc_run_id: string; page: number; limit: number }) {
    return this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "READER");

      const calc_run = await getCalcRunById(conn, input.calc_run_id);
      if (!calc_run) {
        throw notFound("calc_run not found", { calc_run_id: input.calc_run_id });
      }
      const result = await listRankQualificationResultsByCalcRun(conn, {
        calc_run_id: input.calc_run_id,
        page: input.page,
        limit: input.limit
      });
      return {
        calc_run: toCalcRunResponse(calc_run),
        items: result.items.map((row) => toQualificationResultResponse(row)),
        total: result.total
      };
    });
  }
}
