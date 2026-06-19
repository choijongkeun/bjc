import "dotenv/config";

import { randomUUID } from "node:crypto";

import { pool } from "../src/db/pool.js";
import { withTx } from "../src/db/tx.js";
import { hashPassword } from "../src/util/passwordHash.js";

type Result = {
  name: string;
  ok: boolean;
  message?: string;
};

type Fixture = {
  suffix: string;
  adminId: string;
  readerId: string;
  userId: string;
  otherUserId: string;
  policyId: string;
  productId: string;
  activeStakingId: string;
  cancelRequestedStakingId: string;
  zeroRewardStakingId: string;
  futureStartStakingId: string;
  cancelledStakingId: string;
  maturedStakingId: string;
  closedStakingId: string;
  userLoginId: string;
  otherUserLoginId: string;
  password: string;
  rewardDate: string;
};

type ApiFailure = {
  status: number;
  message: string;
  details: unknown;
};

type RewardApiItem = {
  id: string;
  reward_type: string;
  reward_date: string;
  amount_base: string;
  status: string;
  account_staking_id: string | null;
  source_reference: string;
  source_ledger_event_id: string | null;
  reversal_reward_id: string | null;
  available_at: string | null;
  confirmed_at: string | null;
  reversed_at: string | null;
  metadata?: Record<string, unknown>;
};

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

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

function toDateOnly(value: unknown): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

