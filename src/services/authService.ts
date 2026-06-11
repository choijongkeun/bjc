import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { conflictError, notFound, unauthorized, validationError, forbidden } from "../domain/errors.js";
import {
  getAccountAuthById,
  getAccountByLoginId,
  getAccountByLoginIdForUpdate,
  getAccountByReferralCode,
  getAccountByReferralCodeForUpdate,
  insertAccount,
  updateAccountLoginSuccess,
  type AccountAuthRow,
  type BinaryPosition
} from "../repos/accountsRepo.js";
import { insertAdminAuditLog } from "../repos/auditLogRepo.js";
import { insertAuthSession } from "../repos/authSessionsRepo.js";
import { insertBinaryEdges } from "../repos/binaryEdgesRepo.js";
import { insertBinaryNode } from "../repos/binaryNodesRepo.js";
import { insertReferralEdges, listReferralAncestorsByChild } from "../repos/referralRepo.js";
import { generateReferralCode } from "../util/referralCode.js";
import { createSessionToken, hashSessionToken } from "../util/sessionToken.js";
import { newId } from "../util/ids.js";
import { hashPassword, verifyPassword } from "../util/passwordHash.js";
import { findBinaryPlacement, getBinaryAncestorRowsForPlacement } from "./binaryPlacementService.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

function isMysqlDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ER_DUP_ENTRY";
}

function appendTreePath(path: string | null, nextId: string, fallbackPrefix: string): string {
  const base = path && path.length > 0 ? path : fallbackPrefix;
  return base.endsWith("/") ? `${base}${nextId}/` : `${base}/${nextId}/`;
}

async function generateUniqueReferralCodeWithinTx(conn: DbConn): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const referralCode = generateReferralCode();
    const existing = await getAccountByReferralCode(conn, referralCode);
    if (!existing) return referralCode;
  }

  throw conflictError("failed to generate unique referral code");
}

function toAuthAccountResponse(account: AccountAuthRow) {
  return {
    id: account.id,
    login_id: account.login_id,
    display_name: account.display_name,
    role: account.role,
    status: account.status,
    referral_code: account.referral_code,
    sponsor_account_id: account.sponsor_account_id,
    binary_parent_account_id: account.binary_parent_account_id,
    binary_position: account.binary_position,
    joined_at: account.joined_at,
    last_login_at: account.last_login_at
  };
}

export class AuthService {
  constructor(private readonly pool: DbPool) {}

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  async resolveReferralCode(input: { referral_code: string }) {
    return this.withConnection(async (conn) => {
      const sponsor = await getAccountByReferralCode(conn, input.referral_code);
      if (!sponsor) {
        throw notFound("referral code not found", { referral_code: input.referral_code });
      }
      if (sponsor.status !== "ACTIVE") {
        throw validationError("referral sponsor is not active", {
          referral_code: input.referral_code,
          sponsor_account_id: sponsor.id,
          sponsor_status: sponsor.status
        });
      }

      return {
        referral_code_valid: true,
        sponsor_account_id: sponsor.id,
        sponsor_login_id: sponsor.login_id ?? sponsor.id,
        sponsor_display_name: sponsor.display_name ?? sponsor.login_id ?? sponsor.id
      };
    });
  }

