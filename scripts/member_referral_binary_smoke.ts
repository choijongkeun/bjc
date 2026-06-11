import "dotenv/config";

import { randomUUID } from "node:crypto";

import { pool } from "../src/db/pool.js";
import { withTx } from "../src/db/tx.js";
import { AppError } from "../src/domain/errors.js";
import { extractBearerToken } from "../src/http/sessionAuth.js";
import { AuthService } from "../src/services/authService.js";
import { hashPassword } from "../src/util/passwordHash.js";
import { hashSessionToken } from "../src/util/sessionToken.js";

type Result = {
  name: string;
  ok: boolean;
  message?: string;
};

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

async function main() {
  const authService = new AuthService(pool);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const sponsorId = randomUUID();
  let registeredUserId: string | null = null;

  const sponsorLoginId = `smoke_member_sponsor_${suffix}`;
  const sponsorReferralCode = `SMK${suffix.toUpperCase()}`;
  const sponsorDisplayName = `Smoke Sponsor ${suffix}`;
  const userLoginId = `smoke_member_user_${suffix}`;
  const userDisplayName = `Smoke User ${suffix}`;
  const plainPassword = "Password123";
  const results: Result[] = [];
  let registerToken = "";
  let loginToken = "";

  const [dbRows] = await pool.query("select database() as db, user() as db_user");
  const dbInfo = (dbRows as Array<{ db: string; db_user: string }>)[0];
  process.stdout.write(`smoke_db=${dbInfo?.db ?? "unknown"} user=${mask(String(dbInfo?.db_user ?? ""))}\n`);

  try {
    const sponsorPasswordHash = await hashPassword("SponsorPassword123");

    await withTx(pool, async (conn) => {
      await conn.query(
        `insert into accounts (
            id,
            login_id,
            password_hash,
            display_name,
            role,
            status,
            referral_code,
            joined_at,
            updated_at
          ) values (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?)`,
        [sponsorId, sponsorLoginId, sponsorPasswordHash, sponsorDisplayName, sponsorReferralCode, new Date(), new Date()]
      );
    });

    try {
      const resolved = await authService.resolveReferralCode({ referral_code: sponsorReferralCode });
      results.push({
        name: "referral resolve 성공",
        ok:
          resolved.referral_code_valid === true &&
          resolved.sponsor_account_id === sponsorId &&
          resolved.sponsor_login_id === sponsorLoginId
      });
    } catch (err: any) {
      results.push({ name: "referral resolve 성공", ok: false, message: err?.message });
    }

    try {
      const registered = await authService.register({
        login_id: userLoginId,
        password: plainPassword,
        display_name: userDisplayName,
        referral_code: sponsorReferralCode,
        preferred_binary_position: "LEFT",
        user_agent: "member-referral-smoke",
        ip_address: "127.0.0.1"
      });
      registerToken = registered.access_token;
      registeredUserId = registered.account.id;
      results.push({
        name: "register 성공",
        ok:
          registered.account.login_id === userLoginId &&
          registered.account.sponsor_account_id === sponsorId &&
          registered.account.binary_position === "LEFT"
      });
    } catch (err: any) {
      results.push({ name: "register 성공", ok: false, message: err?.message });
    }

    try {
      await authService.register({
        login_id: userLoginId,
        password: plainPassword,
        display_name: userDisplayName,
        referral_code: sponsorReferralCode,
        preferred_binary_position: "LEFT"
      });
      results.push({ name: "duplicate login_id 실패", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "duplicate login_id 실패",
        ok: err instanceof AppError ? err.status === 409 : false,
        message: err?.message
      });
    }

    try {
      const loggedIn = await authService.login({
        login_id: userLoginId,
        password: plainPassword,
        user_agent: "member-referral-smoke-login",
        ip_address: "127.0.0.1"
      });
      loginToken = loggedIn.access_token;
      results.push({
        name: "login 성공",
        ok: loggedIn.account.id === registeredUserId && loggedIn.account.login_id === userLoginId
      });
    } catch (err: any) {
      results.push({ name: "login 성공", ok: false, message: err?.message });
    }

    try {
      const me = await authService.getMe({ access_token: registerToken });
      results.push({
        name: "register token auth/me 성공",
        ok: me.account.id === registeredUserId && me.account.login_id === userLoginId
      });
    } catch (err: any) {
      results.push({ name: "register token auth/me 성공", ok: false, message: err?.message });
    }

    try {
      const me = await authService.getMe({ access_token: loginToken });
      results.push({
        name: "login token auth/me 성공",
        ok: me.account.id === registeredUserId && me.account.login_id === userLoginId
      });
    } catch (err: any) {
      results.push({ name: "login token auth/me 성공", ok: false, message: err?.message });
    }

    try {
      await authService.login({
        login_id: userLoginId,
        password: "WrongPassword123",
        user_agent: "member-referral-smoke-login",
        ip_address: "127.0.0.1"
      });
      results.push({ name: "wrong password 실패", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "wrong password 실패",
        ok: err instanceof AppError ? err.status === 401 : false,
        message: err?.message
      });
    }

    try {
      extractBearerToken(undefined);
      results.push({ name: "Authorization header 없음 실패", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "Authorization header 없음 실패",
        ok: err instanceof AppError ? err.status === 401 : false,
        message: err?.message
      });
    }

    try {
      await authService.getMe({ access_token: "invalid-smoke-token" });
      results.push({ name: "잘못된 token auth/me 실패", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "잘못된 token auth/me 실패",
        ok: err instanceof AppError ? err.status === 401 : false,
        message: err?.message
      });
    }

    try {
      await authService.logout({ access_token: loginToken });
      results.push({ name: "logout 성공", ok: true });
    } catch (err: any) {
      results.push({ name: "logout 성공", ok: false, message: err?.message });
    }

    try {
      await authService.getMe({ access_token: loginToken });
      results.push({ name: "logout 이후 auth/me 실패", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "logout 이후 auth/me 실패",
        ok: err instanceof AppError ? err.status === 401 : false,
        message: err?.message
      });
    }

    if (registeredUserId && registerToken && loginToken) {
      const [accountRows] = await pool.query(
        `select sponsor_account_id, binary_parent_account_id, binary_position, password_hash
           from accounts
          where id = ?`,
        [registeredUserId]
      );
      const account = (accountRows as Array<{
        sponsor_account_id: string | null;
        binary_parent_account_id: string | null;
        binary_position: string | null;
        password_hash: string | null;
      }>)[0];

      results.push({
        name: "password_hash plain 저장 금지",
        ok: !!account?.password_hash && account.password_hash !== plainPassword
      });
      results.push({
        name: "accounts sponsor/binary 저장 확인",
        ok:
          account?.sponsor_account_id === sponsorId &&
          account.binary_parent_account_id === sponsorId &&
          account.binary_position === "LEFT"
      });

      const [referralRows] = await pool.query(
        "select count(*) as total from referral_edges where parent_account_id = ? and child_account_id = ? and depth = 1",
        [sponsorId, registeredUserId]
      );
      results.push({
        name: "referral_edges 생성 확인",
        ok: Number((referralRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 1
      });

      const [binarySponsorRows] = await pool.query(
        "select count(*) as total from binary_nodes where account_id = ? and parent_account_id is null",
        [sponsorId]
      );
      results.push({
        name: "sponsor binary root 생성 확인",
        ok: Number((binarySponsorRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 1
      });

      const [binaryUserRows] = await pool.query(
        "select parent_account_id, position from binary_nodes where account_id = ?",
        [registeredUserId]
      );
      const binaryNode = (binaryUserRows as Array<{ parent_account_id: string | null; position: string | null }>)[0];
      results.push({
        name: "binary_nodes 생성 확인",
        ok: binaryNode?.parent_account_id === sponsorId && binaryNode?.position === "LEFT"
      });

      const [sessionRows] = await pool.query(
        "select count(*) as total from auth_sessions where account_id = ? and session_token_hash in (?, ?)",
        [registeredUserId, hashSessionToken(registerToken), hashSessionToken(loginToken)]
      );
      results.push({
        name: "auth_sessions token hash 생성 확인",
        ok: Number((sessionRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 2
      });

      const [revokedRows] = await pool.query(
        "select count(*) as total from auth_sessions where account_id = ? and session_token_hash = ? and revoked_at is not null",
        [registeredUserId, hashSessionToken(loginToken)]
      );
      results.push({
        name: "auth_sessions revoke 처리 확인",
        ok: Number((revokedRows as Array<{ total: number | string }>)[0]?.total ?? 0) === 1
      });
    }
  } finally {
    const ids = [sponsorId, registeredUserId].filter((value): value is string => Boolean(value));
    if (ids.length > 0) {
      const placeholders = ids.map(() => "?").join(", ");
      await withTx(pool, async (conn) => {
        await conn.query(
          `delete from admin_audit_log
            where actor_account_id in (${placeholders}) or target_id in (${placeholders})`,
          [...ids, ...ids]
        );
        await conn.query(`delete from auth_sessions where account_id in (${placeholders})`, ids);
        await conn.query(
          `delete from binary_edges
            where ancestor_account_id in (${placeholders}) or descendant_account_id in (${placeholders})`,
          [...ids, ...ids]
        );
        await conn.query(`delete from binary_nodes where account_id in (${placeholders})`, ids);
        await conn.query(
          `delete from referral_edges
            where parent_account_id in (${placeholders}) or child_account_id in (${placeholders})`,
          [...ids, ...ids]
        );
        await conn.query(
          `update accounts
              set sponsor_account_id = null,
                  binary_parent_account_id = null,
                  binary_position = null
            where id in (${placeholders})`,
          ids
        );
        await conn.query(`delete from accounts where id in (${placeholders})`, ids);
      });
    }
    await pool.end();
  }

  let failed = false;
  for (const result of results) {
    process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.message ? ` :: ${result.message}` : ""}\n`);
    if (!result.ok) failed = true;
  }

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`member_referral_binary_smoke_failed: ${String(err instanceof Error ? err.message : err)}\n`);
  process.exitCode = 1;
});
