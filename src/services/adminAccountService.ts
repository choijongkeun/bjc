import type { DbConn, DbPool } from "../db/pool.js";

import { withTx } from "../db/tx.js";
import { conflictError, forbidden, notFound } from "../domain/errors.js";
import {
  countAccountsForAdmin,
  getAccountAdminDetailById,
  getAccountByIdForUpdate,
  listAccountsForAdmin,
  updateAccountStatus,
  type AccountRole,
  type AccountStatus,
  type AdminAccountSort,
  type BinaryPosition
} from "../repos/accountsRepo.js";
import { insertAdminAuditLog } from "../repos/auditLogRepo.js";
import { revokeActiveSessionsByAccountId } from "../repos/authSessionsRepo.js";
import { assertRoleAtLeast, requireActor } from "./authz.js";
import { NetworkService } from "./networkService.js";

const ZERO = "0";
const mutableStatusTransitions: Record<AccountStatus, AccountStatus[]> = {
  ACTIVE: ["BLOCKED", "WITHDRAWN"],
  BLOCKED: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: []
};

function withPlaceholderMetrics<T extends Record<string, unknown>>(item: T) {
  return {
    ...item,
    total_stake_amount_base: ZERO,
    total_reward_amount_base: ZERO,
    rank_level: 0
  };
}

export class AdminAccountService {
  private readonly networkService: NetworkService;

  constructor(private readonly pool: DbPool) {
    this.networkService = new NetworkService(pool);
  }

