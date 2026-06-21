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
  memberId: string;
  policyId: string;
  sidecarEventId: string;
  withdrawalLedgerId: string;
  calculationDate: string;
};

type SidecarBatchResponse = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  zero_base_skip_count: number;
  ineligible_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_requested_amount_base: string;
  total_release_amount_base: string;
  total_freeze_amount_base: string;
  sidecar_status: string;
  status: string;
};

type SidecarSingleResponse = {
  calc_run_id: string;
  status: string;
  result_type: string;
  target_count: number;
  created_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  zero_base_skip_count: number;
  total_requested_amount_base: string;
  total_release_amount_base: string;
  total_freeze_amount_base: string;
  sidecar_status: string;
};

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
  return { status: response.status, payload: payload as T };
}

async function requestText(path: string, accessToken?: string): Promise<string> {
  const baseUrl = resolveSmokeBaseUrl(process.env);
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const payload = await response.text();
  if (!response.ok) {
    throw {
      status: response.status,
      message: response.statusText,
      details: payload
    } satisfies ApiFailure;
  }
  return payload;
}

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const fixture: Fixture = {
    suffix,
    adminId: randomUUID(),
    readerId: randomUUID(),
    memberId: randomUUID(),
    policyId: randomUUID(),
    sidecarEventId: randomUUID(),
    withdrawalLedgerId: randomUUID(),
    calculationDate: "2026-06-30"
  };

  const createdAt = new Date("2026-06-20T00:00:00.000Z");
  const adminPasswordHash = await hashPassword("AdminSidecar!123");
  const readerPasswordHash = await hashPassword("ReaderSidecar!123");
  const userPasswordHash = await hashPassword("MemberSidecar!123");

  await withTx(pool, async (conn) => {
    const [activePolicyRows] = await conn.query(`select count(*) as total from policy_versions where status = 'ACTIVE'`);
    const hasActivePolicy = Number((activePolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0;
    const policyStatus = hasActivePolicy ? "DRAFT" : "ACTIVE";

    const accountSql = `insert into accounts (
        id, login_id, password_hash, display_name, role, status, referral_code, sponsor_account_id, joined_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await conn.query(accountSql, [
      fixture.adminId,
      `smoke_sidecar_admin_${suffix}`,
      adminPasswordHash,
      `Smoke Sidecar Admin ${suffix}`,
      "ADMIN",
      "ACTIVE",
      `SSA${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.readerId,
      `smoke_sidecar_reader_${suffix}`,
      readerPasswordHash,
      `Smoke Sidecar Reader ${suffix}`,
      "READER",
      "ACTIVE",
      `SSR${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);
    await conn.query(accountSql, [
      fixture.memberId,
      `smoke_sidecar_member_${suffix}`,
      userPasswordHash,
      `Smoke Sidecar Member ${suffix}`,
      "USER",
      "ACTIVE",
      `SSM${suffix.toUpperCase()}`,
      null,
      createdAt,
      createdAt
    ]);

    await conn.query(
      `insert into policy_versions (id, status, note, created_by, created_at, activated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [
        fixture.policyId,
        policyStatus,
        `sidecar smoke ${suffix}`,
        fixture.adminId,
        createdAt,
        policyStatus === "ACTIVE" ? createdAt : null
      ]
    );

    await conn.query(
      `insert into sidecar_events (
          id,
          policy_version_id,
          status,
          trigger_reason,
          freeze_bps,
          release_bps,
          triggered_at,
          released_at,
          created_by,
          created_at
        ) values (?, ?, 'SIDECAR_ACTIVE', 'smoke test', 3000, 7000, ?, null, ?, ?)`,
      [fixture.sidecarEventId, fixture.policyId, createdAt, fixture.adminId, createdAt]
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
        ) values (?, ?, null, null, ?, null, '2026-06-30 05:00:00', 'WITHDRAWAL_REQUEST', '1000', 0, 'BJC', ?, '{}', ?)`,
      [
        fixture.withdrawalLedgerId,
        fixture.memberId,
        fixture.policyId,
        `smoke:sidecar:withdrawal:${suffix}`,
        fixture.adminId
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<Record<string, number>> {
  return withTx(pool, async (conn) => {
    const accountIds = [fixture.adminId, fixture.readerId, fixture.memberId];
    const [calcRows] = await conn.query(`select id from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    const calcRunIds = (calcRows as Array<{ id: string }>).map((row) => row.id);

    if (calcRunIds.length > 0) {
      const placeholders = calcRunIds.map(() => "?").join(", ");
      await conn.query(`delete from settlement_items where calc_run_id in (${placeholders})`, calcRunIds);
    }
    await conn.query(`delete from ledger_events where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from calc_runs where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from sidecar_events where id = ?`, [fixture.sidecarEventId]);
    await conn.query(`delete from admin_audit_log where actor_account_id in (?, ?, ?)`, accountIds);
    await conn.query(`delete from auth_sessions where account_id in (?, ?, ?)`, accountIds);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(`delete from accounts where id in (?, ?, ?)`, accountIds);

    const count = async (sql: string, params: unknown[]) => {
      const [rows] = await conn.query(sql, params);
      return Number((rows as Array<{ total: number | string }>)[0]?.total ?? 0);
    };

    return {
      fixture_ledger_events: await count(`select count(*) as total from ledger_events where policy_version_id = ?`, [fixture.policyId]),
      fixture_calc_runs: await count(`select count(*) as total from calc_runs where policy_version_id = ?`, [fixture.policyId]),
      fixture_sidecar_events: await count(`select count(*) as total from sidecar_events where id = ?`, [fixture.sidecarEventId]),
      fixture_accounts: await count(`select count(*) as total from accounts where id in (?, ?, ?)`, accountIds),
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
  const adminLoginId = `smoke_sidecar_admin_${fixture.suffix}`;
  const readerLoginId = `smoke_sidecar_reader_${fixture.suffix}`;
  let adminToken = "";
  let readerToken = "";
  let calcRunId = "";
  let step = "fixture";

  try {
    step = "health";
    await requestJson<{ ok: true }>("/health");
    results.push({ name: "health 확인", ok: true });

    const adminLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: adminLoginId,
        password: "AdminSidecar!123",
      }),
    });
    adminToken = adminLogin.payload.access_token;
    results.push({ name: "ADMIN 로그인 성공", ok: adminLogin.payload.account.id === fixture.adminId });

    const readerLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        login_id: readerLoginId,
        password: "ReaderSidecar!123",
      }),
    });
    readerToken = readerLogin.payload.access_token;
    results.push({ name: "READER 로그인 성공", ok: readerLogin.payload.account.id === fixture.readerId });

    step = "reader forbidden";
    try {
      await requestJson("/api/admin/rewards/sidecar/run", {
        method: "POST",
        accessToken: readerToken,
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
    const batch = await requestJson<SidecarBatchResponse>("/api/admin/rewards/sidecar/run", {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.calculationDate
      })
    });
    calcRunId = batch.payload.calc_run_id;
    results.push({
      name: "ADMIN SIDECAR batch 실행",
      ok:
        batch.payload.status === "SUCCEEDED" &&
        batch.payload.target_count === 1 &&
        batch.payload.created_count === 1 &&
        batch.payload.zero_base_skip_count === 0 &&
        batch.payload.ineligible_skip_count === 0 &&
        batch.payload.duplicate_skip_count === 0 &&
        batch.payload.conflict_count === 0 &&
        batch.payload.failed_count === 0 &&
        batch.payload.total_requested_amount_base === "1000" &&
        batch.payload.total_release_amount_base === "700" &&
        batch.payload.total_freeze_amount_base === "300" &&
        batch.payload.sidecar_status === "SIDECAR_ACTIVE",
      message: JSON.stringify(batch.payload)
    });

    const releaseReference = `calc:SIDECAR:${fixture.calculationDate}:${calcRunId}:release:smoke:sidecar:withdrawal:${fixture.suffix}`;
    const freezeReference = `calc:SIDECAR:${fixture.calculationDate}:${calcRunId}:freeze:smoke:sidecar:withdrawal:${fixture.suffix}`;
    const [ledgerRows] = await pool.query(
      `select event_type, amount_base, product_id, reference_id
         from ledger_events
        where reference_id in (?, ?)
        order by reference_id asc`,
      [freezeReference, releaseReference]
    );
    const ledgers = ledgerRows as Array<{
      event_type: string;
      amount_base: string;
      product_id: string | null;
      reference_id: string;
    }>;
    results.push({
      name: "release/freeze ledger 생성",
      ok:
        ledgers.length === 2 &&
        ledgers.some((row) => row.event_type === "WITHDRAWAL_RELEASE" && row.amount_base === "700" && row.product_id === null) &&
        ledgers.some((row) => row.event_type === "WITHDRAWAL_FREEZE" && row.amount_base === "300" && row.product_id === null),
      message: JSON.stringify(ledgers)
    });

    step = "single duplicate";
    const single = await requestJson<SidecarSingleResponse>(`/api/admin/accounts/${fixture.memberId}/sidecar`, {
      method: "POST",
      accessToken: adminToken,
      body: JSON.stringify({
        policy_version_id: fixture.policyId,
        calculation_date: fixture.calculationDate
      })
    });
    results.push({
      name: "동일 회원 단건 실행 duplicate",
      ok:
        single.payload.calc_run_id === calcRunId &&
        single.payload.result_type === "duplicate" &&
        single.payload.total_release_amount_base === "700" &&
        single.payload.total_freeze_amount_base === "300",
      message: JSON.stringify(single.payload)
    });

    const calcRunSummary = await requestJson<SidecarBatchResponse>(`/api/admin/calc-runs/${calcRunId}/summary`, {
      accessToken: adminToken
    });
    results.push({
      name: "calc_run summary",
      ok:
        calcRunSummary.payload.calc_run_id === calcRunId &&
        calcRunSummary.payload.created_count === 1 &&
        calcRunSummary.payload.total_requested_amount_base === "1000",
      message: JSON.stringify(calcRunSummary.payload)
    });

    const calcRunReport = await requestJson<{ items: Array<{ run_type: string; succeeded_run_count: string }> }>(
      `/api/admin/reports/calc-run-summary?policy_version_id=${fixture.policyId}&run_type=SIDECAR`,
      { accessToken: adminToken }
    );
    results.push({
      name: "calc-run report",
      ok:
        calcRunReport.payload.items.length === 1 &&
        calcRunReport.payload.items[0]?.run_type === "SIDECAR" &&
        calcRunReport.payload.items[0]?.succeeded_run_count === "1",
      message: JSON.stringify(calcRunReport.payload)
    });

    const calcRunsCsv = await requestText(
      `/api/admin/reports/calc-runs.csv?policy_version_id=${fixture.policyId}&run_type=SIDECAR`,
      adminToken
    );
    results.push({
      name: "calc-runs.csv",
      ok: calcRunsCsv.includes("SIDECAR") && calcRunsCsv.includes(calcRunId),
      message: calcRunsCsv
    });

    const adminRewards = await requestJson<{ total: number }>(
      `/api/admin/rewards?page=1&limit=20&reward_type=SIDECAR`,
      { accessToken: adminToken }
    );
    results.push({
      name: "SIDECAR는 reward row 미생성",
      ok: adminRewards.payload.total === 0,
      message: JSON.stringify(adminRewards.payload)
    });
  } catch (error) {
    const apiError = error as Partial<ApiFailure>;
    const details = typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
    process.stderr.write(
      `sidecar smoke failed at step=${step}: ${String(apiError.message ?? error)}${apiError.status ? ` (status=${apiError.status})` : ""} details=${details}\n`
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
  process.stderr.write(`sidecar smoke failed: ${message}\n`);
  process.exitCode = 1;
});
