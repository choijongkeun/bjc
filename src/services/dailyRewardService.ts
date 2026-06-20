import type { DbConn, DbPool } from "../db/pool.js";

import { assertIntString } from "../domain/amount.js";
import { conflictError, forbidden, notFound, validationError } from "../domain/errors.js";
import { assertCalcRunStatusTransitionAllowed } from "../domain/calcRunStatus.js";
import {
  getRewardBySourceReference,
  insertAccountReward,
  updateRewardSourceLedgerEvent,
} from "../repos/accountRewardsRepo.js";
import {
  type DailyRewardEligibleStakingRow,
  listDailyRewardEligibleStakings,
} from "../repos/accountStakingsRepo.js";
import {
  getCalcRunById,
  getCalcRunByPolicyRunTypeDate,
  insertCalcRun,
  updateCalcRunStatus,
} from "../repos/calcRunsRepo.js";
import { insertAdminAuditLog, listAdminAuditLogs, type AdminAuditLogRow } from "../repos/auditLogRepo.js";
import { insertLedgerEvent } from "../repos/ledgerEventsRepo.js";
import { getPolicyVersionById } from "../repos/policyVersionsRepo.js";
import { withTx } from "../db/tx.js";
import { newId } from "../util/ids.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";

const BPS_DENOMINATOR = 10000n;
const ASIA_SEOUL_OFFSET_HOURS = 9;
const DEFAULT_BATCH_CHUNK_SIZE = 200;

type DailyRewardRunSummary = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  zero_reward_skip_count: number;
  duplicate_skip_count: number;
  failed_count: number;
  total_reward_amount_base: string;
  status: string;
};

export function formatSqlDateTime(value: Date): string {
  return value.toISOString().slice(0, 19).replace("T", " ");
}

function normalizeSqlDateTimeValue(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return formatSqlDateTime(value);
  }
  return value;
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

function createEmptyDailyRewardSummary(calc_run_id: string, status = "RUNNING"): DailyRewardRunSummary {
  return {
    calc_run_id,
    target_count: 0,
    created_count: 0,
    zero_reward_skip_count: 0,
    duplicate_skip_count: 0,
    failed_count: 0,
    total_reward_amount_base: "0",
    status
  };
}

function toApiDateTime(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function toApiDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

export function assertRewardDateString(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("reward_date must be YYYY-MM-DD", { reward_date: value });
  }
}

export function calculateDailyRewardAmountBase(principal_amount_base: string, daily_interest_bps_snapshot: string): string {
  assertIntString("principal_amount_base", principal_amount_base);
  assertIntString("daily_interest_bps_snapshot", daily_interest_bps_snapshot);

  const principal = BigInt(principal_amount_base);
  const bps = BigInt(daily_interest_bps_snapshot);

  if (principal < 0n) {
    throw validationError("principal_amount_base must be non-negative", { principal_amount_base });
  }
  if (bps < 0n) {
    throw validationError("daily_interest_bps_snapshot must be non-negative", { daily_interest_bps_snapshot });
  }

  return ((principal * bps) / BPS_DENOMINATOR).toString();
}

