import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, loginAdminUi } from "../helpers/api.js";
import { E2E_ADMIN_URL, E2E_API_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("ADMIN 로그인, 새로고침 세션 복구, 로그아웃 후 보호 경로 차단을 검증한다", async ({ page }) => {
  await loginAdminUi(page, fixture.credentials.admin);
  await expect(page.getByText(fixture.credentials.admin.login_id, { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText(fixture.credentials.admin.login_id, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=policies`);
  await expect(page).toHaveURL(/\/login/);
});

test("READER 로그인과 조회 전용 접근을 검증한다", async ({ page }) => {
  await loginAdminUi(page, fixture.credentials.reader);
  await page.goto(`${E2E_ADMIN_URL}/admin?tab=rewards`);
  await expect(page.getByRole("button", { name: "기여 보상 실행" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사이드카 정산 실행" })).toHaveCount(0);
});

test("잘못된 비밀번호, BLOCKED 계정, USER의 Admin Front 접근을 차단한다", async ({ page }) => {
  await page.goto(`${E2E_ADMIN_URL}/login`);
  await page.getByLabel("아이디", { exact: true }).fill(fixture.credentials.admin.login_id);
  await page.getByLabel("비밀번호", { exact: true }).fill("WrongPassword!123");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("아이디 또는 비밀번호가 올바르지 않습니다.")).toBeVisible();

  await page.getByLabel("아이디", { exact: true }).fill(fixture.credentials.blocked_user.login_id);
  await page.getByLabel("비밀번호", { exact: true }).fill(fixture.credentials.blocked_user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("사용할 수 없는 계정입니다.")).toBeVisible();

  await page.getByLabel("아이디", { exact: true }).fill(fixture.credentials.root_user.login_id);
  await page.getByLabel("비밀번호", { exact: true }).fill(fixture.credentials.root_user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("관리자 화면에 접근할 권한이 없습니다.")).toBeVisible();
});

test("세션 만료 후 로그인 화면으로 이동하고 안내 문구를 표시한다", async ({ page, request }) => {
  await loginAdminUi(page, fixture.credentials.admin);
  const accessToken = await page.evaluate(() => {
    const raw = window.localStorage.getItem("bjc-admin-session");
    if (!raw) return null;
    return JSON.parse(raw)?.state?.accessToken ?? null;
  });
  expect(accessToken).toBeTruthy();

  const logoutResponse = await request.post(`${E2E_API_URL}/api/auth/logout`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {},
  });
  expect(logoutResponse.ok()).toBeTruthy();

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=policies`);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("로그인이 만료되었습니다. 다시 로그인해 주세요.")).toBeVisible();
});
