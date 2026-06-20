import { Socket } from "node:net";

type EnvLike = Record<string, string | undefined>;

type HealthPayload = {
  ok?: boolean;
  service?: string;
  environment?: string;
  build_commit?: string;
};

type E2eTarget = {
  name: "api" | "admin" | "user";
  envKey: "BJC_E2E_API_URL" | "BJC_E2E_ADMIN_URL" | "BJC_E2E_USER_URL";
  defaultUrl: string;
};

type E2ePreflightResult = {
  ok: boolean;
  api_url: string;
  admin_url: string;
  user_url: string;
  reason?: string;
  hint?: string;
  stale_service?: string;
  api_environment?: string;
  build_commit?: string;
};

const API_TARGET: E2eTarget = { name: "api", envKey: "BJC_E2E_API_URL", defaultUrl: "http://127.0.0.1:3011" };
const ADMIN_TARGET: E2eTarget = { name: "admin", envKey: "BJC_E2E_ADMIN_URL", defaultUrl: "http://127.0.0.1:4191" };
const USER_TARGET: E2eTarget = { name: "user", envKey: "BJC_E2E_USER_URL", defaultUrl: "http://127.0.0.1:4192" };
const TARGETS: E2eTarget[] = [API_TARGET, ADMIN_TARGET, USER_TARGET];

function parseTargetUrl(target: E2eTarget, env: EnvLike): URL {
  const raw = env[target.envKey] ?? target.defaultUrl;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${target.envKey} must be a valid http(s) URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${target.envKey} must use http or https`);
  }
  return url;
}

function getPort(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === "https:" ? 443 : 80;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function isPortListening(url: URL, timeoutMs = 750): Promise<boolean> {
  const port = getPort(url);
  const host = url.hostname;

  return await new Promise<boolean>((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function readApiHealth(url: URL): Promise<HealthPayload | null> {
  const healthUrl = new URL("/health", url).toString();
  try {
    const response = await withTimeout(
      fetch(healthUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
      1_500,
      "health endpoint timeout"
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as HealthPayload;
  } catch {
    return null;
  }
}

function fail(urls: Record<E2eTarget["name"], URL>, reason: string, hint: string, payload: Partial<E2ePreflightResult> = {}): E2ePreflightResult {
  return {
    ok: false,
    api_url: urls.api.toString(),
    admin_url: urls.admin.toString(),
    user_url: urls.user.toString(),
    reason,
    hint,
    ...payload,
  };
}

export async function runE2ePreflight(env: EnvLike = process.env): Promise<E2ePreflightResult> {
  const urls = {
    api: parseTargetUrl(API_TARGET, env),
    admin: parseTargetUrl(ADMIN_TARGET, env),
    user: parseTargetUrl(USER_TARGET, env),
  } satisfies Record<E2eTarget["name"], URL>;

  const hints = TARGETS.map((target) => `lsof -nP -iTCP:${getPort(urls[target.name])} -sTCP:LISTEN`).join(" | ");

  for (const target of TARGETS) {
    const url = urls[target.name];
    const listening = await isPortListening(url);
    if (!listening) {
      continue;
    }

    if (target.name === "api") {
      const payload = await readApiHealth(url);
      if (payload?.ok === true && payload.service === "bjc-api") {
        return fail(
          urls,
          `E2E API port ${getPort(url)} is already serving bjc-api; stop the stale server before running Playwright`,
          hints,
          {
            stale_service: payload.service,
            api_environment: payload.environment,
            build_commit: payload.build_commit,
          }
        );
      }
      return fail(urls, `E2E API port ${getPort(url)} is already in use`, hints);
    }

    return fail(urls, `E2E ${target.name} port ${getPort(url)} is already in use`, hints);
  }

  return {
    ok: true,
    api_url: urls.api.toString(),
    admin_url: urls.admin.toString(),
    user_url: urls.user.toString(),
  };
}

function printResult(result: E2ePreflightResult) {
  process.stdout.write(`api_url=${result.api_url}\n`);
  process.stdout.write(`admin_url=${result.admin_url}\n`);
  process.stdout.write(`user_url=${result.user_url}\n`);
  if (result.ok) {
    process.stdout.write("preflight=PASS\n");
    return;
  }
  process.stdout.write("preflight=FAIL\n");
  process.stdout.write(`reason=${result.reason}\n`);
  if (result.stale_service) {
    process.stdout.write(`stale_service=${result.stale_service}\n`);
  }
  if (result.api_environment) {
    process.stdout.write(`api_environment=${result.api_environment}\n`);
  }
  if (result.build_commit) {
    process.stdout.write(`build_commit=${result.build_commit}\n`);
  }
  if (result.hint) {
    process.stdout.write(`hint=${result.hint}\n`);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  try {
    const result = await runE2ePreflight();
    printResult(result);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stdout.write(
      `preflight=FAIL\nreason=${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  }
}