  async register(input: {
    login_id: string;
    password: string;
    display_name: string;
    referral_code: string;
    preferred_binary_position?: BinaryPosition | null;
    user_agent?: string | null;
    ip_address?: string | null;
  }) {
    return withTx(this.pool, async (conn) => {
      const existing = await getAccountByLoginIdForUpdate(conn, input.login_id);
      if (existing) {
        throw conflictError("login_id already exists", { login_id: input.login_id });
      }

      const sponsor = await getAccountByReferralCodeForUpdate(conn, input.referral_code);
      if (!sponsor) {
        throw notFound("referral code not found", { referral_code: input.referral_code });
      }
      if (sponsor.status !== "ACTIVE") {
        throw validationError("referral sponsor is not active", {
          referral_code: input.referral_code,
          sponsor_account_id: sponsor.id,
          sponsor_status: sponsor.status
        });
      }

      const placement = await findBinaryPlacement(conn, {
        sponsor_account_id: sponsor.id,
        preferred_binary_position: input.preferred_binary_position ?? null
      });

      const now = new Date();
      const id = newId();
      const password_hash = await hashPassword(input.password);
      const referral_code = await generateUniqueReferralCodeWithinTx(conn);
      const parentAncestors = await getBinaryAncestorRowsForPlacement(conn, placement.parent_account_id);
      const sponsorAncestors = await listReferralAncestorsByChild(conn, sponsor.id);
      const access_token = createSessionToken();
      const session_token_hash = hashSessionToken(access_token);
      const expires_at = new Date(Date.now() + SESSION_TTL_MS);

      try {
        await insertAccount(conn, {
          id,
          login_id: input.login_id,
          password_hash,
          display_name: input.display_name,
          role: "USER",
          status: "ACTIVE",
          referral_code,
          sponsor_account_id: sponsor.id,
          binary_parent_account_id: placement.parent_account_id,
          binary_position: placement.position,
          joined_at: now,
          last_login_at: now,
          updated_at: now
        });

        await insertReferralEdges(conn, [
          {
            parent_account_id: sponsor.id,
            child_account_id: id,
            depth: 1,
            path: `/${sponsor.id}/${id}/`
          },
          ...sponsorAncestors.map((ancestor) => ({
            parent_account_id: ancestor.parent_account_id,
            child_account_id: id,
            depth: ancestor.depth + 1,
            path: appendTreePath(ancestor.path, id, `/${ancestor.parent_account_id}/${sponsor.id}/`)
          }))
        ]);

        await insertBinaryNode(conn, {
          account_id: id,
          parent_account_id: placement.parent_account_id,
          position: placement.position,
          root_account_id: placement.root_account_id,
          updated_at: now
        });

        await insertBinaryEdges(conn, [
          {
            ancestor_account_id: id,
            descendant_account_id: id,
            depth: 0,
            root_leg: null,
            path: `/${id}/`
          },
          ...parentAncestors.map((ancestor) => ({
            ancestor_account_id: ancestor.ancestor_account_id,
            descendant_account_id: id,
            depth: ancestor.depth + 1,
            root_leg: ancestor.depth === 0 ? placement.position : ancestor.root_leg ?? placement.position,
            path: appendTreePath(
              ancestor.path,
              id,
              `/${ancestor.ancestor_account_id}/${placement.parent_account_id}/`
            )
          }))
        ]);

        await insertAuthSession(conn, {
          account_id: id,
          session_token_hash,
          expires_at,
          last_seen_at: now,
          user_agent: input.user_agent ?? null,
          ip_address: input.ip_address ?? null
        });

        await insertAdminAuditLog(conn, {
          actor_account_id: id,
          action: "AUTH_REGISTER",
          target_table: "accounts",
          target_id: id,
          meta: {
            login_id: input.login_id,
            sponsor_account_id: sponsor.id,
            binary_parent_account_id: placement.parent_account_id,
            binary_position: placement.position
          }
        });
        await insertAdminAuditLog(conn, {
          actor_account_id: id,
          action: "BINARY_AUTO_PLACEMENT",
          target_table: "binary_nodes",
          target_id: id,
          meta: {
            sponsor_account_id: sponsor.id,
            parent_account_id: placement.parent_account_id,
            position: placement.position,
            root_account_id: placement.root_account_id
          }
        });
      } catch (err) {
        if (isMysqlDuplicateKeyError(err)) {
          throw conflictError("registration conflict", { login_id: input.login_id });
        }
        throw err;
      }

      const created = await getAccountAuthById(conn, id);
      if (!created) {
        throw notFound("registered account not found after insert", { account_id: id });
      }

      return {
        access_token,
        account: toAuthAccountResponse(created)
      };
    });
  }

  async login(input: { login_id: string; password: string; user_agent?: string | null; ip_address?: string | null }) {
    return withTx(this.pool, async (conn) => {
      const account = await getAccountByLoginIdForUpdate(conn, input.login_id);
      if (!account || !account.password_hash) {
        throw unauthorized("invalid login or password");
      }
      if (account.status !== "ACTIVE") {
        throw forbidden("account is not active", { account_id: account.id, status: account.status });
      }

      const ok = await verifyPassword(input.password, account.password_hash);
      if (!ok) {
        throw unauthorized("invalid login or password");
      }

      const now = new Date();
      const access_token = createSessionToken();
      const session_token_hash = hashSessionToken(access_token);
      const expires_at = new Date(Date.now() + SESSION_TTL_MS);

      await updateAccountLoginSuccess(conn, {
        id: account.id,
        last_login_at: now,
        updated_at: now
      });
      await insertAuthSession(conn, {
        account_id: account.id,
        session_token_hash,
        expires_at,
        last_seen_at: now,
        user_agent: input.user_agent ?? null,
        ip_address: input.ip_address ?? null
      });
      await insertAdminAuditLog(conn, {
        actor_account_id: account.id,
        action: "AUTH_LOGIN",
        target_table: "accounts",
        target_id: account.id,
        meta: { login_id: account.login_id }
      });

      const updated = await getAccountByLoginId(conn, input.login_id);
      if (!updated) {
        throw notFound("account not found after login", { login_id: input.login_id });
      }

      return {
        access_token,
        account: toAuthAccountResponse(updated)
      };
    });
  }
}
