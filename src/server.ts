import "dotenv/config";
import express from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { PolicyEngine } from "./services/policyEngine.js";
import { AuthService } from "./services/authService.js";
import { NetworkService } from "./services/networkService.js";
import { AdminAccountService } from "./services/adminAccountService.js";
import { AccountStakingService } from "./services/accountStakingService.js";
import { AccountRewardService } from "./services/accountRewardService.js";
import { DailyRewardService } from "./services/dailyRewardService.js";
import { RewardWithdrawalService } from "./services/rewardWithdrawalService.js";
import { toHttpError } from "./http/httpErrors.js";
import { actorMiddleware } from "./http/actorMiddleware.js";
import { extractBearerToken, requireSessionAccount, sessionAuthMiddleware } from "./http/sessionAuth.js";
import { unauthorized, validationError } from "./domain/errors.js";

const app = express();
const allowedOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use((req, res, next) => {
  const origin = req.header("origin");

  if (origin && allowedOriginPattern.test(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Authorization, Content-Type, x-actor-account-id");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: "2mb" }));
app.use(actorMiddleware);

const engine = new PolicyEngine(pool);
const authService = new AuthService(pool);
const networkService = new NetworkService(pool);
const adminAccountService = new AdminAccountService(pool);
const accountStakingService = new AccountStakingService(pool);
const accountRewardService = new AccountRewardService(pool);
const dailyRewardService = new DailyRewardService(pool);
const rewardWithdrawalService = new RewardWithdrawalService(pool);
const requireSession = sessionAuthMiddleware(authService);
const upload = multer({ storage: multer.memoryStorage() });

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const networkDepthQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(10).default(3)
});

const adminAccountsListQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).optional(),
  role: z.enum(["USER", "READER", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "BLOCKED", "WITHDRAWN"]).optional(),
  sponsor_account_id: z.string().trim().min(1).optional(),
  binary_parent_account_id: z.string().trim().min(1).optional(),
  binary_position: z.enum(["LEFT", "RIGHT"]).optional(),
  sort: z.enum(["joined_at_desc", "joined_at_asc", "login_id_asc", "total_stake_desc"]).default("joined_at_desc")
});

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

const stakingStatusSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "MATURED",
  "CLOSED",
]);

const stakingSortSchema = z
  .enum(["created_at_desc", "created_at_asc", "matures_at_asc", "matures_at_desc"])
  .default("created_at_desc");

const rewardTypeSchema = z.enum([
  "DAILY_REWARD",
  "DIRECT_REFERRAL",
  "RANK_BONUS",
  "CONTRIBUTION",
  "WITHDRAWAL_FEE",
  "SIDECAR",
  "ADJUSTMENT",
  "REVERSAL",
]);

const rewardStatusSchema = z.enum(["PENDING", "CONFIRMED", "REVERSED"]);

const withdrawalTypeSchema = z.enum(["DAILY_REWARD", "BONUS"]);
const withdrawalStatusSchema = z.enum(["REQUESTED", "APPROVED", "PROCESSING", "COMPLETED", "REJECTED", "FAILED", "CANCELLED"]);
const withdrawalSortSchema = z
  .enum(["requested_at_desc", "requested_at_asc", "created_at_desc", "created_at_asc", "completed_at_desc", "completed_at_asc"])
  .default("requested_at_desc");

const rewardSortSchema = z
  .enum([
    "reward_date_desc",
    "reward_date_asc",
    "created_at_desc",
    "created_at_asc",
    "available_at_desc",
    "available_at_asc",
  ])
  .default("reward_date_desc");

