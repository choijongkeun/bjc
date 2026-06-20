import { expect, type APIRequestContext, type Page } from "@playwright/test";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { E2E_ADMIN_URL, E2E_API_URL, E2E_USER_URL } from "./env.js";

type JsonInit = {
  method?: "GET" | "POST";
  actorId?: string;
  accessToken?: string;
  body?: unknown;
};

export async function assertApiReady(request: APIRequestContext) {
  const health = await request.get(`${E2E_API_URL}/health`);
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toEqual(
    expect.objectContaining({
      ok: true,
      service: "bjc-api",
    })
  );

  const ready = await request.get(`${E2E_API_URL}/ready`);
  expect(ready.ok()).toBeTruthy();
  expect(await ready.json()).toEqual(
    expect.objectContaining({
      ok: true,
      service: "bjc-api",
      database: "ready",
    })
  );
}

export async function jsonRequest<T>(request: APIRequestContext, path: string, init: JsonInit = {}): Promise<T> {
  const response = await request.fetch(`${E2E_API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.actorId ? { "x-actor-account-id": init.actorId } : {}),
      ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    data: init.body,
  });
  expect(response.ok(), `${path} failed: ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

export async function rawRequest(request: APIRequestContext, path: string, init: JsonInit = {}) {
  return request.fetch(`${E2E_API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.actorId ? { "x-actor-account-id": init.actorId } : {}),
      ...(init.accessToken ? { Authorization: `Bearer ${init.accessToken}` } : {}),
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    data: init.body,
  });
}

export async function loginUserByApi(
  request: APIRequestContext,
  credentials: { login_id: string; password: string }
): Promise<{ access_token: string; account: { id: string; login_id: string } }> {
  return jsonRequest(request, "/api/auth/login", {
    method: "POST",
    body: credentials,
  });
}

export async function loginAdminUi(page: Page, actorId: string) {
  await page.goto(`${E2E_ADMIN_URL}/login`);
  await page.getByLabel(/Actor Account ID/i).fill(actorId);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/admin\?tab=policies/);
}

export async function loginUserUi(page: Page, credentials: { login_id: string; password: string }) {
  await page.goto(`${E2E_USER_URL}/login`);
  await page.getByLabel(/Login ID/i).fill(credentials.login_id);
  await page.getByLabel(/Password/i).fill(credentials.password);
  await page.getByRole("button", { name: /로그인/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function runAllRewardBatches(request: APIRequestContext, fixture: BjcFixture) {
  await jsonRequest(request, "/api/admin/calc-runs/daily-reward", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, reward_date: fixture.calculation_date },
  });
  await jsonRequest(request, "/api/admin/rewards/direct-referral/run", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, activated_from: "2026-06-20", activated_to: "2026-06-20" },
  });
  await jsonRequest(request, "/api/admin/rewards/rank-qualification/run", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
  });
  await jsonRequest(request, "/api/admin/rewards/rank-bonus/run", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
  });
  await jsonRequest(request, "/api/admin/rewards/contribution/run", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
  });
  await jsonRequest(request, "/api/admin/rewards/sidecar/run", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
  });
}
