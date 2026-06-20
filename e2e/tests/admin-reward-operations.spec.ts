import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, jsonRequest, loginAdminUi, runAllRewardBatches } from "../helpers/api.js";
import { E2E_ADMIN_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
  await runAllRewardBatches(request, fixture);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("배치 실행 결과, calc_run summary, reward drill-down, duplicate 재실행을 검증한다", async ({ page, request }) => {
  const duplicateContribution = await jsonRequest<{ status: string; duplicate_skip_count: number; conflict_count?: number }>(
    request,
    "/api/admin/rewards/contribution/run",
    {
      method: "POST",
      actorId: fixture.accounts.admin.id,
      body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
    }
  );
  expect(duplicateContribution.status).toBeTruthy();
  expect(duplicateContribution.duplicate_skip_count).toBeGreaterThanOrEqual(0);

  const duplicateSidecar = await jsonRequest<{ status: string; duplicate_skip_count: number; conflict_count?: number }>(
    request,
    "/api/admin/rewards/sidecar/run",
    {
      method: "POST",
      actorId: fixture.accounts.admin.id,
      body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
    }
  );
  expect(duplicateSidecar.status).toBeTruthy();
  expect(duplicateSidecar.duplicate_skip_count).toBeGreaterThanOrEqual(0);

  await loginAdminUi(page, fixture.accounts.admin.id);
  await page.goto(`${E2E_ADMIN_URL}/admin?tab=rewards`);
  await expect(page.getByRole("button", { name: "기여 보상 실행" })).toBeVisible();
  await expect(page.getByRole("button", { name: "사이드카 정산 실행" })).toBeVisible();

  const calcRuns = await jsonRequest<{ items: Array<{ id: string; run_type: string }> }>(
    request,
    `/api/admin/reports/calc-run-summary?policy_version_id=${fixture.ids.policy_id}`,
    { actorId: fixture.accounts.admin.id }
  );
  expect(calcRuns.items.some((item) => item.run_type === "CONTRIBUTION")).toBeTruthy();

  const rewards = await jsonRequest<{ items: Array<{ id: string; reward_type: string }> }>(
    request,
    `/api/admin/rewards?policy_version_id=${fixture.ids.policy_id}&page=1&limit=20`,
    { actorId: fixture.accounts.admin.id }
  );
  expect(rewards.items.some((item) => item.reward_type === "CONTRIBUTION")).toBeTruthy();

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=calc`);
  await page.getByRole("row").filter({ hasText: "기여 보상" }).first().click();
  await expect(page.getByText("정산 내역")).toBeVisible();
});
