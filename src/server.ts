import "dotenv/config";
import express from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { PolicyEngine } from "./services/policyEngine.js";
import { toHttpError } from "./http/httpErrors.js";
import { actorMiddleware } from "./http/actorMiddleware.js";
import { unauthorized, validationError } from "./domain/errors.js";

const app = express();
const allowedOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use((req, res, next) => {
  const origin = req.header("origin");

  if (origin && allowedOriginPattern.test(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Content-Type, x-actor-account-id");
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
const upload = multer({ storage: multer.memoryStorage() });

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());

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
