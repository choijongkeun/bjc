import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, loginAdminUi, rawRequest } from "../helpers/api.js";
import { E2E_ADMIN_URL, E2E_API_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("READER는 조회만 가능하고 mutation 및 CSV export가 차단된다", async ({ page, request }) => {
  await loginAdminUi(page, fixture.accounts.reader.id);

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=rewards`);
  await expect(page.getByRole("button", { name: "기여 보상 실행" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "사이드카 정산 실행" })).toHaveCount(0);

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=accounts&accountId=${fixture.accounts.root_user.id}`);
  await expect(page.getByText("READER는 상태 변경을 수행할 수 없습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "상태 변경" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "기여 보상 단건 실행" })).toHaveCount(0);

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=withdrawals`);
  await expect(page.getByText("선택된 출금 없음")).toBeVisible();

  const contributionRun = await rawRequest(request, `${"/api/admin/rewards/contribution/run"}`, {
    method: "POST",
    actorId: fixture.accounts.reader.id,
    body: { policy_version_id: fixture.ids.policy_id, calculation_date: fixture.calculation_date },
  });
  expect(contributionRun.status()).toBe(403);

  const statusUpdate = await rawRequest(request, `/api/admin/accounts/${fixture.accounts.root_user.id}/status`, {
    method: "POST",
    actorId: fixture.accounts.reader.id,
    body: { status: "BLOCKED", reason: "reader forbidden" },
  });
  expect(statusUpdate.status()).toBe(403);

  const csvResponse = await request.get(`${E2E_API_URL}/api/admin/reports/rewards.csv?policy_version_id=${fixture.ids.policy_id}`, {
    headers: { "x-actor-account-id": fixture.accounts.reader.id },
  });
  expect(csvResponse.status()).toBe(403);
});
