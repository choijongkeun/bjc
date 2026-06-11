import "dotenv/config";

import { randomUUID } from "node:crypto";

import { pool } from "../src/db/pool.js";
import { withTx } from "../src/db/tx.js";
import { AppError } from "../src/domain/errors.js";
import { extractBearerToken } from "../src/http/sessionAuth.js";
import { AdminAccountService } from "../src/services/adminAccountService.js";
import { AuthService } from "../src/services/authService.js";
import { NetworkService } from "../src/services/networkService.js";
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

async function main() {
  const authService = new AuthService(pool);
  const networkService = new NetworkService(pool);
  const adminAccountService = new AdminAccountService(pool);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const adminId = randomUUID();
  const readerId = randomUUID();
  const sponsorId = randomUUID();
  let registeredUserId: string | null = null;
  let childUserId: string | null = null;

  const adminLoginId = `smoke_member_admin_${suffix}`;
  const readerLoginId = `smoke_member_reader_${suffix}`;
  const sponsorLoginId = `smoke_member_sponsor_${suffix}`;
  const adminReferralCode = `ADM${suffix.toUpperCase()}`;
  const readerReferralCode = `RDR${suffix.toUpperCase()}`;
  const sponsorReferralCode = `SMK${suffix.toUpperCase()}`;
  const sponsorDisplayName = `Smoke Sponsor ${suffix}`;
  const userLoginId = `smoke_member_user_${suffix}`;
  const userDisplayName = `Smoke User ${suffix}`;
  const childLoginId = `smoke_member_child_${suffix}`;
  const childDisplayName = `Smoke Child ${suffix}`;
  const plainPassword = "Password123";
  const results: Result[] = [];
  let registerToken = "";
  let loginToken = "";
  let userReferralCode = "";

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
      await conn.query(
        `insert into accounts (
            id,
            login_id,
            display_name,
            role,
            status,
            referral_code,
            joined_at,
            updated_at
          ) values (?, ?, ?, 'ADMIN', 'ACTIVE', ?, ?, ?)`,
        [adminId, adminLoginId, `Smoke Admin ${suffix}`, adminReferralCode, new Date(), new Date()]
      );
      await conn.query(
        `insert into accounts (
            id,
            login_id,
            display_name,
            role,
            status,
            referral_code,
            joined_at,
            updated_at
          ) values (?, ?, ?, 'READER', 'ACTIVE', ?, ?, ?)`,
        [readerId, readerLoginId, `Smoke Reader ${suffix}`, readerReferralCode, new Date(), new Date()]
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
      userReferralCode = registered.account.referral_code ?? "";
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
      const child = await authService.register({
        login_id: childLoginId,
        password: plainPassword,
        display_name: childDisplayName,
        referral_code: userReferralCode,
        preferred_binary_position: "LEFT",
        user_agent: "member-referral-smoke-child",
        ip_address: "127.0.0.1"
      });
      childUserId = child.account.id;
      results.push({
        name: "child register 성공",
        ok:
          child.account.login_id === childLoginId &&
          child.account.sponsor_account_id === registeredUserId &&
          child.account.binary_parent_account_id === registeredUserId &&
          child.account.binary_position === "LEFT"
      });
    } catch (err: any) {
      results.push({ name: "child register 성공", ok: false, message: err?.message });
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
      const sessionAccount = await authService.authenticateAccessToken(registerToken);
      const tree = await networkService.getReferralTree({ account_id: sessionAccount.id, depth: 3 });
      results.push({
        name: "referral-tree 성공",
        ok:
          tree.root.account_id === registeredUserId &&
          tree.children.length === 1 &&
          tree.children[0]?.account_id === childUserId &&
          tree.children[0]?.depth === 1
      });
      results.push({
        name: "referral-tree 민감정보 비포함",
        ok: !containsSensitiveKey(tree, "password_hash") && !containsSensitiveKey(tree, "session_token_hash")
      });
    } catch (err: any) {
      results.push({ name: "referral-tree 성공", ok: false, message: err?.message });
    }

    try {
      const sessionAccount = await authService.authenticateAccessToken(registerToken);
      const tree = await networkService.getBinaryTree({ account_id: sessionAccount.id, depth: 3 });
      results.push({
        name: "binary-tree 성공",
        ok:
          tree.root.account_id === registeredUserId &&
          tree.root.children.length === 1 &&
          tree.root.children[0]?.account_id === childUserId &&
          tree.root.children[0]?.binary_position === "LEFT"
      });
      results.push({
        name: "binary-tree 민감정보 비포함",
        ok: !containsSensitiveKey(tree, "password_hash") && !containsSensitiveKey(tree, "session_token_hash")
      });
    } catch (err: any) {
      results.push({ name: "binary-tree 성공", ok: false, message: err?.message });
    }

    try {
      const sessionAccount = await authService.authenticateAccessToken(registerToken);
      const legs = await networkService.getBinaryLegs({ account_id: sessionAccount.id });
      results.push({
        name: "binary-legs 성공",
        ok:
          legs.left.member_count === 1 &&
          legs.right.member_count === 0 &&
          legs.weak_leg === "LEFT" &&
          legs.weak_leg_volume_base === "0"
      });
    } catch (err: any) {
      results.push({ name: "binary-legs 성공", ok: false, message: err?.message });
    }

    try {
      const sessionAccount = await authService.authenticateAccessToken(registerToken);
      const downlines = await networkService.listDownlines({
        account_id: sessionAccount.id,
        type: "referral",
        depth: 3,
        page: 1,
        limit: 50
      });
      results.push({
        name: "downlines referral 성공",
        ok:
          downlines.total === 1 &&
          downlines.items.length === 1 &&
          downlines.items[0]?.account_id === childUserId &&
          downlines.items[0]?.root_leg === null
      });
      results.push({
        name: "downlines referral 민감정보 비포함",
        ok: !containsSensitiveKey(downlines, "password_hash") && !containsSensitiveKey(downlines, "session_token_hash")
      });
    } catch (err: any) {
      results.push({ name: "downlines referral 성공", ok: false, message: err?.message });
    }

    try {
      const sessionAccount = await authService.authenticateAccessToken(registerToken);
      const downlines = await networkService.listDownlines({
        account_id: sessionAccount.id,
        type: "binary",
        depth: 3,
        page: 1,
        limit: 50
      });
      results.push({
        name: "downlines binary 성공",
        ok:
          downlines.total === 1 &&
          downlines.items.length === 1 &&
          downlines.items[0]?.account_id === childUserId &&
          downlines.items[0]?.root_leg === "LEFT"
      });
      results.push({
        name: "downlines binary 민감정보 비포함",
        ok: !containsSensitiveKey(downlines, "password_hash") && !containsSensitiveKey(downlines, "session_token_hash")
      });
    } catch (err: any) {
      results.push({ name: "downlines binary 성공", ok: false, message: err?.message });
    }

    try {
      const adminAccounts = await adminAccountService.listAccounts({
        actor_account_id: adminId,
        q: userLoginId,
        role: "USER",
        page: 1,
        limit: 20,
        sort: "joined_at_desc"
      });
      results.push({
        name: "ADMIN actor admin/accounts 성공",
        ok:
          adminAccounts.total >= 1 &&
          adminAccounts.items.some((item) => item.id === registeredUserId && item.login_id === userLoginId)
      });
      results.push({
        name: "ADMIN accounts 민감정보 비포함",
        ok: !containsSensitiveKey(adminAccounts, "password_hash") && !containsSensitiveKey(adminAccounts, "session_token_hash")
      });
    } catch (err: any) {
      results.push({ name: "ADMIN actor admin/accounts 성공", ok: false, message: err?.message });
    }

    try {
      const readerAccounts = await adminAccountService.listAccounts({
        actor_account_id: readerId,
        q: userLoginId,
        role: "USER",
        page: 1,
        limit: 20,
        sort: "joined_at_desc"
      });
      results.push({
        name: "READER actor admin/accounts 성공",
        ok: readerAccounts.items.some((item) => item.id === registeredUserId)
      });
    } catch (err: any) {
      results.push({ name: "READER actor admin/accounts 성공", ok: false, message: err?.message });
    }

    try {
      await adminAccountService.listAccounts({
        actor_account_id: sponsorId,
        page: 1,
        limit: 20,
        sort: "joined_at_desc"
      });
      results.push({ name: "USER actor admin/accounts 실패", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "USER actor admin/accounts 실패",
        ok: err instanceof AppError ? err.status === 403 : false,
        message: err?.message
      });
    }

    if (registeredUserId) {
      try {
        const detail = await adminAccountService.getAccountDetail({
          actor_account_id: adminId,
          account_id: registeredUserId
        });
        results.push({
          name: "ADMIN actor admin/accounts/:accountId 성공",
          ok:
            detail.account.id === registeredUserId &&
            detail.account.sponsor_account_id === sponsorId &&
            detail.account.sponsor_login_id === sponsorLoginId
        });
        results.push({
          name: "ADMIN detail 민감정보 비포함",
          ok: !containsSensitiveKey(detail, "password_hash") && !containsSensitiveKey(detail, "session_token_hash")
        });
      } catch (err: any) {
        results.push({ name: "ADMIN actor admin/accounts/:accountId 성공", ok: false, message: err?.message });
      }

      try {
        const tree = await adminAccountService.getReferralTree({
          actor_account_id: adminId,
          account_id: registeredUserId,
          depth: 3
        });
        results.push({
          name: "ADMIN actor 특정 회원 referral-tree 성공",
          ok: tree.root.account_id === registeredUserId && tree.children[0]?.account_id === childUserId
        });
      } catch (err: any) {
        results.push({ name: "ADMIN actor 특정 회원 referral-tree 성공", ok: false, message: err?.message });
      }

      try {
        const tree = await adminAccountService.getBinaryTree({
          actor_account_id: adminId,
          account_id: registeredUserId,
          depth: 3
        });
        results.push({
          name: "ADMIN actor 특정 회원 binary-tree 성공",
          ok: tree.root.account_id === registeredUserId && tree.root.children[0]?.account_id === childUserId
        });
      } catch (err: any) {
        results.push({ name: "ADMIN actor 특정 회원 binary-tree 성공", ok: false, message: err?.message });
      }

      try {
        const legs = await adminAccountService.getBinaryLegs({
          actor_account_id: adminId,
          account_id: registeredUserId
        });
        results.push({
          name: "ADMIN actor 특정 회원 binary-legs 성공",
          ok: legs.left.member_count === 1 && legs.right.member_count === 0
        });
      } catch (err: any) {
        results.push({ name: "ADMIN actor 특정 회원 binary-legs 성공", ok: false, message: err?.message });
      }

      try {
        const downlines = await adminAccountService.listDownlines({
          actor_account_id: adminId,
          account_id: registeredUserId,
          type: "binary",
          depth: 3,
          page: 1,
          limit: 50
        });
        results.push({
          name: "ADMIN actor 특정 회원 downlines 성공",
          ok: downlines.total === 1 && downlines.items[0]?.account_id === childUserId
        });
      } catch (err: any) {
        results.push({ name: "ADMIN actor 특정 회원 downlines 성공", ok: false, message: err?.message });
      }
    }

    try {
      await adminAccountService.getAccountDetail({
        actor_account_id: adminId,
        account_id: randomUUID()
      });
      results.push({ name: "존재하지 않는 accountId 404", ok: false, message: "unexpected success" });
    } catch (err: any) {
      results.push({
        name: "존재하지 않는 accountId 404",
        ok: err instanceof AppError ? err.status === 404 : false,
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
    const ids = [adminId, readerId, sponsorId, registeredUserId, childUserId].filter((value): value is string => Boolean(value));
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
