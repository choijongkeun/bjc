import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { assertCalcRunStatusTransitionAllowed } from "../domain/calcRunStatus.js";
import { AppError, forbidden, conflictError, notFound, validationError } from "../domain/errors.js";
import {
  addDirectReferralSummaryCount,
  buildDirectReferralSourceReference,
  calculateDirectReferralRewardAmountBase,
  classifyDirectReferralSponsorEligibility,
  classifyExistingDirectReferralReward,
  createEmptyDirectReferralBatchSummary,
  getKstDateFromSqlDateTime,
  getKstDateWindowUtc,
  isEligibleDirectReferralSourceStaking
} from "../domain/directReferralReward.js";
import { getRewardById, getRewardBySourceReference, insertAccountReward, updateRewardSourceLedgerEvent } from "../repos/accountRewardsRepo.js";
import { getAccountAuthById } from "../repos/accountsRepo.js";
import { insertAdminAuditLog, listAdminAuditLogs, type AdminAuditLogRow } from "../repos/auditLogRepo.js";
import {
  getCalcRunById,
  getCalcRunByPolicyRunTypeDate,
  insertCalcRun,
  updateCalcRunStatus
} from "../repos/calcRunsRepo.js";
import {
  getAccountStakingById,
  getAccountStakingByIdForUpdate,
  listDirectReferralEligibleStakingCandidates
} from "../repos/accountStakingsRepo.js";
import {
  getActiveDirectReferralRule,
  getDirectReferralRuleForUpdate
} from "../repos/directReferralRewardRulesRepo.js";
import { insertLedgerEvent } from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById } from "../repos/policyVersionsRepo.js";
import { getStakingProductById } from "../repos/stakingProductsRepo.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";
import { formatSqlDateTime } from "./dailyRewardService.js";

const DIRECT_REFERRAL_FORMULA_VERSION = "direct_referral_v1";
const DIRECT_REFERRAL_DEPTH = 1;
const DIRECT_REFERRAL_RUN_TYPE = "DIRECT_REFERRAL";
const DEFAULT_BATCH_CHUNK_SIZE = 200;
const RULE_MISSING_REASON = "ACTIVE_DIRECT_REFERRAL_RULE_NOT_FOUND";

type DirectReferralRunSummary = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  no_sponsor_skip_count: number;
  inactive_sponsor_skip_count: number;
  zero_reward_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_reward_amount_base: string;
  status: string;
};

type DirectReferralProcessResult =
  | { type: "created"; reward_id: string; amount_base: string }
  | { type: "no_sponsor" }
  | { type: "inactive_sponsor" }
  | { type: "zero_reward" }
  | { type: "duplicate"; existing_reward_id: string }
  | { type: "conflict"; existing_reward_id: string };

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

function isRuleMissingError(err: unknown): boolean {
  return (
    err instanceof AppError &&
    err.code === "VALIDATION_ERROR" &&
    err.details?.reason === RULE_MISSING_REASON
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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

function createEmptyDirectReferralRunSummary(calc_run_id: string, status = "RUNNING"): DirectReferralRunSummary {
  return {
    calc_run_id,
    target_count: 0,
    created_count: 0,
    no_sponsor_skip_count: 0,
    inactive_sponsor_skip_count: 0,
    zero_reward_skip_count: 0,
    duplicate_skip_count: 0,
    conflict_count: 0,
    failed_count: 0,
    total_reward_amount_base: "0",
    status
  };
}

export function assertCanRunDirectReferral(role: "USER" | "READER" | "ADMIN"): void {
  if (role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: role });
  }
}

function toCalcRunResponse(row: {
  id: string;
  policy_version_id: string;
  run_type: string;
  run_date: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  finalized_at: string | null;
  error_message?: string | null;
  created_at?: string;
}) {
  return {
    id: row.id,
    policy_version_id: row.policy_version_id,
    run_type: row.run_type,
    run_date: String(row.run_date).slice(0, 10),
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    finalized_at: row.finalized_at,
    error_message: row.error_message ?? null,
    created_at: row.created_at ?? null
  };
}

