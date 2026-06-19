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

type ApiFailure = {
  status: number;
  message: string;
  details: unknown;
};

type Fixture = {
  suffix: string;
  adminId: string;
  readerId: string;
  userId: string;
  otherUserId: string;
  policyId: string;
  productId: string;
  dailyStakingId: string;
  userLoginId: string;
  otherUserLoginId: string;
  password: string;
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

type PreviewResponse = {
  withdrawal_type: "DAILY_REWARD" | "BONUS";
  requested_amount_base: string;
  fee_amount_base: string;
  net_amount_base: string;
  available_amount_base: string;
  allocations: Array<{
    reward_id: string;
    allocated_amount_base: string;
    holding_days: number;
    fee_schedule_days: number;
    fee_rate_bps: string;
    fee_amount_base: string;
    net_amount_base: string;
  }>;
  preview_only: true;
};

type WithdrawalDetail = {
  id: string;
  account_id: string;
  withdrawal_type: "DAILY_REWARD" | "BONUS";
  requested_amount_base: string;
  fee_amount_base: string;
  net_amount_base: string;
  fee_mode_snapshot: string;
  status: string;
  idempotency_key: string;
  wallet_address: string | null;
  network: string | null;
  tx_hash: string | null;
  reject_reason: string | null;
  failure_reason: string | null;
  account?: {
    id: string;
    login_id: string | null;
    display_name: string | null;
    status: string | null;
  };
  allocation_summary: {
    allocation_count: number;
    reserved_amount_base: string;
    consumed_amount_base: string;
    released_amount_base: string;
  };
  allocations: Array<{
    id: number;
    reward_id: string;
    allocated_amount_base: string;
    fee_amount_base: string;
    net_amount_base: string;
    fee_schedule_days_snapshot: number;
    fee_rate_snapshot: string;
    holding_days_snapshot: number;
    status: string;
    reward: {
      id: string;
      reward_type: string;
      reward_date: string;
      amount_base: string;
      status: string;
    };
  }>;
  ledger_events?: Array<{
    id: string;
    event_type: string;
    amount_base: string;
    reference_id: string;
  }>;
  audit_logs?: Array<{
    id: string;
    actor_account_id: string;
    action: string;
  }>;
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
    userId: randomUUID(),
    otherUserId: randomUUID(),
    policyId: randomUUID(),
    productId: randomUUID(),
    dailyStakingId: randomUUID(),
    userLoginId: `smoke_withdrawal_user_${suffix}`,
    otherUserLoginId: `smoke_withdrawal_other_${suffix}`,
    password: "SmokeWithdraw!123"
  };

  const createdAt = new Date("2026-06-10T00:00:00.000Z");
  const adminPasswordHash = await hashPassword("AdminWithdraw!123");
  const readerPasswordHash = await hashPassword("ReaderWithdraw!123");
  const userPasswordHash = await hashPassword(fixture.password);
  const otherUserPasswordHash = await hashPassword(fixture.password);

  await withTx(pool, async (conn) => {
    const [activePolicyRows] = await conn.query(`select count(*) as total from policy_versions where status = 'ACTIVE'`);
    const hasActivePolicy = Number((activePolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0) > 0;
    const policyStatus = hasActivePolicy ? "DRAFT" : "ACTIVE";

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
        `smoke_withdrawal_admin_${suffix}`,
        adminPasswordHash,
        `Smoke Withdrawal Admin ${suffix}`,
        `SWA${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.readerId,
        `smoke_withdrawal_reader_${suffix}`,
        readerPasswordHash,
        `Smoke Withdrawal Reader ${suffix}`,
        `SWR${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.userId,
        fixture.userLoginId,
        userPasswordHash,
        `Smoke Withdrawal User ${suffix}`,
        `SWU${suffix.toUpperCase()}`,
        createdAt,
        createdAt,
        fixture.otherUserId,
        fixture.otherUserLoginId,
        otherUserPasswordHash,
        `Smoke Withdrawal Other ${suffix}`,
        `SWO${suffix.toUpperCase()}`,
        createdAt,
        createdAt
      ]
    );

    await conn.query(
      `insert into policy_versions (id, status, note, created_by, created_at, activated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [
        fixture.policyId,
        policyStatus,
        `withdrawal smoke ${suffix}`,
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
        ) values (?, ?, ?, 'BJC', 18, '1', '999999999999999999', 30, '50', 1)`,
      [fixture.productId, fixture.policyId, `Smoke Withdrawal Product ${suffix}`]
    );

    await conn.query(
      `insert into withdrawal_fee_rules (
          id,
          policy_version_id,
          withdrawal_source_type,
          schedule_days,
          fee_bps,
          fee_mode,
          is_active
        ) values
        (?, ?, 'DAILY_REWARD', 1,  '2000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'DAILY_REWARD', 7,  '1000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'DAILY_REWARD', 15, '600',  'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'DAILY_REWARD', 30, '300',  'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS',        30, '3000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS',        60, '2000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS',        90, '1000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS',       180, '0',    'DEDUCT_FROM_WITHDRAWAL', 1)`,
      [
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId,
        randomUUID(),
        fixture.policyId
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
        ) values (?, ?, ?, ?, '1000000000000000000', '50', 30, 'ACTIVE', ?, '2026-05-20 00:00:00.000000', '2026-06-19 00:00:00.000000', '2026-05-20 00:00:00.000000', ?, ?)`,
      [
        fixture.dailyStakingId,
        fixture.userId,
        fixture.productId,
        fixture.policyId,
        `withdrawal-staking-${suffix}`,
        createdAt,
        createdAt
      ]
    );

    await conn.query(
      `insert into account_rewards (
          id,
          account_id,
          account_staking_id,
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
        (?, ?, ?, ?, null, 'DAILY_REWARD',    '2026-05-20', '700000',  'CONFIRMED', ?, null, null, '2026-05-20 00:00:00.000000', '2026-05-20 00:00:00.000000', null, cast(? as json), ?, ?),
        (?, ?, ?, ?, null, 'DAILY_REWARD',    '2026-06-12', '800000',  'CONFIRMED', ?, null, null, '2026-06-12 00:00:00.000000', '2026-06-12 00:00:00.000000', null, cast(? as json), ?, ?),
        (?, ?, ?, ?, null, 'DAILY_REWARD',    '2026-06-18', '1000000', 'CONFIRMED', ?, null, null, '2026-06-18 00:00:00.000000', '2026-06-18 00:00:00.000000', null, cast(? as json), ?, ?),
        (?, ?, null, ?, null, 'RANK_BONUS',   '2026-04-10', '400000',  'CONFIRMED', ?, null, null, '2026-04-10 00:00:00.000000', '2026-04-10 00:00:00.000000', null, cast(? as json), ?, ?),
        (?, ?, null, ?, null, 'DIRECT_REFERRAL','2026-05-10','600000', 'CONFIRMED', ?, null, null, '2026-05-10 00:00:00.000000', '2026-05-10 00:00:00.000000', null, cast(? as json), ?, ?)`,
      [
        randomUUID(),
        fixture.userId,
        fixture.dailyStakingId,
        fixture.policyId,
        `withdrawal.smoke.daily.old:${suffix}`,
        JSON.stringify({ principal_amount_base: "1000000000000000000" }),
        createdAt,
        createdAt,
        randomUUID(),
        fixture.userId,
        fixture.dailyStakingId,
        fixture.policyId,
        `withdrawal.smoke.daily.mid:${suffix}`,
        JSON.stringify({ principal_amount_base: "1000000000000000000" }),
        createdAt,
        createdAt,
        randomUUID(),
        fixture.userId,
        fixture.dailyStakingId,
        fixture.policyId,
        `withdrawal.smoke.daily.new:${suffix}`,
        JSON.stringify({ principal_amount_base: "1000000000000000000" }),
        createdAt,
        createdAt,
        randomUUID(),
        fixture.userId,
        fixture.policyId,
        `withdrawal.smoke.bonus.rank:${suffix}`,
        JSON.stringify({ reason: "rank bonus smoke" }),
        createdAt,
        createdAt,
        randomUUID(),
        fixture.userId,
        fixture.policyId,
        `withdrawal.smoke.bonus.direct:${suffix}`,
        JSON.stringify({ reason: "direct referral smoke" }),
        createdAt,
        createdAt
      ]
    );
  });

  return fixture;
}

async function cleanupFixture(fixture: Fixture): Promise<{ remaining: Record<string, number> }> {
  return withTx(pool, async (conn) => {
    const accountIds = [fixture.adminId, fixture.readerId, fixture.userId, fixture.otherUserId];

    const [withdrawalRows] = await conn.query(
      `select id from reward_withdrawals where fee_policy_version_id = ? or account_id in (?, ?, ?, ?)`,
      [fixture.policyId, ...accountIds]
    );
    const withdrawalIds = (withdrawalRows as Array<{ id: string }>).map((row) => row.id);

    if (withdrawalIds.length > 0) {
      const placeholders = withdrawalIds.map(() => "?").join(", ");
      await conn.query(
        `delete from reward_withdrawal_allocations where withdrawal_id in (${placeholders})`,
        withdrawalIds
      );
      await conn.query(`delete from reward_withdrawals where id in (${placeholders})`, withdrawalIds);
    }

    await conn.query(
      `delete from ledger_events where policy_version_id = ? or account_id in (?, ?, ?, ?)`,
      [fixture.policyId, ...accountIds]
    );

    const [rewardRows] = await conn.query(`select id from account_rewards where policy_version_id = ?`, [fixture.policyId]);
    const rewardIds = (rewardRows as Array<{ id: string }>).map((row) => row.id);
    if (rewardIds.length > 0) {
      const placeholders = rewardIds.map(() => "?").join(", ");
      await conn.query(
        `delete from account_rewards where reward_type = 'REVERSAL' and id in (${placeholders})`,
        rewardIds
      );
      await conn.query(`delete from account_rewards where id in (${placeholders})`, rewardIds);
    }

    await conn.query(`delete from admin_audit_log where actor_account_id in (?, ?, ?, ?)`, accountIds);
    await conn.query(`delete from auth_sessions where account_id in (?, ?, ?, ?)`, accountIds);
    await conn.query(`delete from account_stakings where id = ?`, [fixture.dailyStakingId]);
    await conn.query(`delete from withdrawal_fee_rules where policy_version_id = ?`, [fixture.policyId]);
    await conn.query(`delete from staking_products where id = ?`, [fixture.productId]);
    await conn.query(`delete from policy_versions where id = ?`, [fixture.policyId]);
    await conn.query(`delete from accounts where id in (?, ?, ?, ?)`, accountIds);

    const [remainingWithdrawalRows] = await conn.query(
      `select count(*) as total from reward_withdrawals where fee_policy_version_id = ?`,
      [fixture.policyId]
    );
    const [remainingAllocationRows] = await conn.query(
      `select count(*) as total
         from reward_withdrawal_allocations
        where withdrawal_id in (select id from reward_withdrawals where fee_policy_version_id = ?)`,
      [fixture.policyId]
    );
    const [remainingLedgerRows] = await conn.query(
      `select count(*) as total from ledger_events where policy_version_id = ? or account_id in (?, ?, ?, ?)`,
      [fixture.policyId, ...accountIds]
    );
    const [remainingRewardRows] = await conn.query(
      `select count(*) as total from account_rewards where policy_version_id = ?`,
      [fixture.policyId]
    );
    const [remainingAuditRows] = await conn.query(
      `select count(*) as total from admin_audit_log where actor_account_id in (?, ?, ?, ?)`,
      accountIds
    );
    const [remainingSessionRows] = await conn.query(
      `select count(*) as total from auth_sessions where account_id in (?, ?, ?, ?)`,
      accountIds
    );
    const [remainingStakingRows] = await conn.query(`select count(*) as total from account_stakings where id = ?`, [
      fixture.dailyStakingId
    ]);
    const [remainingFeeRuleRows] = await conn.query(
      `select count(*) as total from withdrawal_fee_rules where policy_version_id = ?`,
      [fixture.policyId]
    );
    const [remainingProductRows] = await conn.query(`select count(*) as total from staking_products where id = ?`, [
      fixture.productId
    ]);
    const [remainingPolicyRows] = await conn.query(`select count(*) as total from policy_versions where id = ?`, [
      fixture.policyId
    ]);
    const [remainingAccountRows] = await conn.query(`select count(*) as total from accounts where id in (?, ?, ?, ?)`, accountIds);

    return {
      remaining: {
        withdrawals: Number((remainingWithdrawalRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        allocations: Number((remainingAllocationRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        ledger_events: Number((remainingLedgerRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        rewards: Number((remainingRewardRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        audit_logs: Number((remainingAuditRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        sessions: Number((remainingSessionRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        stakings: Number((remainingStakingRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        fee_rules: Number((remainingFeeRuleRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        products: Number((remainingProductRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        policies: Number((remainingPolicyRows as Array<{ total: number | string }>)[0]?.total ?? 0),
        accounts: Number((remainingAccountRows as Array<{ total: number | string }>)[0]?.total ?? 0)
      }
    };
  });
}

async function main() {
  try {
    const results: Result[] = [];
    const fixture = await createFixture();
    let userToken = "";
    let otherUserToken = "";
    let currentStep = "fixture created";

    try {
      currentStep = "health";
      await requestJson<{ ok: true }>("/health");
      results.push({ name: "health 확인", ok: true });

      currentStep = "user login";
      const userLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login_id: fixture.userLoginId,
          password: fixture.password
        })
      });
      userToken = userLogin.payload.access_token;
      results.push({ name: "User 로그인 성공", ok: userLogin.payload.account.id === fixture.userId });

      currentStep = "other user login";
      const otherUserLogin = await requestJson<{ access_token: string; account: { id: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login_id: fixture.otherUserLoginId,
          password: fixture.password
        })
      });
      otherUserToken = otherUserLogin.payload.access_token;
      results.push({ name: "다른 User 로그인 성공", ok: otherUserLogin.payload.account.id === fixture.otherUserId });

      currentStep = "initial balance";
      const initialBalance = await requestJson<WithdrawalBalanceResponse>("/api/me/withdrawal-balance", {
        accessToken: userToken
      });
      results.push({
        name: "초기 withdrawal balance DAILY/BONUS",
        ok:
          initialBalance.payload.daily_reward.confirmed_amount_base === "2500000" &&
          initialBalance.payload.daily_reward.available_amount_base === "2500000" &&
          initialBalance.payload.bonus.confirmed_amount_base === "1000000" &&
          initialBalance.payload.bonus.available_amount_base === "1000000" &&
          initialBalance.payload.total.reserved_amount_base === "0" &&
          initialBalance.payload.total.completed_amount_base === "0"
      });

      currentStep = "preview";
      const preview = await requestJson<PreviewResponse>("/api/me/withdrawal-preview", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          withdrawal_type: "DAILY_REWARD",
          requested_amount_base: "1200000"
        })
      });
      results.push({
        name: "preview FIFO/fee 계산",
        ok:
          preview.payload.preview_only === true &&
          preview.payload.available_amount_base === "2500000" &&
          preview.payload.fee_amount_base === "71000" &&
          preview.payload.net_amount_base === "1129000" &&
          preview.payload.allocations.length === 2 &&
          preview.payload.allocations[0]?.allocated_amount_base === "700000" &&
          preview.payload.allocations[0]?.fee_rate_bps === "300" &&
          preview.payload.allocations[1]?.allocated_amount_base === "500000" &&
          preview.payload.allocations[1]?.fee_rate_bps === "1000"
      });

      currentStep = "create main withdrawal";
      const mainCreate = await requestJson<{ withdrawal: WithdrawalDetail }>("/api/me/withdrawals", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          withdrawal_type: "DAILY_REWARD",
          requested_amount_base: "1200000",
          idempotency_key: `main-${fixture.suffix}`,
          wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
          network: "BASE"
        })
      });
      const mainWithdrawalId = mainCreate.payload.withdrawal.id;
      results.push({
        name: "출금 신청 REQUESTED 생성",
        ok:
          mainCreate.status === 201 &&
          mainCreate.payload.withdrawal.status === "REQUESTED" &&
          mainCreate.payload.withdrawal.requested_amount_base === "1200000" &&
          mainCreate.payload.withdrawal.fee_amount_base === "71000" &&
          mainCreate.payload.withdrawal.net_amount_base === "1129000" &&
          mainCreate.payload.withdrawal.allocation_summary.reserved_amount_base === "1200000" &&
          mainCreate.payload.withdrawal.allocations.length === 2
      });

      const [mainAllocationRows] = await pool.query(
        `select status, cast(sum(allocated_amount_base) as char) as total
           from reward_withdrawal_allocations
          where withdrawal_id = ?
          group by status`,
        [mainWithdrawalId]
      );
      const mainAllocation = (mainAllocationRows as Array<{ status: string; total: string }>)[0];
      results.push({
        name: "allocations RESERVED 확인",
        ok: mainAllocation?.status === "RESERVED" && mainAllocation.total === "1200000"
      });

      currentStep = "idempotent replay";
      const replay = await requestJson<{ withdrawal: WithdrawalDetail }>("/api/me/withdrawals", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          withdrawal_type: "DAILY_REWARD",
          requested_amount_base: "1200000",
          idempotency_key: `main-${fixture.suffix}`,
          wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
          network: "BASE"
        })
      });
      results.push({
        name: "같은 idempotency 동일 응답",
        ok: replay.status === 200 && replay.payload.withdrawal.id === mainWithdrawalId
      });

      currentStep = "idempotency conflict";
      try {
        await requestJson("/api/me/withdrawals", {
          method: "POST",
          accessToken: userToken,
          body: JSON.stringify({
            withdrawal_type: "DAILY_REWARD",
            requested_amount_base: "1300000",
            idempotency_key: `main-${fixture.suffix}`,
            wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
            network: "BASE"
          })
        });
        results.push({ name: "같은 key 다른 amount 409", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "같은 key 다른 amount 409", ok: apiError.status === 409, message: apiError.message });
      }

      currentStep = "insufficient balance";
      try {
        await requestJson("/api/me/withdrawal-preview", {
          method: "POST",
          accessToken: userToken,
          body: JSON.stringify({
            withdrawal_type: "DAILY_REWARD",
            requested_amount_base: "999999999"
          })
        });
        results.push({ name: "잔액 초과 실패", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "잔액 초과 실패", ok: apiError.status === 409, message: apiError.message });
      }

      currentStep = "other user detail blocked";
      try {
        await requestJson(`/api/me/withdrawals/${mainWithdrawalId}`, { accessToken: otherUserToken });
        results.push({ name: "다른 사용자 상세 404", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "다른 사용자 상세 404", ok: apiError.status === 404, message: apiError.message });
      }

      currentStep = "cancel flow";
      const cancelCreate = await requestJson<{ withdrawal: WithdrawalDetail }>("/api/me/withdrawals", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          withdrawal_type: "BONUS",
          requested_amount_base: "300000",
          idempotency_key: `cancel-${fixture.suffix}`,
          wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          network: "BASE"
        })
      });
      const cancelWithdrawalId = cancelCreate.payload.withdrawal.id;
      const cancelResult = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/me/withdrawals/${cancelWithdrawalId}/cancel`,
        {
          method: "POST",
          accessToken: userToken
        }
      );
      results.push({
        name: "User cancel -> CANCELLED",
        ok:
          cancelResult.payload.withdrawal.status === "CANCELLED" &&
          cancelResult.payload.withdrawal.allocation_summary.released_amount_base === "300000"
      });

      const [cancelAllocationRows] = await pool.query(
        `select status, cast(sum(allocated_amount_base) as char) as total
           from reward_withdrawal_allocations
          where withdrawal_id = ?
          group by status`,
        [cancelWithdrawalId]
      );
      const cancelAllocation = (cancelAllocationRows as Array<{ status: string; total: string }>)[0];
      results.push({
        name: "cancel 후 allocations RELEASED",
        ok: cancelAllocation?.status === "RELEASED" && cancelAllocation.total === "300000"
      });

      currentStep = "reader list/detail";
      const readerList = await requestJson<{ items: WithdrawalDetail[]; total: number }>(
        `/api/admin/withdrawals?page=1&limit=20&q=${encodeURIComponent(fixture.userLoginId)}`,
        { actorId: fixture.readerId }
      );
      const readerDetail = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/admin/withdrawals/${mainWithdrawalId}`,
        { actorId: fixture.readerId }
      );
      results.push({
        name: "READER 목록/상세 가능",
        ok:
          readerList.payload.total >= 2 &&
          readerList.payload.items.every((item) => item.account?.id === fixture.userId) &&
          readerList.payload.items.every((item) => item.wallet_address === null || item.wallet_address.includes("****")) &&
          readerDetail.payload.withdrawal.id === mainWithdrawalId &&
          Array.isArray(readerDetail.payload.withdrawal.ledger_events) &&
          Array.isArray(readerDetail.payload.withdrawal.audit_logs)
      });

      currentStep = "reader forbidden transition";
      try {
        await requestJson(`/api/admin/withdrawals/${mainWithdrawalId}/approve`, {
          method: "POST",
          actorId: fixture.readerId
        });
        results.push({ name: "READER 상태 변경 403", ok: false, message: "unexpected success" });
      } catch (error) {
        const apiError = error as ApiFailure;
        results.push({ name: "READER 상태 변경 403", ok: apiError.status === 403, message: apiError.message });
      }

      currentStep = "admin approve";
      const approved = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/admin/withdrawals/${mainWithdrawalId}/approve`,
        {
          method: "POST",
          actorId: fixture.adminId
        }
      );
      results.push({
        name: "ADMIN approve",
        ok: approved.payload.withdrawal.status === "APPROVED"
      });

      currentStep = "admin processing";
      const processing = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/admin/withdrawals/${mainWithdrawalId}/processing`,
        {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({ network: "BASE" })
        }
      );
      results.push({
        name: "ADMIN processing",
        ok: processing.payload.withdrawal.status === "PROCESSING"
      });

      currentStep = "admin complete";
      const completed = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/admin/withdrawals/${mainWithdrawalId}/complete`,
        {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({
            tx_hash: `0xcomplete${fixture.suffix}`,
            network: "BASE"
          })
        }
      );
      results.push({
        name: "ADMIN complete",
        ok:
          completed.payload.withdrawal.status === "COMPLETED" &&
          completed.payload.withdrawal.tx_hash === `0xcomplete${fixture.suffix}` &&
          completed.payload.withdrawal.network === "BASE"
      });

      const [completedAllocationRows] = await pool.query(
        `select status, cast(sum(allocated_amount_base) as char) as total
           from reward_withdrawal_allocations
          where withdrawal_id = ?
          group by status`,
        [mainWithdrawalId]
      );
      const completedAllocation = (completedAllocationRows as Array<{ status: string; total: string }>)[0];
      results.push({
        name: "allocation CONSUMED",
        ok: completedAllocation?.status === "CONSUMED" && completedAllocation.total === "1200000"
      });

      const [completeLedgerRows] = await pool.query(
        `select event_type, amount_base, reference_id
           from ledger_events
          where reference_id in (?, ?)
          order by reference_id asc`,
        [`withdrawal.complete:${mainWithdrawalId}`, `withdrawal.fee:${mainWithdrawalId}`]
      );
      const completeLedger = completeLedgerRows as Array<{ event_type: string; amount_base: string; reference_id: string }>;
      results.push({
        name: "completed/fee ledger 생성",
        ok:
          completeLedger.length === 2 &&
          completeLedger.some(
            (row) => row.reference_id === `withdrawal.complete:${mainWithdrawalId}` && row.event_type === "WITHDRAWAL_COMPLETED" && row.amount_base === "1129000"
          ) &&
          completeLedger.some(
            (row) => row.reference_id === `withdrawal.fee:${mainWithdrawalId}` && row.event_type === "WITHDRAWAL_FEE_CHARGED" && row.amount_base === "71000"
          )
      });

      currentStep = "reject flow";
      const rejectCreate = await requestJson<{ withdrawal: WithdrawalDetail }>("/api/me/withdrawals", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          withdrawal_type: "BONUS",
          requested_amount_base: "400000",
          idempotency_key: `reject-${fixture.suffix}`,
          wallet_address: "0x9999999999999999999999999999999999999999",
          network: "BASE"
        })
      });
      const rejectWithdrawalId = rejectCreate.payload.withdrawal.id;
      const rejected = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/admin/withdrawals/${rejectWithdrawalId}/reject`,
        {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({ reason: "manual reject smoke" })
        }
      );
      results.push({
        name: "별도 요청 reject",
        ok:
          rejected.payload.withdrawal.status === "REJECTED" &&
          rejected.payload.withdrawal.reject_reason === "manual reject smoke"
      });

      currentStep = "fail flow";
      const failCreate = await requestJson<{ withdrawal: WithdrawalDetail }>("/api/me/withdrawals", {
        method: "POST",
        accessToken: userToken,
        body: JSON.stringify({
          withdrawal_type: "DAILY_REWARD",
          requested_amount_base: "500000",
          idempotency_key: `fail-${fixture.suffix}`,
          wallet_address: "0x7777777777777777777777777777777777777777",
          network: "BASE"
        })
      });
      const failWithdrawalId = failCreate.payload.withdrawal.id;
      await requestJson(`/api/admin/withdrawals/${failWithdrawalId}/approve`, {
        method: "POST",
        actorId: fixture.adminId
      });
      await requestJson(`/api/admin/withdrawals/${failWithdrawalId}/processing`, {
        method: "POST",
        actorId: fixture.adminId,
        body: JSON.stringify({ network: "BASE" })
      });
      const failed = await requestJson<{ withdrawal: WithdrawalDetail }>(
        `/api/admin/withdrawals/${failWithdrawalId}/fail`,
        {
          method: "POST",
          actorId: fixture.adminId,
          body: JSON.stringify({ reason: "chain fail smoke" })
        }
      );
      results.push({
        name: "별도 요청 fail",
        ok:
          failed.payload.withdrawal.status === "FAILED" &&
          failed.payload.withdrawal.failure_reason === "chain fail smoke"
      });

      currentStep = "user list/detail";
      const myWithdrawals = await requestJson<{ items: WithdrawalDetail[]; total: number }>(
        `/api/me/withdrawals?page=1&limit=20&sort=requested_at_desc`,
        {
          accessToken: userToken
        }
      );
      const myMainDetail = await requestJson<{ withdrawal: WithdrawalDetail }>(`/api/me/withdrawals/${mainWithdrawalId}`, {
        accessToken: userToken
      });
      results.push({
        name: "User 목록/상세",
        ok:
          myWithdrawals.payload.total === 4 &&
          myWithdrawals.payload.items.every((item) => item.account_id === fixture.userId) &&
          myMainDetail.payload.withdrawal.id === mainWithdrawalId &&
          !("audit_logs" in myMainDetail.payload.withdrawal) &&
          !("ledger_events" in myMainDetail.payload.withdrawal)
      });

      currentStep = "admin account list";
      const adminAccountList = await requestJson<{ account: { id: string }; items: WithdrawalDetail[]; total: number }>(
        `/api/admin/accounts/${fixture.userId}/withdrawals?page=1&limit=20&sort=requested_at_desc`,
        {
          actorId: fixture.readerId
        }
      );
      results.push({
        name: "Admin 회원별 출금 목록",
        ok: adminAccountList.payload.account.id === fixture.userId && adminAccountList.payload.total === 4
      });

      currentStep = "summary";
      const summary = await requestJson<{
        requested_amount_base: string;
        approved_amount_base: string;
        processing_amount_base: string;
        completed_amount_base: string;
        rejected_amount_base: string;
        failed_amount_base: string;
        cancelled_amount_base: string;
        fee_amount_base: string;
        net_completed_amount_base: string;
        requested_count: number;
        completed_count: number;
      }>("/api/admin/reports/withdrawal-summary", {
        actorId: fixture.readerId
      });
      results.push({
        name: "withdrawal summary",
        ok:
          summary.payload.requested_amount_base === "0" &&
          summary.payload.approved_amount_base === "0" &&
          summary.payload.processing_amount_base === "0" &&
          summary.payload.completed_amount_base === "1200000" &&
          summary.payload.rejected_amount_base === "400000" &&
          summary.payload.failed_amount_base === "500000" &&
          summary.payload.cancelled_amount_base === "300000" &&
          summary.payload.fee_amount_base === "281000" &&
          summary.payload.net_completed_amount_base === "1129000" &&
          summary.payload.requested_count === 4 &&
          summary.payload.completed_count === 1
      });

      currentStep = "final balance";
      const finalBalance = await requestJson<WithdrawalBalanceResponse>("/api/me/withdrawal-balance", {
        accessToken: userToken
      });
      results.push({
        name: "최종 balance completed/released 반영",
        ok:
          finalBalance.payload.daily_reward.available_amount_base === "1300000" &&
          finalBalance.payload.daily_reward.completed_amount_base === "1200000" &&
          finalBalance.payload.daily_reward.reserved_amount_base === "0" &&
          finalBalance.payload.bonus.available_amount_base === "1000000" &&
          finalBalance.payload.bonus.reserved_amount_base === "0"
      });

      currentStep = "reward summary enhancement";
      const rewardSummary = await requestJson<{
        pending_reward_amount_base: string;
        confirmed_reward_amount_base: string;
        withdrawable_reward_amount_base: string;
        withdrawn_reward_amount_base: string;
      }>("/api/me/rewards/summary", { accessToken: userToken });
      results.push({
        name: "reward summary 보강",
        ok:
          rewardSummary.payload.confirmed_reward_amount_base === "3500000" &&
          rewardSummary.payload.withdrawable_reward_amount_base === "2300000" &&
          rewardSummary.payload.withdrawn_reward_amount_base === "1200000"
      });

      currentStep = "audit verification";
      const [auditRows] = await pool.query(
        `select action
           from admin_audit_log
          where actor_account_id in (?, ?, ?, ?)
          order by created_at asc`,
        [fixture.userId, fixture.adminId, fixture.readerId, fixture.otherUserId]
      );
      const auditActions = (auditRows as Array<{ action: string }>).map((row) => row.action);
      results.push({
        name: "audit event 생성",
        ok:
          auditActions.includes("USER_WITHDRAWAL_CREATE") &&
          auditActions.includes("USER_WITHDRAWAL_CANCEL") &&
          auditActions.includes("ADMIN_WITHDRAWAL_APPROVE") &&
          auditActions.includes("ADMIN_WITHDRAWAL_PROCESSING") &&
          auditActions.includes("ADMIN_WITHDRAWAL_COMPLETE") &&
          auditActions.includes("ADMIN_WITHDRAWAL_REJECT") &&
          auditActions.includes("ADMIN_WITHDRAWAL_FAIL")
      });

      results.push({
        name: "amount string 및 민감정보 비포함",
        ok:
          typeof initialBalance.payload.daily_reward.available_amount_base === "string" &&
          typeof preview.payload.fee_amount_base === "string" &&
          typeof myMainDetail.payload.withdrawal.requested_amount_base === "string" &&
          !containsSensitiveKey(myMainDetail.payload, "password_hash") &&
          !containsSensitiveKey(myMainDetail.payload, "session_token_hash") &&
          !containsSensitiveKey(myMainDetail.payload, "access_token")
      });
    } catch (error) {
      const apiError = error as Partial<ApiFailure>;
      const details =
        typeof apiError.details === "string" ? apiError.details : JSON.stringify(apiError.details ?? null);
      process.stderr.write(
        `reward withdrawal smoke failed at step=${currentStep}: ${String(apiError.message ?? error)}${
          apiError.status ? ` (status=${apiError.status})` : ""
        } details=${details}\n`
      );
      throw error;
    } finally {
      const cleanup = await cleanupFixture(fixture);
      results.push({
        name: "cleanup 후 관련 row 0",
        ok: Object.values(cleanup.remaining).every((value) => value === 0),
        message: JSON.stringify(cleanup.remaining)
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
  process.stderr.write(`reward withdrawal smoke failed: ${message}\n`);
  process.exitCode = 1;
});
