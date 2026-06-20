import { expect, test } from "@playwright/test";
import { cleanupBjcFixture } from "../../scripts/fixtures/bjcFixtureCleanup.js";
import { createBjcFixture } from "../../scripts/fixtures/bjcFixtureFactory.js";
import type { BjcFixture } from "../../scripts/fixtures/bjcFixtureTypes.js";
import { assertApiReady, jsonRequest, loginAdminUi } from "../helpers/api.js";
import { E2E_ADMIN_URL } from "../helpers/env.js";

let fixture: BjcFixture;

test.beforeAll(async ({ request }) => {
  fixture = await createBjcFixture();
  await assertApiReady(request);
});

test.afterAll(async () => {
  await cleanupBjcFixture(fixture);
});

test("회원 상세, 상태 변경, referral/binary/downline 조회를 검증한다", async ({ page, request }) => {
  await loginAdminUi(page, fixture.accounts.admin.id);

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=accounts&accountId=${fixture.accounts.root_user.id}`);
  await page.getByPlaceholder("아이디 / 이름 / 추천 코드").fill(fixture.credentials.root_user.login_id);
  await page.getByRole("button", { name: "조회" }).click();
  await expect(page.getByRole("heading", { name: "회원 상세" })).toBeVisible();
  await expect(page.getByText(fixture.credentials.root_user.login_id, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("회원 상태 변경", { exact: true })).toBeVisible();
  await page.getByPlaceholder("변경 사유를 남길 수 있습니다.").fill("e2e block");
  await page.getByRole("button", { name: "상태 변경" }).click();
  await expect
    .poll(async () => {
      const detail = await jsonRequest<{ account: { status: string } }>(
        request,
        `/api/admin/accounts/${fixture.accounts.root_user.id}`,
        { actorId: fixture.accounts.admin.id }
      );
      return detail.account.status;
    })
    .toBe("BLOCKED");

  const detail = await jsonRequest<{ account: { status: string } }>(
    request,
    `/api/admin/accounts/${fixture.accounts.root_user.id}`,
    { actorId: fixture.accounts.admin.id }
  );
  expect(detail.account.status).toBe("BLOCKED");

  await page.goto(`${E2E_ADMIN_URL}/admin?tab=network&accountId=${fixture.accounts.root_user.id}`);
  await expect(page.getByText("추천 조직도")).toBeVisible();
  await expect(page.getByText("바이너리 조직도")).toBeVisible();
  await expect(page.getByText("하위 회원 목록")).toBeVisible();

  const referralTree = await jsonRequest<{ root: { account_id: string }; children: Array<{ account_id: string }> }>(
    request,
    `/api/admin/accounts/${fixture.accounts.root_user.id}/referral-tree?depth=3`,
    { actorId: fixture.accounts.admin.id }
  );
  expect(referralTree.children).toHaveLength(2);

  const binaryLegs = await jsonRequest<{ left: { member_count: number }; right: { member_count: number } }>(
    request,
    `/api/admin/accounts/${fixture.accounts.root_user.id}/binary-legs`,
    { actorId: fixture.accounts.admin.id }
  );
  expect(binaryLegs.left.member_count).toBe(1);
  expect(binaryLegs.right.member_count).toBe(1);
});
