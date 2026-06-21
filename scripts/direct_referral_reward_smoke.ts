import "dotenv/config";

import { randomUUID } from "node:crypto";

import { pool } from "../src/db/pool.js";
import { withTx } from "../src/db/tx.js";
import { hashPassword } from "../src/util/passwordHash.js";
import { resolveSmokeBaseUrl } from "./smoke_config.js";
import { findFixtureRewards, fixtureCleanupSucceeded } from "./direct_referral_reward_smoke_helpers.js";

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
  sponsorId: string;
  blockedSponsorId: string;
  sourceUserId: string;
  blockedSourceUserId: string;
  noSponsorUserId: string;
  zeroSourceUserId: string;
  policyId: string;
  productId: string;
  ruleId: string;
  referralEdgeId1: string;
  referralEdgeId2: string;
  activeSourceStakingId: string;
  blockedSourceStakingId: string;
  noSponsorStakingId: string;
  zeroRewardStakingId: string;
  sponsorLoginId: string;
  sourceUserLoginId: string;
  password: string;
  activatedFrom: string;
  activatedTo: string;
};

type DirectReferralBatchResponse = {
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

type RewardListItem = {
  id: string;
  reward_type: string;
  reward_date: string;
  amount_base: string;
  status: string;
  account_staking_id: string | null;
  source_account_id?: string | null;
  source_account_staking_id: string | null;
  source_reference: string;
  source_ledger_event_id: string | null;
  metadata?: Record<string, unknown>;
  source?: {
    account_id?: string | null;
    login_id?: string | null;
    display_name: string | null;
    staking: {
      id: string;
      principal_amount_base: string | null;
      status: string | null;
    } | null;
    direct_referral_rate_bps: string | null;
  } | null;
  account?: {
    id: string;
    login_id: string | null;
    display_name: string | null;
  };
  calc_run?: {
    id: string;
    status: string | null;
    run_type: string | null;
    run_date: string | null;
  } | null;
};

type WithdrawalBalanceResponse = {
  daily_reward: {
    confirmed_amount_base: string;
    reserved_amount_base: string;
    completed_amount_base: string;
    available_amount_base: string;
  };
  bonus: {
    confirmed_amount_base: string;
    reserved_amount_base: string;
    completed_amount_base: string;
    available_amount_base: string;
  };
  total: {
    reserved_amount_base: string;
    completed_amount_base: string;
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
  init: RequestInit & { accessToken?: string } = {}
): Promise<{ status: number; payload: T }> {
  const baseUrl = resolveSmokeBaseUrl(process.env);
  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  if (init.accessToken) {
    headers.set("Authorization", `Bearer ${init.accessToken}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload && "error" in payload ? (payload as any).error : null;
    throw {
      status: response.status,
      message: errorPayload?.message ?? response.statusText,
      details: errorPayload?.details ?? null
    } satisfies ApiFailure;
  }

  return {
    status: response.status,
    payload: payload as T
  };
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const fixture: Fixture = {
    suffix,
    adminId: randomUUID(),
    readerId: randomUUID(),
    sponsorId: randomUUID(),
    blockedSponsorId: randomUUID(),
    sourceUserId: randomUUID(),
    blockedSourceUserId: randomUUID(),
    noSponsorUserId: randomUUID(),
    zeroSourceUserId: randomUUID(),
    policyId: randomUUID(),
    productId: randomUUID(),
    ruleId: randomUUID(),
    referralEdgeId1: randomUUID(),
    referralEdgeId2: randomUUID(),
    activeSourceStakingId: randomUUID(),
    blockedSourceStakingId: randomUUID(),
    noSponsorStakingId: randomUUID(),
    zeroRewardStakingId: randomUUID(),
    sponsorLoginId: `smoke_direct_sponsor_${suffix}`,
    sourceUserLoginId: `smoke_direct_source_${suffix}`,
    password: "SmokeDirect!123",
    activatedFrom: "2026-06-01",
    activatedTo: "2026-06-30"
  };

  const createdAt = new Date("2026-06-10T00:00:00.000Z");
  const adminPasswordHash = await hashPassword("AdminDirect!123");
  const readerPasswordHash = await hashPassword("ReaderDirect!123");
  const userPasswordHash = await hashPassword(fixture.password);

  await withTx(pool, async (conn) => {
    const [activePolicyRows] = await conn.query(`select count(*) as total from policy_versions where status = 'ACTIVE'`);
    const hasActivePolicy = Number((activePolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0;
    const policyStatus = hasActivePolicy ? "DRAFT" : "ACTIVE";

    const accountSql = `insert into accounts (
        id, login_id, password_hash, display_name, role, status, referral_code, sponsor_account_id, joined_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await conn.query(accountSql, [
      fixture.adminId,
      `smoke_direct_admin_${suffix}`,
      adminPasswordHash,
      `Smoke Direct Admin ${suffix}`,
      "ADMIN",
      "ACTIVE",
      `SDA${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.readerId,
      `smoke_direct_reader_${suffix}`,
      readerPasswordHash,
      `Smoke Direct Reader ${suffix}`,
      "READER",
      "ACTIVE",
      `SDR${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.sponsorId,
      fixture.sponsorLoginId,
      userPasswordHash,
      `Smoke Direct Sponsor ${suffix}`,
      "USER",
      "ACTIVE",
      `SDS${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.blockedSponsorId,
      `smoke_direct_blocked_sponsor_${suffix}`,
      userPasswordHash,
      `Smoke Direct Blocked Sponsor ${suffix}`,
      "USER",
      "BLOCKED",
      `SDB${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.sourceUserId,
      fixture.sourceUserLoginId,
      userPasswordHash,
      `Smoke Direct Source ${suffix}`,
      "USER",
      "ACTIVE",
      `SDU${suffix.toUpperCase()}`,
      fixture.sponsorId,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.blockedSourceUserId,
      `smoke_direct_blocked_source_${suffix}`,
      userPasswordHash,
      `Smoke Direct Blocked Source ${suffix}`,
      "USER",
      "ACTIVE",
      `SDBS${suffix.toUpperCase()}`,
      fixture.blockedSponsorId,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.noSponsorUserId,
      `smoke_direct_no_sponsor_${suffix}`,
      userPasswordHash,
      `Smoke Direct No Sponsor ${suffix}`,
      "USER",
      "ACTIVE",
      `SDN${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.zeroSourceUserId,
      `smoke_direct_zero_${suffix}`,
      userPasswordHash,
      `Smoke Direct Zero ${suffix}`,
      "USER",
      "ACTIVE",
      `SDZ${suffix.toUpperCase()}`,
      fixture.sponsorId,
      createdAt,
      createdAt
    ]);

    await conn.query(
      `insert into referral_edges (id, parent_account_id, child_account_id, depth, path, created_at)
       values
       (?, ?, ?, 1, ?, ?),
       (?, ?, ?, 1, ?, ?)`,
      [
        fixture.referralEdgeId1,
        fixture.sponsorId,
        fixture.sourceUserId,
        `${fixture.sponsorId}/${fixture.sourceUserId}`,
        createdAt,
        fixture.referralEdgeId2,
        fixture.blockedSponsorId,
        fixture.blockedSourceUserId,
        `${fixture.blockedSponsorId}/${fixture.blockedSourceUserId}`,
        createdAt
      ]
    );

    await conn.query(
      `insert into policy_versions (id, status, note, created_by, created_at, activated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [
        fixture.policyId,
        policyStatus,
        `direct referral smoke ${suffix}`,
        fixture.adminId,
        createdAt,
        policyStatus === "ACTIVE" ? createdAt : null
      ]
    );

    await conn.query(
      `insert into referral_bonus_rules (id, policy_version_id, depth, bonus_bps, is_active, created_at, updated_at)
       values (?, ?, 1, '1500', 1, ?, ?)`,
      [fixture.ruleId, fixture.policyId, createdAt, createdAt]
    );

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
      [fixture.productId, fixture.policyId, `Smoke Direct Product ${suffix}`]
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
        (?, ?, ?, ?, '1000000', '50', 30, 'ACTIVE', ?, '2026-06-19 00:00:00.000000', '2026-07-19 00:00:00.000000', '2026-06-19 00:00:00.000000', ?, ?),
        (?, ?, ?, ?, '2000000', '50', 30, 'ACTIVE', ?, '2026-06-19 01:00:00.000000', '2026-07-19 01:00:00.000000', '2026-06-19 01:00:00.000000', ?, ?),
        (?, ?, ?, ?, '3000000', '50', 30, 'ACTIVE', ?, '2026-06-19 02:00:00.000000', '2026-07-19 02:00:00.000000', '2026-06-19 02:00:00.000000', ?, ?),
        (?, ?, ?, ?, '1',       '50', 30, 'ACTIVE', ?, '2026-06-19 03:00:00.000000', '2026-07-19 03:00:00.000000', '2026-06-19 03:00:00.000000', ?, ?)`,
      [
        fixture.activeSourceStakingId,
        fixture.sourceUserId,
        fixture.productId,
        fixture.policyId,
        `direct-active-${suffix}`,
        createdAt,
        createdAt,
        fixture.blockedSourceStakingId,
        fixture.blockedSourceUserId,
        fixture.productId,
        fixture.policyId,
        `direct-blocked-${suffix}`,
        createdAt,
        createdAt,
        fixture.noSponsorStakingId,
        fixture.noSponsorUserId,
        fixture.productId,
        fixture.policyId,
        `direct-none-${suffix}`,
        createdAt,
        createdAt,
        fixture.zeroRewardStakingId,
        fixture.zeroSourceUserId,
        fixture.productId,
        fixture.policyId,
        `direct-zero-${suffix}`,
        createdAt,
        createdAt
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<{ remaining: Record<string, number> }> {
  return withTx(pool, async (conn) => {
    const accountIds = [
      fixture.adminId,
      fixture.readerId,
      fixture.sponsorId,
      fixture.blockedSponsorId,
      fixture.sourceUserId,
      fixture.blockedSourceUserId,
      fixture.noSponsorUserId,
      fixture.zeroSourceUserId
    ];
    const stakingIds = [
      fixture.activeSourceStakingId,
      fixture.blockedSourceStakingId,
      fixture.noSponsorStakingId,
      fixture.zeroRewardStakingId
    ];

    const [rewardRows] = await conn.query(
      `select id, source_reference from account_rewards where policy_version_id = ?`,
      [fixture.policyId]
    );
    const rewards = rewardRows as Array<{ id: string; source_reference: string }>;
    const rewardIds = rewards.map((row) => row.id);

    if (rewardIds.length > 0) {
      const placeholders = rewardIds.map(() => "?").join(", ");
      await conn.query(`delete from account_rewards where id in (${placeholders})`, rewardIds);
    }
    await conn.query(`delete from ledger_events where policy_version_id = ?`, [fixture.policyId]);

    await conn.query(`delete from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(
      `delete from admin_audit_log where actor_account_id in (?, ?, ?, ?, ?, ?, ?, ?)`,
      accountIds
    );
    await conn.query(
      `delete from auth_sessions where account_id in (?, ?, ?, ?, ?, ?, ?, ?)`,
      accountIds
    );
    await conn.query(`delete from account_stakings where id in (?, ?, ?, ?)`, stakingIds);
    await conn.query(`delete from referral_bonus_rules where id = ?`, [fixture.ruleId]);
    await conn.query(`delete from referral_edges where id in (?, ?)`, [fixture.referralEdgeId1, fixture.referralEdgeId2]);
    await conn.query(`delete from staking_products where id = ?`, [fixture.productId]);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(
      `update accounts
          set sponsor_account_id = null
        where id in (?, ?, ?, ?)`,
      [fixture.sourceUserId, fixture.blockedSourceUserId, fixture.noSponsorUserId, fixture.zeroSourceUserId]
    );
    await conn.query(
      `delete from accounts where id in (?, ?, ?, ?, ?, ?, ?, ?)`,
      accountIds
    );

    const [remainingRewardRows] = await conn.query(`select count(*) as total from account_rewards where policy_version_id = ?`, [
      fixture.policyId
    ]);
    const [remainingLedgerRows] = await conn.query(`select count(*) as total from ledger_events where policy_version_id = ?`, [
      fixture.policyId
    ]);
    const [remainingCalcRows] = await conn.query(`select count(*) as total from calc_runs where policy_version_id = ?`, [
      fixture.policyId
    ]);
    const [remainingStakingRows] = await conn.query(
      `select count(*) as total from account_stakings where id in (?, ?, ?, ?)`,
      stakingIds
    );
    const [remainingRuleRows] = await conn.query(`select count(*) as total from referral_bonus_rules where id = ?`, [
      fixture.ruleId
    ]);
    const [remainingEdgeRows] = await conn.query(`select count(*) as total from referral_edges where id in (?, ?)`, [
      fixture.referralEdgeId1,
      fixture.referralEdgeId2
    ]);
    const [remainingAccountRows] = await conn.query(
      `select count(*) as total from accounts where id in (?, ?, ?, ?, ?, ?, ?, ?)`,
      accountIds
    );
    const [remainingSessionRows] = await conn.query(
      `select count(*) as total from auth_sessions where account_id in (?, ?, ?, ?, ?, ?, ?, ?)`,
      accountIds
    );
    const [remainingProductRows] = await conn.query(`select count(*) as total from staking_products where id = ?`, [
      fixture.productId
    ]);
    const [remainingPolicyRows] = await conn.query(`select count(*) as total from policy_versions where id = ?`, [
      fixture.policyId
    ]);

    return {
      remaining: {
        fixture_rewards: Number((remainingRewardRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_ledger_events: Number((remainingLedgerRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_calc_runs: Number((remainingCalcRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_stakings: Number((remainingStakingRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_rules: Number((remainingRuleRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_referral_edges: Number((remainingEdgeRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_accounts: Number((remainingAccountRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_sessions: Number((remainingSessionRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_products: Number((remainingProductRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_policies: Number((remainingPolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0)
      }
    };
  });
}

async function main() {
  const results: Result[] = [];
  const fixture = await createFixture();
  const adminLoginId = `smoke_direct_admin_${fixture.suffix}`;
  const readerLoginId = `smoke_direct_reader_${fixture.suffix}`;
  const expectedAmount = ((1000000n * 1500n) / 10000n).toString();
  let sponsorToken = "";
  let adminToken = "";
  let readerToken = "";
  let rewardId = "";
  let calcRunId = "";
  let currentStep = "fixture created";

  try {
    currentStep = "health";
    await requestJson<{ ok: true }>("/health");
    results.push({ name: "health 확인", ok: true });

    currentStep = "sponsor login";
    const sponsorLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: fixture.sponsorLoginId,
        password: fixture.password
      })
    });
    sponsorToken = sponsorLogin.payload.access_token;
    results.push({ name: "Sponsor 로그인 성공", ok: sponsorLogin.payload.account.id === fixture.sponsorId });

    currentStep = "admin login";
    const adminLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: adminLoginId,
        password: "AdminDirect!123"
      })
    });
    adminToken = adminLogin.payload.access_token;
    results.push({ name: "ADMIN 로그인 성공", ok: adminLogin.payload.account.id === fixture.adminId });

    currentStep = "reader login";
    const readerLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: readerLoginId,
        password: "ReaderDirect!123"
      })
    });
    readerToken = readerLogin.payload.access_token;
    results.push({ name: "READER 로그인 성공", ok: readerLogin.payload.account.id === fixture.readerId });

    currentStep = "reader forbidden";
    try {
      await requestJson("/api/admin/rewards/direct-referral/run", {
        method: "POST",
        accessToken: readerToken,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          activated_from: fixture.activatedFrom,
          activated_to: fixture.activatedTo
        })
      });
      results.push({ name: "READER batch 실행 차단", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "READER batch 실행 차단", ok: apiError.status === 403, message: apiError.message });
    }

    currentStep = "batch run";
    const batchRun = await requestJson<DirectReferralBatchResponse>("/api/admin/rewards/direct-referral/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        activated_from: fixture.activatedFrom,
        activated_to: fixture.activatedTo
      })
    });
    calcRunId = batchRun.payload.calc_run_id;
    results.push({
      name: "ADMIN batch 실행 성공",
      ok:
        batchRun.payload.status === "SUCCEEDED" &&
        batchRun.payload.target_count === 4 &&
        batchRun.payload.created_count === 1 &&
        batchRun.payload.no_sponsor_skip_count === 1 &&
        batchRun.payload.inactive_sponsor_skip_count === 1 &&
        batchRun.payload.zero_reward_skip_count === 1 &&
        batchRun.payload.duplicate_skip_count === 0 &&
        batchRun.payload.conflict_count === 0 &&
        batchRun.payload.failed_count === 0 &&
        batchRun.payload.total_reward_amount_base === expectedAmount,
      message: JSON.stringify(batchRun.payload)
    });

    const [rewardRows] = await pool.query(
      `select
          id,
          account_id,
          account_staking_id,
          source_account_id,
          source_account_staking_id,
          reward_type,
          reward_date,
          amount_base,
          status,
          source_reference,
          source_ledger_event_id,
          calc_run_id
         from account_rewards
        where policy_version_id = ?
        order by created_at asc`,
      [fixture.policyId]
    );
    const rewards = rewardRows as Array<{
      id: string;
      account_id: string;
      account_staking_id: string | null;
      source_account_id: string | null;
      source_account_staking_id: string | null;
      reward_type: string;
      reward_date: string;
      amount_base: string;
      status: string;
      source_reference: string;
      source_ledger_event_id: string | null;
      calc_run_id: string | null;
    }>;
    rewardId = String(rewards[0]?.id ?? "");
    results.push({
      name: "account_rewards DIRECT_REFERRAL 저장 구조",
      ok:
        rewards.length === 1 &&
        rewards[0]?.account_id === fixture.sponsorId &&
        rewards[0]?.account_staking_id === null &&
        rewards[0]?.source_account_id === fixture.sourceUserId &&
        rewards[0]?.source_account_staking_id === fixture.activeSourceStakingId &&
        rewards[0]?.reward_type === "DIRECT_REFERRAL" &&
        rewards[0]?.amount_base === expectedAmount &&
        rewards[0]?.status === "CONFIRMED" &&
        rewards[0]?.source_reference === `direct_referral:${fixture.activeSourceStakingId}:${fixture.sponsorId}` &&
        rewards[0]?.calc_run_id === calcRunId &&
        Boolean(rewards[0]?.source_ledger_event_id),
      message: JSON.stringify(rewards)
    });

    const [ledgerRows] = await pool.query(
      `select event_type, amount_base, related_account_id, reference_id
         from ledger_events
        where reference_id = ?`,
      [`direct_referral:${fixture.activeSourceStakingId}:${fixture.sponsorId}`]
    );
    const ledger = (ledgerRows as Array<{
      event_type: string;
      amount_base: string;
      related_account_id: string | null;
      reference_id: string;
    }>)[0];
    results.push({
      name: "ledger DIRECT_REFERRAL_BONUS 생성",
      ok:
        ledger?.event_type === "DIRECT_REFERRAL_BONUS" &&
        ledger.amount_base === expectedAmount &&
        ledger.related_account_id === fixture.sourceUserId &&
        ledger.reference_id === `direct_referral:${fixture.activeSourceStakingId}:${fixture.sponsorId}`,
      message: JSON.stringify(ledger ?? null)
    });

    currentStep = "rerun duplicate";
    const rerun = await requestJson<DirectReferralBatchResponse>("/api/admin/rewards/direct-referral/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        activated_from: fixture.activatedFrom,
        activated_to: fixture.activatedTo
      })
    });
    results.push({
      name: "동일 범위 재실행 duplicate",
      ok:
        rerun.payload.calc_run_id === calcRunId &&
        rerun.payload.created_count === 0 &&
        rerun.payload.duplicate_skip_count === 1 &&
        rerun.payload.no_sponsor_skip_count === 1 &&
        rerun.payload.inactive_sponsor_skip_count === 1 &&
        rerun.payload.zero_reward_skip_count === 1 &&
        rerun.payload.total_reward_amount_base === "0",
      message: JSON.stringify(rerun.payload)
    });

    currentStep = "single duplicate";
    const singleRun = await requestJson<{
      calc_run_id: string | null;
      status: string;
      result_type: string;
      reward_id: string | null;
      existing_reward_id: string | null;
    }>(`/api/admin/stakings/${fixture.activeSourceStakingId}/direct-referral-calculate`, {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({})
    });
    results.push({
      name: "동일 staking 선택 실행 duplicate",
      ok:
        singleRun.payload.result_type === "duplicate" &&
        typeof singleRun.payload.calc_run_id === "string" &&
        singleRun.payload.calc_run_id.length > 0 &&
        singleRun.payload.reward_id === null &&
        singleRun.payload.existing_reward_id === rewardId,
      message: JSON.stringify(singleRun.payload)
    });

    currentStep = "user rewards list";
    const myRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/me/rewards?page=1&limit=20&reward_type=DIRECT_REFERRAL`,
      { accessToken: sponsorToken }
    );
    const myReward = myRewards.payload.items[0];
    results.push({
      name: "User reward 목록 및 source 정보",
      ok:
        myRewards.payload.total === 1 &&
        myReward?.id === rewardId &&
        myReward.reward_type === "DIRECT_REFERRAL" &&
        typeof myReward.amount_base === "string" &&
        myReward.source_account_staking_id === fixture.activeSourceStakingId &&
        myReward.source?.display_name === `Smoke Direct Source ${fixture.suffix}` &&
        myReward.source?.staking?.principal_amount_base === "1000000" &&
        myReward.source?.direct_referral_rate_bps === "1500" &&
        myReward.source?.login_id === undefined &&
        !containsSensitiveKey(myRewards.payload, "password_hash") &&
        !containsSensitiveKey(myRewards.payload, "session_token_hash")
    });

    currentStep = "user reward detail";
    const myRewardDetail = await requestJson<{ reward: RewardListItem & { metadata: Record<string, unknown> } }>(
      `/api/me/rewards/${rewardId}`,
      { accessToken: sponsorToken }
    );
    results.push({
      name: "User reward 상세 source/principal/rate",
      ok:
        myRewardDetail.payload.reward.metadata?.formula_version === "direct_referral_v1" &&
        myRewardDetail.payload.reward.metadata?.source_principal_amount_base === "1000000" &&
        myRewardDetail.payload.reward.metadata?.direct_referral_rate_bps === "1500" &&
        myRewardDetail.payload.reward.source?.staking?.id === fixture.activeSourceStakingId &&
        !("login_id" in (myRewardDetail.payload.reward.source ?? {}))
    });

    currentStep = "reward summary";
    const rewardSummary = await requestJson<{
      pending_reward_amount_base: string;
      confirmed_reward_amount_base: string;
      withdrawable_reward_amount_base: string;
      withdrawn_reward_amount_base: string;
      daily_reward_amount_base: string;
      bonus_reward_amount_base: string;
      reward_count: number;
    }>("/api/me/rewards/summary", { accessToken: sponsorToken });
    results.push({
      name: "Reward summary BONUS 반영",
      ok:
        rewardSummary.payload.confirmed_reward_amount_base === expectedAmount &&
        rewardSummary.payload.withdrawable_reward_amount_base === expectedAmount &&
        rewardSummary.payload.daily_reward_amount_base === "0" &&
        rewardSummary.payload.bonus_reward_amount_base === expectedAmount &&
        rewardSummary.payload.reward_count === 1
    });

    currentStep = "withdrawal balance";
    const withdrawalBalance = await requestJson<WithdrawalBalanceResponse>("/api/me/withdrawal-balance", {
      accessToken: sponsorToken
    });
    results.push({
      name: "Withdrawal BONUS 반영",
      ok:
        withdrawalBalance.payload.daily_reward.available_amount_base === "0" &&
        withdrawalBalance.payload.bonus.confirmed_amount_base === expectedAmount &&
        withdrawalBalance.payload.bonus.available_amount_base === expectedAmount &&
        withdrawalBalance.payload.total.reserved_amount_base === "0"
    });

    currentStep = "admin reward detail";
    const adminRewardDetail = await requestJson<{ reward: RewardListItem & { metadata: Record<string, unknown> } }>(
      `/api/admin/rewards/${rewardId}`,
      { accessToken: adminToken }
    );
    results.push({
      name: "Admin reward 상세",
      ok:
        adminRewardDetail.payload.reward.account?.id === fixture.sponsorId &&
        adminRewardDetail.payload.reward.source_account_id === fixture.sourceUserId &&
        adminRewardDetail.payload.reward.source?.account_id === fixture.sourceUserId &&
        adminRewardDetail.payload.reward.source?.login_id === fixture.sourceUserLoginId &&
        adminRewardDetail.payload.reward.source?.staking?.id === fixture.activeSourceStakingId &&
        adminRewardDetail.payload.reward.source?.staking?.principal_amount_base === "1000000" &&
        adminRewardDetail.payload.reward.source?.direct_referral_rate_bps === "1500" &&
        adminRewardDetail.payload.reward.calc_run?.id === calcRunId &&
        !containsSensitiveKey(adminRewardDetail.payload, "password_hash") &&
        !containsSensitiveKey(adminRewardDetail.payload, "session_token_hash")
    });

    currentStep = "admin reward list";
    const adminRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/admin/rewards?page=1&limit=20&reward_type=DIRECT_REFERRAL&account_id=${fixture.sponsorId}&calc_run_id=${calcRunId}`,
      { accessToken: adminToken }
    );
    const fixtureAdminRewards = findFixtureRewards(adminRewards.payload.items, {
      rewardId,
      accountId: fixture.sponsorId,
      calcRunId,
      sourceReference: `direct_referral:${fixture.activeSourceStakingId}:${fixture.sponsorId}`
    });
    results.push({
      name: "Admin rewards 목록",
      ok: fixtureAdminRewards.length === 1,
      message: JSON.stringify({
        total: adminRewards.payload.total,
        matched_reward_ids: fixtureAdminRewards.map((item) => item.id)
      })
    });

    currentStep = "admin account rewards";
    const adminAccountRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/admin/accounts/${fixture.sponsorId}/rewards?page=1&limit=20&reward_type=DIRECT_REFERRAL`,
      { accessToken: adminToken }
    );
    results.push({
      name: "Admin account별 rewards 조회",
      ok: adminAccountRewards.payload.total === 1 && adminAccountRewards.payload.items[0]?.id === rewardId
    });

    currentStep = "calc run rewards";
    const calcRunRewards = await requestJson<{ calc_run: { id: string; status: string }; items: RewardListItem[]; total: number }>(
      `/api/admin/calc-runs/${calcRunId}/rewards?page=1&limit=20&reward_type=DIRECT_REFERRAL`,
      { accessToken: adminToken }
    );
    results.push({
      name: "calc_run별 rewards 조회",
      ok:
        calcRunRewards.payload.calc_run.id === calcRunId &&
        calcRunRewards.payload.total === 1 &&
        calcRunRewards.payload.items[0]?.id === rewardId
    });

    const [auditRows] = await pool.query(
      `select action
         from admin_audit_log
        where actor_account_id in (?, ?)
        order by created_at asc`,
      [fixture.adminId, fixture.readerId]
    );
    const auditActions = (auditRows as Array<{ action: string }>).map((row) => row.action);
    results.push({
      name: "audit log 생성",
      ok: auditActions.includes("ADMIN_DIRECT_REFERRAL_RUN")
    });
  } catch (error) {
    const apiError = error as Partial<ApiFailure>;
    const details =
      typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
    process.stderr.write(
      `direct referral smoke failed at step=${currentStep}: ${String(apiError.message ?? error)}${
        apiError.status ? ` (status=${apiError.status})` : ""
      } details=${details}\n`
    );
    throw error;
  } finally {
    const cleanup = await cleanupFixture(fixture);
    results.push({
      name: "cleanup 후 관련 row 0",
      ok: fixtureCleanupSucceeded(cleanup.remaining),
      message: JSON.stringify(cleanup.remaining)
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
  process.stderr.write(`direct referral smoke failed: ${message}\n`);
  process.exitCode = 1;
});
