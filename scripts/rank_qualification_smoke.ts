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
  leftUserId: string;
  rightUserId: string;
  rightSupportUserId: string;
  leftDownlineUserId: string;
  policyId: string;
  productId: string;
  rootStakeId: string;
  leftStakeId: string;
  rightStakeId: string;
  leftDownlineStakeId: string;
  rightSupportStakeId: string;
  rootLoginId: string;
  password: string;
  initialDate: string;
  promotedDate: string;
  deferredDate: string;
  singleDate: string;
};

type RankRunResponse = {
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

type RankQualificationResultItem = {
  id: string;
  calc_run_id: string;
  account_id: string;
  policy_version_id: string;
  calculation_date: string;
  previous_rank_level: number | null;
  qualified_rank_level: number | null;
  applied_rank_level: number | null;
  result_status: string;
  personal_active_stake_amount_base: string;
  personal_cumulative_stake_amount_base: string;
  direct_referral_count: number;
  direct_active_referral_count: number;
  left_leg_volume_base: string;
  right_leg_volume_base: string;
  weak_leg_volume_base: string;
  strong_leg_volume_base: string;
  downline_daily_reward_amount_base: string;
  qualification_snapshot: Record<string, unknown>;
};

type RankHistoryItem = {
  id: string;
  calc_run_id: string;
  effective_date: string;
  previous_rank_level: number | null;
  calculated_rank_level: number | null;
  final_rank_level: number | null;
  change_type: string;
  qualification_snapshot: Record<string, unknown>;
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
    rootUserId: randomUUID(),
    leftUserId: randomUUID(),
    rightUserId: randomUUID(),
    rightSupportUserId: randomUUID(),
    leftDownlineUserId: randomUUID(),
    policyId: randomUUID(),
    productId: randomUUID(),
    rootStakeId: randomUUID(),
    leftStakeId: randomUUID(),
    rightStakeId: randomUUID(),
    leftDownlineStakeId: randomUUID(),
    rightSupportStakeId: randomUUID(),
    rootLoginId: `smoke_rank_root_${suffix}`,
    password: "SmokeRank!123",
    initialDate: "2026-07-01",
    promotedDate: "2026-07-02",
    deferredDate: "2026-07-03",
    singleDate: "2026-07-04"
  };

  const createdAt = new Date("2026-06-30T00:00:00.000Z");
  const adminPasswordHash = await hashPassword("AdminRank!123");
  const readerPasswordHash = await hashPassword("ReaderRank!123");
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
        (?, ?, ?, ?, 'USER', 'BLOCKED', ?, ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?, ?)`,
      [
        fixture.adminId,
        `smoke_rank_admin_${suffix}`,
        adminPasswordHash,
        `Smoke Rank Admin ${suffix}`,
        `SRA${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.readerId,
        `smoke_rank_reader_${suffix}`,
        readerPasswordHash,
        `Smoke Rank Reader ${suffix}`,
        `SRR${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.rootUserId,
        fixture.rootLoginId,
        userPasswordHash,
        `Smoke Rank Root ${suffix}`,
        `SRU${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.leftUserId,
        `smoke_rank_left_${suffix}`,
        userPasswordHash,
        `Smoke Rank Left ${suffix}`,
        `SRL${suffix.toUpperCase()}`,
        fixture.rootUserId,
        createdAt,
        createdAt,
        fixture.rightUserId,
        `smoke_rank_right_${suffix}`,
        userPasswordHash,
        `Smoke Rank Right ${suffix}`,
        `SRR${suffix.toUpperCase()}A`,
        fixture.rootUserId,
        createdAt,
        createdAt,
        fixture.rightSupportUserId,
        `smoke_rank_support_${suffix}`,
        userPasswordHash,
        `Smoke Rank Support ${suffix}`,
        `SRS${suffix.toUpperCase()}`,
        fixture.rootUserId,
        createdAt,
        createdAt,
        fixture.leftDownlineUserId,
        `smoke_rank_left_down_${suffix}`,
        userPasswordHash,
        `Smoke Rank Left Down ${suffix}`,
        `SRD${suffix.toUpperCase()}`,
        fixture.leftUserId,
        createdAt,
        createdAt
      ]
    );

    await conn.query(
      `insert into policy_versions (id, status, note, created_by) values (?, ?, ?, ?)`,
      [fixture.policyId, policyStatus, `rank qualification smoke ${suffix}`, fixture.adminId]
    );

    await conn.query(
      `insert into rank_rules (
          id, policy_version_id, rank_level, required_lines, required_weak_volume_base, rank_share_bps, effective_bonus_bps, is_active
        ) values
        (?, ?, 1, 1, '1000000', '1000', '500', 1),
        (?, ?, 2, 3, '3000000', '2000', '1000', 1),
        (?, ?, 3, 4, '5000000', '3000', '1500', 1)`,
      [randomUUID(), fixture.policyId, randomUUID(), fixture.policyId, randomUUID(), fixture.policyId]
    );

    await conn.query(
      `insert into staking_products (
          id, policy_version_id, name, symbol, decimals, min_stake_amount_base, max_stake_amount_base, staking_days, daily_interest_bps, is_active
        ) values (?, ?, ?, 'USDC', 6, '1', '999999999', 30, '50', 1)`,
      [fixture.productId, fixture.policyId, `Smoke Rank Product ${suffix}`]
    );

    await conn.query(
      `insert into binary_nodes (account_id, parent_account_id, position, root_account_id, updated_at) values
        (?, null, null, ?, ?),
        (?, ?, 'LEFT', ?, ?),
        (?, ?, 'RIGHT', ?, ?),
        (?, ?, 'LEFT', ?, ?),
        (?, ?, 'LEFT', ?, ?)`,
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
        fixture.rightSupportUserId,
        fixture.rightUserId,
        fixture.rootUserId,
        createdAt,
        fixture.leftDownlineUserId,
        fixture.leftUserId,
        fixture.rootUserId,
        createdAt
      ]
    );

    await conn.query(
      `insert into binary_edges (
          ancestor_account_id, descendant_account_id, depth, root_leg, path
        ) values
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 0, null, ?),
        (?, ?, 1, 'LEFT', ?),
        (?, ?, 1, 'RIGHT', ?),
        (?, ?, 2, 'RIGHT', ?),
        (?, ?, 2, 'LEFT', ?),
        (?, ?, 1, 'LEFT', ?),
        (?, ?, 1, 'LEFT', ?)`,
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
        fixture.rightSupportUserId,
        fixture.rightSupportUserId,
        `/${fixture.rightSupportUserId}/`,
        fixture.leftDownlineUserId,
        fixture.leftDownlineUserId,
        `/${fixture.leftDownlineUserId}/`,
        fixture.rootUserId,
        fixture.leftUserId,
        `/${fixture.rootUserId}/${fixture.leftUserId}/`,
        fixture.rootUserId,
        fixture.rightUserId,
        `/${fixture.rootUserId}/${fixture.rightUserId}/`,
        fixture.rootUserId,
        fixture.rightSupportUserId,
        `/${fixture.rootUserId}/${fixture.rightUserId}/${fixture.rightSupportUserId}/`,
        fixture.rootUserId,
        fixture.leftDownlineUserId,
        `/${fixture.rootUserId}/${fixture.leftUserId}/${fixture.leftDownlineUserId}/`,
        fixture.leftUserId,
        fixture.leftDownlineUserId,
        `/${fixture.leftUserId}/${fixture.leftDownlineUserId}/`,
        fixture.rightUserId,
        fixture.rightSupportUserId,
        `/${fixture.rightUserId}/${fixture.rightSupportUserId}/`
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
        (?, ?, ?, ?, '500000', '50', 30, 'ACTIVE', ?, '2026-06-30 00:00:00.000000', '2026-07-30 00:00:00.000000', '2026-06-30 00:00:00.000000', ?, ?),
        (?, ?, ?, ?, '2000000', '50', 30, 'ACTIVE', ?, '2026-06-30 00:00:00.000000', '2026-07-30 00:00:00.000000', '2026-06-30 00:00:00.000000', ?, ?),
        (?, ?, ?, ?, '1500000', '50', 30, 'ACTIVE', ?, '2026-06-30 00:00:00.000000', '2026-07-30 00:00:00.000000', '2026-06-30 00:00:00.000000', ?, ?),
        (?, ?, ?, ?, '1000000', '50', 30, 'ACTIVE', ?, '2026-06-30 00:00:00.000000', '2026-07-30 00:00:00.000000', '2026-06-30 00:00:00.000000', ?, ?)`,
      [
        fixture.rootStakeId,
        fixture.rootUserId,
        fixture.productId,
        fixture.policyId,
        `rank-root-${suffix}`,
        createdAt,
        createdAt,
        fixture.leftStakeId,
        fixture.leftUserId,
        fixture.productId,
        fixture.policyId,
        `rank-left-${suffix}`,
        createdAt,
        createdAt,
        fixture.rightStakeId,
        fixture.rightUserId,
        fixture.productId,
        fixture.policyId,
        `rank-right-${suffix}`,
        createdAt,
        createdAt,
        fixture.leftDownlineStakeId,
        fixture.leftDownlineUserId,
        fixture.productId,
        fixture.policyId,
        `rank-left-down-${suffix}`,
        createdAt,
        createdAt
      ]
    );
  });

  return fixture;
}

async function activateSupportForPromotion(fixture: Fixture): Promise<void> {
  await withTx(pool, async (conn) => {
    await conn.query(`update accounts set status = 'ACTIVE', updated_at = current_timestamp(6) where id = ?`, [
      fixture.rightSupportUserId
    ]);
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
        ) values (?, ?, ?, ?, '2500000', '50', 30, 'ACTIVE', ?, '2026-07-01 00:00:00.000000', '2026-07-31 00:00:00.000000', '2026-07-01 00:00:00.000000', current_timestamp(6), current_timestamp(6))`,
      [
        fixture.rightSupportStakeId,
        fixture.rightSupportUserId,
        fixture.productId,
        fixture.policyId,
        `rank-right-support-${fixture.suffix}`
      ]
    );
  });
}

