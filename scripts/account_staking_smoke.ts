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

type Fixture = {
  suffix: string;
  adminId: string;
  readerId: string;
  userId: string;
  otherUserId: string;
  policyId: string;
  activeProductId: string;
  inactiveProductId: string;
  userLoginId: string;
  otherUserLoginId: string;
  password: string;
};

type ApiFailure = {
  status: number;
  message: string;
  details: unknown;
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
    if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
    return Object.values(obj).some((item) => containsSensitiveKey(item, key));
  }
  return false;
}

async function http<T>(
  path: string,
  init: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const baseUrl = resolveSmokeBaseUrl(process.env);
  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
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
  const adminId = randomUUID();
  const readerId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const policyId = randomUUID();
  const activeProductId = randomUUID();
  const inactiveProductId = randomUUID();
  const password = "SmokePass!123";

  const adminPasswordHash = await hashPassword("AdminSmokePass!123");
  const readerPasswordHash = await hashPassword("ReaderSmokePass!123");
  const userPasswordHash = await hashPassword(password);
  const otherUserPasswordHash = await hashPassword(password);
  const now = new Date();

  const fixture: Fixture = {
    suffix,
    adminId,
    readerId,
    userId,
    otherUserId,
    policyId,
    activeProductId,
    inactiveProductId,
    userLoginId: `smoke_staking_user_${suffix}`,
    otherUserLoginId: `smoke_staking_other_${suffix}`,
    password,
  };

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
        adminId,
        `smoke_staking_admin_${suffix}`,
        adminPasswordHash,
        `Smoke Staking Admin ${suffix}`,
        `SSA${suffix.toUpperCase()}`,
        now,
        now,
        readerId,
        `smoke_staking_reader_${suffix}`,
        readerPasswordHash,
        `Smoke Staking Reader ${suffix}`,
        `SSR${suffix.toUpperCase()}`,
        now,
        now,
        userId,
        fixture.userLoginId,
        userPasswordHash,
        `Smoke Staking User ${suffix}`,
        `SSU${suffix.toUpperCase()}`,
        now,
        now,
        otherUserId,
        fixture.otherUserLoginId,
        otherUserPasswordHash,
        `Smoke Staking Other ${suffix}`,
        `SSO${suffix.toUpperCase()}`,
        now,
        now,
      ]
    );

    await conn.query(
      `insert into policy_versions (id, status, note, created_by) values (?, 'DRAFT', ?, ?)`,
      [policyId, `staking smoke ${suffix}`, adminId]
    );

    await conn.query(
      `insert into staking_products (
          id, policy_version_id, name, symbol, decimals, min_stake_amount_base, max_stake_amount_base, staking_days, daily_interest_bps, is_active
        ) values
        (?, ?, ?, 'USDC', 6, '100', '1000000', 30, '50', 1),
        (?, ?, ?, 'USDC', 6, '100', '1000000', 90, '70', 0)`,
      [
        activeProductId,
        policyId,
        `Smoke Active Product ${suffix}`,
        inactiveProductId,
        policyId,
        `Smoke Inactive Product ${suffix}`,
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<{
  remaining: Record<string, number>;
}> {
  return withTx(pool, async (conn) => {
    const accountIds = [fixture.adminId, fixture.readerId, fixture.userId, fixture.otherUserId];
    const productIds = [fixture.activeProductId, fixture.inactiveProductId];
    const stakingRows = await conn.query(
      `select id, source_ledger_event_id, cancellation_ledger_event_id
         from account_stakings
        where account_id in (?, ?, ?, ?)`,
      accountIds
    );
    const stakings = stakingRows[0] as Array<{
      id: string;
      source_ledger_event_id: string | null;
      cancellation_ledger_event_id: string | null;
    }>;

    const ledgerReferenceIds = stakings.flatMap((staking) => [
      `staking.request:${staking.id}`,
      `staking.lock:${staking.id}`,
      `staking.activate:${staking.id}`,
      `staking.cancel:${staking.id}`,
      `staking.release:${staking.id}`,
      `staking.mature:${staking.id}`,
    ]);

    if (stakings.length > 0) {
      const stakingIds = stakings.map((staking) => staking.id);
      const placeholders = stakingIds.map(() => "?").join(", ");
      await conn.query(`delete from account_stakings where id in (${placeholders})`, stakingIds);

      const ledgerPlaceholders = ledgerReferenceIds.map(() => "?").join(", ");
      await conn.query(`delete from ledger_events where reference_id in (${ledgerPlaceholders})`, ledgerReferenceIds);
    }

    await conn.query(
      `delete from admin_audit_log where actor_account_id in (?, ?, ?, ?) or target_id in (?, ?, ?, ?)`,
      [...accountIds, ...accountIds]
    );
    await conn.query(`delete from auth_sessions where account_id in (?, ?, ?, ?)`, accountIds);
    await conn.query(`delete from staking_products where id in (?, ?)`, productIds);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(`delete from accounts where id in (?, ?, ?, ?)`, accountIds);

    const [remainingAccountsRows] = await conn.query(`select count(*) as total from accounts where id in (?, ?, ?, ?)`, accountIds);
    const [remainingPoliciesRows] = await conn.query(`select count(*) as total from policy_versions where id = ?`, [
      fixture.policyId,
    ]);
    const [remainingProductsRows] = await conn.query(
      `select count(*) as total from staking_products where id in (?, ?)`,
      productIds
    );
    const [remainingStakingsRows] = await conn.query(
      `select count(*) as total from account_stakings where account_id in (?, ?, ?, ?)`,
      accountIds
    );
    const [remainingSessionsRows] = await conn.query(
      `select count(*) as total from auth_sessions where account_id in (?, ?, ?, ?)`,
      accountIds
    );
    const remainingAccounts = (remainingAccountsRows as Array<{ total: number | string }>)[0];
    const remainingPolicies = (remainingPoliciesRows as Array<{ total: number | string }>)[0];
    const remainingProducts = (remainingProductsRows as Array<{ total: number | string }>)[0];
    const remainingStakings = (remainingStakingsRows as Array<{ total: number | string }>)[0];
    const remainingSessions = (remainingSessionsRows as Array<{ total: number | string }>)[0];

    return {
      remaining: {
        accounts: Number((remainingAccounts as { total: number | string }).total ?? 0),
        policies: Number((remainingPolicies as { total: number | string }).total ?? 0),
        products: Number((remainingProducts as { total: number | string }).total ?? 0),
        stakings: Number((remainingStakings as { total: number | string }).total ?? 0),
        sessions: Number((remainingSessions as { total: number | string }).total ?? 0),
      },
    };
  });
}

async function main() {
  try {
    const results: Result[] = [];
    const fixture = await createFixture();
    const adminLoginId = `smoke_staking_admin_${fixture.suffix}`;
    const readerLoginId = `smoke_staking_reader_${fixture.suffix}`;
    let userToken = "";
    let otherUserToken = "";
    let adminToken = "";
    let readerToken = "";
    let pendingCancelledId = "";
    let activeCancelledId = "";
    let rejectedId = "";
    let currentStep = "fixture created";

    try {
    currentStep = "db info";
    const [dbRows] = await pool.query("select database() as db, user() as db_user");
    const dbInfo = (dbRows as Array<{ db: string; db_user: string }>)[0];
    process.stdout.write(`staking_smoke_db=${dbInfo?.db ?? "unknown"} user=${mask(String(dbInfo?.db_user ?? ""))}\n`);

    currentStep = "health";
    await http<{ ok: true }>("/health");
    results.push({ name: "health 확인", ok: true });

    currentStep = "public products";
    const publicProducts = await http<{ staking_products: Array<Record<string, unknown>>; total: number }>(
      `/api/staking-products?page=1&limit=20`
    );
    const activeProduct = publicProducts.staking_products.find((item) => item.id === fixture.activeProductId);
    const inactiveProduct = publicProducts.staking_products.find((item) => item.id === fixture.inactiveProductId);
    results.push({
      name: "상품 목록 조회",
      ok: Boolean(activeProduct) && !inactiveProduct && publicProducts.total >= 1,
    });

    currentStep = "user login";
    const userLogin = await http<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: fixture.userLoginId,
        password: fixture.password,
      }),
    });
    userToken = userLogin.access_token;
    results.push({
      name: "User 로그인 성공",
      ok: userLogin.account.id === fixture.userId,
    });

    currentStep = "other user login";
    const otherUserLogin = await http<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: fixture.otherUserLoginId,
        password: fixture.password,
      }),
    });
    otherUserToken = otherUserLogin.access_token;
    results.push({
      name: "다른 User 로그인 성공",
      ok: otherUserLogin.account.id === fixture.otherUserId,
    });

    currentStep = "admin login";
    const adminLogin = await http<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: adminLoginId,
        password: "AdminSmokePass!123",
      }),
    });
    adminToken = adminLogin.access_token;
    results.push({
      name: "ADMIN 로그인 성공",
      ok: adminLogin.account.id === fixture.adminId,
    });

    currentStep = "reader login";
    const readerLogin = await http<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: readerLoginId,
        password: "ReaderSmokePass!123",
      }),
    });
    readerToken = readerLogin.access_token;
    results.push({
      name: "READER 로그인 성공",
      ok: readerLogin.account.id === fixture.readerId,
    });

    currentStep = "create pending";
    const createPending = await http<{ staking: any }>("/api/me/stakings", {
      method: "POST",
      accessToken: userToken,
      body: JSON.stringify({
        staking_product_id: fixture.activeProductId,
        principal_amount_base: "1000",
        idempotency_key: `create-same-${fixture.suffix}`,
      }),
    });
    pendingCancelledId = createPending.staking.id;
    results.push({
      name: "정상 신청 PENDING",
      ok:
        createPending.staking.status === "PENDING" &&
        createPending.staking.principal_amount_base === "1000" &&
        typeof createPending.staking.principal_amount_base === "string",
    });

    currentStep = "create pending replay";
    const createPendingReplay = await http<{ staking: any }>("/api/me/stakings", {
      method: "POST",
      accessToken: userToken,
      body: JSON.stringify({
        staking_product_id: fixture.activeProductId,
        principal_amount_base: "1000",
        idempotency_key: `create-same-${fixture.suffix}`,
      }),
    });
    results.push({
      name: "동일 idempotency 재요청 동일 결과",
      ok: createPendingReplay.staking.id === pendingCancelledId,
    });

    currentStep = "same key conflict";
    try {
      await http("/api/me/stakings", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          staking_product_id: fixture.activeProductId,
          principal_amount_base: "2000",
          idempotency_key: `create-same-${fixture.suffix}`,
        }),
      });
      results.push({ name: "같은 key 다른 amount 409", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "같은 key 다른 amount 409", ok: apiError.status === 409, message: apiError.message });
    }

    currentStep = "min amount fail";
    try {
      await http("/api/me/stakings", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          staking_product_id: fixture.activeProductId,
          principal_amount_base: "99",
          idempotency_key: `min-fail-${fixture.suffix}`,
        }),
      });
      results.push({ name: "최소 금액 미만 실패", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "최소 금액 미만 실패", ok: apiError.status === 422, message: apiError.message });
    }

    currentStep = "inactive product fail";
    try {
      await http("/api/me/stakings", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          staking_product_id: fixture.inactiveProductId,
          principal_amount_base: "1000",
          idempotency_key: `inactive-fail-${fixture.suffix}`,
        }),
      });
      results.push({ name: "inactive product 실패", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "inactive product 실패", ok: apiError.status === 422, message: apiError.message });
    }

    currentStep = "my staking list";
    const myList = await http<{ items: Array<any>; total: number }>("/api/me/stakings?page=1&limit=20", {
      accessToken: userToken,
    });
    results.push({
      name: "내 목록 조회",
      ok: myList.total >= 1 && myList.items.some((item) => item.id === pendingCancelledId),
    });

    currentStep = "my staking detail";
    const myDetail = await http<{ staking: any }>(`/api/me/stakings/${pendingCancelledId}`, {
      accessToken: userToken,
    });
    results.push({
      name: "내 상세 조회",
      ok: myDetail.staking.id === pendingCancelledId && myDetail.staking.product.id === fixture.activeProductId,
    });

    currentStep = "other user detail blocked";
    try {
      await http(`/api/me/stakings/${pendingCancelledId}`, {
        accessToken: otherUserToken,
      });
      results.push({ name: "다른 회원 상세 접근 차단", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "다른 회원 상세 접근 차단", ok: apiError.status === 404, message: apiError.message });
    }

    currentStep = "user cancel pending";
    const userCancelPending = await http<{ staking: any }>(`/api/me/stakings/${pendingCancelledId}/cancel`, {
      method: "POST",
      accessToken: userToken,
      body: JSON.stringify({
        reason: "pending cancel by smoke",
        idempotency_key: `cancel-pending-${fixture.suffix}`,
      }),
    });
    results.push({
      name: "PENDING user cancel -> CANCELLED",
      ok: userCancelPending.staking.status === "CANCELLED",
    });

    currentStep = "create for activate";
    const createForActivate = await http<{ staking: any }>("/api/me/stakings", {
      method: "POST",
      accessToken: userToken,
      body: JSON.stringify({
        staking_product_id: fixture.activeProductId,
        principal_amount_base: "1500",
        idempotency_key: `activate-${fixture.suffix}`,
      }),
    });
    activeCancelledId = createForActivate.staking.id;

    currentStep = "reader list";
    const readerList = await http<{ items: Array<any>; total: number }>(
      `/api/admin/stakings?page=1&limit=20&account_id=${fixture.userId}`,
      {
        accessToken: readerToken,
      }
    );
    results.push({
      name: "READER 목록 가능",
      ok: readerList.items.some((item) => item.id === activeCancelledId),
    });

    currentStep = "reader detail";
    const readerDetail = await http<{ staking: any }>(`/api/admin/stakings/${activeCancelledId}`, {
      accessToken: readerToken,
    });
    results.push({
      name: "READER 상세 가능",
      ok: readerDetail.staking.id === activeCancelledId,
    });

    currentStep = "reader activate forbidden";
    try {
      await http(`/api/admin/stakings/${activeCancelledId}/activate`, {
        method: "POST",
        accessToken: readerToken,
        body: JSON.stringify({}),
      });
      results.push({ name: "READER activate 실패", ok: false, message: "unexpected success" });
    } catch (error) {
      const apiError = error as ApiFailure;
      results.push({ name: "READER activate 실패", ok: apiError.status === 403, message: apiError.message });
    }

    currentStep = "admin activate";
    const adminActivate = await http<{ staking: any }>(`/api/admin/stakings/${activeCancelledId}/activate`, {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({}),
    });
    results.push({
      name: "ADMIN activate 성공",
      ok:
        adminActivate.staking.status === "ACTIVE" &&
        adminActivate.staking.started_at !== null &&
        adminActivate.staking.matures_at !== null,
    });

    currentStep = "user cancel request";
    const userCancelRequest = await http<{ staking: any }>(`/api/me/stakings/${activeCancelledId}/cancel`, {
      method: "POST",
      accessToken: userToken,
      body: JSON.stringify({
        reason: "active cancel request by smoke",
        idempotency_key: `cancel-active-${fixture.suffix}`,
      }),
    });
    results.push({
      name: "ACTIVE user cancel request -> CANCEL_REQUESTED",
      ok: userCancelRequest.staking.status === "CANCEL_REQUESTED",
    });

    currentStep = "admin cancel";
    const adminCancel = await http<{ staking: any }>(`/api/admin/stakings/${activeCancelledId}/cancel`, {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        reason: "admin final cancel by smoke",
      }),
    });
    results.push({
      name: "ADMIN cancel -> CANCELLED",
      ok: adminCancel.staking.status === "CANCELLED",
    });

    currentStep = "create for reject";
    const createForReject = await http<{ staking: any }>("/api/me/stakings", {
      method: "POST",
      accessToken: userToken,
      body: JSON.stringify({
        staking_product_id: fixture.activeProductId,
        principal_amount_base: "2000",
        idempotency_key: `reject-${fixture.suffix}`,
      }),
    });
    rejectedId = createForReject.staking.id;

    currentStep = "admin reject";
    const adminReject = await http<{ staking: any }>(`/api/admin/stakings/${rejectedId}/reject`, {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        reason: "reject by smoke",
      }),
    });
    results.push({
      name: "reject 흐름",
      ok: adminReject.staking.status === "CANCELLED",
    });

    currentStep = "admin account list";
    const adminAccountList = await http<{ items: Array<any>; total: number }>(
      `/api/admin/accounts/${fixture.userId}/stakings?page=1&limit=20`,
      {
        accessToken: adminToken,
      }
    );
    results.push({
      name: "Admin account별 목록 가능",
      ok: adminAccountList.items.length >= 3,
    });

    currentStep = "ledger verification";
    const [ledgerRows] = await pool.query(
      `select reference_id, event_type from ledger_events
         where reference_id in (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `staking.request:${pendingCancelledId}`,
        `staking.cancel:${pendingCancelledId}`,
        `staking.request:${activeCancelledId}`,
        `staking.lock:${activeCancelledId}`,
        `staking.activate:${activeCancelledId}`,
        `staking.cancel:${activeCancelledId}`,
        `staking.release:${activeCancelledId}`,
        `staking.request:${rejectedId}`,
        `staking.cancel:${rejectedId}`,
      ]
    );
    const ledgerList = ledgerRows as Array<{ reference_id: string; event_type: string }>;
    results.push({
      name: "ledger event 생성",
      ok:
        ledgerList.some((row) => row.reference_id === `staking.request:${pendingCancelledId}` && row.event_type === "STAKING_REQUESTED") &&
        ledgerList.some((row) => row.reference_id === `staking.lock:${activeCancelledId}` && row.event_type === "STAKING_PRINCIPAL_LOCKED") &&
        ledgerList.some((row) => row.reference_id === `staking.release:${activeCancelledId}` && row.event_type === "STAKING_PRINCIPAL_RELEASED"),
    });

    currentStep = "audit verification";
    const [auditRows] = await pool.query(
      `select action from admin_audit_log where actor_account_id in (?, ?, ?) order by created_at asc`,
      [fixture.userId, fixture.readerId, fixture.adminId]
    );
    const auditActions = (auditRows as Array<{ action: string }>).map((row) => row.action);
    results.push({
      name: "audit log 생성",
      ok:
        auditActions.includes("USER_STAKING_REQUEST") &&
        auditActions.includes("USER_STAKING_CANCEL_REQUEST") &&
        auditActions.includes("ADMIN_STAKING_ACTIVATE") &&
        auditActions.includes("ADMIN_STAKING_REJECT") &&
        auditActions.includes("ADMIN_STAKING_CANCEL"),
    });

    results.push({
      name: "amount가 string",
      ok:
        typeof createPending.staking.principal_amount_base === "string" &&
        typeof createPending.staking.daily_interest_bps_snapshot === "string",
    });

    results.push({
      name: "민감정보 비포함",
      ok:
        !containsSensitiveKey(createPending, "password_hash") &&
        !containsSensitiveKey(createPending, "session_token_hash") &&
        !containsSensitiveKey(createPending, "access_token"),
    });
    } catch (error) {
      const apiError = error as Partial<ApiFailure>;
      const details =
        typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
      process.stderr.write(
        `account staking smoke failed at step=${currentStep}: ${String(apiError.message ?? error)}${
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
  process.stderr.write(`account staking smoke failed: ${message}\n`);
  process.exitCode = 1;
});
