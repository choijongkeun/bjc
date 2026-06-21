import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, jsonRequest, loginAdminUi, loginUserByApi, rawRequest, runAllRewardBatches } from "../helpers/api.js";
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

test("REQUESTED -> APPROVED -> PROCESSING -> COMPLETED 와 실패 validation을 검증한다", async ({ page, request }) => {
  const userSession = await loginUserByApi(request, fixture.credentials.root_user);
  const adminSession = await loginUserByApi(request, fixture.credentials.admin);
  const created = await jsonRequest<{ withdrawal: { id: string; status: string } }>(request, "/api/me/withdrawals", {
    method: "POST",
    accessToken: userSession.access_token,
    body: {
      withdrawal_type: "DAILY_REWARD",
      requested_amount_base: "50",
      idempotency_key: `admin-withdrawal-${fixture.suffix}`,
      wallet_address: "0xabc123456789",
      network: "BSC",
    },
  });
  const withdrawalId = created.withdrawal.id;

  await loginAdminUi(page, fixture.credentials.admin);
  await page.goto(`${E2E_ADMIN_URL}/admin?tab=withdrawals`);
  await expect(page.getByRole("heading", { name: "출금 상세" })).toBeVisible();

  const badComplete = await rawRequest(request, `/api/admin/withdrawals/${withdrawalId}/complete`, {
    method: "POST",
    accessToken: adminSession.access_token,
    body: { tx_hash: "", network: "" },
  });
  expect(badComplete.status()).toBe(422);

  await jsonRequest(request, `/api/admin/withdrawals/${withdrawalId}/approve`, {
    method: "POST",
    accessToken: adminSession.access_token,
  });
  await jsonRequest(request, `/api/admin/withdrawals/${withdrawalId}/processing`, {
    method: "POST",
    accessToken: adminSession.access_token,
    body: { network: "BSC" },
  });
  await jsonRequest(request, `/api/admin/withdrawals/${withdrawalId}/complete`, {
    method: "POST",
    accessToken: adminSession.access_token,
    body: { tx_hash: "0xfeedbeef", network: "BSC" },
  });

  const detail = await jsonRequest<{ withdrawal: { status: string; tx_hash: string | null; network: string | null } }>(
    request,
    `/api/admin/withdrawals/${withdrawalId}`,
    { accessToken: adminSession.access_token }
  );
  expect(detail.withdrawal.status).toBe("COMPLETED");
  expect(detail.withdrawal.tx_hash).toBe("0xfeedbeef");
  expect(detail.withdrawal.network).toBe("BSC");
});
