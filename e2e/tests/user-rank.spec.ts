import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, jsonRequest, loginUserUi } from "../helpers/api.js";
import { E2E_USER_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
  await jsonRequest(request, "/api/admin/calc-runs/daily-reward", {
    method: "POST",
    actorId: fixture.accounts.admin.id,
    body: { policy_version_id: fixture.ids.policy_id, reward_date: fixture.calculation_date },
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
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("현재 직급, 다음 직급 조건, rank history와 최근 rank bonus를 보여준다", async ({ page, request }) => {
  const rank = await jsonRequest<{
    rank_status: { current_rank_level: number | null } | null;
    latest_qualification_result: { applied_rank_level: number } | null;
    next_rank: { rank_level: number } | null;
  }>(request, "/api/me/rank", {
    accessToken: (await jsonRequest<{ access_token: string }>(request, "/api/auth/login", {
      method: "POST",
      body: fixture.credentials.root_user,
    })).access_token,
  });
  const currentRankLevel = rank.rank_status?.current_rank_level ?? rank.latest_qualification_result?.applied_rank_level ?? 0;
  expect(currentRankLevel).toBeGreaterThan(0);

  await loginUserUi(page, fixture.credentials.root_user);
  await page.goto(`${E2E_USER_URL}/rank`);
  await expect(page.getByText("현재 직급", { exact: true })).toBeVisible();
  await expect(page.getByText("다음 직급", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "최근 RANK_BONUS 내역" })).toBeVisible();
  await expect(page.getByRole("link", { name: "보상 상세" }).first()).toBeVisible();
});
