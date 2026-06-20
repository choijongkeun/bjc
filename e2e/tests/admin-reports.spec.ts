import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, loginAdminUi, runAllRewardBatches } from "../helpers/api.js";
import { E2E_ADMIN_URL, E2E_API_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
  await runAllRewardBatches(request, fixture);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("리포트 화면과 CSV content-type을 검증한다", async ({ page, request }) => {
  await loginAdminUi(page, fixture.accounts.admin.id);
  await page.goto(`${E2E_ADMIN_URL}/admin?tab=reports`);
  await expect(page.getByText("Reward By Type")).toBeVisible();
  await expect(page.getByText("Calc Run Summary")).toBeVisible();
  await expect(page.getByRole("button", { name: "rewards.csv" })).toBeVisible();
  await expect(page.getByRole("button", { name: "calc-runs.csv" })).toBeVisible();

  const rewardsCsv = await request.get(
    `${E2E_API_URL}/api/admin/reports/rewards.csv?policy_version_id=${fixture.ids.policy_id}&reward_type=CONTRIBUTION`,
    { headers: { "x-actor-account-id": fixture.accounts.admin.id } }
  );
  expect(rewardsCsv.ok()).toBeTruthy();
  expect(rewardsCsv.headers()["content-type"]).toContain("text/csv");

  const calcRunsCsv = await request.get(
    `${E2E_API_URL}/api/admin/reports/calc-runs.csv?policy_version_id=${fixture.ids.policy_id}&run_type=SIDECAR`,
    { headers: { "x-actor-account-id": fixture.accounts.admin.id } }
  );
  expect(calcRunsCsv.ok()).toBeTruthy();
  expect(calcRunsCsv.headers()["content-type"]).toContain("text/csv");
});
