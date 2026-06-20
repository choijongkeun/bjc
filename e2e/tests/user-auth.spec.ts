import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, loginUserUi } from "../helpers/api.js";
import { E2E_USER_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("회원가입, 로그인, 로그아웃, 보호 경로 차단을 검증한다", async ({ page }) => {
  await page.goto(`${E2E_USER_URL}/register`);
  await page.getByLabel("아이디").fill(`e2e_registered_${fixture.suffix}`);
  await page.getByLabel("이름").fill(`Registered ${fixture.suffix}`);
  await page.getByLabel("비밀번호", { exact: true }).fill(fixture.credentials.register_password);
  await page.getByLabel("비밀번호 확인").fill(fixture.credentials.register_password);
  await page.getByRole("combobox").selectOption("LEFT");
  await page.getByPlaceholder("추천인 코드").fill(fixture.accounts.root_user.referral_code);
  await page.getByRole("button", { name: "추천인 확인" }).click();
  await expect(page.getByText("추천인 확인 완료")).toBeVisible();
  await page.getByRole("button", { name: "회원가입" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("내 계정 요약")).toBeVisible();

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto(`${E2E_USER_URL}/dashboard`);
  await expect(page).toHaveURL(/\/login/);
});

test("잘못된 비밀번호와 BLOCKED 계정 로그인을 차단한다", async ({ page }) => {
  await page.goto(`${E2E_USER_URL}/login`);
  await page.getByLabel("아이디").fill(fixture.credentials.root_user.login_id);
  await page.getByLabel("비밀번호", { exact: true }).fill("WrongPassword!123");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("로그인 실패")).toBeVisible();

  await page.getByLabel("아이디").fill(fixture.credentials.blocked_user.login_id);
  await page.getByLabel("비밀번호", { exact: true }).fill(fixture.credentials.blocked_user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("로그인 실패")).toBeVisible();
});

test("로그인 후 auth/me와 로그아웃 후 보호 경로를 다시 확인한다", async ({ page }) => {
  await loginUserUi(page, fixture.credentials.root_user);
  await expect(page.getByText(fixture.credentials.root_user.login_id, { exact: true }).first()).toBeVisible();
  await page.goto(`${E2E_USER_URL}/network`);
  await expect(page.getByRole("heading", { name: "추천 조직", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);
});
