import "dotenv/config";

import { randomUUID } from "node:crypto";

import { pool } from "../src/db/pool.js";
import { withTx } from "../src/db/tx.js";
import { hashPassword } from "../src/util/passwordHash.js";
import { resolveSmokeBaseUrl } from "./smoke_config.js";

type Result = {
  name: string;
  ok: boolean;
  message?: string;
};

type ApiFailure = {
  status: number;
  message: string;
  details: unknown;
};

type Fixture = {
  suffix: string;
  adminId: string;
  readerId: string;
  rootUserId: string;
  zeroBaseUserId: string;
  leftUserId: string;
  rightUserId: string;
  policyId: string;
  productId: string;
  leftStakeId: string;
  rightStakeId: string;
  qualificationRunId: string;
  qualificationRootResultId: string;
  qualificationZeroResultId: string;
  dailyRewardId: string;
  reversedDailyRewardId: string;
  reversalRewardId: string;
  rootLoginId: string;
  password: string;
  calculationDate: string;
};

type RankBonusRunResponse = {
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

type RankBonusSingleResponse = {
  calc_run_id: string;
  status: string;
  result_type: string;
  reward_id: string | null;
  existing_reward_id: string | null;
  base_daily_reward_amount_base: string;
  rank_bonus_amount_base: string;
};

type RewardListItem = {
  id: string;
  account_id: string;
  reward_type: string;
  reward_date: string;
  amount_base: string;
  status: string;
  account_staking_id: string | null;
  source_account_id?: string | null;
  source_account_staking_id?: string | null;
  source_reference: string;
  source_ledger_event_id: string | null;
  metadata?: Record<string, unknown>;
  calc_run?: {
    id: string;
    run_type: string | null;
    run_date: string | null;
    status: string | null;
  } | null;
  account?: {
    id: string;
    login_id: string | null;
    display_name: string | null;
  };
};

type RewardDetail = RewardListItem & {
  metadata?: Record<string, unknown>;
};

type WithdrawalBalanceResponse = {
  bonus: {
    confirmed_amount_base: string;
    reserved_amount_base: string;
    completed_amount_base: string;
    available_amount_base: string;
  };
};

function containsSensitiveKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveKey(item, key));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return true;
    }
    return Object.values(obj).some((item) => containsSensitiveKey(item, key));
  }
  return false;
}