async function http<T>(
  path: string,
  init: RequestInit & { actorId?: string; accessToken?: string } = {}
): Promise<T> {
  const baseUrl = process.env.BJC_SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
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

  return payload as T;
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const fixture: Fixture = {
    suffix,
    adminId: randomUUID(),
    readerId: randomUUID(),
    userId: randomUUID(),
    otherUserId: randomUUID(),
    policyId: randomUUID(),
    productId: randomUUID(),
    activeStakingId: randomUUID(),
    cancelRequestedStakingId: randomUUID(),
    zeroRewardStakingId: randomUUID(),
    futureStartStakingId: randomUUID(),
    cancelledStakingId: randomUUID(),
    maturedStakingId: randomUUID(),
    closedStakingId: randomUUID(),
    userLoginId: `smoke_reward_user_${suffix}`,
    otherUserLoginId: `smoke_reward_other_${suffix}`,
    password: "SmokePass!123",
    rewardDate: "2026-06-19",
  };

  const adminPasswordHash = await hashPassword("AdminRewardPass!123");
  const readerPasswordHash = await hashPassword("ReaderRewardPass!123");
  const userPasswordHash = await hashPassword(fixture.password);
  const otherUserPasswordHash = await hashPassword(fixture.password);
  const createdAt = new Date("2026-06-10T00:00:00.000Z");

  await withTx(pool, async (conn) => {
    await conn.query(
      `insert into accounts (
          id, login_id, password_hash, display_name, role, status, referral_code, joined_at, updated_at
        ) values
        (?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?, ?),
        (?, ?, ?, ?, 'READER', 'ACTIVE', ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?)`,
      [
        fixture.adminId,
        `smoke_reward_admin_${suffix}`,
        adminPasswordHash,
        `Smoke Reward Admin ${suffix}`,
        `SRA${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.readerId,
        `smoke_reward_reader_${suffix}`,
        readerPasswordHash,
        `Smoke Reward Reader ${suffix}`,
        `SRR${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.userId,
        fixture.userLoginId,
        userPasswordHash,
        `Smoke Reward User ${suffix}`,
        `SRU${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.otherUserId,
        fixture.otherUserLoginId,
        otherUserPasswordHash,
        `Smoke Reward Other ${suffix}`,
        `SRO${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
      ]
    );

    await conn.query(`insert into policy_versions (id, status, note, created_by) values (?, 'DRAFT', ?, ?)`, [
      fixture.policyId,
      `reward smoke ${suffix}`,
      fixture.adminId,
    ]);

    await conn.query(
      `insert into staking_products (
          id,
          policy_version_id,
          name,
          symbol,
          decimals,
          min_stake_amount_base,
          max_stake_amount_base,
          staking_days,
          daily_interest_bps,
          is_active
        ) values (?, ?, ?, 'USDC', 6, '1', '999999999', 30, '50', 1)`,
      [fixture.productId, fixture.policyId, `Smoke Reward Product ${suffix}`]
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
          cancel_requested_at,
          cancelled_at,
          matured_at,
          closed_at,
          created_at,
          updated_at
        ) values
        (?, ?, ?, ?, '1000000', '50', 30, 'ACTIVE', ?, '2026-06-18 14:59:59.000000', '2026-06-30 15:00:00.000000', '2026-06-18 14:59:59.000000', null, null, null, null, ?, ?),
        (?, ?, ?, ?, '2000000', '70', 30, 'CANCEL_REQUESTED', ?, '2026-06-19 14:59:59.000000', '2026-06-30 15:00:00.000000', '2026-06-19 14:59:59.000000', '2026-06-19 15:30:00.000000', null, null, null, ?, ?),
        (?, ?, ?, ?, '1', '1', 30, 'ACTIVE', ?, '2026-06-19 14:00:00.000000', '2026-06-30 15:00:00.000000', '2026-06-19 14:00:00.000000', null, null, null, null, ?, ?),
        (?, ?, ?, ?, '900000', '120', 30, 'ACTIVE', ?, '2026-06-19 15:00:00.000000', '2026-06-30 15:00:00.000000', '2026-06-19 15:00:00.000000', null, null, null, null, ?, ?),
        (?, ?, ?, ?, '3000000', '50', 30, 'CANCELLED', ?, '2026-06-17 15:00:00.000000', '2026-06-30 15:00:00.000000', '2026-06-17 15:00:00.000000', null, '2026-06-18 14:59:59.000000', null, null, ?, ?),
        (?, ?, ?, ?, '4000000', '50', 30, 'MATURED', ?, '2026-05-18 15:00:00.000000', '2026-06-18 15:00:00.000000', '2026-05-18 15:00:00.000000', null, null, '2026-06-18 15:00:00.000000', null, ?, ?),
        (?, ?, ?, ?, '5000000', '50', 30, 'CLOSED', ?, '2026-05-18 15:00:00.000000', '2026-06-30 15:00:00.000000', '2026-05-18 15:00:00.000000', null, null, null, '2026-06-18 14:59:59.000000', ?, ?)`,
      [
        fixture.activeStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-active-${suffix}`,
        createdAt,
        createdAt,
        fixture.cancelRequestedStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-cancel-requested-${suffix}`,
        createdAt,
        createdAt,
        fixture.zeroRewardStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-zero-${suffix}`,
        createdAt,
        createdAt,
        fixture.futureStartStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-future-${suffix}`,
        createdAt,
        createdAt,
        fixture.cancelledStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-cancelled-${suffix}`,
        createdAt,
        createdAt,
        fixture.maturedStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-matured-${suffix}`,
        createdAt,
        createdAt,
        fixture.closedStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `reward-closed-${suffix}`,
        createdAt,
        createdAt,
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<{ remaining: Record<string, number> }> {
  return withTx(pool, async (conn) => {
    const accountIds = [fixture.adminId, fixture.readerId, fixture.userId, fixture.otherUserId];
    const stakingIds = [
      fixture.activeStakingId,
      fixture.cancelRequestedStakingId,
      fixture.zeroRewardStakingId,
      fixture.futureStartStakingId,
      fixture.cancelledStakingId,
      fixture.maturedStakingId,
      fixture.closedStakingId,
    ];

    const [rewardRows] = await conn.query(
      `select id, source_reference from account_rewards where policy_version_id = ?`,
      [fixture.policyId]
    );
    const rewards = rewardRows as Array<{ id: string; source_reference: string }>;
    const rewardIds = rewards.map((row) => row.id);
    const rewardRefs = rewards.map((row) => row.source_reference);

    if (rewardIds.length > 0) {
      const rewardPlaceholders = rewardIds.map(() => "?").join(", ");
      await conn.query(
        `delete from account_rewards where reward_type = 'REVERSAL' and id in (${rewardPlaceholders})`,
        rewardIds
      );
      await conn.query(
        `delete from account_rewards where reward_type <> 'REVERSAL' and id in (${rewardPlaceholders})`,
        rewardIds
      );
    }

    if (rewardRefs.length > 0) {
      const rewardRefPlaceholders = rewardRefs.map(() => "?").join(", ");
      await conn.query(`delete from ledger_events where reference_id in (${rewardRefPlaceholders})`, rewardRefs);
    }

    await conn.query(`delete from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(
      `delete from admin_audit_log where actor_account_id in (?, ?, ?, ?)`,
      accountIds
    );
    await conn.query(`delete from auth_sessions where account_id in (?, ?, ?, ?)`, accountIds);
    await conn.query(`delete from account_stakings where id in (?, ?, ?, ?, ?, ?, ?)`, stakingIds);
    await conn.query(`delete from staking_products where id = ?`, [fixture.productId]);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(`delete from accounts where id in (?, ?, ?, ?)`, accountIds);

    const [remainingRewardRows] = await conn.query(`select count(*) as total from account_rewards where policy_version_id = ?`, [
      fixture.policyId,
    ]);
    const [remainingCalcRows] = await conn.query(`select count(*) as total from calc_runs where policy_version_id = ?`, [
      fixture.policyId,
    ]);
    const [remainingStakingRows] = await conn.query(`select count(*) as total from account_stakings where id in (?, ?, ?, ?, ?, ?, ?)`, stakingIds);
    const [remainingAccountRows] = await conn.query(`select count(*) as total from accounts where id in (?, ?, ?, ?)`, accountIds);
    const [remainingSessionRows] = await conn.query(`select count(*) as total from auth_sessions where account_id in (?, ?, ?, ?)`, accountIds);
    const [remainingProductRows] = await conn.query(`select count(*) as total from staking_products where id = ?`, [fixture.productId]);
    const [remainingPolicyRows] = await conn.query(`select count(*) as total from policy_versions where id = ?`, [fixture.policyId]);

    return {
      remaining: {
        rewards: Number((remainingRewardRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        calc_runs: Number((remainingCalcRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        stakings: Number((remainingStakingRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        accounts: Number((remainingAccountRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        sessions: Number((remainingSessionRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        products: Number((remainingProductRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        policies: Number((remainingPolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0),
      },
    };
  });
}

async function main() {
  try {
    const results: Result[] = [];
    const fixture = await createFixture();
    let userToken = "";
    let otherUserToken = "";
    let calcRunId = "";
    let originalRewardId = "";
    let reversalRewardId = "";
    let currentStep = "fixture created";

    try {
      currentStep = "db info";
      const [dbRows] = await pool.query("select database() as db, user() as db_user");
      const dbInfo = (dbRows as Array<{ db: string; db_user: string }>)[0];
      process.stdout.write(`reward_smoke_db=${dbInfo?.db ?? "unknown"} user=${mask(String(dbInfo?.db_user ?? ""))}\n`);

      currentStep = "health";
      await http<{ ok: true }>("/health");
      results.push({ name: "health 확인", ok: true });

      currentStep = "user login";
      const userLogin = await http<{ access_token: string; account: { id: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login_id: fixture.userLoginId,
          password: fixture.password,
        }),
      });
      userToken = userLogin.access_token;
      results.push({ name: "User 로그인 성공", ok: userLogin.account.id === fixture.userId });

      currentStep = "other user login";
      const otherUserLogin = await http<{ access_token: string; account: { id: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login_id: fixture.otherUserLoginId,
          password: fixture.password,
        }),
      });
      otherUserToken = otherUserLogin.access_token;
      results.push({ name: "다른 User 로그인 성공", ok: otherUserLogin.account.id === fixture.otherUserId });

      currentStep = "reader forbidden";
      try {
        await http("/api/admin/calc-runs/daily-reward", {
          method: "POST",
          actorId: fixture.readerId,
          body: JSON.stringify({
            policy_version_id: fixture.policyId,
            reward_date: fixture.rewardDate,
          }),
        });
        results.push({ name: "READER daily reward 실행 차단", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "READER daily reward 실행 차단", ok: apiError.status === 403, message: apiError.message });
      }

      currentStep = "admin daily reward run";
      const runResult = await http<{
        calc_run: { id: string; status: string; run_date: string };
        target_count: number;
        created_count: number;
        zero_reward_skip_count: number;
        duplicate_skip_count: number;
        failed_count: number;
        total_reward_amount_base: string;
      }>("/api/admin/calc-runs/daily-reward", {
        method: "POST",
        actorId: fixture.adminId,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          reward_date: fixture.rewardDate,
        }),
      });
      calcRunId = runResult.calc_run.id;
      results.push({
        name: "ADMIN daily reward 실행 성공",
        ok:
          runResult.calc_run.status === "SUCCEEDED" &&
          runResult.calc_run.run_date === fixture.rewardDate &&
          runResult.target_count === 3 &&
          runResult.created_count === 2 &&
          runResult.zero_reward_skip_count === 1 &&
          runResult.duplicate_skip_count === 0 &&
          runResult.failed_count === 0 &&
          runResult.total_reward_amount_base === "19000",
      });

      currentStep = "duplicate rerun";
      try {
        await http("/api/admin/calc-runs/daily-reward", {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({
            policy_version_id: fixture.policyId,
            reward_date: fixture.rewardDate,
          }),
        });
        results.push({ name: "동일 날짜 재실행 중복 방지", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "동일 날짜 재실행 중복 방지", ok: apiError.status === 409, message: apiError.message });
      }

      currentStep = "db verification";
      const [rewardRows] = await pool.query(
        `select
            id,
            reward_type,
            reward_date,
            amount_base,
            status,
            account_id,
            account_staking_id,
            policy_version_id,
            calc_run_id,
            source_reference,
            source_ledger_event_id
           from account_rewards
          where policy_version_id = ?
          order by source_reference asc`,
        [fixture.policyId]
      );
      const dailyRewards = rewardRows as Array<{
        id: string;
        reward_type: string;
        reward_date: string;
        amount_base: string;
        status: string;
        account_id: string;
        account_staking_id: string;
        policy_version_id: string;
        calc_run_id: string;
        source_reference: string;
        source_ledger_event_id: string | null;
      }>;
      const [selectedRewardRows] = await pool.query(
        `select id
           from account_rewards
          where policy_version_id = ?
            and account_staking_id = ?
          limit 1`,
        [fixture.policyId, fixture.activeStakingId]
      );
      originalRewardId = String((selectedRewardRows as Array<{ id: string }>)[0]?.id ?? "");
      results.push({
        name: "account_rewards 생성 및 source_ledger 연결",
        ok:
          dailyRewards.length === 2 &&
          dailyRewards.every((row) => row.reward_type === "DAILY_REWARD") &&
          dailyRewards.every((row) => toDateOnly(row.reward_date) === fixture.rewardDate) &&
          dailyRewards.every((row) => row.status === "CONFIRMED") &&
          dailyRewards.every((row) => row.account_id === fixture.userId) &&
          dailyRewards.every((row) => row.policy_version_id === fixture.policyId) &&
          dailyRewards.every((row) => row.calc_run_id === calcRunId) &&
          dailyRewards.every((row) => Boolean(row.source_ledger_event_id)) &&
          dailyRewards.some((row) => row.account_staking_id === fixture.activeStakingId && row.amount_base === "5000") &&
          dailyRewards.some(
            (row) => row.account_staking_id === fixture.cancelRequestedStakingId && row.amount_base === "14000"
          ),
      });

      const [zeroRows] = await pool.query(
        `select count(*) as total
           from account_rewards
          where policy_version_id = ?
            and (amount_base = '0' or account_staking_id in (?, ?, ?, ?))`,
        [
          fixture.policyId,
          fixture.zeroRewardStakingId,
          fixture.futureStartStakingId,
          fixture.cancelledStakingId,
          fixture.closedStakingId,
        ]
      );
      results.push({
        name: "0 reward 및 제외 대상 row 미생성",
        ok: Number((zeroRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 0,
      });

      const [ledgerRows] = await pool.query(
        `select reference_id, event_type, amount_base
           from ledger_events
          where policy_version_id = ?
            and calc_run_id = ?
          order by reference_id asc`,
        [fixture.policyId, calcRunId]
      );
      const ledgerEvents = ledgerRows as Array<{ reference_id: string; event_type: string; amount_base: string }>;
      results.push({
        name: "ledger_events DAILY_REWARD_ACCRUAL 생성",
        ok:
          ledgerEvents.length === 2 &&
          ledgerEvents.every((row) => row.event_type === "DAILY_REWARD_ACCRUAL") &&
          ledgerEvents.some((row) => row.reference_id === `reward.daily:${fixture.activeStakingId}:${fixture.rewardDate}`) &&
          ledgerEvents.some((row) => row.reference_id === `reward.daily:${fixture.cancelRequestedStakingId}:${fixture.rewardDate}`),
      });

      currentStep = "user list";
      const myRewards = await http<{ items: RewardApiItem[]; total: number }>(
        `/api/me/rewards?page=1&limit=20&sort=reward_date_desc`,
        { accessToken: userToken }
      );
      results.push({
        name: "User rewards 목록",
        ok:
          myRewards.total === 2 &&
          myRewards.items.length === 2 &&
          myRewards.items.every((item) => typeof item.amount_base === "string") &&
          myRewards.items.every((item) => item.reward_type === "DAILY_REWARD"),
      });
      if (!originalRewardId) {
        originalRewardId = String(myRewards.items[0]?.id ?? "");
      }

      currentStep = "user detail";
      const myRewardDetail = await http<{ reward: RewardApiItem & { metadata: Record<string, unknown>; reversal: { id: string; amount_base: string } | null } }>(
        `/api/me/rewards/${originalRewardId}`,
        { accessToken: userToken }
      );
      results.push({
        name: "User reward 상세",
        ok:
          myRewardDetail.reward?.id === originalRewardId &&
          myRewardDetail.reward.metadata?.principal_amount_base === "1000000" &&
          myRewardDetail.reward.metadata?.daily_interest_bps_snapshot === "50" &&
          !containsSensitiveKey(myRewardDetail, "password_hash") &&
          !containsSensitiveKey(myRewardDetail, "session_token_hash"),
      });

      currentStep = "other user blocked";
      try {
        await http(`/api/me/rewards/${originalRewardId}`, { accessToken: otherUserToken });
        results.push({ name: "타인 reward 접근 차단", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "타인 reward 접근 차단", ok: apiError.status === 404, message: apiError.message });
      }

      currentStep = "staking rewards";
      const stakingRewards = await http<{ items: RewardApiItem[]; total: number }>(
        `/api/me/stakings/${fixture.activeStakingId}/rewards?page=1&limit=20`,
        { accessToken: userToken }
      );
      results.push({
        name: "staking별 rewards 조회",
        ok: stakingRewards.total === 1 && stakingRewards.items[0]?.account_staking_id === fixture.activeStakingId,
      });

      currentStep = "reward summary";
      const rewardSummary = await http<{
        pending_reward_amount_base: string;
        confirmed_reward_amount_base: string;
        withdrawable_reward_amount_base: string;
        withdrawn_reward_amount_base: string;
        daily_reward_amount_base: string;
        reward_count: number;
      }>("/api/me/rewards/summary", { accessToken: userToken });
      results.push({
        name: "User rewards summary",
        ok:
          rewardSummary.pending_reward_amount_base === "0" &&
          rewardSummary.confirmed_reward_amount_base === "19000" &&
          rewardSummary.withdrawable_reward_amount_base === "19000" &&
          rewardSummary.withdrawn_reward_amount_base === "0" &&
          rewardSummary.daily_reward_amount_base === "19000" &&
          rewardSummary.reward_count === 2,
      });

      currentStep = "staking summary";
      const stakingSummary = await http<{
        pending_count: number;
        active_count: number;
        cancel_requested_count: number;
        cancelled_count: number;
        matured_count: number;
        closed_count: number;
        pending_principal_amount_base: string;
        active_principal_amount_base: string;
      }>("/api/me/stakings/summary", { accessToken: userToken });
      results.push({
        name: "User staking summary",
        ok:
          stakingSummary.pending_count === 0 &&
          stakingSummary.active_count === 3 &&
          stakingSummary.cancel_requested_count === 1 &&
          stakingSummary.cancelled_count === 1 &&
          stakingSummary.matured_count === 1 &&
          stakingSummary.closed_count === 1 &&
          stakingSummary.pending_principal_amount_base === "0" &&
          stakingSummary.active_principal_amount_base === "1900001",
      });

      currentStep = "admin list";
      const adminRewards = await http<{ items: Array<RewardApiItem & { account: { id: string; login_id: string | null } }>; total: number }>(
        `/api/admin/rewards?page=1&limit=20&q=${encodeURIComponent(fixture.userLoginId)}`,
        { actorId: fixture.adminId }
      );
      results.push({
        name: "Admin rewards 목록",
        ok: adminRewards.total === 2 && adminRewards.items.every((item) => item.account.id === fixture.userId),
      });

      currentStep = "admin detail";
      const adminRewardDetail = await http<{
        reward: RewardApiItem & {
          metadata: Record<string, unknown>;
          account: { id: string; login_id: string | null };
          staking: { id: string };
          product: { id: string };
          calc_run: { id: string; status: string };
          reversal: { id: string; amount_base: string } | null;
        };
      }>(`/api/admin/rewards/${originalRewardId}`, { actorId: fixture.adminId });
      results.push({
        name: "Admin reward 상세",
        ok:
          adminRewardDetail.reward?.account?.id === fixture.userId &&
          adminRewardDetail.reward.staking?.id === fixture.activeStakingId &&
          adminRewardDetail.reward.product?.id === fixture.productId &&
          adminRewardDetail.reward.calc_run?.id === calcRunId &&
          adminRewardDetail.reward.reversal === null,
      });

      currentStep = "admin account rewards";
      const accountRewards = await http<{ items: RewardApiItem[]; total: number }>(
        `/api/admin/accounts/${fixture.userId}/rewards?page=1&limit=20`,
        { actorId: fixture.adminId }
      );
      results.push({
        name: "Admin account별 rewards 조회",
        ok: accountRewards.total === 2,
      });

      currentStep = "calc run rewards";
      const calcRunRewards = await http<{ calc_run: { id: string; status: string }; items: RewardApiItem[]; total: number }>(
        `/api/admin/calc-runs/${calcRunId}/rewards?page=1&limit=20`,
        { actorId: fixture.adminId }
      );
      results.push({
        name: "calc_run별 rewards 조회",
        ok: calcRunRewards.calc_run.id === calcRunId && calcRunRewards.total === 2,
      });

      currentStep = "reverse reward";
      const reverseResult = await http<{ reward: RewardApiItem & { reversal: { id: string; amount_base: string } } }>(
        `/api/admin/rewards/${originalRewardId}/reverse`,
        {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({ reason: "smoke reversal" }),
        }
      );
      reversalRewardId = reverseResult.reward.reversal.id;
      results.push({
        name: "reward reversal 성공",
        ok:
          reverseResult.reward.status === "REVERSED" &&
          reverseResult.reward.reversal.amount_base === "-5000",
      });

      currentStep = "double reversal blocked";
      try {
        await http(`/api/admin/rewards/${originalRewardId}/reverse`, {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({ reason: "duplicate reversal" }),
        });
        results.push({ name: "이미 reversed 409", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "이미 reversed 409", ok: apiError.status === 409, message: apiError.message });
      }

      const [reversalRows] = await pool.query(
        `select reward_type, amount_base, account_id, account_staking_id, policy_version_id, calc_run_id, source_reference
           from account_rewards
          where id = ?`,
        [reversalRewardId]
      );
      const reversalRow = (reversalRows as Array<{
        reward_type: string;
        amount_base: string;
        account_id: string;
        account_staking_id: string;
        policy_version_id: string;
        calc_run_id: string;
        source_reference: string;
      }>)[0];
      results.push({
        name: "reversal row/account/policy/calc_run 일치",
        ok:
          reversalRow?.reward_type === "REVERSAL" &&
          reversalRow.amount_base === "-5000" &&
          reversalRow.account_id === fixture.userId &&
          reversalRow.account_staking_id === fixture.activeStakingId &&
          reversalRow.policy_version_id === fixture.policyId &&
          reversalRow.calc_run_id === calcRunId &&
          reversalRow.source_reference === `reward.reversal:${originalRewardId}`,
      });

      const [adjustmentRows] = await pool.query(
        `select event_type, amount_base
           from ledger_events
          where reference_id = ?`,
        [`reward.reversal:${originalRewardId}`]
      );
      const adjustment = (adjustmentRows as Array<{ event_type: string; amount_base: string }>)[0];
      results.push({
        name: "reversal ledger adjustment 생성",
        ok: adjustment?.event_type === "ADJUSTMENT" && adjustment.amount_base === "-5000",
      });

      currentStep = "post reversal detail";
      const reversedDetail = await http<{ reward: RewardApiItem & { reversal: { id: string; amount_base: string } } }>(
        `/api/admin/rewards/${originalRewardId}`,
        { actorId: fixture.adminId }
      );
      results.push({
        name: "reversal 후 Admin 상세 반영",
        ok:
          reversedDetail.reward.status === "REVERSED" &&
          reversedDetail.reward.reversal.id === reversalRewardId &&
          reversedDetail.reward.reversal.amount_base === "-5000",
      });

      currentStep = "post reversal summary";
      const summaryAfterReversal = await http<{
        confirmed_reward_amount_base: string;
        withdrawable_reward_amount_base: string;
        daily_reward_amount_base: string;
        reward_count: number;
      }>("/api/me/rewards/summary", { accessToken: userToken });
      results.push({
        name: "reversal 후 summary net 반영",
        ok:
          summaryAfterReversal.confirmed_reward_amount_base === "9000" &&
          summaryAfterReversal.withdrawable_reward_amount_base === "9000" &&
          summaryAfterReversal.daily_reward_amount_base === "9000" &&
          summaryAfterReversal.reward_count === 3,
      });

      currentStep = "post reversal calc run";
      const calcRunAfterReversal = await http<{ items: RewardApiItem[]; total: number }>(
        `/api/admin/calc-runs/${calcRunId}/rewards?page=1&limit=20`,
        { actorId: fixture.adminId }
      );
      results.push({
        name: "calc_run rewards에 reversal 포함",
        ok: calcRunAfterReversal.total === 3 && calcRunAfterReversal.items.some((item) => item.id === reversalRewardId),
      });

      const [auditRows] = await pool.query(
        `select action from admin_audit_log where actor_account_id in (?, ?, ?) order by created_at asc`,
        [fixture.userId, fixture.readerId, fixture.adminId]
      );
      const auditActions = (auditRows as Array<{ action: string }>).map((row) => row.action);
      results.push({
        name: "audit log 생성",
        ok: auditActions.includes("ADMIN_DAILY_REWARD_RUN") && auditActions.includes("ADMIN_REWARD_REVERSE"),
      });

      results.push({
        name: "민감정보 비포함",
        ok:
          !containsSensitiveKey(adminRewardDetail, "password_hash") &&
          !containsSensitiveKey(adminRewardDetail, "session_token_hash") &&
          !containsSensitiveKey(adminRewardDetail, "access_token"),
      });
    } catch (error) {
      const apiError = error as Partial<ApiFailure>;
      const details =
        typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
      process.stderr.write(
        `account reward smoke failed at step=${currentStep}: ${String(apiError.message ?? error)}${
          apiError.status ? ` (status=${apiError.status})` : ""
        } details=${details}\n`
      );
      throw error;
    } finally {
      const cleanup = await cleanupFixture(fixture);
      results.push({
        name: "cleanup 후 관련 row 0",
        ok: Object.values(cleanup.remaining).every((value) => value === 0),
        message: JSON.stringify(cleanup.remaining),
      });
    }

    for (const result of results) {
      process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.message ? ` :: ${result.message}` : ""}\n`);
    }

    if (results.some((result) => !result.ok)) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  const message =
    typeof error === "object" && error !== null && "message" in error ? String((error as { message: unknown }).message) : String(error);
  process.stderr.write(`account reward smoke failed: ${message}\n`);
  process.exitCode = 1;
});