function requireActorId(req: express.Request): string {
  const actorId = req.header("x-actor-account-id");
  if (!actorId) {
    throw unauthorized("Missing header: x-actor-account-id");
  }
  return actorId;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/referrals/resolve", async (req, res, next) => {
  try {
    const query = z
      .object({
        referral_code: z.string().trim().min(1)
      })
      .parse(req.query);

    const result = await authService.resolveReferralCode({ referral_code: query.referral_code });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = z
      .object({
        login_id: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
        password: z.string().min(8).max(128),
        display_name: z.string().trim().min(1).max(100),
        referral_code: z.string().trim().min(1).max(32),
        preferred_binary_position: z.enum(["LEFT", "RIGHT"]).optional()
      })
      .parse(req.body);

    const result = await authService.register({
      ...body,
      user_agent: req.header("user-agent") ?? null,
      ip_address: req.ip ?? null
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = z
      .object({
        login_id: z.string().trim().min(3).max(64),
        password: z.string().min(8).max(128)
      })
      .parse(req.body);

    const result = await authService.login({
      ...body,
      user_agent: req.header("user-agent") ?? null,
      ip_address: req.ip ?? null
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/auth/me", requireSession, async (req, res, next) => {
  try {
    const account = requireSessionAccount(req);
    res.json({
      account: {
        id: account.id,
        login_id: account.login_id,
        display_name: account.display_name,
        role: account.role,
        status: account.status,
        referral_code: account.referral_code,
        sponsor_account_id: account.sponsor_account_id,
        binary_parent_account_id: account.binary_parent_account_id,
        binary_position: account.binary_position
      }
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/auth/logout", requireSession, async (req, res, next) => {
  try {
    const access_token = extractBearerToken(req.header("authorization"));
    const result = await authService.logout({ access_token });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/me/stakings", requireSession, async (req, res, next) => {
  try {
    const body = z
      .object({
        staking_product_id: z.string().trim().min(1),
        principal_amount_base: z.string().trim().min(1),
        idempotency_key: z.string().trim().min(1).max(128),
      })
      .parse(req.body);

    const sessionAccount = requireSessionAccount(req);
    const result = await accountStakingService.createMyStaking({
      account_id: sessionAccount.id,
      staking_product_id: body.staking_product_id,
      principal_amount_base: body.principal_amount_base,
      idempotency_key: body.idempotency_key,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/stakings", requireSession, async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        status: stakingStatusSchema.optional(),
        product_id: z.string().trim().min(1).optional(),
        sort: stakingSortSchema,
      })
      .parse(req.query);

    const sessionAccount = requireSessionAccount(req);
    const result = await accountStakingService.listMyStakings({
      account_id: sessionAccount.id,
      status: query.status,
      product_id: query.product_id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/stakings/summary", requireSession, async (req, res, next) => {
  try {
    const sessionAccount = requireSessionAccount(req);
    const result = await accountRewardService.getMyStakingSummary({
      account_id: sessionAccount.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/rewards/summary", requireSession, async (req, res, next) => {
  try {
    const sessionAccount = requireSessionAccount(req);
    const result = await accountRewardService.getMyRewardSummary({
      account_id: sessionAccount.id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/withdrawal-balance", requireSession, async (req, res, next) => {
  try {
    const sessionAccount = requireSessionAccount(req);
    const result = await rewardWithdrawalService.getMyWithdrawalBalance({
      account_id: sessionAccount.id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/me/withdrawal-preview", requireSession, async (req, res, next) => {
  try {
    const body = z
      .object({
        withdrawal_type: withdrawalTypeSchema,
        requested_amount_base: z.string().trim().min(1)
      })
      .parse(req.body);
    const sessionAccount = requireSessionAccount(req);
    const result = await rewardWithdrawalService.previewMyWithdrawal({
      account_id: sessionAccount.id,
      withdrawal_type: body.withdrawal_type,
      requested_amount_base: body.requested_amount_base
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/me/withdrawals", requireSession, async (req, res, next) => {
  try {
    const body = z
      .object({
        withdrawal_type: withdrawalTypeSchema,
        requested_amount_base: z.string().trim().min(1),
        idempotency_key: z.string().trim().min(1).max(128),
        wallet_address: z.string().trim().min(1).max(255),
        network: z.string().trim().min(1).max(64)
      })
      .parse(req.body);
    const sessionAccount = requireSessionAccount(req);
    const result = await rewardWithdrawalService.createMyWithdrawal({
      account_id: sessionAccount.id,
      withdrawal_type: body.withdrawal_type,
      requested_amount_base: body.requested_amount_base,
      idempotency_key: body.idempotency_key,
      wallet_address: body.wallet_address,
      network: body.network
    });
    res.status(result.created ? 201 : 200).json(result.result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/withdrawals", requireSession, async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        withdrawal_type: withdrawalTypeSchema.optional(),
        status: withdrawalStatusSchema.optional(),
        requested_from: z.string().optional(),
        requested_to: z.string().optional(),
        sort: withdrawalSortSchema
      })
      .parse(req.query);
    const sessionAccount = requireSessionAccount(req);
    const result = await rewardWithdrawalService.listMyWithdrawals({
      account_id: sessionAccount.id,
      withdrawal_type: query.withdrawal_type,
      status: query.status,
      requested_from: query.requested_from,
      requested_to: query.requested_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/withdrawals/:withdrawalId", requireSession, async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const sessionAccount = requireSessionAccount(req);
    const result = await rewardWithdrawalService.getMyWithdrawal({
      account_id: sessionAccount.id,
      withdrawal_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/me/withdrawals/:withdrawalId/cancel", requireSession, async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const sessionAccount = requireSessionAccount(req);
    const result = await rewardWithdrawalService.cancelMyWithdrawal({
      account_id: sessionAccount.id,
      withdrawal_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/rewards", requireSession, async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        reward_type: rewardTypeSchema.optional(),
        status: rewardStatusSchema.optional(),
        reward_date_from: z.string().optional(),
        reward_date_to: z.string().optional(),
        staking_id: z.string().trim().min(1).optional(),
        sort: rewardSortSchema,
      })
      .parse(req.query);

    const sessionAccount = requireSessionAccount(req);
    const result = await accountRewardService.listMyRewards({
      account_id: sessionAccount.id,
      reward_type: query.reward_type,
      status: query.status,
      reward_date_from: query.reward_date_from,
      reward_date_to: query.reward_date_to,
      staking_id: query.staking_id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/rewards/:rewardId", requireSession, async (req, res, next) => {
  try {
    const reward_id = z.string().trim().min(1).parse(req.params.rewardId);
    const sessionAccount = requireSessionAccount(req);
    const result = await accountRewardService.getMyReward({
      account_id: sessionAccount.id,
      reward_id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/stakings/:stakingId/rewards", requireSession, async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const query = paginationQuerySchema
      .extend({
        status: rewardStatusSchema.optional(),
        reward_date_from: z.string().optional(),
        reward_date_to: z.string().optional(),
        sort: rewardSortSchema,
      })
      .parse(req.query);

    const sessionAccount = requireSessionAccount(req);
    const result = await accountRewardService.listMyStakingRewards({
      account_id: sessionAccount.id,
      staking_id,
      status: query.status,
      reward_date_from: query.reward_date_from,
      reward_date_to: query.reward_date_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/stakings/:stakingId", requireSession, async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const sessionAccount = requireSessionAccount(req);
    const result = await accountStakingService.getMyStaking({
      account_id: sessionAccount.id,
      staking_id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/me/stakings/:stakingId/cancel", requireSession, async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const body = z
      .object({
        reason: z.string().trim().max(500).optional(),
        idempotency_key: z.string().trim().min(1).max(128),
      })
      .parse(req.body);

    const sessionAccount = requireSessionAccount(req);
    const result = await accountStakingService.cancelMyStaking({
      account_id: sessionAccount.id,
      staking_id,
      reason: body.reason ?? null,
      idempotency_key: body.idempotency_key,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/referral-tree", requireSession, async (req, res, next) => {
  try {
    const query = networkDepthQuerySchema.parse(req.query);
    const account = requireSessionAccount(req);
    const result = await networkService.getReferralTree({
      account_id: account.id,
      depth: query.depth
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/binary-tree", requireSession, async (req, res, next) => {
  try {
    const query = networkDepthQuerySchema.parse(req.query);
    const account = requireSessionAccount(req);
    const result = await networkService.getBinaryTree({
      account_id: account.id,
      depth: query.depth
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/binary-legs", requireSession, async (req, res, next) => {
  try {
    const account = requireSessionAccount(req);
    const result = await networkService.getBinaryLegs({
      account_id: account.id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/me/downlines", requireSession, async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        type: z.enum(["referral", "binary"]),
        depth: z.coerce.number().int().min(1).max(10).default(3)
      })
      .parse(req.query);
    const account = requireSessionAccount(req);
    const result = await networkService.listDownlines({
      account_id: account.id,
      type: query.type,
      depth: query.depth,
      page: query.page,
      limit: query.limit
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const query = adminAccountsListQuerySchema.parse(req.query);
    const result = await adminAccountService.listAccounts({
      actor_account_id,
      q: query.q,
      role: query.role,
      status: query.status,
      sponsor_account_id: query.sponsor_account_id,
      binary_parent_account_id: query.binary_parent_account_id,
      binary_position: query.binary_position,
      page: query.page,
      limit: query.limit,
      sort: query.sort
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const result = await adminAccountService.getAccountDetail({
      actor_account_id,
      account_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/accounts/:accountId/status", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const body = z
      .object({
        status: z.enum(["ACTIVE", "BLOCKED", "WITHDRAWN"]),
        reason: z.string().trim().min(1).max(500).optional()
      })
      .parse(req.body);
    const result = await adminAccountService.updateStatus({
      actor_account_id,
      account_id,
      status: body.status,
      reason: body.reason
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/referral-tree", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const query = networkDepthQuerySchema.parse(req.query);
    const result = await adminAccountService.getReferralTree({
      actor_account_id,
      account_id,
      depth: query.depth
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/binary-tree", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const query = networkDepthQuerySchema.parse(req.query);
    const result = await adminAccountService.getBinaryTree({
      actor_account_id,
      account_id,
      depth: query.depth
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/binary-legs", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const result = await adminAccountService.getBinaryLegs({
      actor_account_id,
      account_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/downlines", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const query = paginationQuerySchema
      .extend({
        type: z.enum(["referral", "binary"]),
        depth: z.coerce.number().int().min(1).max(10).default(3)
      })
      .parse(req.query);
    const result = await adminAccountService.listDownlines({
      actor_account_id,
      account_id,
      type: query.type,
      depth: query.depth,
      page: query.page,
      limit: query.limit
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/admin/policy-versions", async (req, res, next) => {
  try {
    const body = z
      .object({
        note: z.string().nullable().optional(),
        effective_from: z.string().nullable().optional(),
        effective_to: z.string().nullable().optional()
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await engine.createPolicyVersion({ actor_account_id, ...body });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/stakings", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        q: z.string().trim().min(1).optional(),
        account_id: z.string().trim().min(1).optional(),
        product_id: z.string().trim().min(1).optional(),
        status: stakingStatusSchema.optional(),
        created_from: z.string().optional(),
        created_to: z.string().optional(),
        matures_from: z.string().optional(),
        matures_to: z.string().optional(),
        sort: stakingSortSchema,
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await accountStakingService.listAdminStakings({
      actor_account_id,
      q: query.q,
      account_id: query.account_id,
      product_id: query.product_id,
      status: query.status,
      created_from: query.created_from,
      created_to: query.created_to,
      matures_from: query.matures_from,
      matures_to: query.matures_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/stakings/:stakingId", async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const actor_account_id = requireActorId(req);
    const result = await accountStakingService.getAdminStaking({
      actor_account_id,
      staking_id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/stakings/:stakingId/activate", async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const actor_account_id = requireActorId(req);
    const result = await accountStakingService.activateAdminStaking({
      actor_account_id,
      staking_id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/stakings/:stakingId/reject", async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const body = z
      .object({
        reason: z.string().trim().min(1).max(500),
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await accountStakingService.rejectAdminStaking({
      actor_account_id,
      staking_id,
      reason: body.reason,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/stakings/:stakingId/cancel", async (req, res, next) => {
  try {
    const staking_id = z.string().trim().min(1).parse(req.params.stakingId);
    const body = z
      .object({
        reason: z.string().trim().max(500).optional(),
      })
      .parse(req.body ?? {});

    const actor_account_id = requireActorId(req);
    const result = await accountStakingService.cancelAdminStaking({
      actor_account_id,
      staking_id,
      reason: body.reason ?? null,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/stakings", async (req, res, next) => {
  try {
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const query = paginationQuerySchema
      .extend({
        status: stakingStatusSchema.optional(),
        product_id: z.string().trim().min(1).optional(),
        sort: stakingSortSchema,
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await accountStakingService.listAdminAccountStakings({
      actor_account_id,
      account_id,
      status: query.status,
      product_id: query.product_id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/rewards", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        q: z.string().trim().min(1).optional(),
        account_id: z.string().trim().min(1).optional(),
        staking_id: z.string().trim().min(1).optional(),
        reward_type: rewardTypeSchema.optional(),
        status: rewardStatusSchema.optional(),
        calc_run_id: z.string().trim().min(1).optional(),
        reward_date_from: z.string().optional(),
        reward_date_to: z.string().optional(),
        sort: rewardSortSchema,
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await accountRewardService.listAdminRewards({
      actor_account_id,
      q: query.q,
      account_id: query.account_id,
      staking_id: query.staking_id,
      reward_type: query.reward_type,
      status: query.status,
      calc_run_id: query.calc_run_id,
      reward_date_from: query.reward_date_from,
      reward_date_to: query.reward_date_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/rewards/:rewardId", async (req, res, next) => {
  try {
    const reward_id = z.string().trim().min(1).parse(req.params.rewardId);
    const actor_account_id = requireActorId(req);
    const result = await accountRewardService.getAdminReward({
      actor_account_id,
      reward_id,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/rewards", async (req, res, next) => {
  try {
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const query = paginationQuerySchema
      .extend({
        staking_id: z.string().trim().min(1).optional(),
        reward_type: rewardTypeSchema.optional(),
        status: rewardStatusSchema.optional(),
        calc_run_id: z.string().trim().min(1).optional(),
        reward_date_from: z.string().optional(),
        reward_date_to: z.string().optional(),
        sort: rewardSortSchema,
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await accountRewardService.listAdminAccountRewards({
      actor_account_id,
      account_id,
      staking_id: query.staking_id,
      reward_type: query.reward_type,
      status: query.status,
      calc_run_id: query.calc_run_id,
      reward_date_from: query.reward_date_from,
      reward_date_to: query.reward_date_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/rewards/:rewardId/reverse", async (req, res, next) => {
  try {
    const reward_id = z.string().trim().min(1).parse(req.params.rewardId);
    const body = z
      .object({
        reason: z.string().trim().min(1).max(500),
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await accountRewardService.reverseReward({
      actor_account_id,
      reward_id,
      reason: body.reason,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/withdrawals", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        q: z.string().trim().min(1).optional(),
        account_id: z.string().trim().min(1).optional(),
        withdrawal_type: withdrawalTypeSchema.optional(),
        status: withdrawalStatusSchema.optional(),
        network: z.string().trim().min(1).optional(),
        requested_from: z.string().optional(),
        requested_to: z.string().optional(),
        completed_from: z.string().optional(),
        completed_to: z.string().optional(),
        sort: withdrawalSortSchema
      })
      .parse(req.query);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.listAdminWithdrawals({
      actor_account_id,
      q: query.q,
      account_id: query.account_id,
      withdrawal_type: query.withdrawal_type,
      status: query.status,
      network: query.network,
      requested_from: query.requested_from,
      requested_to: query.requested_to,
      completed_from: query.completed_from,
      completed_to: query.completed_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort
    });
    res.json({
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/withdrawals/:withdrawalId", async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.getAdminWithdrawal({
      actor_account_id,
      withdrawal_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/withdrawals/:withdrawalId/approve", async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.approveWithdrawal({
      actor_account_id,
      withdrawal_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/withdrawals/:withdrawalId/reject", async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const body = z
      .object({
        reason: z.string().trim().min(1).max(500)
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.rejectWithdrawal({
      actor_account_id,
      withdrawal_id,
      reason: body.reason
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/withdrawals/:withdrawalId/processing", async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const body = z
      .object({
        network: z.string().trim().min(1).max(64)
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.markWithdrawalProcessing({
      actor_account_id,
      withdrawal_id,
      network: body.network
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/withdrawals/:withdrawalId/complete", async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const body = z
      .object({
        tx_hash: z.string().trim().min(1).max(255),
        network: z.string().trim().min(1).max(64)
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.completeWithdrawal({
      actor_account_id,
      withdrawal_id,
      tx_hash: body.tx_hash,
      network: body.network
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/withdrawals/:withdrawalId/fail", async (req, res, next) => {
  try {
    const withdrawal_id = z.string().trim().min(1).parse(req.params.withdrawalId);
    const body = z
      .object({
        reason: z.string().trim().min(1).max(500)
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.failWithdrawal({
      actor_account_id,
      withdrawal_id,
      reason: body.reason
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/accounts/:accountId/withdrawals", async (req, res, next) => {
  try {
    const account_id = z.string().trim().min(1).parse(req.params.accountId);
    const query = paginationQuerySchema
      .extend({
        withdrawal_type: withdrawalTypeSchema.optional(),
        status: withdrawalStatusSchema.optional(),
        network: z.string().trim().min(1).optional(),
        requested_from: z.string().optional(),
        requested_to: z.string().optional(),
        completed_from: z.string().optional(),
        completed_to: z.string().optional(),
        sort: withdrawalSortSchema
      })
      .parse(req.query);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.listAdminAccountWithdrawals({
      actor_account_id,
      account_id,
      withdrawal_type: query.withdrawal_type,
      status: query.status,
      network: query.network,
      requested_from: query.requested_from,
      requested_to: query.requested_to,
      completed_from: query.completed_from,
      completed_to: query.completed_to,
      page: query.page,
      limit: query.limit,
      sort: query.sort
    });
    res.json({
      account: result.account,
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/reports/withdrawal-summary", async (req, res, next) => {
  try {
    const query = z
      .object({
        date_from: z.string().optional(),
        date_to: z.string().optional(),
        withdrawal_type: withdrawalTypeSchema.optional(),
        network: z.string().trim().min(1).optional()
      })
      .parse(req.query);
    const actor_account_id = requireActorId(req);
    const result = await rewardWithdrawalService.getAdminWithdrawalSummary({
      actor_account_id,
      date_from: query.date_from,
      date_to: query.date_to,
      withdrawal_type: query.withdrawal_type,
      network: query.network
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/admin/calc-runs/daily-reward", async (req, res, next) => {
  try {
    const body = z
      .object({
        policy_version_id: z.string().trim().min(1),
        reward_date: z.string().trim().min(1),
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await dailyRewardService.runDailyReward({
      actor_account_id,
      policy_version_id: body.policy_version_id,
      reward_date: body.reward_date,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/admin/calc-runs/:calcRunId/rewards", async (req, res, next) => {
  try {
    const calc_run_id = z.string().trim().min(1).parse(req.params.calcRunId);
    const query = paginationQuerySchema
      .extend({
        reward_type: rewardTypeSchema.optional(),
        status: rewardStatusSchema.optional(),
        sort: rewardSortSchema,
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await accountRewardService.listCalcRunRewards({
      actor_account_id,
      calc_run_id,
      reward_type: query.reward_type,
      status: query.status,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      calc_run: result.calc_run,
      items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total,
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/policies", async (req, res, next) => {
  try {
    const body = z
      .object({
        note: z.string().nullable().optional(),
        effective_from: z.string().nullable().optional(),
        effective_to: z.string().nullable().optional()
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await engine.createPolicyVersion({ actor_account_id, ...body });
    res.json({ policy_id: result.policy_version_id, status: "DRAFT" });
  } catch (err) {
    next(err);
  }
});

app.get("/api/policies", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        status: z.enum(["DRAFT", "ACTIVE", "RETIRED"]).optional(),
        effective_from: z.string().optional(),
        effective_to: z.string().optional()
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await engine.listPolicyVersions({ actor_account_id, ...query });
    res.json({
      policy_versions: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.post("/admin/policy-versions/:id/activate", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    await engine.activatePolicyVersion({ actor_account_id, policy_version_id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/policies/:id/activate", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    await engine.activatePolicyVersion({ actor_account_id, policy_version_id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/policy-versions/:id", async (req, res, next) => {
  try {
    const actor_account_id = requireActorId(req);
    const pv = await engine.getPolicyVersion({ actor_account_id, policy_version_id: req.params.id });
    res.json({ policy_version: pv });
  } catch (err) {
    next(err);
  }
});

app.post("/admin/ledger-events", async (req, res, next) => {
  try {
    const body = z
      .object({
        event: z.object({
          account_id: z.string(),
          product_id: z.string(),
          policy_version_id: z.string(),
          calc_run_id: z.string().nullable().optional(),
          event_time: z.string(),
          event_type: z.string(),
          amount_base: z.string(),
          decimals: z.number().int(),
          symbol: z.string(),
          reference_id: z.string(),
          related_account_id: z.string().nullable().optional(),
          meta: z.record(z.unknown()).optional()
        })
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await engine.createLedgerEvent({ actor_account_id, event: body.event as any });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/ledger-events", async (req, res, next) => {
  try {
    const body = z
      .object({
        event: z.object({
          account_id: z.string(),
          product_id: z.string(),
          policy_id: z.string(),
          calc_run_id: z.string().nullable().optional(),
          event_time: z.string(),
          event_type: z.string(),
          amount_base: z.string(),
          decimals: z.number().int(),
          symbol: z.string(),
          reference_id: z.string(),
          related_account_id: z.string().nullable().optional(),
          meta: z.record(z.unknown()).optional()
        })
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await engine.createLedgerEvent({
      actor_account_id,
      event: {
        ...body.event,
        policy_version_id: body.event.policy_id
      } as any
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/staking-products", async (req, res, next) => {
  try {
    const body = z
      .object({
        policy_id: z.string(),
        products: z
          .array(
            z.object({
              id: z.string().nullable().optional(),
              name: z.string().min(1),
              symbol: z.string().min(1),
              decimals: z.number().int().min(0).max(30),
              min_stake_amount_base: z.string(),
              max_stake_amount_base: z.string(),
              staking_days: z.number().int().positive(),
              daily_interest_bps: z.union([z.string(), z.number().int().nonnegative()]).transform(String),
              is_active: z.boolean()
            })
          )
          .min(1)
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await engine.upsertStakingProducts({
      actor_account_id,
      policy_version_id: body.policy_id,
      products: body.products.map((product) => ({ ...product, id: product.id ?? null }))
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/staking-products", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        policy_id: z.string().optional(),
        is_active: booleanQuerySchema.optional(),
        symbol: z.string().optional()
      })
      .parse(req.query);

    if (req.header("x-actor-account-id")) {
      const actor_account_id = requireActorId(req);
      const result = await engine.listStakingProducts({
        actor_account_id,
        policy_version_id: query.policy_id,
        is_active: query.is_active,
        symbol: query.symbol,
        page: query.page,
        limit: query.limit
      });
      res.json({
        staking_products: result.items,
        page: query.page,
        limit: query.limit,
        total: result.total
      });
      return;
    }

    const result = await accountStakingService.listPublicStakingProducts({
      page: query.page,
      limit: query.limit,
      symbol: query.symbol
    });
    res.json({
      staking_products: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/ledger-events/import-csv", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      throw validationError("csv file is required", { field: "file" });
    }

    const actor_account_id = requireActorId(req);
    const result = await engine.importLedgerEventsCsv({
      actor_account_id,
      csv_text: req.file.buffer.toString("utf8")
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/ledger-events", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        account_id: z.string().optional(),
        product_id: z.string().optional(),
        policy_id: z.string().optional(),
        calc_run_id: z.string().optional(),
        event_type: z
          .enum([
            "STAKE",
            "UNSTAKE",
            "STAKING_REQUESTED",
            "STAKING_PRINCIPAL_LOCKED",
            "STAKING_ACTIVATED",
            "STAKING_CANCELLED",
            "STAKING_PRINCIPAL_RELEASED",
            "STAKING_MATURED",
            "DAILY_REWARD_ACCRUAL",
            "DAILY_REWARD_PAYOUT",
            "DIRECT_REFERRAL_BONUS",
            "RANK_BONUS",
            "CONTRIBUTION_BONUS",
            "WITHDRAWAL_REQUEST",
            "WITHDRAWAL_FEE",
            "WITHDRAWAL_RELEASE",
            "WITHDRAWAL_FREEZE",
            "WITHDRAWAL_UNFREEZE",
            "SIDECAR_TRIGGER",
            "SIDECAR_RELEASE",
            "ADJUSTMENT"
          ])
          .optional(),
        reference_id: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional()
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await engine.listLedgerEvents({
      actor_account_id,
      account_id: query.account_id,
      product_id: query.product_id,
      policy_version_id: query.policy_id,
      calc_run_id: query.calc_run_id,
      event_type: query.event_type,
      reference_id: query.reference_id,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit
    });
    res.json({
      ledger_events: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.post("/admin/calc-runs", async (req, res, next) => {
  try {
    const body = z
      .object({
        policy_version_id: z.string(),
        run_type: z.string(),
        run_date: z.string()
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await engine.createCalcRun({ actor_account_id, ...body });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/calc-runs", async (req, res, next) => {
  try {
    const body = z
      .object({
        policy_id: z.string(),
        run_type: z.string(),
        run_date: z.string()
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await engine.createCalcRun({
      actor_account_id,
      policy_version_id: body.policy_id,
      run_type: body.run_type,
      run_date: body.run_date
    });
    res.json({ calc_run_id: result.calc_run_id, status: "PENDING" });
  } catch (err) {
    next(err);
  }
});

app.get("/api/calc-runs", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        policy_id: z.string().optional(),
        run_type: z
          .enum(["DAILY_REWARD", "DIRECT_REFERRAL", "RANK_BONUS", "CONTRIBUTION", "WITHDRAWAL_FEE", "SIDECAR"])
          .optional(),
        status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "FINALIZED"]).optional(),
        run_date_from: z.string().optional(),
        run_date_to: z.string().optional()
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await engine.listCalcRuns({
      actor_account_id,
      policy_version_id: query.policy_id,
      run_type: query.run_type,
      status: query.status,
      run_date_from: query.run_date_from,
      run_date_to: query.run_date_to,
      page: query.page,
      limit: query.limit
    });
    res.json({
      calc_runs: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.post("/admin/calc-runs/:id/status", async (req, res, next) => {
  try {
    const body = z
      .object({
        to_status: z.enum(["PENDING", "RUNNING", "SUCCEEDED", "FAILED", "FINALIZED"]),
        allow_failed_retry: z.boolean().default(false),
        set_finalized_at: z.boolean().default(true)
      })
      .parse(req.body);

    const actor_account_id = requireActorId(req);
    const result = await engine.transitionCalcRunStatus({
      actor_account_id,
      calc_run_id: req.params.id,
      to_status: body.to_status,
      allow_failed_retry: body.allow_failed_retry,
      set_finalized_at: body.set_finalized_at
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

async function transition(req: express.Request, res: express.Response, next: express.NextFunction, to_status: any) {
  try {
    const actor_account_id = requireActorId(req);
    const calc_run_id = z.string().min(1).parse(req.params.id);
    const error_message =
      to_status === "FAILED"
        ? z.object({ error_message: z.string().nullable().optional() }).parse(req.body ?? {}).error_message ?? null
        : null;
    const result = await engine.transitionCalcRunStatus({
      actor_account_id,
      calc_run_id,
      to_status,
      allow_failed_retry: false,
      set_finalized_at: true,
      error_message
    });
    res.json({ ok: true, from: result.from_status, to: result.to_status });
  } catch (err) {
    next(err);
  }
}

app.post("/api/calc-runs/:id/start", (req, res, next) => transition(req, res, next, "RUNNING"));
app.post("/api/calc-runs/:id/succeed", (req, res, next) => transition(req, res, next, "SUCCEEDED"));
app.post("/api/calc-runs/:id/fail", (req, res, next) => transition(req, res, next, "FAILED"));
app.post("/api/calc-runs/:id/finalize", (req, res, next) => transition(req, res, next, "FINALIZED"));

app.post("/admin/settlement-items", async (req, res, next) => {
  try {
    const body = z
      .object({
        calc_run_id: z.string(),
        settlement_type: z.string(),
        account_id: z.string(),
        amount_base: z.string(),
        decimals: z.number().int(),
        symbol: z.string(),
        reference_id: z.string().nullable().optional(),
        meta: z.record(z.unknown()).optional()
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    const result = await engine.insertSettlementItem({
      actor_account_id,
      calc_run_id: body.calc_run_id,
      settlement_type: body.settlement_type as any,
      account_id: body.account_id,
      amount_base: body.amount_base,
      decimals: body.decimals,
      symbol: body.symbol,
      reference_id: body.reference_id ?? null,
      meta: body.meta
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.patch("/admin/settlement-items/:id", async (req, res, next) => {
  try {
    const body = z
      .object({
        calc_run_id: z.string(),
        amount_base: z.string(),
        meta: z.record(z.unknown()).optional()
      })
      .parse(req.body);
    const actor_account_id = requireActorId(req);
    await engine.updateSettlementItemAmount({
      actor_account_id,
      calc_run_id: body.calc_run_id,
      settlement_item_id: req.params.id,
      amount_base: body.amount_base,
      meta: body.meta
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.delete("/admin/settlement-items/:id", async (req, res, next) => {
  try {
    const body = z.object({ calc_run_id: z.string() }).parse(req.body ?? {});
    const actor_account_id = requireActorId(req);
    await engine.deleteSettlementItem({
      actor_account_id,
      calc_run_id: body.calc_run_id,
      settlement_item_id: req.params.id
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/settlement-items", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        calc_run_id: z.string().optional(),
        account_id: z.string().optional(),
        settlement_type: z
          .enum([
            "DAILY_REWARD",
            "DIRECT_REFERRAL",
            "RANK_BONUS",
            "CONTRIBUTION",
            "WITHDRAWAL_FEE",
            "WITHDRAWAL_FREEZE",
            "WITHDRAWAL_RELEASE",
            "ADJUSTMENT"
          ])
          .optional()
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await engine.listSettlementItems({ actor_account_id, ...query });
    res.json({
      settlement_items: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/reports/summary", async (req, res, next) => {
  try {
    const query = z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        policy_id: z.string().optional()
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await engine.getSummaryReport({
      actor_account_id,
      from: query.from,
      to: query.to,
      policy_version_id: query.policy_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get("/api/audit-logs", async (req, res, next) => {
  try {
    const query = paginationQuerySchema
      .extend({
        actor_account_id: z.string().optional(),
        action: z.string().optional(),
        target_table: z.string().optional(),
        target_id: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional()
      })
      .parse(req.query);

    const actor_account_id = requireActorId(req);
    const result = await engine.listAuditLogs({
      actor_account_id,
      actor_account_id_filter: query.actor_account_id,
      action: query.action,
      target_table: query.target_table,
      target_id: query.target_id,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit
    });
    res.json({
      audit_logs: result.items,
      page: query.page,
      limit: query.limit,
      total: result.total
    });
  } catch (err) {
    next(err);
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const { status, body } = toHttpError(err);
  res.status(status).json(body);
});

app.listen(env.PORT, () => {
  process.stdout.write(`listening on :${env.PORT}\n`);
});
