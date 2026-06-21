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

type LoginResponse = {
  access_token: string;
  account: {
    id: string;
    login_id: string | null;
    role: string;
    status: string;
  };
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
      "Usage: tsx scripts/run_reward_batch.ts <daily-reward|direct-referral|rank-qualification|rank-bonus|contribution|sidecar> --policy=<id> [--date=<YYYY-MM-DD> | --from=<YYYY-MM-DD> --to=<YYYY-MM-DD>] [--dry-run] [--execute] [--login-id=<id>] [--password=<password>] [--base-url=<url>]"
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

async function parseJsonResponse<T>(response: Response): Promise<T | string> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}

async function login(baseUrl: string, credentials: { login_id: string; password: string }) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });
  const body = await parseJsonResponse<LoginResponse>(response);
  if (!response.ok || typeof body === "string") {
    throw new Error(
      `Batch login failed with status ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`
    );
  }
  return body;
}

async function logout(baseUrl: string, accessToken: string) {
  await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
}

async function main() {
  let baseUrl = "";
  let accessToken = "";
  try {
    const parsed = parseArgs(process.argv.slice(2));
    baseUrl = parsed.args["base-url"] ?? process.env.BJC_BATCH_BASE_URL ?? process.env.BJC_API_BASE_URL ?? "http://127.0.0.1:3011";
    const loginId = parsed.args["login-id"] ?? process.env.BJC_BATCH_LOGIN_ID;
    const password = parsed.args.password ?? process.env.BJC_BATCH_PASSWORD;

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
      auth_mode: "login_id_password_to_bearer",
      login_id: loginId ?? null,
      payload,
      preflight,
    };

    if (parsed.dryRun) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      return;
    }

    if (!loginId || !password) {
      throw new Error("Missing batch credentials: provide --login-id/--password or BJC_BATCH_LOGIN_ID/BJC_BATCH_PASSWORD");
    }

    const loginResult = await login(baseUrl, { login_id: loginId, password });
    accessToken = loginResult.access_token;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await parseJsonResponse<unknown>(response);
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
          authenticated_account_id: loginResult.account.id,
          authenticated_role: loginResult.account.role,
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
  } finally {
    if (baseUrl && accessToken) {
      await logout(baseUrl, accessToken);
    }
  }
}

await main();