function buildRuleMissingError(policy_version_id: string) {
  return validationError("active direct referral rule not found", {
    policy_version_id,
    reward_type: DIRECT_REFERRAL_RUN_TYPE,
    reason: RULE_MISSING_REASON
  });
}

export class DirectReferralRewardService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async assertBatchPreconditions(input: { actor_account_id: string; policy_version_id: string }): Promise<void> {
    await this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const policy = await getPolicyVersionById(conn, input.policy_version_id);
      if (!policy) {
        throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      }

      const rule = await getActiveDirectReferralRule(conn, input.policy_version_id);
      if (!rule) {
        throw buildRuleMissingError(input.policy_version_id);
      }
    });
  }

  private async prepareBatchCalcRun(input: {
    actor_account_id: string;
    policy_version_id: string;
    run_date: string;
  }): Promise<{ calc_run_id: string; should_complete: boolean }> {
    const now = new Date();

    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: DIRECT_REFERRAL_RUN_TYPE,
        run_date: input.run_date
      });

      if (existing) {
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("direct referral calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "SUCCEEDED" || existing.status === "FINALIZED") {
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: "ADMIN_DIRECT_REFERRAL_RUN",
            target_table: "calc_runs",
            target_id: existing.id,
            meta: {
              calc_run_id: existing.id,
              mode: "batch",
              status: existing.status,
              rerun: true,
              policy_version_id: input.policy_version_id,
              run_date: input.run_date
            }
          });
          return { calc_run_id: existing.id, should_complete: false };
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
          error_message: null
        });
        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: "ADMIN_DIRECT_REFERRAL_RUN",
          target_table: "calc_runs",
          target_id: existing.id,
          meta: {
            calc_run_id: existing.id,
            mode: "batch",
            status: "RUNNING",
            policy_version_id: input.policy_version_id,
            run_date: input.run_date
          }
        });
        return { calc_run_id: existing.id, should_complete: true };
      }

      const calc_run_id = newId();
      await insertCalcRun(conn, {
        id: calc_run_id,
        policy_version_id: input.policy_version_id,
        run_type: DIRECT_REFERRAL_RUN_TYPE,
        run_date: input.run_date,
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
        action: "ADMIN_DIRECT_REFERRAL_RUN",
        target_table: "calc_runs",
        target_id: calc_run_id,
        meta: {
          calc_run_id,
          mode: "batch",
          status: "RUNNING",
          policy_version_id: input.policy_version_id,
          run_date: input.run_date
        }
      });
      return { calc_run_id, should_complete: true };
    });
  }

  private async completeBatchCalcRun(input: {
    actor_account_id: string;
    calc_run_id: string;
    policy_version_id: string;
    run_date: string;
    status: "SUCCEEDED" | "FAILED";
    summary: ReturnType<typeof createEmptyDirectReferralBatchSummary>;
    error_message?: string | null;
    update_status: boolean;
  }): Promise<void> {
    const finished_at = new Date();

    await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      if (input.update_status) {
        await updateCalcRunStatus(conn, {
          id: input.calc_run_id,
          status: input.status,
          finished_at: formatSqlDateTime(finished_at),
          error_message: input.error_message ?? null
        });
      }

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_DIRECT_REFERRAL_RUN",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        meta: {
          calc_run_id: input.calc_run_id,
          mode: "batch",
          status: input.status,
          update_status: input.update_status,
          policy_version_id: input.policy_version_id,
          run_date: input.run_date,
          ...input.summary
        }
      });
    });
  }

  private async prepareSingleCalcRun(input: {
    actor_account_id: string;
    policy_version_id: string;
    run_date: string;
  }): Promise<{ calc_run_id: string; created_new: boolean }> {
    const now = new Date();

    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: DIRECT_REFERRAL_RUN_TYPE,
        run_date: input.run_date
      });

      if (existing) {
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("direct referral calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "FAILED") {
          assertCalcRunStatusTransitionAllowed({
            from: existing.status,
            to: "RUNNING",
            allowFailedRetry: true
          });
          await updateCalcRunStatus(conn, {
            id: existing.id,
            status: "RUNNING",
            started_at: formatSqlDateTime(now),
            error_message: null
          });
          return { calc_run_id: existing.id, created_new: true };
        }
        return { calc_run_id: existing.id, created_new: false };
      }

      const calc_run_id = newId();
      await insertCalcRun(conn, {
        id: calc_run_id,
        policy_version_id: input.policy_version_id,
        run_type: DIRECT_REFERRAL_RUN_TYPE,
        run_date: input.run_date,
        status: "PENDING",
        created_by: actor.id
      });
      await updateCalcRunStatus(conn, {
        id: calc_run_id,
        status: "RUNNING",
        started_at: formatSqlDateTime(now),
        error_message: null
      });
      return { calc_run_id, created_new: true };
    });
  }

  private async completeSingleCalcRun(input: {
    calc_run_id: string;
    actor_account_id: string;
    status: "SUCCEEDED" | "FAILED";
    error_message?: string | null;
  }): Promise<void> {
    await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");
      await updateCalcRunStatus(conn, {
        id: input.calc_run_id,
        status: input.status,
        finished_at: formatSqlDateTime(new Date()),
        error_message: input.error_message ?? null
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_DIRECT_REFERRAL_RUN",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        meta: {
          calc_run_id: input.calc_run_id,
          mode: "single",
          status: input.status,
          error_message: input.error_message ?? null
        }
      });
    });
  }

  private async processSourceStaking(input: {
    actor_account_id: string;
    calc_run_id: string;
    staking_id: string;
    expected_policy_version_id: string;
    audit_mode: "batch" | "single";
  }): Promise<DirectReferralProcessResult> {
    const now = new Date();

    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const staking = await getAccountStakingByIdForUpdate(conn, input.staking_id);
      if (!staking) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      if (staking.policy_version_id !== input.expected_policy_version_id) {
        throw validationError("staking policy_version_id mismatch", {
          staking_id: input.staking_id,
          staking_policy_version_id: staking.policy_version_id,
          expected_policy_version_id: input.expected_policy_version_id
        });
      }
      if (
        !isEligibleDirectReferralSourceStaking({
          status: staking.status,
          activated_at: staking.activated_at,
          cancel_requested_at: staking.cancel_requested_at
        })
      ) {
        throw conflictError("staking is not eligible for direct referral reward", {
          staking_id: staking.id,
          status: staking.status,
          activated_at: staking.activated_at,
          cancel_requested_at: staking.cancel_requested_at
        });
      }

      const sourceAccount = await getAccountAuthById(conn, staking.account_id);
      if (!sourceAccount) {
        throw notFound("source account not found", { account_id: staking.account_id });
      }

      if (!sourceAccount.sponsor_account_id) {
        return { type: "no_sponsor" };
      }

      const sponsor = await getAccountAuthById(conn, sourceAccount.sponsor_account_id);
      const finalSponsorEligibility = classifyDirectReferralSponsorEligibility({
        sponsor_account_id: sponsor?.id ?? null,
        sponsor_role: sponsor?.role ?? null,
        sponsor_status: sponsor?.status ?? null,
        source_account_id: sourceAccount.id
      });
      if (finalSponsorEligibility === "no_sponsor") {
        return { type: "no_sponsor" };
      }
      if (finalSponsorEligibility === "inactive_sponsor" || !sponsor) {
        return { type: "inactive_sponsor" };
      }

      const rule = await getDirectReferralRuleForUpdate(conn, staking.policy_version_id);
      if (!rule) {
        throw buildRuleMissingError(staking.policy_version_id);
      }

      const product = await getStakingProductById(conn, staking.staking_product_id);
      if (!product) {
        throw notFound("staking product not found", {
          staking_product_id: staking.staking_product_id
        });
      }

      const activatedAt = staking.activated_at;
      if (!activatedAt) {
        throw validationError("staking activated_at is required", { staking_id: staking.id });
      }

      const reward_date = getKstDateFromSqlDateTime(activatedAt);
      const source_reference = buildDirectReferralSourceReference(staking.id, sponsor.id);
      const amount_base = calculateDirectReferralRewardAmountBase(staking.principal_amount_base, rule.bonus_bps);

      const existing = await getRewardBySourceReference(conn, {
        reward_type: "DIRECT_REFERRAL",
        source_reference
      });

      if (existing) {
        const outcome = classifyExistingDirectReferralReward(existing, {
          account_id: sponsor.id,
          source_account_id: sourceAccount.id,
          source_account_staking_id: staking.id,
          policy_version_id: staking.policy_version_id,
          amount_base,
          direct_referral_rate_bps: rule.bonus_bps
        });
        if (outcome === "duplicate") {
          return { type: "duplicate", existing_reward_id: existing.id };
        }

        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: "DIRECT_REFERRAL_REWARD_CONFLICT",
          target_table: "account_rewards",
          target_id: existing.id,
          meta: {
            mode: input.audit_mode,
            calc_run_id: input.calc_run_id,
            source_staking_id: staking.id,
            source_account_id: sourceAccount.id,
            sponsor_account_id: sponsor.id,
            existing_reward_id: existing.id,
            status: "conflict"
          }
        });
        return { type: "conflict", existing_reward_id: existing.id };
      }

      if (amount_base === "0") {
        return { type: "zero_reward" };
      }

      const reward_id = newId();
      const ledger_event_id = newId();
      const metadata_json = {
        formula_version: DIRECT_REFERRAL_FORMULA_VERSION,
        source_principal_amount_base: staking.principal_amount_base,
        direct_referral_rate_bps: rule.bonus_bps,
        referral_depth: DIRECT_REFERRAL_DEPTH
      };

      try {
        await insertAccountReward(conn, {
          id: reward_id,
          account_id: sponsor.id,
          account_staking_id: null,
          source_account_id: sourceAccount.id,
          source_account_staking_id: staking.id,
          policy_version_id: staking.policy_version_id,
          calc_run_id: input.calc_run_id,
          reward_type: "DIRECT_REFERRAL",
          reward_date,
          amount_base,
          status: "CONFIRMED",
          source_reference,
          available_at: now,
          confirmed_at: now,
          metadata_json,
          created_at: now,
          updated_at: now
        });

        await insertLedgerEvent(conn, {
          id: ledger_event_id,
          account_id: sponsor.id,
          related_account_id: sourceAccount.id,
          product_id: staking.staking_product_id,
          policy_version_id: staking.policy_version_id,
          calc_run_id: input.calc_run_id,
          event_time: now.toISOString(),
          event_type: "DIRECT_REFERRAL_BONUS",
          amount_base,
          decimals: product.decimals,
          symbol: product.symbol,
          reference_id: source_reference,
          meta: {
            reward_id,
            source_staking_id: staking.id,
            source_principal_amount_base: staking.principal_amount_base,
            direct_referral_rate_bps: rule.bonus_bps,
            formula_version: DIRECT_REFERRAL_FORMULA_VERSION,
            referral_depth: DIRECT_REFERRAL_DEPTH
          },
          created_by: actor.id
        });

        await updateRewardSourceLedgerEvent(conn, {
          id: reward_id,
          source_ledger_event_id: ledger_event_id,
          updated_at: now
        });
      } catch (err) {
        if (!isMysqlDuplicateKeyError(err)) {
          throw err;
        }

        const racedExisting = await getRewardBySourceReference(conn, {
          reward_type: "DIRECT_REFERRAL",
          source_reference
        });
        if (!racedExisting) {
          throw err;
        }

        const outcome = classifyExistingDirectReferralReward(racedExisting, {
          account_id: sponsor.id,
          source_account_id: sourceAccount.id,
          source_account_staking_id: staking.id,
          policy_version_id: staking.policy_version_id,
          amount_base,
          direct_referral_rate_bps: rule.bonus_bps
        });
        if (outcome === "duplicate") {
          return { type: "duplicate", existing_reward_id: racedExisting.id };
        }

        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: "DIRECT_REFERRAL_REWARD_CONFLICT",
          target_table: "account_rewards",
          target_id: racedExisting.id,
          meta: {
            mode: input.audit_mode,
            calc_run_id: input.calc_run_id,
            source_staking_id: staking.id,
            source_account_id: sourceAccount.id,
            sponsor_account_id: sponsor.id,
            existing_reward_id: racedExisting.id,
            status: "conflict"
          }
        });
        return { type: "conflict", existing_reward_id: racedExisting.id };
      }

      return { type: "created", reward_id, amount_base };
    });
  }

  async runBatch(input: {
    actor_account_id: string;
    policy_version_id: string;
    activated_from: string;
    activated_to: string;
  }): Promise<{
    calc_run_id: string;
    target_count: number;
    created_count: number;
    no_sponsor_skip_count: number;
    inactive_sponsor_skip_count: number;
    zero_reward_skip_count: number;
    duplicate_skip_count: number;
    conflict_count: number;
    failed_count: number;
    total_reward_amount_base: string;
    status: string;
  }> {
    const window = getKstDateWindowUtc({
      from: input.activated_from,
      to: input.activated_to
    });

    await this.assertBatchPreconditions({
      actor_account_id: input.actor_account_id,
      policy_version_id: input.policy_version_id
    });

    const preparedCalcRun = await this.prepareBatchCalcRun({
      actor_account_id: input.actor_account_id,
      policy_version_id: input.policy_version_id,
      run_date: window.run_date
    });
    const calc_run_id = preparedCalcRun.calc_run_id;

    let summary = createEmptyDirectReferralBatchSummary();
    let fatalError: unknown = null;

    try {
      for (let offset = 0; ; offset += DEFAULT_BATCH_CHUNK_SIZE) {
        const candidates = await this.withConnection((conn) =>
          listDirectReferralEligibleStakingCandidates(conn, {
            policy_version_id: input.policy_version_id,
            activated_from_sql: window.startSql,
            activated_to_exclusive_sql: window.endExclusiveSql,
            limit: DEFAULT_BATCH_CHUNK_SIZE,
            offset
          })
        );

        if (!candidates.length) {
          break;
        }

        summary = {
          ...summary,
          target_count: summary.target_count + candidates.length
        };

        for (const candidate of candidates) {
          try {
            const result = await this.processSourceStaking({
              actor_account_id: input.actor_account_id,
              calc_run_id,
              staking_id: candidate.id,
              expected_policy_version_id: input.policy_version_id,
              audit_mode: "batch"
            });

            if (result.type === "created") {
              summary = addDirectReferralSummaryCount(summary, {
                type: "created",
                amount_base: result.amount_base
              });
            } else if (result.type === "no_sponsor") {
              summary = addDirectReferralSummaryCount(summary, { type: "no_sponsor" });
            } else if (result.type === "inactive_sponsor") {
              summary = addDirectReferralSummaryCount(summary, { type: "inactive_sponsor" });
            } else if (result.type === "zero_reward") {
              summary = addDirectReferralSummaryCount(summary, { type: "zero_reward" });
            } else if (result.type === "duplicate") {
              summary = addDirectReferralSummaryCount(summary, { type: "duplicate" });
            } else {
              summary = addDirectReferralSummaryCount(summary, { type: "conflict" });
            }
          } catch (err) {
            if (isRuleMissingError(err)) {
              fatalError = err;
              throw err;
            }
            summary = addDirectReferralSummaryCount(summary, { type: "failed" });
          }
        }
      }

      await this.completeBatchCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id,
        policy_version_id: input.policy_version_id,
        run_date: window.run_date,
        status: summary.failed_count > 0 ? "FAILED" : "SUCCEEDED",
        summary,
        error_message: summary.failed_count > 0 ? "direct referral batch failed for one or more staking rows" : null,
        update_status: preparedCalcRun.should_complete
      });
    } catch (err) {
      await this.completeBatchCalcRun({
        actor_account_id: input.actor_account_id,
        calc_run_id,
        policy_version_id: input.policy_version_id,
        run_date: window.run_date,
        status: "FAILED",
        summary,
        error_message: err instanceof Error ? err.message : "direct referral batch failed",
        update_status: preparedCalcRun.should_complete
      });
      throw err;
    }

    const calc_run = await this.withConnection(async (conn) => {
      const row = await getCalcRunById(conn, calc_run_id);
      if (!row) {
        throw notFound("calc_run not found after direct referral run", { calc_run_id });
      }
      return row;
    });

    return {
      calc_run_id,
      ...summary,
      status: fatalError || summary.failed_count > 0 ? "FAILED" : calc_run.status
    };
  }

  async runForStaking(input: {
    actor_account_id: string;
    staking_id: string;
    policy_version_id?: string;
  }): Promise<{
    calc_run_id: string | null;
    status: string;
    result_type: DirectReferralProcessResult["type"];
    reward_id: string | null;
    existing_reward_id: string | null;
  }> {
    const staking = await this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const row = await getAccountStakingById(conn, input.staking_id);
      if (!row) {
        throw notFound("staking not found", { staking_id: input.staking_id });
      }
      if (input.policy_version_id && input.policy_version_id !== row.policy_version_id) {
        throw validationError("policy_version_id does not match staking snapshot", {
          staking_id: input.staking_id,
          staking_policy_version_id: row.policy_version_id,
          policy_version_id: input.policy_version_id
        });
      }

      const rule = await getActiveDirectReferralRule(conn, row.policy_version_id);
      if (!rule) {
        throw buildRuleMissingError(row.policy_version_id);
      }

      return row;
    });

    if (
      !isEligibleDirectReferralSourceStaking({
        status: staking.status,
        activated_at: staking.activated_at,
        cancel_requested_at: staking.cancel_requested_at
      })
    ) {
      throw conflictError("staking is not eligible for direct referral reward", {
        staking_id: staking.id,
        status: staking.status,
        activated_at: staking.activated_at,
        cancel_requested_at: staking.cancel_requested_at
      });
    }

    const activatedAt = staking.activated_at;
    if (!activatedAt) {
      throw validationError("staking activated_at is required", { staking_id: staking.id });
    }

    const run_date = getKstDateFromSqlDateTime(activatedAt);
    const prepared = await this.prepareSingleCalcRun({
      actor_account_id: input.actor_account_id,
      policy_version_id: staking.policy_version_id,
      run_date
    });

    try {
      const result = await this.processSourceStaking({
        actor_account_id: input.actor_account_id,
        calc_run_id: prepared.calc_run_id,
        staking_id: staking.id,
        expected_policy_version_id: staking.policy_version_id,
        audit_mode: "single"
      });

      if (prepared.created_new) {
        await this.completeSingleCalcRun({
          actor_account_id: input.actor_account_id,
          calc_run_id: prepared.calc_run_id,
          status: "SUCCEEDED"
        });
      } else {
        await withTx(this.pool, async (conn) => {
          const actor = await requireActor(conn, input.actor_account_id);
          assertRoleAtLeast(actor, "ADMIN");
          await insertAdminAuditLog(conn, {
            actor_account_id: actor.id,
            action: "ADMIN_DIRECT_REFERRAL_RUN",
            target_table: "account_stakings",
            target_id: staking.id,
            meta: {
              mode: "single",
              calc_run_id: prepared.calc_run_id,
              source_staking_id: staking.id,
              policy_version_id: staking.policy_version_id,
              result_type: result.type
            }
          });
        });
      }

      return {
        calc_run_id: prepared.calc_run_id,
        status: prepared.created_new ? "SUCCEEDED" : "COMPLETED",
        result_type: result.type,
        reward_id: result.type === "created" ? result.reward_id : null,
        existing_reward_id:
          result.type === "duplicate" || result.type === "conflict" ? result.existing_reward_id : null
      };
    } catch (err) {
      if (prepared.created_new) {
        await this.completeSingleCalcRun({
          actor_account_id: input.actor_account_id,
          calc_run_id: prepared.calc_run_id,
          status: "FAILED",
          error_message: err instanceof Error ? err.message : "direct referral single run failed"
        });
      }
      throw err;
    }
  }

  async getRewardForRunResult(reward_id: string) {
    return this.withConnection(async (conn) => {
      const reward = await getRewardById(conn, reward_id);
      if (!reward) {
        throw notFound("reward not found", { reward_id });
      }
      return reward;
    });
  }

  async getCalcRun(calc_run_id: string) {
    return this.withConnection(async (conn) => {
      const row = await getCalcRunById(conn, calc_run_id);
      if (!row) {
        throw notFound("calc_run not found", { calc_run_id });
      }
      return toCalcRunResponse(row);
    });
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
      if (calcRun.run_type !== DIRECT_REFERRAL_RUN_TYPE) {
        throw validationError("calc_run is not a direct referral run", {
          calc_run_id: input.calc_run_id,
          run_type: calcRun.run_type
        });
      }

      const audit = await listAdminAuditLogs(conn, {
        action: "ADMIN_DIRECT_REFERRAL_RUN",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        page: 1,
        limit: 20
      });

      return (
        extractDirectReferralSummaryFromAuditLogs(audit.items, input.calc_run_id) ??
        createEmptyDirectReferralRunSummary(input.calc_run_id, calcRun.status)
      );
    });
  }
}