  private async withConnection<T>(fn: (conn: DbConn) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  private async requireAdminReader(conn: DbConn, actor_account_id: string) {
    const actor = await requireActor(conn, actor_account_id);
    assertRoleAtLeast(actor, "READER");
    return actor;
  }

  async listAccounts(input: {
    actor_account_id: string;
    q?: string;
    role?: AccountRole;
    status?: AccountStatus;
    sponsor_account_id?: string;
    binary_parent_account_id?: string;
    binary_position?: BinaryPosition;
    page: number;
    limit: number;
    sort: AdminAccountSort;
  }) {
    return this.withConnection(async (conn) => {
      await this.requireAdminReader(conn, input.actor_account_id);
      const offset = (input.page - 1) * input.limit;
      const total = await countAccountsForAdmin(conn, input);
      const rows = await listAccountsForAdmin(conn, {
        ...input,
        offset
      });

      return {
        items: rows.map((row) =>
          withPlaceholderMetrics({
            id: row.id,
            login_id: row.login_id,
            display_name: row.display_name,
            role: row.role,
            status: row.status,
            referral_code: row.referral_code,
            sponsor_account_id: row.sponsor_account_id,
            sponsor_login_id: row.sponsor_login_id,
            binary_parent_account_id: row.binary_parent_account_id,
            binary_parent_login_id: row.binary_parent_login_id,
            binary_position: row.binary_position,
            joined_at: row.joined_at,
            last_login_at: row.last_login_at
          })
        ),
        page: input.page,
        limit: input.limit,
        total
      };
    });
  }

  async getAccountDetail(input: { actor_account_id: string; account_id: string }) {
    return this.withConnection(async (conn) => {
      await this.requireAdminReader(conn, input.actor_account_id);
      const account = await getAccountAdminDetailById(conn, input.account_id);
      if (!account) {
        throw notFound("account not found", { account_id: input.account_id });
      }

      return {
        account: withPlaceholderMetrics({
          id: account.id,
          login_id: account.login_id,
          display_name: account.display_name,
          role: account.role,
          status: account.status,
          referral_code: account.referral_code,
          sponsor_account_id: account.sponsor_account_id,
          sponsor_login_id: account.sponsor_login_id,
          sponsor_display_name: account.sponsor_display_name,
          binary_parent_account_id: account.binary_parent_account_id,
          binary_parent_login_id: account.binary_parent_login_id,
          binary_parent_display_name: account.binary_parent_display_name,
          binary_position: account.binary_position,
          joined_at: account.joined_at,
          last_login_at: account.last_login_at,
          created_at: account.created_at,
          updated_at: account.updated_at
        })
      };
    });
  }

  async getReferralTree(input: { actor_account_id: string; account_id: string; depth: number }) {
    await this.withConnection(async (conn) => {
      await this.requireAdminReader(conn, input.actor_account_id);
    });
    return this.networkService.getReferralTreeForAccount({
      account_id: input.account_id,
      depth: input.depth
    });
  }

  async getBinaryTree(input: { actor_account_id: string; account_id: string; depth: number }) {
    await this.withConnection(async (conn) => {
      await this.requireAdminReader(conn, input.actor_account_id);
    });
    return this.networkService.getBinaryTreeForAccount({
      account_id: input.account_id,
      depth: input.depth
    });
  }

  async getBinaryLegs(input: { actor_account_id: string; account_id: string }) {
    await this.withConnection(async (conn) => {
      await this.requireAdminReader(conn, input.actor_account_id);
    });
    return this.networkService.getBinaryLegsForAccount({
      account_id: input.account_id
    });
  }

  async listDownlines(input: {
    actor_account_id: string;
    account_id: string;
    type: "referral" | "binary";
    depth: number;
    page: number;
    limit: number;
  }) {
    await this.withConnection(async (conn) => {
      await this.requireAdminReader(conn, input.actor_account_id);
    });
    return this.networkService.getDownlinesForAccount({
      account_id: input.account_id,
      type: input.type,
      depth: input.depth,
      page: input.page,
      limit: input.limit
    });
  }

  async updateStatus(input: {
    actor_account_id: string;
    account_id: string;
    status: AccountStatus;
    reason?: string | null;
  }) {
    return withTx(this.pool, async (conn) => {
      const actor = await requireActor(conn, input.actor_account_id);
      assertRoleAtLeast(actor, "ADMIN");

      const target = await getAccountByIdForUpdate(conn, input.account_id);
      if (!target) {
        throw notFound("account not found", { account_id: input.account_id });
      }
      if (target.id === actor.id) {
        throw forbidden("cannot change own account status", { account_id: input.account_id });
      }
      if (target.role !== "USER") {
        throw forbidden("only USER account status can be changed", {
          account_id: input.account_id,
          role: target.role
        });
      }
      if (target.status === input.status) {
        throw conflictError("account status is already set", {
          account_id: input.account_id,
          status: input.status
        });
      }

      const allowedNextStatuses = mutableStatusTransitions[target.status];
      if (!allowedNextStatuses.includes(input.status)) {
        throw conflictError("invalid account status transition", {
          account_id: input.account_id,
          from_status: target.status,
          to_status: input.status
        });
      }

      const now = new Date();
      await updateAccountStatus(conn, {
        id: target.id,
        status: input.status,
        updated_at: now
      });

      const revoked_session_count =
        input.status === "ACTIVE"
          ? 0
          : await revokeActiveSessionsByAccountId(conn, {
              account_id: target.id,
              revoked_at: now
            });

      await insertAdminAuditLog(conn, {
        actor_account_id: actor.id,
        action: "ADMIN_ACCOUNT_STATUS_UPDATED",
        target_table: "accounts",
        target_id: target.id,
        meta: {
          login_id: target.login_id,
          role: target.role,
          previous_status: target.status,
          next_status: input.status,
          reason: input.reason ?? null,
          revoked_session_count
        }
      });

      const account = await getAccountAdminDetailById(conn, target.id);
      if (!account) {
        throw notFound("account not found", { account_id: target.id });
      }

      return {
        account: withPlaceholderMetrics({
          id: account.id,
          login_id: account.login_id,
          display_name: account.display_name,
          role: account.role,
          status: account.status,
          referral_code: account.referral_code,
          sponsor_account_id: account.sponsor_account_id,
          sponsor_login_id: account.sponsor_login_id,
          sponsor_display_name: account.sponsor_display_name,
          binary_parent_account_id: account.binary_parent_account_id,
          binary_parent_login_id: account.binary_parent_login_id,
          binary_parent_display_name: account.binary_parent_display_name,
          binary_position: account.binary_position,
          joined_at: account.joined_at,
          last_login_at: account.last_login_at,
          created_at: account.created_at,
          updated_at: account.updated_at
        }),
        previous_status: target.status,
        revoked_session_count
      };
    });
  }
}
