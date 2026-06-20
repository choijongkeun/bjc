# BJC Reward Batch Scheduler Runbook V1

## Current State
- 실제 cron 등록은 하지 않았습니다.
- 운영자는 `scripts/run_reward_batch.ts` 와 `npm run batch:*` 스크립트로 명시 실행합니다.
- 현재 dry-run 은 `health/ready + service 확인 + payload 검증 + endpoint/URL 출력` 까지만 수행합니다.
- 서버에 no-write batch simulation API 는 아직 없습니다.

## Recommended Order
1. `DAILY_REWARD`
2. `DIRECT_REFERRAL`
3. `RANK_QUALIFICATION`
4. `RANK_BONUS`
5. `CONTRIBUTION`
6. `SIDECAR`

## Why This Order
- `DIRECT_REFERRAL` 는 활성 staking 을 읽습니다.
- `RANK_QUALIFICATION` 은 binary volume 상태를 고정합니다.
- `RANK_BONUS` 는 rank qualification 결과와 daily reward 를 읽습니다.
- `CONTRIBUTION` 과 `SIDECAR` 는 withdrawal request 기반으로 계산합니다.

## CLI Examples
- Dry-run: `npm run batch:daily-reward -- --policy=<id> --date=2026-06-20 --actor-id=<admin-id> --dry-run`
- Execute: `npm run batch:contribution -- --policy=<id> --date=2026-06-20 --actor-id=<admin-id> --execute`
- Direct referral 단일 날짜: `npm run batch:direct-referral -- --policy=<id> --date=2026-06-20 --actor-id=<admin-id> --execute`

## Re-run Policy
- 동일 snapshot 재실행은 duplicate 로 취급합니다.
- snapshot 이 다르면 conflict 로 처리합니다.
- 회원 단위 실패는 batch summary 의 `failed_count` 로 누적합니다.
- rule 자체 오류는 해당 calc_run 을 `FAILED` 로 종료합니다.

## Timezone
- 운영 기준 시간대는 `Asia/Seoul` 입니다.
- 날짜 인자는 `YYYY-MM-DD` 형식으로 전달합니다.

## Lock / Idempotency
- calc_run 키는 기존 runtime 의 `policy_version_id + run_type + date` 규칙을 따릅니다.
- 실행 중 동일 키 재실행은 conflict 또는 in-progress 로 거부될 수 있습니다.

## Failure Recovery
- `/ready` 가 실패하면 실행하지 않습니다.
- dry-run 출력의 `url`, `payload`, `preflight` 를 먼저 검토합니다.
- 실패한 batch 는 원인 수정 후 동일 날짜로 재실행합니다.

## SIDECAR Note
- SIDECAR 는 현재 `account_rewards` row 를 만들지 않습니다.
- BONUS 잔액에도 반영하지 않습니다.
- 목적은 release/freeze settlement 분리입니다.
- 향후 materialization 이 필요하면 별도 migration 과 정책 확정이 선행돼야 합니다.
