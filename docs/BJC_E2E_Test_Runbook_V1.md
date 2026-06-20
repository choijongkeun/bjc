# BJC E2E Test Runbook V1

## Scope
- Playwright 기반 User/Admin/Reader E2E를 Chromium 하나로 실행합니다.
- 고정 포트는 `API 3011`, `Admin 4191`, `User 4192` 입니다.
- 기존 프로세스 자동 종료는 하지 않습니다. 포트 충돌 시 실행을 실패시키고 수동 확인합니다.

## Commands
- 준비 빌드: `npm run prepare:e2e`
- 헤드리스 실행: `npm run e2e`
- 헤디드 실행: `npm run e2e:headed`
- 리포트 보기: `npm run e2e:report`

## Test Layout
- `e2e/tests/user-auth.spec.ts`
- `e2e/tests/user-staking-reward-withdrawal.spec.ts`
- `e2e/tests/user-rank.spec.ts`
- `e2e/tests/admin-member-network.spec.ts`
- `e2e/tests/admin-reward-operations.spec.ts`
- `e2e/tests/admin-withdrawal.spec.ts`
- `e2e/tests/admin-reports.spec.ts`
- `e2e/tests/reader-permissions.spec.ts`

## Fixture Policy
- 공통 fixture는 `scripts/fixtures/bjcFixtureFactory.ts` 와 `scripts/fixtures/bjcFixtureCleanup.ts` 를 사용합니다.
- 매 실행마다 고유 `suffix` 를 발급합니다.
- cleanup 은 `policy_version_id`, 명시적 계정 ID, 해당 suffix 로 생성된 계정만 역순 삭제합니다.
- `reward_type` 전체 삭제나 운영 데이터 전역 삭제는 금지합니다.

## Verification
- `/health` 와 `/ready` 가 모두 `ok=true`, `service=bjc-api` 를 반환해야 합니다.
- Playwright `webServer` 는 `reuseExistingServer=false` 로 stale server 재사용을 막습니다.
- 실패 시에만 screenshot, video, trace 를 남깁니다.
- retry 로 flaky test 를 숨기지 않습니다.

## Notes
- Reader 는 mutation 과 CSV export 를 모두 차단합니다.
- SIDECAR 는 현재 `account_rewards` materialization 이 아니라 ledger/settlement 검증만 수행합니다.
