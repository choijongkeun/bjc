import { runSmokePreflight } from "./smoke_preflight.js";

type BatchKind =
  | "daily-reward"
  | "direct-referral"
  | "rank-qualification"
  | "rank-bonus"
  | "contribution"
  | "sidecar";

type BatchConfig = {
  path: string;
  buildPayload: (args: Record<string, string>) => Record<string, string>;
};

const CONFIG: Record<BatchKind, BatchConfig> = {
  "daily-reward": {
    path: "/api/admin/calc-runs/daily-reward",
    buildPayload: (args) => ({
      policy_version_id: requireArg(args, "policy"),
      reward_date: requireArg(args, "date"),
    }),
  },
  "direct-referral": {
    path: "/api/admin/rewards/direct-referral/run",
    buildPayload: (args) => {
      const from = args.from ?? args.date;
      const to = args.to ?? args.date;
      if (!from || !to) {
        throw new Error("direct-referral batch requires --date=<YYYY-MM-DD> or both --from=<YYYY-MM-DD> and --to=<YYYY-MM-DD>");
      }
      return {
        policy_version_id: requireArg(args, "policy"),
        activated_from: from,
        activated_to: to,
      };
    },
  },
  "rank-qualification": {
    path: "/api/admin/rewards/rank-qualification/run",
    buildPayload: (args) => ({
      policy_version_id: requireArg(args, "policy"),
      calculation_date: requireArg(args, "date"),
    }),
  },
  "rank-bonus": {
    path: "/api/admin/rewards/rank-bonus/run",
    buildPayload: (args) => ({
      policy_version_id: requireArg(args, "policy"),
      calculation_date: requireArg(args, "date"),
    }),
  },
  contribution: {
    path: "/api/admin/rewards/contribution/run",
    buildPayload: (args) => ({
      policy_version_id: requireArg(args, "policy"),
      calculation_date: requireArg(args, "date"),
    }),
  },
  sidecar: {
    path: "/api/admin/rewards/sidecar/run",
    buildPayload: (args) => ({
      policy_version_id: requireArg(args, "policy"),
      calculation_date: requireArg(args, "date"),
    }),
  },
};

function requireArg(args: Record<string, string>, key: string): string {
  const value = args[key]?.trim();
  if (!value) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

function parseArgs(argv: string[]) {
  const [kindRaw, ...rest] = argv;
  if (!kindRaw || !(kindRaw in CONFIG)) {
    throw new Error(
      "Usage: tsx scripts/run_reward_batch.ts <daily-reward|direct-referral|rank-qualification|rank-bonus|contribution|sidecar> --policy=<id> [--date=<YYYY-MM-DD> | --from=<YYYY-MM-DD> --to=<YYYY-MM-DD>] [--dry-run] [--execute] [--actor-id=<uuid>] [--base-url=<url>]"
    );
  }

  const args: Record<string, string> = {};
  let execute = false;
  let dryRun = false;
  for (const item of rest) {
    if (item === "--execute") {
      execute = true;
      continue;
    }
    if (item === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (!item.startsWith("--")) {
      throw new Error(`Unsupported argument: ${item}`);
    }
    const [rawKey, ...rawValue] = item.slice(2).split("=");
    if (!rawKey || rawValue.length === 0) {
      throw new Error(`Expected --key=value format: ${item}`);
    }
    args[rawKey] = rawValue.join("=");
  }

  return {
    kind: kindRaw as BatchKind,
    args,
    execute,
    dryRun: dryRun || !execute,
  };
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const baseUrl = parsed.args["base-url"] ?? process.env.BJC_BATCH_BASE_URL ?? process.env.BJC_API_BASE_URL ?? "http://127.0.0.1:3011";
    const actorId = parsed.args["actor-id"] ?? process.env.BJC_BATCH_ACTOR_ID;
    if (!actorId) {
      throw new Error("Missing actor id: provide --actor-id=<uuid> or BJC_BATCH_ACTOR_ID");
    }

    const preflight = await runSmokePreflight({
      env: {
        BJC_SMOKE_BASE_URL: baseUrl,
      },
    });
    if (!preflight.ok) {
      throw new Error(preflight.reason ?? "preflight failed");
    }

    const config = CONFIG[parsed.kind];
    const payload = config.buildPayload(parsed.args);
    const targetUrl = `${baseUrl}${config.path}`;
    const output: Record<string, unknown> = {
      ok: true,
      mode: parsed.dryRun ? "dry-run" : "execute",
      batch_kind: parsed.kind,
      url: targetUrl,
      actor_mode: "x-actor-account-id",
      actor_id: actorId,
      payload,
      preflight,
    };

    if (parsed.dryRun) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-actor-account-id": actorId,
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // keep raw text
    }
    if (!response.ok) {
      process.stdout.write(
        `${JSON.stringify(
          {
            ok: false,
            mode: "execute",
            batch_kind: parsed.kind,
            url: targetUrl,
            payload,
            status: response.status,
            body,
          },
          null,
          2
        )}\n`
      );
      process.exit(1);
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          ...output,
          status: response.status,
          response: body,
        },
        null,
        2
      )}\n`
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )}\n`
    );
    process.exit(1);
  }
}

await main();
