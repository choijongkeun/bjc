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
  sponsorId: string;
  depth1UserId: string;
  depth2UserId: string;
  zeroUserId: string;
  policyId: string;
  productId: string;
  depth1RuleId: string;
  depth2RuleId: string;
  edge1Id: string;
  edge2Id: string;
  sponsorLoginId: string;
  password: string;
  calculationDate: string;
};

type ContributionBatchResponse = {
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

type ContributionSingleResponse = {
  calc_run_id: string;
  status: string;
  result_type: string;
  reward_id: string | null;
  existing_reward_id: string | null;
  base_amount_base: string;
  reward_amount_base: string;
  pool_amount_base: string;
  total_score: string;
};

type RewardListItem = {
  id: string;
  reward_type: string;
  amount_base: string;
  status: string;
  source_reference: string;
  metadata?: Record<string, unknown>;
  account?: { id: string; login_id?: string | null } | null;
  calc_run?: { id: string; run_type: string | null } | null;
};

type WithdrawalBalanceResponse = {
  bonus: {
    confirmed_amount_base: string;
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

  return { status: response.status, payload: payload as T };
}

async function requestText(
  path: string,
  init: RequestInit & { actorId?: string } = {}
): Promise<{ status: number; payload: string }> {
  const baseUrl = resolveSmokeBaseUrl(process.env);
  const headers = new Headers(init.headers ?? {});
  if (init.actorId) {
    headers.set("x-actor-account-id", init.actorId);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });
  const payload = await response.text();
  if (!response.ok) {
    throw {
      status: response.status,
      message: response.statusText,
      details: payload
    } satisfies ApiFailure;
  }
  return { status: response.status, payload };
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const fixture: Fixture = {
    suffix,
    adminId: randomUUID(),
    readerId: randomUUID(),
    sponsorId: randomUUID(),
    depth1UserId: randomUUID(),
    depth2UserId: randomUUID(),
    zeroUserId: randomUUID(),
    policyId: randomUUID(),
    productId: randomUUID(),
    depth1RuleId: randomUUID(),
    depth2RuleId: randomUUID(),
    edge1Id: randomUUID(),
    edge2Id: randomUUID(),
    sponsorLoginId: `smoke_contrib_sponsor_${suffix}`,
    password: "SmokeContribution!123",
    calculationDate: "2026-06-30"
  };

  const createdAt = new Date("2026-06-20T00:00:00.000Z");
  const adminPasswordHash = await hashPassword("AdminContribution!123");
  const readerPasswordHash = await hashPassword("ReaderContribution!123");
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
      `smoke_contrib_admin_${suffix}`,
      adminPasswordHash,
      `Smoke Contribution Admin ${suffix}`,
      "ADMIN",
      "ACTIVE",
      `SCA${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.readerId,
      `smoke_contrib_reader_${suffix}`,
      readerPasswordHash,
      `Smoke Contribution Reader ${suffix}`,
      "READER",
      "ACTIVE",
      `SCR${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.sponsorId,
      fixture.sponsorLoginId,
      userPasswordHash,
      `Smoke Contribution Sponsor ${suffix}`,
      "USER",
      "ACTIVE",
      `SCS${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.depth1UserId,
      `smoke_contrib_depth1_${suffix}`,
      userPasswordHash,
      `Smoke Contribution Depth1 ${suffix}`,
      "USER",
      "ACTIVE",
      `SCD1${suffix.toUpperCase()}`,
      fixture.sponsorId,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.depth2UserId,
      `smoke_contrib_depth2_${suffix}`,
      userPasswordHash,
      `Smoke Contribution Depth2 ${suffix}`,
      "USER",
      "ACTIVE",
      `SCD2${suffix.toUpperCase()}`,
      fixture.sponsorId,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.zeroUserId,
      `smoke_contrib_zero_${suffix}`,
      userPasswordHash,
      `Smoke Contribution Zero ${suffix}`,
      "USER",
      "ACTIVE",
      `SCZ${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);

    await conn.query(
      `insert into referral_edges (id, parent_account_id, child_account_id, depth, path, created_at)
       values
       (?, ?, ?, 1, ?, ?),
       (?, ?, ?, 2, ?, ?)`,
      [
        fixture.edge1Id,
        fixture.sponsorId,
        fixture.depth1UserId,
        `${fixture.sponsorId}/${fixture.depth1UserId}`,
        createdAt,
        fixture.edge2Id,
        fixture.sponsorId,
        fixture.depth2UserId,
        `${fixture.sponsorId}/mid/${fixture.depth2UserId}`,
        createdAt
      ]
    );

    await conn.query(
      `insert into policy_versions (id, status, note, created_by, created_at, activated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [
        fixture.policyId,
        policyStatus,
        `contribution smoke ${suffix}`,
        fixture.adminId,
        createdAt,
        policyStatus === "ACTIVE" ? createdAt : null
      ]
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
        ) values (?, ?, ?, 'BJC', 0, '1', '999999999', 30, '50', 1)`,
      [fixture.productId, fixture.policyId, `Smoke Contribution Product ${suffix}`]
    );

    await conn.query(
      `insert into contribution_weight_rules (id, policy_version_id, depth, weight_bps)
       values
       (?, ?, 1, 10000),
       (?, ?, 2, 5000)`,
      [fixture.depth1RuleId, fixture.policyId, fixture.depth2RuleId, fixture.policyId]
    );

    await conn.query(
      `insert into ledger_events (
          id,
          account_id,
          related_account_id,
          product_id,
          policy_version_id,
          calc_run_id,
          event_time,
          event_type,
          amount_base,
          decimals,
          symbol,
          reference_id,
          meta,
          created_by
        ) values
        (?, ?, null, null, ?, null, '2026-06-30 01:00:00', 'WITHDRAWAL_REQUEST', '1000', 0, 'BJC', ?, '{}', ?),
        (?, ?, null, null, ?, null, '2026-06-30 02:00:00', 'WITHDRAWAL_REQUEST', '500', 0, 'BJC', ?, '{}', ?)`,
      [
        randomUUID(),
        fixture.depth1UserId,
        fixture.policyId,
        `smoke:contribution:withdrawal:${suffix}:depth1`,
        fixture.adminId,
        randomUUID(),
        fixture.depth2UserId,
        fixture.policyId,
        `smoke:contribution:withdrawal:${suffix}:depth2`,
        fixture.adminId
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<Record<string, number>> {
  return withTx(pool, async (conn) => {
    const accountIds = [fixture.adminId, fixture.readerId, fixture.sponsorId, fixture.depth1UserId, fixture.depth2UserId, fixture.zeroUserId];
    const [calcRows] = await conn.query(`select id from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    const calcRunIds = (calcRows as Array<{ id: string }>).map((row) => row.id);

    if (calcRunIds.length > 0) {
      const placeholders = calcRunIds.map(() => "?").join(", ");
      await conn.query(`delete from settlement_items where calc_run_id in (${placeholders})`, calcRunIds);
      await conn.query(`delete from contribution_rewards where calc_run_id in (${placeholders})`, calcRunIds);
    }
    await conn.query(`delete from contribution_daily_pools where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from account_rewards where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from ledger_events where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(
      `delete from admin_audit_log where actor_account_id in (?, ?, ?, ?, ?, ?)`,
      accountIds
    );
    await conn.query(
      `delete from auth_sessions where account_id in (?, ?, ?, ?, ?, ?)`,
      accountIds
    );
    await conn.query(`delete from contribution_weight_rules where id in (?, ?)`, [fixture.depth1RuleId, fixture.depth2RuleId]);
    await conn.query(`delete from referral_edges where id in (?, ?)`, [fixture.edge1Id, fixture.edge2Id]);
    await conn.query(`delete from staking_products where id = ?`, [fixture.productId]);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(
      `update accounts set sponsor_account_id = null where id in (?, ?)`,
      [fixture.depth1UserId, fixture.depth2UserId]
    );
    await conn.query(`delete from accounts where id in (?, ?, ?, ?, ?, ?)`, accountIds);

    const count = async (sql: string, params: unknown[]) => {
      const [rows] = await conn.query(sql, params);
      return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
    };

    return {
      fixture_rewards: await count(`select count(*) as total from account_rewards where policy_version_id = ?`, [fixture.policyId]),
      fixture_ledger_events: await count(`select count(*) as total from ledger_events where policy_version_id = ?`, [fixture.policyId]),
      fixture_calc_runs: await count(`select count(*) as total from calc_runs where policy_version_id = ?`, [fixture.policyId]),
      fixture_rules: await count(`select count(*) as total from contribution_weight_rules where id in (?, ?)`, [fixture.depth1RuleId, fixture.depth2RuleId]),
      fixture_edges: await count(`select count(*) as total from referral_edges where id in (?, ?)`, [fixture.edge1Id, fixture.edge2Id]),
      fixture_accounts: await count(`select count(*) as total from accounts where id in (?, ?, ?, ?, ?, ?)`, accountIds),
      fixture_products: await count(`select count(*) as total from staking_products where id = ?`, [fixture.productId]),
      fixture_policies: await count(`select count(*) as total from policy_versions where id = ?`, [fixture.policyId])
    };
  });
}

function cleanupSucceeded(remaining: Record<string, number>): boolean {
  return Object.values(remaining).every((value) => value === 0);
}

async function main() {
  const results: Result[] = [];
  const fixture = await createFixture();
  const expectedPool = "300";
  const expectedReward = "300";
  const expectedScore = "1250";
  let sponsorToken = "";
  let calcRunId = "";
  let rewardId = "";
  let step = "fixture";

  try {
    step = "health";
    await requestJson<{ ok: true }>("/health");
    results.push({ name: "health 확인", ok: true });

    step = "login";
    const login = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: fixture.sponsorLoginId,
        password: fixture.password
      })
    });
    sponsorToken = login.payload.access_token;
    results.push({ name: "Sponsor 로그인 성공", ok: login.payload.account.id === fixture.sponsorId });

    step = "reader forbidden";
    try {
      await requestJson("/api/admin/rewards/contribution/run", {
        method: "POST",
        actorId: fixture.readerId,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          calculation_date: fixture.calculationDate
        })
      });
      results.push({ name: "READER batch 실행 차단", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "READER batch 실행 차단", ok: apiError.status === 403, message: apiError.message });
    }

    step = "batch run";
    const batch = await requestJson<ContributionBatchResponse>("/api/admin/rewards/contribution/run", {
      method: "POST",
      actorId: fixture.adminId,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.calculationDate
      })
    });
    calcRunId = batch.payload.calc_run_id;
    results.push({
      name: "ADMIN CONTRIBUTION batch 실행",
      ok:
        batch.payload.status === "SUCCEEDED" &&
        batch.payload.target_count === 1 &&
        batch.payload.created_count === 1 &&
        batch.payload.zero_base_skip_count === 0 &&
        batch.payload.zero_reward_skip_count === 0 &&
        batch.payload.ineligible_skip_count === 0 &&
        batch.payload.duplicate_skip_count === 0 &&
        batch.payload.conflict_count === 0 &&
        batch.payload.failed_count === 0 &&
        batch.payload.total_base_amount_base === "1500" &&
        batch.payload.total_reward_amount_base === expectedReward &&
        batch.payload.pool_amount_base === expectedPool &&
        batch.payload.total_score === expectedScore,
      message: JSON.stringify(batch.payload)
    });

    const [rewardRows] = await pool.query(
      `select id, amount_base, reward_type, source_reference, status, calc_run_id
         from account_rewards
        where policy_version_id = ?`,
      [fixture.policyId]
    );
    const reward = (rewardRows as Array<{
      id: string;
      amount_base: string;
      reward_type: string;
      source_reference: string;
      status: string;
      calc_run_id: string;
    }>)[0];
    rewardId = reward?.id ?? "";
    results.push({
      name: "account_rewards CONTRIBUTION 저장",
      ok:
        reward?.reward_type === "CONTRIBUTION" &&
        reward.amount_base === expectedReward &&
        reward.status === "CONFIRMED" &&
        reward.calc_run_id === calcRunId &&
        reward.source_reference === `calc:CONTRIBUTION:${fixture.calculationDate}:acct:${fixture.sponsorId}`,
      message: JSON.stringify(reward ?? null)
    });

    const [ledgerRows] = await pool.query(
      `select event_type, amount_base, product_id, reference_id
         from ledger_events
        where reference_id = ?`,
      [`calc:CONTRIBUTION:${fixture.calculationDate}:acct:${fixture.sponsorId}`]
    );
    const ledger = (ledgerRows as Array<{
      event_type: string;
      amount_base: string;
      product_id: string | null;
      reference_id: string;
    }>)[0];
    results.push({
      name: "ledger CONTRIBUTION_BONUS 생성",
      ok:
        ledger?.event_type === "CONTRIBUTION_BONUS" &&
        ledger.amount_base === expectedReward &&
        ledger.product_id === null &&
        ledger.reference_id === `calc:CONTRIBUTION:${fixture.calculationDate}:acct:${fixture.sponsorId}`,
      message: JSON.stringify(ledger ?? null)
    });

    step = "single duplicate";
    const singleDuplicate = await requestJson<ContributionSingleResponse>(
      `/api/admin/accounts/${fixture.sponsorId}/contribution`,
      {
        method: "POST",
        actorId: fixture.adminId,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          calculation_date: fixture.calculationDate
        })
      }
    );
    results.push({
      name: "동일 회원 단건 실행 duplicate",
      ok:
        singleDuplicate.payload.calc_run_id === calcRunId &&
        singleDuplicate.payload.result_type === "duplicate" &&
        singleDuplicate.payload.existing_reward_id === rewardId &&
        singleDuplicate.payload.reward_id === null,
      message: JSON.stringify(singleDuplicate.payload)
    });

    step = "single zero base";
    const singleZeroBase = await requestJson<ContributionSingleResponse>(
      `/api/admin/accounts/${fixture.zeroUserId}/contribution`,
      {
        method: "POST",
        actorId: fixture.adminId,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          calculation_date: fixture.calculationDate
        })
      }
    );
    results.push({
      name: "기여도 없는 회원 zero_base",
      ok:
        singleZeroBase.payload.calc_run_id === calcRunId &&
        singleZeroBase.payload.result_type === "zero_base" &&
        singleZeroBase.payload.reward_amount_base === "0",
      message: JSON.stringify(singleZeroBase.payload)
    });

    step = "user rewards";
    const myRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/me/rewards?page=1&limit=20&reward_type=CONTRIBUTION`,
      { accessToken: sponsorToken }
    );
    results.push({
      name: "User rewards CONTRIBUTION 조회",
      ok:
        myRewards.payload.total === 1 &&
        myRewards.payload.items[0]?.id === rewardId &&
        myRewards.payload.items[0]?.reward_type === "CONTRIBUTION" &&
        typeof myRewards.payload.items[0]?.amount_base === "string" &&
        !containsSensitiveKey(myRewards.payload, "password_hash") &&
        !containsSensitiveKey(myRewards.payload, "session_token_hash")
    });

    const myRewardDetail = await requestJson<{ reward: RewardListItem & { metadata: Record<string, unknown> } }>(
      `/api/me/rewards/${rewardId}`,
      { accessToken: sponsorToken }
    );
    results.push({
      name: "User reward 상세 metadata sanitize",
      ok:
        myRewardDetail.payload.reward.metadata?.formula_version === "contribution_v1" &&
        myRewardDetail.payload.reward.metadata?.pool_amount_base === expectedPool &&
        !("account_score" in myRewardDetail.payload.reward.metadata) &&
        !("depth_breakdown" in myRewardDetail.payload.reward.metadata),
      message: JSON.stringify(myRewardDetail.payload.reward.metadata)
    });

    const rewardSummary = await requestJson<{
      confirmed_reward_amount_base: string;
      withdrawable_reward_amount_base: string;
      daily_reward_amount_base: string;
      bonus_reward_amount_base: string;
      reward_count: number;
    }>("/api/me/rewards/summary", { accessToken: sponsorToken });
    results.push({
      name: "Reward summary BONUS 반영",
      ok:
        rewardSummary.payload.confirmed_reward_amount_base === expectedReward &&
        rewardSummary.payload.withdrawable_reward_amount_base === expectedReward &&
        rewardSummary.payload.daily_reward_amount_base === "0" &&
        rewardSummary.payload.bonus_reward_amount_base === expectedReward &&
        rewardSummary.payload.reward_count === 1,
      message: JSON.stringify(rewardSummary.payload)
    });

    const withdrawalBalance = await requestJson<WithdrawalBalanceResponse>("/api/me/withdrawal-balance", {
      accessToken: sponsorToken
    });
    results.push({
      name: "Withdrawal BONUS 반영",
      ok:
        withdrawalBalance.payload.bonus.confirmed_amount_base === expectedReward &&
        withdrawalBalance.payload.bonus.available_amount_base === expectedReward,
      message: JSON.stringify(withdrawalBalance.payload)
    });

    const adminRewards = await requestJson<{ items: RewardListItem[]; total: number }>(
      `/api/admin/rewards?page=1&limit=20&reward_type=CONTRIBUTION&account_id=${fixture.sponsorId}&calc_run_id=${calcRunId}`,
      { actorId: fixture.adminId }
    );
    results.push({
      name: "Admin rewards 필터",
      ok: adminRewards.payload.total === 1 && adminRewards.payload.items[0]?.id === rewardId
    });

    const calcRunSummary = await requestJson<ContributionBatchResponse>(`/api/admin/calc-runs/${calcRunId}/summary`, {
      actorId: fixture.adminId
    });
    results.push({
      name: "calc_run summary",
      ok:
        calcRunSummary.payload.calc_run_id === calcRunId &&
        calcRunSummary.payload.created_count === 1 &&
        calcRunSummary.payload.total_reward_amount_base === expectedReward,
      message: JSON.stringify(calcRunSummary.payload)
    });

    const reportSummary = await requestJson<{
      reward_amount_base: string;
      reward_count: string;
      calc_run_succeeded_count: string;
    }>(
      `/api/admin/reports/reward-summary?policy_version_id=${fixture.policyId}&reward_type=CONTRIBUTION`,
      { actorId: fixture.adminId }
    );
    results.push({
      name: "report summary",
      ok:
        reportSummary.payload.reward_amount_base === expectedReward &&
        reportSummary.payload.reward_count === "1" &&
        reportSummary.payload.calc_run_succeeded_count === "1",
      message: JSON.stringify(reportSummary.payload)
    });

    const rewardsCsv = await requestText(
      `/api/admin/reports/rewards.csv?policy_version_id=${fixture.policyId}&reward_type=CONTRIBUTION`,
      { actorId: fixture.adminId }
    );
    results.push({
      name: "rewards.csv",
      ok:
        rewardsCsv.payload.includes("CONTRIBUTION") &&
        rewardsCsv.payload.includes(expectedReward) &&
        !rewardsCsv.payload.includes("password_hash") &&
        !rewardsCsv.payload.includes("session_token_hash"),
      message: rewardsCsv.payload
    });

    const calcRunsCsv = await requestText(`/api/admin/reports/calc-runs.csv?policy_version_id=${fixture.policyId}&run_type=CONTRIBUTION`, {
      actorId: fixture.adminId
    });
    results.push({
      name: "calc-runs.csv",
      ok: calcRunsCsv.payload.includes("CONTRIBUTION") && calcRunsCsv.payload.includes(calcRunId),
      message: calcRunsCsv.payload
    });
  } catch (error) {
    const apiError = error as Partial<ApiFailure>;
    const details = typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
    process.stderr.write(
      `contribution smoke failed at step=${step}: ${String(apiError.message ?? error)}${apiError.status ? ` (status=${apiError.status})` : ""} details=${details}\n`
    );
    throw error;
  } finally {
    const remaining = await cleanupFixture(fixture);
    results.push({
      name: "cleanup 후 fixture row 0",
      ok: cleanupSucceeded(remaining),
      message: JSON.stringify(remaining)
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
  process.stderr.write(`contribution smoke failed: ${message}\n`);
  process.exitCode = 1;
});