async function deferDemotion(fixture: Fixture): Promise<void> {
  await withTx(pool, async (conn) => {
    await conn.query(`update accounts set status = 'BLOCKED', updated_at = current_timestamp(6) where id = ?`, [
      fixture.rightSupportUserId
    ]);
    await conn.query(
      `update account_stakings
          set status = 'CANCEL_REQUESTED',
              cancel_requested_at = current_timestamp(6),
              updated_at = current_timestamp(6)
        where id = ?`,
      [fixture.rightSupportStakeId]
    );
  });
}

async function cleanupFixture(fixture: Fixture): Promise<{ remaining: Record<string, number> }> {
  return withTx(pool, async (conn) => {
    const accountIds = [
      fixture.adminId,
      fixture.readerId,
      fixture.rootUserId,
      fixture.leftUserId,
      fixture.rightUserId,
      fixture.rightSupportUserId,
      fixture.leftDownlineUserId
    ];
    const stakingIds = [
      fixture.rootStakeId,
      fixture.leftStakeId,
      fixture.rightStakeId,
      fixture.leftDownlineStakeId,
      fixture.rightSupportStakeId
    ];

    await conn.query(`delete from account_rank_history where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from account_rank_qualification_results where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(
      `delete from account_rank_status
        where policy_version_id = ?
           or account_id in (${accountIds.map(() => "?").join(", ")})`,
      [fixture.policyId, ...accountIds]
    );
    await conn.query(`delete from account_rewards where policy_version_id = ? and reward_type = 'RANK_BONUS'`, [fixture.policyId]);
    await conn.query(`delete from ledger_events where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from calc_runs where policy_version_id = ? and run_type = 'RANK_QUALIFICATION'`, [fixture.policyId]);
    await conn.query(
      `delete from admin_audit_log
        where actor_account_id in (${accountIds.map(() => "?").join(", ")})
           or target_id in (${accountIds.map(() => "?").join(", ")})`,
      [...accountIds, ...accountIds]
    );
    await conn.query(
      `delete from auth_sessions where account_id in (${accountIds.map(() => "?").join(", ")})`,
      accountIds
    );
    await conn.query(`delete from account_stakings where id in (${stakingIds.map(() => "?").join(", ")})`, stakingIds);
    await conn.query(
      `update accounts
          set sponsor_account_id = null,
              binary_parent_account_id = null,
              updated_at = current_timestamp(6)
        where id in (${accountIds.map(() => "?").join(", ")})`,
      accountIds
    );
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
    await conn.query(`delete from accounts where id in (${accountIds.map(() => "?").join(", ")})`, accountIds);

    const [remainingStatusRows] = await conn.query(
      `select count(*) as total
         from account_rank_status
        where policy_version_id = ?
           or account_id in (${accountIds.map(() => "?").join(", ")})`,
      [fixture.policyId, ...accountIds]
    );
    const [remainingResultRows] = await conn.query(`select count(*) as total from account_rank_qualification_results where policy_version_id = ?`, [
      fixture.policyId
    ]);
    const [remainingHistoryRows] = await conn.query(`select count(*) as total from account_rank_history where policy_version_id = ?`, [
      fixture.policyId
    ]);
    const [remainingCalcRunRows] = await conn.query(`select count(*) as total from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    const [remainingStakingRows] = await conn.query(`select count(*) as total from account_stakings where id in (${stakingIds.map(() => "?").join(", ")})`, stakingIds);
    const [remainingRuleRows] = await conn.query(`select count(*) as total from rank_rules where policy_version_id = ?`, [fixture.policyId]);
    const [remainingAccountRows] = await conn.query(`select count(*) as total from accounts where id in (${accountIds.map(() => "?").join(", ")})`, accountIds);
    const [remainingSessionRows] = await conn.query(
      `select count(*) as total from auth_sessions where account_id in (${accountIds.map(() => "?").join(", ")})`,
      accountIds
    );
    const [remainingAuditRows] = await conn.query(
      `select count(*) as total
         from admin_audit_log
        where actor_account_id in (${accountIds.map(() => "?").join(", ")})
           or target_id in (${accountIds.map(() => "?").join(", ")})`,
      [...accountIds, ...accountIds]
    );
    const [remainingProductRows] = await conn.query(`select count(*) as total from staking_products where id = ?`, [fixture.productId]);
    const [remainingPolicyRows] = await conn.query(`select count(*) as total from policy_versions where id = ?`, [fixture.policyId]);

    return {
      remaining: {
        fixture_rank_status: Number((remainingStatusRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_rank_results: Number((remainingResultRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_rank_history: Number((remainingHistoryRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_calc_runs: Number((remainingCalcRunRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_stakings: Number((remainingStakingRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_rules: Number((remainingRuleRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_accounts: Number((remainingAccountRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_sessions: Number((remainingSessionRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_admin_audit_logs: Number((remainingAuditRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_products: Number((remainingProductRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fixture_policies: Number((remainingPolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0)
      }
    };
  });
}

async function main() {
  const results: Result[] = [];
  const fixture = await createFixture();
  const adminLoginId = `smoke_rank_admin_${fixture.suffix}`;
  const readerLoginId = `smoke_rank_reader_${fixture.suffix}`;
  const initialFixtureAccountIds = [fixture.rootUserId, fixture.leftUserId, fixture.rightUserId, fixture.leftDownlineUserId];
  const promotedFixtureAccountIds = [...initialFixtureAccountIds, fixture.rightSupportUserId];
  let rootToken = "";
  let adminToken = "";
  let readerToken = "";
  let initialRunId = "";
  let promotedRunId = "";
  let deferredRunId = "";
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
        password: fixture.password
      })
    });
    rootToken = login.payload.access_token;
    results.push({ name: "USER 로그인 성공", ok: login.payload.account.id === fixture.rootUserId });

    currentStep = "admin login";
    const adminLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: adminLoginId,
        password: "AdminRank!123"
      })
    });
    adminToken = adminLogin.payload.access_token;
    results.push({ name: "ADMIN 로그인 성공", ok: adminLogin.payload.account.id === fixture.adminId });

    currentStep = "reader login";
    const readerLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: readerLoginId,
        password: "ReaderRank!123"
      })
    });
    readerToken = readerLogin.payload.access_token;
    results.push({ name: "READER 로그인 성공", ok: readerLogin.payload.account.id === fixture.readerId });

    currentStep = "reader forbidden";
    try {
      await requestJson("/api/admin/rewards/rank-qualification/run", {
        method: "POST",
        accessToken: readerToken,
        body: JSON.stringify({
          policy_version_id: fixture.policyId,
          calculation_date: fixture.initialDate
        })
      });
      results.push({ name: "READER qualification 실행 차단", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "READER qualification 실행 차단", ok: apiError.status === 403, message: apiError.message });
    }

    currentStep = "initial batch";
    const initialRun = await requestJson<RankRunResponse>("/api/admin/rewards/rank-qualification/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.initialDate
      })
    });
    initialRunId = initialRun.payload.calc_run_id;
    results.push({
      name: "ADMIN batch INITIAL 실행",
      ok:
        initialRun.payload.status === "SUCCEEDED" &&
        initialRun.payload.target_count >= initialFixtureAccountIds.length &&
        initialRun.payload.failed_count === 0,
      message: JSON.stringify(initialRun.payload)
    });

    currentStep = "duplicate batch";
    const duplicateRun = await requestJson<RankRunResponse>("/api/admin/rewards/rank-qualification/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.initialDate
      })
    });
    results.push({
      name: "동일 날짜 calc_run 재사용",
      ok: duplicateRun.payload.calc_run_id === initialRunId && duplicateRun.payload.target_count >= initialFixtureAccountIds.length
    });

    currentStep = "initial results";
    const initialResults = await requestJson<{ calc_run: { id: string }; items: RankQualificationResultItem[]; total: number }>(
      `/api/admin/calc-runs/${initialRunId}/rank-results?page=1&limit=100`,
      { accessToken: adminToken }
    );
    const rootInitial = initialResults.payload.items.find((item) => item.account_id === fixture.rootUserId);
    const initialFixtureResults = initialResults.payload.items.filter((item) => initialFixtureAccountIds.includes(item.account_id));
    results.push({
      name: "INITIAL metrics/weak leg/최고 rank",
      ok:
        initialResults.payload.calc_run.id === initialRunId &&
        initialResults.payload.total >= initialFixtureAccountIds.length &&
        initialFixtureResults.length === initialFixtureAccountIds.length &&
        rootInitial?.direct_active_referral_count === 2 &&
        rootInitial?.left_leg_volume_base === "3000000" &&
        rootInitial?.right_leg_volume_base === "1500000" &&
        rootInitial?.weak_leg_volume_base === "1500000" &&
        rootInitial?.qualified_rank_level === 1 &&
        rootInitial?.applied_rank_level === 1 &&
        rootInitial?.result_status === "QUALIFIED",
      message: JSON.stringify(rootInitial ?? null)
    });

    const [initialRewardRows] = await pool.query(
      `select count(*) as total from account_rewards where calc_run_id = ?`,
      [initialRunId]
    );
    const [initialLedgerRows] = await pool.query(
      `select count(*) as total from ledger_events where calc_run_id = ?`,
      [initialRunId]
    );
    results.push({
      name: "qualification은 reward/ledger 미생성",
      ok:
        Number((initialRewardRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 0 &&
        Number((initialLedgerRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 0
    });

    currentStep = "initial me rank";
    const myInitialRank = await requestJson<{
      rank_status: { current_rank_level: number | null } | null;
      latest_qualification_result: RankQualificationResultItem | null;
    }>("/api/me/rank", { accessToken: rootToken });
    results.push({
      name: "User 현재 직급 조회",
      ok:
        myInitialRank.payload.rank_status?.current_rank_level === 1 &&
        myInitialRank.payload.latest_qualification_result?.account_id === fixture.rootUserId
    });

    await activateSupportForPromotion(fixture);

    currentStep = "promoted batch";
    const promotedRun = await requestJson<RankRunResponse>("/api/admin/rewards/rank-qualification/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.promotedDate
      })
    });
    promotedRunId = promotedRun.payload.calc_run_id;
    results.push({
      name: "PROMOTED batch 실행",
      ok:
        promotedRun.payload.status === "SUCCEEDED" &&
        promotedRun.payload.target_count >= promotedFixtureAccountIds.length &&
        promotedRun.payload.promoted_count >= 1,
      message: JSON.stringify(promotedRun.payload)
    });

    currentStep = "promoted results";
    const promotedResults = await requestJson<{ items: RankQualificationResultItem[]; total: number }>(
      `/api/admin/calc-runs/${promotedRunId}/rank-results?page=1&limit=100`,
      { accessToken: adminToken }
    );
    const rootPromoted = promotedResults.payload.items.find((item) => item.account_id === fixture.rootUserId);
    const promotedFixtureResults = promotedResults.payload.items.filter((item) => promotedFixtureAccountIds.includes(item.account_id));
    results.push({
      name: "PROMOTED metrics 반영",
      ok:
        promotedResults.payload.total >= promotedFixtureAccountIds.length &&
        promotedFixtureResults.length === promotedFixtureAccountIds.length &&
        rootPromoted?.direct_active_referral_count === 3 &&
        rootPromoted?.right_leg_volume_base === "4000000" &&
        rootPromoted?.weak_leg_volume_base === "3000000" &&
        rootPromoted?.qualified_rank_level === 2 &&
        rootPromoted?.applied_rank_level === 2 &&
        rootPromoted?.result_status === "QUALIFIED",
      message: JSON.stringify(rootPromoted ?? null)
    });

    await deferDemotion(fixture);

    currentStep = "deferred batch";
    const deferredRun = await requestJson<RankRunResponse>("/api/admin/rewards/rank-qualification/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.deferredDate
      })
    });
    deferredRunId = deferredRun.payload.calc_run_id;
    results.push({
      name: "DEMOTION_DEFERRED batch 실행",
      ok:
        deferredRun.payload.status === "SUCCEEDED" &&
        deferredRun.payload.demotion_deferred_count >= 1,
      message: JSON.stringify(deferredRun.payload)
    });

    currentStep = "deferred me rank";
    const myDeferredRank = await requestJson<{
      rank_status: { current_rank_level: number | null; last_change_type: string | null } | null;
      latest_qualification_result: RankQualificationResultItem | null;
      next_rank: { rank_level: number } | null;
      next_rank_progress: Array<{ metric: string; current: string | number; required: string | number; met: boolean }>;
    }>("/api/me/rank", { accessToken: rootToken });
    results.push({
      name: "demotion deferred는 current rank 유지",
      ok:
        myDeferredRank.payload.rank_status?.current_rank_level === 2 &&
        myDeferredRank.payload.rank_status?.last_change_type === "MAINTAINED" &&
        myDeferredRank.payload.latest_qualification_result?.qualified_rank_level === 1 &&
        myDeferredRank.payload.latest_qualification_result?.applied_rank_level === 2 &&
        myDeferredRank.payload.latest_qualification_result?.result_status === "DEMOTION_CANDIDATE" &&
        myDeferredRank.payload.next_rank?.rank_level === 3,
      message: JSON.stringify(myDeferredRank.payload)
    });

    results.push({
      name: "amount string 및 민감정보 비포함",
      ok:
        typeof myDeferredRank.payload.latest_qualification_result?.weak_leg_volume_base === "string" &&
        !containsSensitiveKey(myDeferredRank.payload, "password_hash") &&
        !containsSensitiveKey(myDeferredRank.payload, "session_token_hash") &&
        !containsSensitiveKey(myDeferredRank.payload, "access_token")
    });

    currentStep = "user history";
    const myHistory = await requestJson<{ items: RankHistoryItem[]; total: number }>("/api/me/rank-history?page=1&limit=10", {
      accessToken: rootToken
    });
    results.push({
      name: "User rank history",
      ok:
        myHistory.payload.total >= 3 &&
        myHistory.payload.items.some((item) => item.change_type === "PROMOTED") &&
        myHistory.payload.items.some((item) => item.qualification_snapshot?.demotion_deferred === true)
    });

    currentStep = "admin account rank";
    const adminRank = await requestJson<{
      account: { id: string };
      rank_status: { current_rank_level: number | null } | null;
      latest_qualification_result: RankQualificationResultItem | null;
    }>(`/api/admin/accounts/${fixture.rootUserId}/rank`, { accessToken: adminToken });
    results.push({
      name: "Admin account rank 조회",
      ok:
        adminRank.payload.account.id === fixture.rootUserId &&
        adminRank.payload.rank_status?.current_rank_level === 2 &&
        adminRank.payload.latest_qualification_result?.result_status === "DEMOTION_CANDIDATE"
    });

    currentStep = "admin history";
    const adminHistory = await requestJson<{ items: RankHistoryItem[]; total: number }>(
      `/api/admin/accounts/${fixture.rootUserId}/rank-history?page=1&limit=10`,
      { accessToken: adminToken }
    );
    results.push({
      name: "Admin account rank history 조회",
      ok: adminHistory.payload.total >= 3
    });

    currentStep = "single qualification";
    const singleRun = await requestJson<{
      calc_run: { id: string; run_type: string; run_date: string };
      qualification_result: RankQualificationResultItem;
    }>(`/api/admin/accounts/${fixture.rootUserId}/rank-qualification`, {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.singleDate
      })
    });
    results.push({
      name: "Admin 단건 qualification 실행",
      ok:
        singleRun.payload.calc_run.run_type === "RANK_QUALIFICATION" &&
        singleRun.payload.calc_run.run_date === fixture.singleDate &&
        singleRun.payload.qualification_result.account_id === fixture.rootUserId,
      message: JSON.stringify(singleRun.payload)
    });

    const [auditRows] = await pool.query(
      `select action from admin_audit_log where actor_account_id in (?, ?) order by created_at asc`,
      [fixture.adminId, fixture.readerId]
    );
    const actions = (auditRows as Array<{ action: string }>).map((row) => row.action);
    results.push({
      name: "audit log 생성",
      ok:
        actions.includes("ADMIN_RANK_QUALIFICATION_RUN") &&
        actions.includes("ACCOUNT_RANK_INITIALIZED") &&
        actions.includes("ACCOUNT_RANK_PROMOTED") &&
        actions.includes("ACCOUNT_RANK_DEMOTION_DEFERRED")
    });
  } catch (error) {
    const apiError = error as Partial<ApiFailure>;
    const details = typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
    process.stderr.write(
      `rank qualification smoke failed at step=${currentStep}: ${String(apiError.message ?? error)}${
        apiError.status ? ` (status=${apiError.status})` : ""
      } details=${details}\n`
    );
    throw error;
  } finally {
    const cleanup = await cleanupFixture(fixture);
    results.push({
      name: "cleanup 후 fixture row 0",
      ok: Object.values(cleanup.remaining).every((value) => value === 0),
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
  process.stderr.write(`rank qualification smoke failed: ${message}\n`);
  process.exitCode = 1;
});