export function getRewardDateWindowUtc(reward_date: string): {
  start: Date;
  end: Date;
  startSql: string;
  endSql: string;
} {
  assertRewardDateString(reward_date);
  const [yearText, monthText, dayText] = reward_date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const start = new Date(Date.UTC(year, month - 1, day, -ASIA_SEOUL_OFFSET_HOURS, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    start,
    end,
    startSql: formatSqlDateTime(start),
    endSql: formatSqlDateTime(end)
  };
}

export function isDailyRewardEligibleByTimestamps(input: {
  status: string;
  started_at: Date | string | null;
  matures_at: Date | string | null;
  cancelled_at: Date | string | null;
  closed_at: Date | string | null;
  reward_day_start: string;
  reward_day_end: string;
}): boolean {
  const startedAt = normalizeSqlDateTimeValue(input.started_at);
  const maturesAt = normalizeSqlDateTimeValue(input.matures_at);
  const cancelledAt = normalizeSqlDateTimeValue(input.cancelled_at);
  const closedAt = normalizeSqlDateTimeValue(input.closed_at);

  if (input.status !== "ACTIVE" && input.status !== "CANCEL_REQUESTED") {
    return false;
  }
  if (!startedAt || !maturesAt) {
    return false;
  }
  if (!(startedAt < input.reward_day_end)) {
    return false;
  }
  if (!(maturesAt > input.reward_day_start)) {
    return false;
  }
  if (cancelledAt && cancelledAt <= input.reward_day_start) {
    return false;
  }
  if (closedAt && closedAt <= input.reward_day_start) {
    return false;
  }
  return true;
}

type RunRewardInsertResult =
  | { type: "created"; amount_base: string }
  | { type: "duplicate" }
  | { type: "zero" };

export class DailyRewardService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async processEligibleStaking(input: {
    actor_account_id: string;
    calc_run_id: string;
    reward_date: string;
    reward_created_at: Date;
    staking: DailyRewardEligibleStakingRow;
  }): Promise<RunRewardInsertResult> {
    const rewardWindow = getRewardDateWindowUtc(input.reward_date);
    if (
      !isDailyRewardEligibleByTimestamps({
        status: input.staking.status,
        started_at: input.staking.started_at,
        matures_at: input.staking.matures_at,
        cancelled_at: input.staking.cancelled_at,
        closed_at: input.staking.closed_at,
        reward_day_start: rewardWindow.startSql,
        reward_day_end: rewardWindow.endSql
      })
    ) {
      return { type: "duplicate" };
    }

    const amount_base = calculateDailyRewardAmountBase(
      input.staking.principal_amount_base,
      input.staking.daily_interest_bps_snapshot
    );
    if (amount_base === "0") {
      return { type: "zero" };
    }

    const source_reference = `reward.daily:${input.staking.id}:${input.reward_date}`;

    return withTx(this.pool, async (conn) => {
      const existing = await getRewardBySourceReference(conn, {
        reward_type: "DAILY_REWARD",
        source_reference
      });
      if (existing) {
        return { type: "duplicate" } as const;
      }

      const reward_id = newId();
      const ledger_event_id = newId();

      await insertAccountReward(conn, {
        id: reward_id,
        account_id: input.staking.account_id,
        account_staking_id: input.staking.id,
        policy_version_id: input.staking.policy_version_id,
        calc_run_id: input.calc_run_id,
        reward_type: "DAILY_REWARD",
        reward_date: input.reward_date,
        amount_base,
        status: "CONFIRMED",
        source_reference,
        confirmed_at: input.reward_created_at,
        available_at: input.reward_created_at,
        metadata_json: {
          principal_amount_base: input.staking.principal_amount_base,
          daily_interest_bps_snapshot: input.staking.daily_interest_bps_snapshot,
          duration_days_snapshot: input.staking.duration_days_snapshot,
          denominator: BPS_DENOMINATOR.toString()
        },
        created_at: input.reward_created_at,
        updated_at: input.reward_created_at
      });

      await insertLedgerEvent(conn, {
        id: ledger_event_id,
        account_id: input.staking.account_id,
        product_id: input.staking.staking_product_id,
        policy_version_id: input.staking.policy_version_id,
        calc_run_id: input.calc_run_id,
        event_time: input.reward_created_at.toISOString(),
        event_type: "DAILY_REWARD_ACCRUAL",
        amount_base,
        decimals: input.staking.product_decimals,
        symbol: input.staking.product_symbol,
        reference_id: source_reference,
        meta: {
          reward_id,
          staking_id: input.staking.id,
          calc_run_id: input.calc_run_id,
          reward_date: input.reward_date
        },
        created_by: input.actor_account_id
      });

      await updateRewardSourceLedgerEvent(conn, {
        id: reward_id,
        source_ledger_event_id: ledger_event_id,
        updated_at: input.reward_created_at
      });

      return { type: "created", amount_base } as const;
    });
  }

  async runDailyReward(input: {
    actor_account_id: string;
    policy_version_id: string;
    reward_date: string;
  }): Promise<{
    calc_run: {
      id: string;
      policy_version_id: string;
      run_type: string;
      run_date: string;
      status: string;
      started_at: string | null;
      finished_at: string | null;
      finalized_at: string | null;
      error_message: string | null;
      created_at?: string;
    };
    target_count: number;
    created_count: number;
    zero_reward_skip_count: number;
    duplicate_skip_count: number;
    failed_count: number;
    total_reward_amount_base: string;
  }> {
    assertRewardDateString(input.reward_date);

    const run_date_window = getRewardDateWindowUtc(input.reward_date);
    const now = new Date();
    let calc_run_id = "";

    await this.withConnection(async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const policy = await getPolicyVersionById(conn, input.policy_version_id);
      if (!policy) {
        throw notFound("policy_version not found", { policy_version_id: input.policy_version_id });
      }
    });

    const running = await withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const existing = await getCalcRunByPolicyRunTypeDate(conn, {
        policy_version_id: input.policy_version_id,
        run_type: "DAILY_REWARD",
        run_date: input.reward_date
      });

      if (existing) {
        if (existing.status === "SUCCEEDED" || existing.status === "FINALIZED") {
          throw conflictError("daily reward calc_run already completed", {
            calc_run_id: existing.id,
            status: existing.status
          });
        }
        if (existing.status === "PENDING" || existing.status === "RUNNING") {
          throw conflictError("daily reward calc_run is already in progress", {
            calc_run_id: existing.id,
            status: existing.status
          });
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

        calc_run_id = existing.id;
        return existing.id;
      }

      const new_calc_run_id = newId();
      await insertCalcRun(conn, {
        id: new_calc_run_id,
        policy_version_id: input.policy_version_id,
        run_type: "DAILY_REWARD",
        run_date: input.reward_date,
        status: "PENDING",
        created_by: actor.id
      });
      await updateCalcRunStatus(conn, {
        id: new_calc_run_id,
        status: "RUNNING",
        started_at: formatSqlDateTime(now),
        error_message: null
      });
      calc_run_id = new_calc_run_id;
      return new_calc_run_id;
    });

    let target_count = 0;
    let created_count = 0;
    let zero_reward_skip_count = 0;
    let duplicate_skip_count = 0;
    let failed_count = 0;
    let total_reward_amount_base = 0n;
    let first_error_message: string | null = null;

    try {
      for (let offset = 0; ; offset += DEFAULT_BATCH_CHUNK_SIZE) {
        const stakings = await this.withConnection((conn) =>
          listDailyRewardEligibleStakings(conn, {
            policy_version_id: input.policy_version_id,
            reward_day_start: run_date_window.startSql,
            reward_day_end: run_date_window.endSql,
            limit: DEFAULT_BATCH_CHUNK_SIZE,
            offset
          })
        );

        if (!stakings.length) {
          break;
        }

        target_count += stakings.length;

        for (const staking of stakings) {
          try {
            const result = await this.processEligibleStaking({
              actor_account_id: input.actor_account_id,
              calc_run_id: running,
              reward_date: input.reward_date,
              reward_created_at: now,
              staking
            });

            if (result.type === "created") {
              created_count += 1;
              total_reward_amount_base += BigInt(result.amount_base);
            } else if (result.type === "zero") {
              zero_reward_skip_count += 1;
            } else {
              duplicate_skip_count += 1;
            }
          } catch (error) {
            failed_count += 1;
            if (!first_error_message) {
              first_error_message =
                error instanceof Error ? error.message : "daily reward batch failed for one or more staking rows";
            }
          }
        }
      }

      const finished_at = new Date();
      await withTx(this.pool, async (conn) => {
        const actor = await requireActor(conn, input.actor_account_id);
        assertRoleAtLeast(actor, "ADMIN");

        await updateCalcRunStatus(conn, {
          id: running,
          status: failed_count > 0 ? "FAILED" : "SUCCEEDED",
          finished_at: formatSqlDateTime(finished_at),
          error_message: failed_count > 0 ? first_error_message ?? "daily reward batch failed" : null
        });

        await insertAdminAuditLog(conn, {
          actor_account_id: actor.id,
          action: "ADMIN_DAILY_REWARD_RUN",
          target_table: "calc_runs",
          target_id: running,
          meta: {
            calc_run_id: running,
            reward_date: input.reward_date,
            policy_version_id: input.policy_version_id,
            target_count,
            created_count,
            zero_reward_skip_count,
            duplicate_skip_count,
            failed_count,
            total_reward_amount_base: total_reward_amount_base.toString()
          }
        });
      });
    } catch (error) {
      const finished_at = new Date();
      if (calc_run_id) {
        await withTx(this.pool, async (conn) => {
          const actor = await requireActor(conn, input.actor_account_id);
          assertRoleAtLeast(actor, "ADMIN");
          await updateCalcRunStatus(conn, {
            id: calc_run_id,
            status: "FAILED",
            finished_at: formatSqlDateTime(finished_at),
            error_message: error instanceof Error ? error.message : "daily reward batch failed"
          });
        });
      }
      throw error;
    }

    const calc_run = await this.withConnection(async (conn) => {
      const row = await getCalcRunById(conn, running);
      if (!row) {
        throw notFound("calc_run not found after daily reward run", { calc_run_id: running });
      }
      return row;
    });

    return {
      calc_run: {
        id: calc_run.id,
        policy_version_id: calc_run.policy_version_id,
        run_type: calc_run.run_type,
        run_date: toApiDateOnly(calc_run.run_date),
        status: calc_run.status,
        started_at: toApiDateTime(calc_run.started_at),
        finished_at: toApiDateTime(calc_run.finished_at),
        finalized_at: toApiDateTime(calc_run.finalized_at),
        error_message: calc_run.error_message ?? null,
        created_at: toApiDateTime(calc_run.created_at) ?? undefined
      },
      target_count,
      created_count,
      zero_reward_skip_count,
      duplicate_skip_count,
      failed_count,
      total_reward_amount_base: total_reward_amount_base.toString()
    };
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
      if (calcRun.run_type !== "DAILY_REWARD") {
        throw validationError("calc_run is not a daily reward run", {
          calc_run_id: input.calc_run_id,
          run_type: calcRun.run_type
        });
      }

      const audit = await listAdminAuditLogs(conn, {
        action: "ADMIN_DAILY_REWARD_RUN",
        target_table: "calc_runs",
        target_id: input.calc_run_id,
        page: 1,
        limit: 20
      });

      return extractDailyRewardSummaryFromAuditLogs(audit.items, input.calc_run_id) ?? createEmptyDailyRewardSummary(input.calc_run_id, calcRun.status);
    });
  }
}

export function extractDailyRewardSummaryFromAuditLogs(
  auditLogs: AdminAuditLogRow[],
  calc_run_id: string
): DailyRewardRunSummary | null {
  for (const row of auditLogs) {
    const meta = toJsonObject(row.meta);
    const target_count = toNumberMetric(meta.target_count);
    const created_count = toNumberMetric(meta.created_count);
    const zero_reward_skip_count = toNumberMetric(meta.zero_reward_skip_count);
    const duplicate_skip_count = toNumberMetric(meta.duplicate_skip_count);
    const failed_count = toNumberMetric(meta.failed_count);
    const total_reward_amount_base = toStringMetric(meta.total_reward_amount_base);
    if (
      target_count !== null &&
      created_count !== null &&
      zero_reward_skip_count !== null &&
      duplicate_skip_count !== null &&
      failed_count !== null &&
      total_reward_amount_base !== null
    ) {
      return {
        calc_run_id,
        target_count,
        created_count,
        zero_reward_skip_count,
        duplicate_skip_count,
        failed_count,
        total_reward_amount_base,
        status: toStringMetric(meta.status) ?? "SUCCEEDED"
      };
    }
  }

  return null;
}