async function requestJson<T>(
  path: string,
  init: RequestInit & { actorId?: string; accessToken?: string } = {}
): Promise<{ status: number; payload: T }> {
  const baseUrl = resolveSmokeBaseUrl(process.env);
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init.actorId) {
    headers.set("x-actor-account-id", init.actorId);
  }
  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload && "error" in payload ? (payload as any).error : null;
    throw {
      status: response.status,
      message: errorPayload?.message ?? response.statusText,
      details: errorPayload?.details ?? null,
    } satisfies ApiFailure;
  }

  return {
    status: response.status,
    payload: payload as T,
  };
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const fixture: Fixture = {
    suffix,
    adminId: randomUUID(),
    readerId: randomUUID(),
    rootUserId: randomUUID(),
    zeroBaseUserId: randomUUID(),
    leftUserId: randomUUID(),
    rightUserId: randomUUID(),
    policyId: randomUUID(),
    productId: randomUUID(),
    leftStakeId: randomUUID(),
    rightStakeId: randomUUID(),
    qualificationRunId: randomUUID(),
    qualificationRootResultId: randomUUID(),
    qualificationZeroResultId: randomUUID(),
    dailyRewardId: randomUUID(),
    reversedDailyRewardId: randomUUID(),
    reversalRewardId: randomUUID(),
    rootLoginId: `smoke_rank_bonus_root_${suffix}`,
    password: "SmokeRankBonus!123",
    calculationDate: "2026-07-10",
  };

  const createdAt = new Date("2026-07-09T00:00:00.000Z");
  const adminPasswordHash = await hashPassword("AdminRankBonus!123");
  const readerPasswordHash = await hashPassword("ReaderRankBonus!123");
  const userPasswordHash = await hashPassword(fixture.password);

  await withTx(pool, async (conn) => {
    const [activePolicyRows] = await conn.query(`select count(*) as total from policy_versions where status = 'ACTIVE'`);
    const hasActivePolicy = Number((activePolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0;
    const policyStatus = hasActivePolicy ? "DRAFT" : "ACTIVE";

    await conn.query(
      `insert into accounts (
          id, login_id, password_hash, display_name, role, status, referral_code, sponsor_account_id, joined_at, updated_at
        ) values
        (?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'READER', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, null, ?, ?)`,
      [
        fixture.adminId,
        `smoke_rank_bonus_admin_${suffix}`,
        adminPasswordHash,
        `Smoke Rank Bonus Admin ${suffix}`,
        `SRBA${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.readerId,
        `smoke_rank_bonus_reader_${suffix}`,
        readerPasswordHash,
        `Smoke Rank Bonus Reader ${suffix}`,
        `SRBR${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.rootUserId,
        fixture.rootLoginId,
        userPasswordHash,
        `Smoke Rank Bonus Root ${suffix}`,
        `SRBU${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.leftUserId,
        `smoke_rank_bonus_left_${suffix}`,
        userPasswordHash,
        `Smoke Rank Bonus Left ${suffix}`,
        `SRBL${suffix.toUpperCase()}`,
        fixture.rootUserId,
        createdAt,
        createdAt,
        fixture.rightUserId,
        `smoke_rank_bonus_right_${suffix}`,
        userPasswordHash,
        `Smoke Rank Bonus Right ${suffix}`,
        `SRBX${suffix.toUpperCase()}`,
        fixture.rootUserId,
        createdAt,
        createdAt,
        fixture.zeroBaseUserId,
        `smoke_rank_bonus_zero_${suffix}`,
        userPasswordHash,
        `Smoke Rank Bonus Zero ${suffix}`,
        `SRBZ${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
      ]
    );

    await conn.query(`insert into policy_versions (id, status, note, created_by) values (?, ?, ?, ?)`, [
      fixture.policyId,
      policyStatus,
      `rank bonus smoke ${suffix}`,
      fixture.adminId,
    ]);

    await conn.query(
      `insert into rank_rules (
          id, policy_version_id, rank_level, required_lines, required_weak_volume_base, rank_share_bps, effective_bonus_bps, is_active
        ) values
        (?, ?, 1, 1, '100000', '500', '500', 1),
        (?, ?, 2, 2, '500000', '1000', '1000', 1)`,
      [randomUUID(), fixture.policyId, randomUUID(), fixture.policyId]
    );

    await conn.query(
      `insert into staking_products (
          id, policy_version_id, name, symbol, decimals, min_stake_amount_base, max_stake_amount_base, staking_days, daily_interest_bps, is_active
        ) values (?, ?, ?, 'USDC', 6, '1', '999999999', 30, '50', 1)`,
      [fixture.productId, fixture.policyId, `Smoke Rank Bonus Product ${suffix}`]
    );

    await conn.query(
      `insert into binary_nodes (account_id, parent_account_id, position, root_account_id, updated_at) values
        (?, null, null, ?, ?),
        (?, ?, 'LEFT', ?, ?),
        (?, ?, 'RIGHT', ?, ?),
        (?, null, null, ?, ?)`,
      [
        fixture.rootUserId,
        fixture.rootUserId,
        createdAt,
        fixture.leftUserId,
        fixture.rootUserId,
        fixture.rootUserId,
        createdAt,
        fixture.rightUserId,
        fixture.rootUserId,
        fixture.rootUserId,
        createdAt,
        fixture.zeroBaseUserId,
        fixture.zeroBaseUserId,
        createdAt,
      ]
    );

    await conn.query(
      `insert into binary_edges (ancestor_account_id, descendant_account_id, depth, root_leg, path) values
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 1, 'LEFT', ?),
        (?, ?, 1, 'RIGHT', ?)`,
      [
        fixture.rootUserId,
        fixture.rootUserId,
        `/${fixture.rootUserId}/`,
        fixture.leftUserId,
        fixture.leftUserId,
        `/${fixture.leftUserId}/`,
        fixture.rightUserId,
        fixture.rightUserId,
        `/${fixture.rightUserId}/`,
        fixture.zeroBaseUserId,
        fixture.zeroBaseUserId,
        `/${fixture.zeroBaseUserId}/`,
        fixture.rootUserId,
        fixture.leftUserId,
        `/${fixture.rootUserId}/${fixture.leftUserId}/`,
        fixture.rootUserId,
        fixture.rightUserId,
        `/${fixture.rootUserId}/${fixture.rightUserId}/`,
      ]
    );

    await conn.query(
      `insert into account_stakings (
          id,
          account_id,
          staking_product_id,
          policy_version_id,
          principal_amount_base,
          daily_interest_bps_snapshot,
          duration_days_snapshot,
          status,
          idempotency_key,
          started_at,
          matures_at,
          activated_at,
          created_at,
          updated_at
        ) values
        (?, ?, ?, ?, '1000000', '50', 30, 'ACTIVE', ?, '2026-07-09 00:00:00.000000', '2026-08-08 00:00:00.000000', '2026-07-09 00:00:00.000000', ?, ?),
        (?, ?, ?, ?, '100000', '50', 30, 'ACTIVE', ?, '2026-07-09 00:00:00.000000', '2026-08-08 00:00:00.000000', '2026-07-09 00:00:00.000000', ?, ?)`,
      [
        fixture.leftStakeId,
        fixture.leftUserId,
        fixture.productId,
        fixture.policyId,
        `rank-bonus-left-stake-${suffix}`,
        createdAt,
        createdAt,
        fixture.rightStakeId,
        fixture.rightUserId,
        fixture.productId,
        fixture.policyId,
        `rank-bonus-right-stake-${suffix}`,
        createdAt,
        createdAt,
      ]
    );

    await conn.query(
      `insert into calc_runs (
          id, policy_version_id, run_type, run_date, status, started_at, finished_at, created_by, created_at
        ) values (?, ?, 'RANK_QUALIFICATION', ?, 'SUCCEEDED', ?, ?, ?, ?)`,
      [
        fixture.qualificationRunId,
        fixture.policyId,
        fixture.calculationDate,
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:01.000000",
        fixture.adminId,
        "2026-07-10 00:00:00.000000",
      ]
    );

    await conn.query(
      `insert into account_rank_status (
          account_id,
          policy_version_id,
          current_rank_level,
          qualified_at,
          maintained_until,
          last_qualification_calc_run_id,
          last_change_type
        ) values
        (?, ?, 2, ?, null, ?, 'PROMOTED'),
        (?, ?, 1, ?, null, ?, 'INITIAL')`,
      [
        fixture.rootUserId,
        fixture.policyId,
        `${fixture.calculationDate} 00:00:00.000000`,
        fixture.qualificationRunId,
        fixture.zeroBaseUserId,
        fixture.policyId,
        `${fixture.calculationDate} 00:00:00.000000`,
        fixture.qualificationRunId,
      ]
    );

    await conn.query(
      `insert into account_rank_qualification_results (
          id,
          calc_run_id,
          account_id,
          policy_version_id,
          calculation_date,
          period_from,
          period_to,
          previous_rank_level,
          qualified_rank_level,
          applied_rank_level,
          result_status,
          personal_active_stake_amount_base,
          personal_cumulative_stake_amount_base,
          direct_referral_count,
          direct_active_referral_count,
          left_leg_volume_base,
          right_leg_volume_base,
          weak_leg_volume_base,
          strong_leg_volume_base,
          downline_daily_reward_amount_base,
          qualification_snapshot_json
        ) values
        (?, ?, ?, ?, ?, ?, ?, 1, 2, 2, 'QUALIFIED', '1000000', '1000000', 2, 2, '1000000', '100000', '100000', '1000000', '900000', cast(? as json)),
        (?, ?, ?, ?, ?, ?, ?, null, 1, 1, 'QUALIFIED', '100000', '100000', 0, 0, '0', '0', '0', '0', '0', cast(? as json))`,
      [
        fixture.qualificationRootResultId,
        fixture.qualificationRunId,
        fixture.rootUserId,
        fixture.policyId,
        fixture.calculationDate,
        fixture.calculationDate,
        fixture.calculationDate,
        JSON.stringify({ formula_version: "rank_bonus_smoke_v1" }),
        fixture.qualificationZeroResultId,
        fixture.qualificationRunId,
        fixture.zeroBaseUserId,
        fixture.policyId,
        fixture.calculationDate,
        fixture.calculationDate,
        fixture.calculationDate,
        JSON.stringify({ formula_version: "rank_bonus_smoke_v1" }),
      ]
    );

    await conn.query(
      `insert into account_rewards (
          id,
          account_id,
          account_staking_id,
          source_account_id,
          source_account_staking_id,
          policy_version_id,
          calc_run_id,
          reward_type,
          reward_date,
          amount_base,
          status,
          source_reference,
          source_ledger_event_id,
          reversal_reward_id,
          available_at,
          confirmed_at,
          reversed_at,
          metadata_json,
          created_at,
          updated_at
        ) values
        (?, ?, ?, null, null, ?, null, 'DAILY_REWARD', ?, '1000000', 'CONFIRMED', ?, null, null, ?, ?, null, cast(? as json), ?, ?),
        (?, ?, ?, null, null, ?, null, 'DAILY_REWARD', ?, '100000', 'REVERSED', ?, null, null, ?, ?, ?, cast(? as json), ?, ?),
        (?, ?, null, null, null, ?, null, 'REVERSAL', ?, '-100000', 'CONFIRMED', ?, null, ?, ?, ?, null, cast(? as json), ?, ?)`,
      [
        fixture.dailyRewardId,
        fixture.leftUserId,
        fixture.leftStakeId,
        fixture.policyId,
        fixture.calculationDate,
        `smoke-rank-bonus-daily-left:${suffix}`,
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
        JSON.stringify({ reward_type: "DAILY_REWARD" }),
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
        fixture.reversedDailyRewardId,
        fixture.rightUserId,
        fixture.rightStakeId,
        fixture.policyId,
        fixture.calculationDate,
        `smoke-rank-bonus-daily-right:${suffix}`,
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
        JSON.stringify({ reward_type: "DAILY_REWARD" }),
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
        fixture.reversalRewardId,
        fixture.rightUserId,
        fixture.policyId,
        fixture.calculationDate,
        `smoke-rank-bonus-reversal:${suffix}`,
        fixture.reversedDailyRewardId,
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
        JSON.stringify({ reward_type: "REVERSAL", original_reward_id: fixture.reversedDailyRewardId }),
        "2026-07-10 00:00:00.000000",
        "2026-07-10 00:00:00.000000",
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<{ remaining: Record<string, number> }> {
  return withTx(pool, async (conn) => {
    const accountIds = [fixture.adminId, fixture.readerId, fixture.rootUserId, fixture.zeroBaseUserId, fixture.leftUserId, fixture.rightUserId];
    const calcRunIds = [fixture.qualificationRunId];
    const originalRewardIds = [fixture.reversedDailyRewardId, fixture.dailyRewardId];
    const stakingIds = [fixture.leftStakeId, fixture.rightStakeId];

    const [bonusRewardRows] = await conn.query(
      `select id, source_ledger_event_id
         from account_rewards
        where calc_run_id in (
          select id from calc_runs where policy_version_id = ? and run_type = 'RANK_BONUS'
        )`,
      [fixture.policyId]
    );
    const bonusRewardIds = (bonusRewardRows as Array<{ id: string; source_ledger_event_id: string | null }>).map((row) => row.id);
    const bonusLedgerIds = (bonusRewardRows as Array<{ id: string; source_ledger_event_id: string | null }>)
      .map((row) => row.source_ledger_event_id)
      .filter((value): value is string => Boolean(value));

    const [bonusCalcRunRows] = await conn.query(
      `select id from calc_runs where policy_version_id = ? and run_type = 'RANK_BONUS'`,
      [fixture.policyId]
    );
    const bonusCalcRunIds = (bonusCalcRunRows as Array<{ id: string }>).map((row) => row.id);
    const allCalcRunIds = [...calcRunIds, ...bonusCalcRunIds];

    if (bonusRewardIds.length) {
      await conn.query(`delete from account_rewards where id in (${bonusRewardIds.map(() => "?").join(", ")})`, bonusRewardIds);
    }
    await conn.query(`delete from account_rewards where id = ?`, [fixture.reversalRewardId]);
    await conn.query(`delete from account_rewards where id in (${originalRewardIds.map(() => "?").join(", ")})`, originalRewardIds);

    if (bonusLedgerIds.length) {
      await conn.query(`delete from ledger_events where id in (${bonusLedgerIds.map(() => "?").join(", ")})`, bonusLedgerIds);
    }
    if (allCalcRunIds.length) {
      await conn.query(`delete from ledger_events where calc_run_id in (${allCalcRunIds.map(() => "?").join(", ")})`, allCalcRunIds);
    }

    await conn.query(`delete from account_rank_history where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from account_rank_qualification_results where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from account_rank_status where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from admin_audit_log where actor_account_id in (${accountIds.map(() => "?").join(", ")})`, accountIds);
    await conn.query(`delete from auth_sessions where account_id in (${accountIds.map(() => "?").join(", ")})`, accountIds);
    if (allCalcRunIds.length) {
      await conn.query(`delete from calc_runs where id in (${allCalcRunIds.map(() => "?").join(", ")})`, allCalcRunIds);
    }
    await conn.query(`delete from account_stakings where id in (${stakingIds.map(() => "?").join(", ")})`, stakingIds);
    await conn.query(
      `delete from binary_edges where ancestor_account_id in (${accountIds.map(() => "?").join(", ")}) or descendant_account_id in (${accountIds
        .map(() => "?")
        .join(", ")})`,
      [...accountIds, ...accountIds]
    );
    await conn.query(`delete from binary_nodes where account_id in (${accountIds.map(() => "?").join(", ")})`, accountIds);
    await conn.query(`delete from rank_rules where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from staking_products where id = ?`, [fixture.productId]);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(
      `update accounts
          set sponsor_account_id = null
        where id in (${accountIds.map(() => "?").join(", ")})`,
      accountIds
    );
    await conn.query(
      `delete from accounts
        where id in (${accountIds.map(() => "?").join(", ")})
        order by case
          when id = ? then 1
          when id = ? then 2
          else 0
        end asc`,
      [...accountIds, fixture.rootUserId, fixture.zeroBaseUserId]
    );

    const [remainingRewardRows] = await conn.query(
      `select count(*) as total
         from account_rewards
        where id in (${[fixture.reversalRewardId, ...originalRewardIds, ...bonusRewardIds].map(() => "?").join(", ")})`,
      [fixture.reversalRewardId, ...originalRewardIds, ...bonusRewardIds]
    );
    const [remainingLedgerRows] = await conn.query(
      `select count(*) as total
         from ledger_events
        where policy_version_id = ? and calc_run_id in (${allCalcRunIds.length ? allCalcRunIds.map(() => "?").join(", ") : "?"})`,
      allCalcRunIds.length ? [fixture.policyId, ...allCalcRunIds] : [fixture.policyId, "__none__"]
    );
    const [remainingCalcRunRows] = await conn.query(`select count(*) as total from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    const [remainingRuleRows] = await conn.query(`select count(*) as total from rank_rules where policy_version_id = ?`, [fixture.policyId]);
    const [remainingAccountRows] = await conn.query(
      `select count(*) as total from accounts where id in (${accountIds.map(() => "?").join(", ")})`,
      accountIds
    );
    const [remainingStakingRows] = await conn.query(
      `select count(*) as total from account_stakings where id in (${stakingIds.map(() => "?").join(", ")})`,
      stakingIds
    );
    const [remainingSessionRows] = await conn.query(
      `select count(*) as total from auth_sessions where account_id in (${accountIds.map(() => "?").join(", ")})`,
      accountIds
    );

    return {
      remaining: {
        fixture_rewards: Number((remainingRewardRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_ledger_events: Number((remainingLedgerRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_calc_runs: Number((remainingCalcRunRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_stakings: Number((remainingStakingRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_rules: Number((remainingRuleRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_accounts: Number((remainingAccountRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_sessions: Number((remainingSessionRows as Array<{ total: number | string }>)[0]?.total ?? 0),
      },
    };
  });
}

async function main() {
  const results: Result[] = [];
  const fixture = await createFixture();
  let rootToken = "";
  let bonusCalcRunId = "";
  let createdRewardId = "";
  let createdLedgerId = "";
  let currentStep = "fixture created";

  try {
    currentStep = "health";
    await requestJson<{ ok: true }>("/health");
    results.push({ name: "health 확인", ok: true });

    currentStep = "root login";
    const login = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: fixture.rootLoginId,
        password: fixture.password,
      }),
    });
    rootToken = login.payload.access_token;
    results.push({ name: "USER 로그인 성공", ok: login.payload.account.id === fixture.rootUserId });

    currentStep = "reader forbidden";
    try {
      await requestJson("/api/admin/rewards/rank-bonus/run", {
        method: "POST",
        actorId: fixture.readerId,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          calculation_date: fixture.calculationDate,
        }),
      });
      results.push({ name: "READER rank bonus 실행 차단", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "READER rank bonus 실행 차단", ok: apiError.status === 403, message: apiError.message });
    }

    currentStep = "batch run";
    const run = await requestJson<RankBonusRunResponse>("/api/admin/rewards/rank-bonus/run", {
      method: "POST",
      actorId: fixture.adminId,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.calculationDate,
      }),
    });
    bonusCalcRunId = run.payload.calc_run_id;
    results.push({
      name: "ADMIN batch rank bonus 실행",
      ok:
        run.payload.status === "SUCCEEDED" &&
        run.payload.target_count === 2 &&
        run.payload.created_count === 1 &&
        run.payload.zero_base_skip_count === 1 &&
        run.payload.failed_count === 0 &&
        run.payload.total_base_daily_reward_amount_base === "900000" &&
        run.payload.total_rank_bonus_amount_base === "90000",
      message: JSON.stringify(run.payload),
    });

    currentStep = "summary";
    const summary = await requestJson<RankBonusRunResponse>(`/api/admin/calc-runs/${bonusCalcRunId}/summary`, {
      actorId: fixture.adminId,
    });
    results.push({
      name: "rank bonus summary 조회",
      ok:
        summary.payload.calc_run_id === bonusCalcRunId &&
        summary.payload.created_count === 1 &&
        summary.payload.zero_base_skip_count === 1 &&
        summary.payload.total_rank_bonus_amount_base === "90000",
    });

    const [rewardRows] = await pool.query(
      `select id, source_ledger_event_id, amount_base, source_reference, account_staking_id, source_account_id, source_account_staking_id
         from account_rewards
        where calc_run_id = ? and reward_type = 'RANK_BONUS'`,
      [bonusCalcRunId]
    );
    const createdReward = (rewardRows as Array<Record<string, unknown>>)[0] ?? null;
    createdRewardId = String(createdReward?.id ?? "");
    createdLedgerId = String(createdReward?.source_ledger_event_id ?? "");
    results.push({
      name: "account_rewards RANK_BONUS 생성",
      ok:
        createdReward !== null &&
        String(createdReward.amount_base ?? "") === "90000" &&
        createdReward.account_staking_id === null &&
        createdReward.source_account_id === null &&
        createdReward.source_account_staking_id === null &&
        String(createdReward.source_reference ?? "").startsWith(`rank_bonus:${fixture.calculationDate}:${fixture.rootUserId}:2`),
      message: JSON.stringify(createdReward),
    });

    const [ledgerRows] = await pool.query(
      `select id, event_type, product_id, reference_id, amount_base
         from ledger_events
        where calc_run_id = ? and event_type = 'RANK_BONUS'`,
      [bonusCalcRunId]
    );
    const createdLedger = (ledgerRows as Array<Record<string, unknown>>)[0] ?? null;
    results.push({
      name: "ledger event RANK_BONUS / product_id null",
      ok:
        createdLedger !== null &&
        String(createdLedger.amount_base ?? "") === "90000" &&
        createdLedger.product_id === null &&
        String(createdLedger.reference_id ?? "").startsWith(`rank_bonus:${fixture.calculationDate}:${fixture.rootUserId}:2`),
      message: JSON.stringify(createdLedger),
    });

    currentStep = "duplicate batch";
    const duplicateBatch = await requestJson<RankBonusRunResponse>("/api/admin/rewards/rank-bonus/run", {
      method: "POST",
      actorId: fixture.adminId,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.calculationDate,
      }),
    });
    results.push({
      name: "동일 날짜 batch duplicate 재사용",
      ok:
        duplicateBatch.payload.calc_run_id === bonusCalcRunId &&
        duplicateBatch.payload.created_count === 1 &&
        duplicateBatch.payload.duplicate_skip_count === 0,
    });

    currentStep = "single duplicate";
    const singleDuplicate = await requestJson<RankBonusSingleResponse>(`/api/admin/accounts/${fixture.rootUserId}/rank-bonus`, {
      method: "POST",
      actorId: fixture.adminId,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.calculationDate,
      }),
    });
    let singleDuplicateDebug = "";
    if (singleDuplicate.payload.result_type !== "duplicate" && createdRewardId) {
      const [existingRewardRows] = await pool.query(
        `select
            id,
            account_id,
            policy_version_id,
            reward_type,
            reward_date,
            amount_base,
            account_staking_id,
            source_account_id,
            source_account_staking_id,
            metadata_json
           from account_rewards
          where id = ?`,
        [createdRewardId]
      );
      const [qualificationRows] = await pool.query(
        `select id, applied_rank_level, calc_run_id
           from account_rank_qualification_results
          where account_id = ?
            and policy_version_id = ?
            and calculation_date = ?
          order by created_at desc, id desc
          limit 1`,
        [fixture.rootUserId, fixture.policyId, fixture.calculationDate]
      );
      singleDuplicateDebug = JSON.stringify({
        single: singleDuplicate.payload,
        existing_reward: (existingRewardRows as Array<Record<string, unknown>>)[0] ?? null,
        qualification: (qualificationRows as Array<Record<string, unknown>>)[0] ?? null,
      });
    }
    results.push({
      name: "단건 duplicate 판정",
      ok:
        singleDuplicate.payload.calc_run_id === bonusCalcRunId &&
        singleDuplicate.payload.result_type === "duplicate" &&
        singleDuplicate.payload.existing_reward_id === createdRewardId &&
        singleDuplicate.payload.base_daily_reward_amount_base === "900000" &&
        singleDuplicate.payload.rank_bonus_amount_base === "90000",
      message: singleDuplicateDebug || JSON.stringify(singleDuplicate.payload),
    });

    currentStep = "user rewards";
    const myRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      "/api/me/rewards?reward_type=RANK_BONUS&page=1&limit=20",
      { accessToken: rootToken }
    );
    const myReward = myRewards.payload.items.find((item) => item.id === createdRewardId);
    results.push({
      name: "User rewards 조회",
      ok:
        myRewards.payload.total >= 1 &&
        Boolean(myReward) &&
        typeof myReward?.amount_base === "string" &&
        myReward?.reward_type === "RANK_BONUS",
      message: JSON.stringify(myReward ?? null),
    });

    const myRewardDetail = await requestJson<{ reward: RewardDetail }>(`/api/me/rewards/${createdRewardId}`, {
      accessToken: rootToken,
    });
    results.push({
      name: "User reward 상세 / 민감정보 비포함",
      ok:
        myRewardDetail.payload.reward.id === createdRewardId &&
        myRewardDetail.payload.reward.metadata?.rank_level === 2 &&
        myRewardDetail.payload.reward.metadata?.base_daily_reward_amount_base === "900000" &&
        !containsSensitiveKey(myRewardDetail.payload, "password") &&
        !containsSensitiveKey(myRewardDetail.payload, "token"),
    });

    const mySummary = await requestJson<{
      bonus_reward_amount_base: string;
      confirmed_reward_amount_base: string;
    }>("/api/me/rewards/summary", { accessToken: rootToken });
    results.push({
      name: "Reward summary BONUS bucket 반영",
      ok:
        mySummary.payload.bonus_reward_amount_base === "90000" &&
        mySummary.payload.confirmed_reward_amount_base === "90000",
    });

    const myBalance = await requestJson<WithdrawalBalanceResponse>("/api/me/withdrawal-balance", {
      accessToken: rootToken,
    });
    results.push({
      name: "Withdrawal BONUS 반영",
      ok:
        myBalance.payload.bonus.confirmed_amount_base === "90000" &&
        myBalance.payload.bonus.available_amount_base === "90000",
      message: JSON.stringify(myBalance.payload.bonus),
    });

    const adminRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/admin/accounts/${fixture.rootUserId}/rewards?reward_type=RANK_BONUS&page=1&limit=20`,
      { actorId: fixture.adminId }
    );
    results.push({
      name: "Admin account rewards 조회",
      ok: adminRewards.payload.items.some((item) => item.id === createdRewardId),
    });

    const calcRunRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/admin/calc-runs/${bonusCalcRunId}/rewards?reward_type=RANK_BONUS&page=1&limit=20`,
      { actorId: fixture.adminId }
    );
    results.push({
      name: "calc_run rewards 조회",
      ok:
        calcRunRewards.payload.total >= 1 &&
        calcRunRewards.payload.items.some((item) => item.id === createdRewardId),
    });

    const adminRewardDetail = await requestJson<{ reward: RewardDetail }>(`/api/admin/rewards/${createdRewardId}`, {
      actorId: fixture.adminId,
    });
    results.push({
      name: "Admin reward 상세 metadata / amount string",
      ok:
        typeof adminRewardDetail.payload.reward.amount_base === "string" &&
        adminRewardDetail.payload.reward.metadata?.qualification_result_id === fixture.qualificationRootResultId &&
        adminRewardDetail.payload.reward.metadata?.formula_version === "rank_bonus_v1",
    });

    const [auditRows] = await pool.query(
      `select action
         from admin_audit_log
        where actor_account_id in (?, ?)
        order by created_at asc`,
      [fixture.adminId, fixture.readerId]
    );
    const actions = (auditRows as Array<{ action: string }>).map((row) => row.action);
    results.push({
      name: "audit log 생성",
      ok:
        actions.includes("ADMIN_RANK_BONUS_RUN") &&
        actions.includes("RANK_BONUS_REWARD_DUPLICATE"),
      message: JSON.stringify(actions),
    });

    results.push({
      name: "created reward / ledger ID 확보",
      ok: Boolean(createdRewardId) && Boolean(createdLedgerId),
    });
  } catch (error) {
    const apiError = error as Partial<ApiFailure>;
    const details = typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
    process.stderr.write(
      `rank bonus smoke failed at step=${currentStep}: ${String(apiError.message ?? error)}${
        apiError.status ? ` (status=${apiError.status})` : ""
      } details=${details}\n`
    );
    throw error;
  } finally {
    const cleanup = await cleanupFixture(fixture);
    results.push({
      name: "cleanup 후 fixture row 0",
      ok: Object.values(cleanup.remaining).every((value) => value === 0),
      message: JSON.stringify(cleanup.remaining),
    });

    for (const result of results) {
      process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.message ? ` :: ${result.message}` : ""}\n`);
    }

    if (results.some((result) => !result.ok)) {
      process.exitCode = 1;
    }

    await pool.end();
  }
}

main().catch((error) => {
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
  process.stderr.write(`rank bonus smoke failed: ${message}\n`);
  process.exitCode = 1;
});
