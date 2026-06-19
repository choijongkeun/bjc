import { DEFAULT_BJC_API_BASE_URL, portHintFromUrl } from "./smoke_config.js";

type EnvLike = Record<string, string | undefined>;

type HealthPayload = {
  ok?: boolean;
  service?: string;
  environment?: string;
  build_commit?: string;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type SmokePreflightResult = {
  ok: boolean;
  smokeBaseUrl?: string;
  healthStatus?: "ok";
  apiService?: string;
  apiEnvironment?: string;
  buildCommit?: string;
  reason?: string;
  hint?: string;
};

function fail(smokeBaseUrl: string | undefined, reason: string, hint?: string): SmokePreflightResult {
  return {
    ok: false,
    smokeBaseUrl,
    reason,
    hint,
  };
}

export function requireSmokeBaseUrl(env: EnvLike): string {
  const value = env.BJC_SMOKE_BASE_URL?.trim();
  if (!value) {
    throw new Error("BJC_SMOKE_BASE_URL is required");
  }
  return value;
}

export function parseSmokeBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("BJC_SMOKE_BASE_URL must be a valid http(s) URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BJC_SMOKE_BASE_URL must use http or https");
  }

  return url;
}

export function validateHealthPayload(payload: HealthPayload): { ok: true; payload: Required<Pick<HealthPayload, "service">> & HealthPayload } | { ok: false; reason: string } {
  if (payload.ok !== true) {
    return { ok: false, reason: "health endpoint unavailable" };
  }

  if (payload.service !== "bjc-api") {
    return { ok: false, reason: "unexpected service response; stale server possible" };
  }

  return {
    ok: true,
    payload: {
      ...payload,
      service: payload.service,
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("request timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readHealthPayload(response: { text(): Promise<string> }): Promise<HealthPayload> {
  const text = await response.text();
  try {
    return JSON.parse(text) as HealthPayload;
  } catch {
    throw new Error("health endpoint returned non-json response");
  }
}

export async function runSmokePreflight(options: {
  env?: EnvLike;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
} = {}): Promise<SmokePreflightResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const timeoutMs = options.timeoutMs ?? 3000;

  let smokeBaseUrl: string;
  let parsedUrl: URL;

  try {
    smokeBaseUrl = requireSmokeBaseUrl(env);
    parsedUrl = parseSmokeBaseUrl(smokeBaseUrl);
  } catch (error) {
    return fail(undefined, error instanceof Error ? error.message : "invalid smoke base url");
  }

  const healthUrl = new URL("/health", parsedUrl).toString();
  const hint = `Check the process listening on port ${portHintFromUrl(parsedUrl)}: lsof -nP -iTCP:${portHintFromUrl(parsedUrl)} -sTCP:LISTEN`;

  try {
    const response = await withTimeout(
      fetchImpl(healthUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }),
      timeoutMs
    );

    if (!response.ok) {
      return fail(smokeBaseUrl, "health endpoint unavailable", hint);
    }

    const payload = await readHealthPayload(response);
    const validated = validateHealthPayload(payload);
    if (!validated.ok) {
      return fail(smokeBaseUrl, validated.reason, hint);
    }

    return {
      ok: true,
      smokeBaseUrl,
      healthStatus: "ok",
      apiService: validated.payload.service,
      apiEnvironment: validated.payload.environment,
      buildCommit: validated.payload.build_commit,
    };
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "request timed out"
        ? "health endpoint timeout"
        : error instanceof Error
          ? error.message
          : "health endpoint unavailable";
    return fail(smokeBaseUrl, reason, hint);
  }
}

function printResult(result: SmokePreflightResult) {
  process.stdout.write(`smoke_base_url=${result.smokeBaseUrl ?? DEFAULT_BJC_API_BASE_URL}\n`);
  if (result.ok) {
    process.stdout.write("health_status=ok\n");
    process.stdout.write(`api_service=${result.apiService}\n`);
    if (result.apiEnvironment) {
      process.stdout.write(`api_environment=${result.apiEnvironment}\n`);
    }
    if (result.buildCommit) {
      process.stdout.write(`build_commit=${result.buildCommit}\n`);
    }
    process.stdout.write("preflight=PASS\n");
    return;
  }

  process.stdout.write("preflight=FAIL\n");
  process.stdout.write(`reason=${result.reason}\n`);
  if (result.hint) {
    process.stdout.write(`hint=${result.hint}\n`);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  const result = await runSmokePreflight();
  printResult(result);
  process.exit(result.ok ? 0 : 1);
}