export function extractDirectReferralSummaryFromAuditLogs(
  auditLogs: AdminAuditLogRow[],
  calc_run_id: string
): DirectReferralRunSummary | null {
  for (const row of auditLogs) {
    const meta = toJsonObject(row.meta);
    const target_count = toNumberMetric(meta.target_count);
    const created_count = toNumberMetric(meta.created_count);
    const no_sponsor_skip_count = toNumberMetric(meta.no_sponsor_skip_count);
    const inactive_sponsor_skip_count = toNumberMetric(meta.inactive_sponsor_skip_count);
    const zero_reward_skip_count = toNumberMetric(meta.zero_reward_skip_count);
    const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
    const conflict_count = toNumberMetric(meta.conflict_count);
    const failed_count = toNumberMetric(meta.failed_count);
    const total_reward_amount_base = toStringMetric(meta.total_reward_amount_base);
    if (
      target_count !== null &&
      created_count !== null &&
      no_sponsor_skip_count !== null &&
      inactive_sponsor_skip_count !== null &&
      zero_reward_skip_count !== null &&
      duplicate_skip_count !== null &&
      conflict_count !== null &&
      failed_count !== null &&
      total_reward_amount_base !== null
    ) {
      return {
        calc_run_id,
        target_count,
        created_count,
        no_sponsor_skip_count,
        inactive_sponsor_skip_count,
        zero_reward_skip_count,
        duplicate_skip_count,
        conflict_count,
        failed_count,
        total_reward_amount_base,
        status: toStringMetric(meta.status) ?? "SUCCEEDED"
      };
    }
  }

  return null;
}
