import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, jsonRequest, loginUserByApi, loginUserUi, runAllRewardBatches } from "../helpers/api.js";
import { E2E_USER_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
  await runAllRewardBatches(request, fixture);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("스테이킹 신청, 중복 idempotency, 상세와 취소 요청 흐름을 검증한다", async ({ page, request }) => {
  const session = await loginUserByApi(request, fixture.credentials.root_user);
  const first = await jsonRequest<{ staking: { id: string; status: string } }>(request, "/api/me/stakings", {
    method: "POST",
    accessToken: session.access_token,
    body: {
      staking_product_id: fixture.ids.product_id,
      principal_amount_base: "2500",
      idempotency_key: `stake-${fixture.suffix}`,
    },
  });
  const second = await jsonRequest<{ staking: { id: string; status: string } }>(request, "/api/me/stakings", {
    method: "POST",
    accessToken: session.access_token,
    body: {
      staking_product_id: fixture.ids.product_id,
      principal_amount_base: "2500",
      idempotency_key: `stake-${fixture.suffix}`,
    },
  });
  expect(second.staking.id).toBe(first.staking.id);

  await jsonRequest(request, `/api/admin/stakings/${first.staking.id}/activate`, {
    method: "POST",
    actorId: fixture.accounts.admin.id,
  });

  await loginUserUi(page, fixture.credentials.root_user);
  await page.goto(`${E2E_USER_URL}/staking`);
  await expect(page.getByText("신청 가능한 스테이킹 상품")).toBeVisible();
  await expect(page.getByRole("heading", { name: "내 스테이킹 목록" })).toBeVisible();

  await page.goto(`${E2E_USER_URL}/staking/${first.staking.id}`);
  await expect(page.getByText("취소 요청 가능")).toBeVisible();
  await page.getByRole("button", { name: "취소 요청" }).click();
  await page.getByRole("button", { name: "취소 요청 실행" }).click();
  await expect(page.getByText("취소 요청이 접수되었습니다.").first()).toBeVisible();
});

test("Rewards summary, 상세 allowlist, 다른 회원 reward 404를 검증한다", async ({ page, request }) => {
  const session = await loginUserByApi(request, fixture.credentials.root_user);
  const rewards = await jsonRequest<{
    items: Array<{ id: string; reward_type: string; metadata?: Record<string, unknown> }>;
  }>(request, "/api/me/rewards?page=1&limit=20", {
    accessToken: session.access_token,
  });
  const contributionReward = rewards.items.find((item) => item.reward_type === "CONTRIBUTION");
  expect(contributionReward).toBeTruthy();
  expect(contributionReward?.metadata?.password).toBeUndefined();

  await loginUserUi(page, fixture.credentials.root_user);
  await page.goto(`${E2E_USER_URL}/rewards`);
  await expect(page.getByRole("heading", { name: "보상 내역" })).toBeVisible();
  await expect(page.getByText("내 보상 요약")).toBeVisible();

  if (contributionReward) {
    await page.goto(`${E2E_USER_URL}/rewards/${contributionReward.id}`);
    await expect(page.getByText("보상 계산 정보")).toBeVisible();
    await expect(page.getByText("풀 금액")).toBeVisible();
    await expect(page.getByText("FORMULA VERSION")).toHaveCount(0);
    await expect(page.getByText("source_reference")).toHaveCount(0);
  }

  const otherSession = await loginUserByApi(request, fixture.credentials.other_user);
  const forbiddenReward = await request.get(
    `${process.env.BJC_E2E_API_URL ?? "http://127.0.0.1:3011"}/api/me/rewards/${contributionReward?.id}`,
    {
      headers: { Authorization: `Bearer ${otherSession.access_token}` },
    }
  );
  expect(forbiddenReward.status()).toBe(404);
});

test("출금 balance, preview, 신청, 취소와 다른 회원 withdrawal 404를 검증한다", async ({ page, request }) => {
  const session = await loginUserByApi(request, fixture.credentials.root_user);
  const balance = await jsonRequest<{
    daily_reward: { available_amount_base: string };
    bonus: { available_amount_base: string };
  }>(request, "/api/me/withdrawal-balance", {
    accessToken: session.access_token,
  });
  expect(balance.daily_reward.available_amount_base).not.toBe("0");
  expect(balance.bonus.available_amount_base).not.toBe("0");

  const preview = await jsonRequest<{ fee_amount_base: string; net_amount_base: string }>(
    request,
    "/api/me/withdrawal-preview",
    {
      method: "POST",
      accessToken: session.access_token,
      body: { withdrawal_type: "DAILY_REWARD", requested_amount_base: "50" },
    }
  );
  expect(preview.net_amount_base).toBeTruthy();

  const created = await jsonRequest<{ withdrawal: { id: string; status: string } }>(request, "/api/me/withdrawals", {
    method: "POST",
    accessToken: session.access_token,
    body: {
      withdrawal_type: "DAILY_REWARD",
      requested_amount_base: "50",
      idempotency_key: `withdrawal-${fixture.suffix}`,
      wallet_address: "0xabc123456789",
      network: "BSC",
    },
  });
  const withdrawalId = created.withdrawal.id;

  await loginUserUi(page, fixture.credentials.root_user);
  await page.goto(`${E2E_USER_URL}/withdrawals`);
  await expect(page.getByRole("heading", { name: "출금 가능 잔액" })).toBeVisible();
  await expect(page.getByText("보너스 출금 가능", { exact: true }).first()).toBeVisible();

  await page.goto(`${E2E_USER_URL}/withdrawals/${withdrawalId}`);
  await expect(page.getByText("출금 기본 정보")).toBeVisible();
  await page.getByRole("button", { name: "출금 신청 취소" }).click();
  await page.getByRole("button", { name: "출금 신청 취소", exact: true }).last().click();
  await expect(page.getByText("출금 요청이 취소")).toBeVisible();

  const otherSession = await loginUserByApi(request, fixture.credentials.other_user);
  const forbiddenWithdrawal = await request.get(
    `${process.env.BJC_E2E_API_URL ?? "http://127.0.0.1:3011"}/api/me/withdrawals/${withdrawalId}`,
    {
      headers: { Authorization: `Bearer ${otherSession.access_token}` },
    }
  );
  expect(forbiddenWithdrawal.status()).toBe(404);
});
