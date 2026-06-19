import { describe, expect, it, vi } from "vitest";

import { parseSmokeBaseUrl, requireSmokeBaseUrl, runSmokePreflight, validateHealthPayload } from "./smoke_preflight.js";

function createResponse(body: unknown, options: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "content-type") {
          return options.contentType ?? "application/json";
        }
        return null;
      },
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe("smoke_preflight", () => {
  it("fails when smoke base url is missing", () => {
    expect(() => requireSmokeBaseUrl({})).toThrow("BJC_SMOKE_BASE_URL is required");
  });

  it("fails for invalid smoke base url", () => {
    expect(() => parseSmokeBaseUrl("not-a-url")).toThrow("BJC_SMOKE_BASE_URL must be a valid http(s) URL");
  });

  it("fails when health endpoint is unavailable", async () => {
    const result = await runSmokePreflight({
      env: { BJC_SMOKE_BASE_URL: "http://127.0.0.1:3001" },
      fetchImpl: vi.fn(async () => createResponse({ ok: false }, { ok: false, status: 503 })),
      timeoutMs: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("health endpoint unavailable");
  });

  it("fails when service does not match bjc-api", async () => {
    const result = await runSmokePreflight({
      env: { BJC_SMOKE_BASE_URL: "http://127.0.0.1:3001" },
      fetchImpl: vi.fn(async () => createResponse({ ok: true, service: "other-api" })),
      timeoutMs: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("unexpected service response; stale server possible");
  });

  it("passes for healthy bjc-api response", async () => {
    const result = await runSmokePreflight({
      env: { BJC_SMOKE_BASE_URL: "http://127.0.0.1:3001" },
      fetchImpl: vi.fn(async () =>
        createResponse({
          ok: true,
          service: "bjc-api",
          environment: "development",
          build_commit: "abc1234",
        })
      ),
      timeoutMs: 10,
    });

    expect(result).toMatchObject({
      ok: true,
      smokeBaseUrl: "http://127.0.0.1:3001",
      healthStatus: "ok",
      apiService: "bjc-api",
      apiEnvironment: "development",
      buildCommit: "abc1234",
    });
  });

  it("fails on timeout", async () => {
    const result = await runSmokePreflight({
      env: { BJC_SMOKE_BASE_URL: "http://127.0.0.1:3001" },
      fetchImpl: vi.fn(
        () =>
          new Promise<{
            ok: boolean;
            status: number;
            headers: { get(name: string): string | null };
            text(): Promise<string>;
          }>(() => {})
      ),
      timeoutMs: 10,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("health endpoint timeout");
  });

  it("validates health payload directly", () => {
    expect(validateHealthPayload({ ok: true, service: "bjc-api" })).toEqual({
      ok: true,
      payload: {
        ok: true,
        service: "bjc-api",
      },
    });
  });
});
