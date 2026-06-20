# BJC Rank Bonus Implementation Plan V1

## 1. Goal

- 현재 BJC 저장소에 이미 존재하는 `rank_rules`, `RANK_BONUS` enum, 추천/바이너리 구조를 기반으로 직급 산정과 직급 보상 설계를 고정한다.
- 이번 단계는 설계, migration, SQL smoke, API 계약, 구현 계획까지만 포함한다.
- 실제 `RANK_BONUS` runtime service, API wiring, User/Admin UI, 스케줄러는 이번 단계 범위에서 제외한다.

## 2. Scope

포함:

- 저장소 내 BJC 직급/직급보상 관련 자료 분석
- 현재 추천/바이너리/스테이킹/보상 구조 분석
- 직급 산정 기준과 조직 매출 기준 설계
- 승급/유지/하락 정책 설계
- 직급 projection/history/qualification DB 구조 설계
- `0007` migration 및 SQL smoke 작성
- User/Admin API 계약 초안 작성

제외:

- `RANK_BONUS` runtime service
- 신규 User/Admin 화면
- 자동 배치 스케줄러
- `CONTRIBUTION`
- `SIDECAR`
- 바이너리 매칭 수당 실지급
- 기존 `DIRECT_REFERRAL` 수정

## 3. Source Analysis

### 3.1 Reviewed repository materials

- `.trae/documents/BJC_Calculation_Engine_Design_V1.md`
- `.trae/documents/BJC_Member_Referral_Binary_Leg_Design_V1.md`
- `.trae/documents/BJC_Reward_Withdrawal_Implementation_Plan_V1.md`
- `mysql/migrations/0001_bjc_offchain_core_mysql.sql`
- `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
- `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- `mysql/migrations/0006_bjc_direct_referral_rewards_mysql.sql`
- `src/services/networkService.ts`
- `src/services/adminAccountService.ts`
- `src/repos/accountStakingsRepo.ts`
- `src/repos/accountRewardsRepo.ts`
- `src/repos/reportsRepo.ts`

### 3.2 Missing original materials

이번 세션에서 저장소 내에서 확인되지 않은 원본 자료:

- `BJC-디파이플랜.xlsx`
- `BJC-디파이플랜해설.xlsx`
- `BJC-608.pptx`

따라서 이번 설계는 저장소 안에서 검증 가능한 문서/스키마만 근거로 사용한다.

## 4. Confirmed Rank Model

저장소에서 실제로 확인된 사실:

- 직급 정책 테이블이 이미 존재한다:
  - `rank_rules(policy_version_id, rank_level, required_lines, required_weak_volume_base, rank_share_bps, effective_bonus_bps, is_active)`
- `rank_level` 범위는 `1..10`이다.
- `calc_runs.run_type`에는 이미 `RANK_BONUS`가 존재한다.
- `ledger_events.event_type`에는 이미 `RANK_BONUS`가 존재한다.
- `account_rewards.reward_type`에는 이미 `RANK_BONUS`가 존재한다.
- `RANK_BONUS`는 기존 reward summary/withdrawal BONUS bucket에 포함되는 구조다.
- 현재 코드베이스에는 `RANK_BONUS` runtime service가 없고, `rank_level`은 User/Admin/Network 응답에서 대부분 placeholder `0`이다.

## 5. Confirmed Rank List

저장소에서 검증 가능한 직급 식별자는 다음뿐이다.

- 구체적 직급명/직급코드:
  - 확인 불가
- 구체적 지급표:
  - 데이터 미존재
- 확인 가능한 식별 체계:
  - `rank_level = 1..10`

V1 설계 결정:

- 원본 자료 부재 상태에서 `rank_code`, `rank_name`을 임의 생성하지 않는다.
- 이번 단계의 canonical identifier는 `rank_level`만 사용한다.
- 향후 원본 자료가 확보되면 별도 migration에서 `rank_code`, `rank_name`, `display_order`를 확장한다.

## 6. Confirmed Qualification and Payout Logic

### 6.1 Qualification inputs confirmed by repository documents

- `required_lines`
- `required_weak_volume_base`
- 동일 `calculation_date`의 산하 `DAILY_REWARD` 합계
- highest-qualified-rank selection

### 6.2 Payout formula confirmed by repository documents

```text
downline_daily_reward_amount_base
= same-day subordinate DAILY_REWARD total

rank_bonus_amount_base
= floor(downline_daily_reward_amount_base * effective_bonus_bps / 10000)
```

확정 사항:

- `rank_share_bps`는 설명/검증용 snapshot으로 남길 수 있으나 실지급 공식은 `effective_bonus_bps` 기준이다.
- 고정 금액 보상(`rank_bonus_fixed_amount_base`)은 저장소 근거가 없다.
- 월 지급, 주 지급, 일회성 승급 보상 같은 별도 정책은 저장소 근거가 없다.

## 7. Unconfirmed Policy

다음 항목은 저장소 근거만으로 확정할 수 없다.

- 실제 직급명/직급코드
- 개인 활성 스테이킹 원금 최소치가 직급 조건인지 여부
- 개인 누적 스테이킹 원금이 직급 조건인지 여부
- 직접 추천 ACTIVE 회원 수를 `required_lines`와 동일하게 볼지 여부
- 하위 특정 직급 인원 조건 존재 여부
- 강한 라인 cap / 비율 제한
- 매출 이월 / 소진 / carry-over
- 월/주 단위 qualification period
- 자동 하락 시점과 grace period
- 승급 1회 보상인지, 유지형 반복 보상인지 여부

V1 설계 원칙:

- 저장소에서 검증된 조건만 확정한다.
- 나머지는 문서에 미확정 정책으로 분리한다.
- 0007 schema는 미확정 정책이 later extension 되도록 additive 하게 설계한다.

## 8. Sponsor vs Binary Usage

구조 사용 구분은 아래처럼 고정한다.

```text
직추천/직추천 조건
= accounts.sponsor_account_id / referral_edges

LEFT/RIGHT 레그 / weak leg / rank qualification
= binary_nodes / binary_edges
```

금지:

- sponsor 구조로 weak leg 계산
- binary parent 구조로 direct line 조건 계산

## 9. Condition Matrix

| 조건명 | 원천 테이블 | 집계 기간 | 포함 상태 | 제외 상태 | 시간대 | snapshot 필요 여부 |
| --- | --- | --- | --- | --- | --- | --- |
| 현재 직급 | `account_rank_status` | latest projection | n/a | n/a | KST display | yes |
| 직급 계산 결과 | `account_rank_qualification_results` | `calculation_date` 기준 | n/a | n/a | KST | yes |
| 직급 이력 | `account_rank_history` | effective_date 기준 누적 | n/a | n/a | KST | yes |
| 직접 라인 수 | `referral_edges.depth = 1` | `calculation_date` snapshot | 계정 `ACTIVE` 여부는 별도 count로 기록 | `WITHDRAWN`/비활성은 qualification 해석시 별도 | KST snapshot date | yes |
| 직접 ACTIVE 라인 수 | `accounts` + `referral_edges` | `calculation_date` snapshot | `accounts.status = ACTIVE` | `BLOCKED`, `WITHDRAWN` | KST snapshot date | yes |
| 개인 활성 스테이킹 원금 | `account_stakings` | `calculation_date` snapshot | 정책 미확정, V1 결과 테이블에는 기록 | 정책 미확정 | KST | yes |
| 개인 누적 스테이킹 원금 | `account_stakings` | cumulative to `calculation_date` | 정책 미확정, V1 결과 테이블에는 기록 | 정책 미확정 | KST | yes |
| LEFT 레그 매출 | `binary_edges` + `account_stakings` | `calculation_date` snapshot | 정책상 인정되는 staking status | 미확정 | KST | yes |
| RIGHT 레그 매출 | `binary_edges` + `account_stakings` | `calculation_date` snapshot | 정책상 인정되는 staking status | 미확정 | KST | yes |
| weak leg 매출 | qualification 결과 집계값 | `calculation_date` snapshot | `min(left, right)` | n/a | KST | yes |
| 강한 라인 매출 | qualification 결과 집계값 | `calculation_date` snapshot | `max(left, right)` | n/a | KST | yes |
| 보상 기준 매출 | `account_rewards` 또는 `settlement_items` of `DAILY_REWARD` | `calculation_date` | `DAILY_REWARD` only | other reward types | KST | yes |

## 10. Leg Volume Definition

### 10.1 Confirmed portion

저장소에서 확인된 기준:

- `weak_leg_volume_base = min(left_leg_volume_base, right_leg_volume_base)`
- weak leg / leg volume은 binary tree 기준이다.
- rank bonus 계산은 same-day subordinate `DAILY_REWARD`와 qualification result를 함께 사용한다.

### 10.2 V1 recommended volume source

원본 BJC 자료 부재로 포함 상태는 완전히 확정할 수 없으므로, V1 구현 설계는 아래를 권장한다.

- 집계 원천:
  - `binary_edges.root_leg`
  - `account_stakings.principal_amount_base`
- 권장 인정 상태:
  - `ACTIVE`
  - `CANCEL_REQUESTED`
- 제외 상태:
  - `PENDING`
  - `CANCELLED`
  - `MATURED`
  - `CLOSED`

이 권장안의 이유:

- 현재 `account_stakings`가 원금 snapshot과 상태를 가장 명확하게 제공한다.
- `CANCEL_REQUESTED`는 아직 원금이 release 되지 않았을 수 있어 qualification snapshot에 포함할 수 있다.
- 하지만 이는 저장소 문서만으로 완전 확정된 정책은 아니므로, 실제 runtime 구현 단계에서 운영 확인이 필요하다.

## 11. Promotion / Maintenance / Demotion Policy

### 11.1 Promotion

V1 권장:

- `RANK_QUALIFICATION` run에서 계산된 `qualified_rank_level`이 현재 직급보다 높으면 즉시 승급한다.
- 승급 반영 시 `account_rank_status.current_rank_level`을 갱신하고 `account_rank_history`에 `PROMOTED` row를 남긴다.

### 11.2 Maintenance

V1 권장:

- 매 `RANK_QUALIFICATION` run마다 현재 직급 유지 조건을 재검증한다.
- 유지 조건 충족 시 `account_rank_status`는 유지하고, 필요 시 `account_rank_history`에 `MAINTAINED` row를 남긴다.

### 11.3 Demotion

저장소에서 자동 하락 정책은 확인되지 않았다.

V1 설계 결정:

- 자동 하락은 미구현으로 둔다.
- 대신 qualification 결과 테이블에:
  - `previous_rank_level`
  - `qualified_rank_level`
  - `applied_rank_level`
  - `result_status = DEMOTION_CANDIDATE`
  를 기록한다.
- 즉, 계산은 지원하되 status projection 자동 반영은 하지 않는다.

## 12. Calculation Cadence

저장소에서 검증된 보상 입력은 “동일 날짜의 subordinate DAILY_REWARD 합계”이므로, V1 기본 cadence는 daily로 설계한다.

V1 설계:

- `calculation_date` required
- `period_from`, `period_to` optional
- optional period는 현재 `calculation_date`와 동일 date로 normalize 하는 reserved field로 둔다

즉:

```text
period_from = calculation_date
period_to = calculation_date
```

week/month 지급 정책은 미확정이다.

## 13. DB Design

### 13.1 Reuse decision

재사용:

- `rank_rules`
- `calc_runs`
- `account_rewards`
- `ledger_events`

신규:

- `account_rank_status`
- `account_rank_qualification_results`
- `account_rank_history`

### 13.2 Why new tables are required

직급 산정과 보상 지급을 한 테이블에 합치면 안 되는 이유:

- 현재 직급 projection은 latest state가 필요하다.
- qualification 결과는 calc_run 기준의 immutable snapshot이 필요하다.
- 이력은 언제 어떤 사유로 rank가 변했는지 별도로 추적해야 한다.
- 보상은 financial fact이므로 `account_rewards`와 `ledger_events`에 append-only로 남아야 한다.

## 14. Rank Rule Decision

기존 `rank_rules`를 재사용한다.

이유:

- 저장소에서 확인된 qualification 공식이 이미 현 스키마 컬럼과 맞는다.
- 직급명/직급코드는 검증 자료가 없어서 신규 column 추가가 오히려 임의 설계가 된다.
- `rank_rules`가 현재 비어 있으므로, 0007은 테이블 shape 보강 위주로만 진행한다.

0007에서 `rank_rules`에 추가하는 최소 보강:

- `updated_at`
- `required_weak_volume_base >= 0` check

추가하지 않는 것:

- `rank_code`
- `rank_name`
- `display_order`
- `fixed_amount`
- `qualified_direct_rank_code`

사유:

- 원본 자료 근거 부재

## 15. Account Rank Status / History / Qualification

### 15.1 `account_rank_status`

목적:

- 회원의 현재 적용 직급 projection

핵심 컬럼:

- `account_id`
- `policy_version_id`
- `current_rank_level`
- `qualified_at`
- `maintained_until`
- `last_qualification_calc_run_id`
- `last_bonus_calc_run_id`
- `last_change_type`
- `updated_at`

설계 포인트:

- `current_rank_level`은 nullable
- `0`을 별도 rank로 만들지 않는다
- 현재 미자격 상태는 `null`로 표현한다

### 15.2 `account_rank_qualification_results`

목적:

- 특정 qualification run의 계산 결과 snapshot

핵심 컬럼:

- `calc_run_id`
- `account_id`
- `policy_version_id`
- `calculation_date`
- `period_from`
- `period_to`
- `previous_rank_level`
- `qualified_rank_level`
- `applied_rank_level`
- `result_status`
- `personal_active_stake_amount_base`
- `personal_cumulative_stake_amount_base`
- `direct_referral_count`
- `direct_active_referral_count`
- `left_leg_volume_base`
- `right_leg_volume_base`
- `weak_leg_volume_base`
- `strong_leg_volume_base`
- `downline_daily_reward_amount_base`
- `qualification_snapshot_json`

### 15.3 `account_rank_history`

목적:

- 실제 적용된 rank transition 이력

핵심 컬럼:

- `account_id`
- `policy_version_id`
- `calc_run_id`
- `qualification_result_id`
- `effective_date`
- `previous_rank_level`
- `calculated_rank_level`
- `final_rank_level`
- `change_type`
- 핵심 qualification metric columns
- `qualification_snapshot_json`

## 16. Calc Run Design

### 16.1 Run split

이번 설계는 qualification과 reward 지급을 분리한다.

```text
1. RANK_QUALIFICATION
2. account_rank_status update
3. account_rank_history insert
4. RANK_BONUS
5. account_rewards / ledger_events insert
```

### 16.2 Why split is preferred

- qualification과 financial reward를 분리해야 감사성이 높다.
- 직급 보상 정책이 바뀌어도 qualification snapshot을 재사용할 수 있다.
- demotion candidate처럼 “보상 미발생 상태”도 기록 가능하다.
- qualification run은 `settlement_items` 없이도 독립적으로 감사 추적 가능하다.

### 16.3 Calc run enum decision

0007에서 `calc_runs.run_type`에 `RANK_QUALIFICATION`을 추가한다.

기존 `RANK_BONUS`만으로 처리하지 않는 이유:

- qualification 결과와 reward 지급 결과를 같은 run으로 묶으면 history/status/reward의 의미가 섞인다.
- qualification run은 금융 이벤트가 아니므로 별도 run type이 더 명확하다.

## 17. Reward Design and Duplicate Prevention

`RANK_BONUS` reward row 설계:

- `account_id = 보상 수령 회원`
- `account_staking_id = null`
- `source_account_id = null`
- `source_account_staking_id = null`
- `reward_type = 'RANK_BONUS'`
- `source_reference = rank_bonus:<period_key>:<account_id>:<rank_level>`
- `metadata_json`에 qualification snapshot 최소 정보 저장

중복 방지:

- 기존 `unique (reward_type, source_reference)` 재사용
- 추가 reward column/migration은 필요하지 않다

권장 `period_key`:

- V1 daily model:
  - `YYYY-MM-DD`

## 18. Ledger Design and `product_id`

### 18.1 Problem

현재 `ledger_events.product_id`는 `NOT NULL`이다.

하지만 `RANK_BONUS`는 특정 staking product 한 건에 귀속되지 않는 보상이다.

### 18.2 Chosen solution

0007에서:

- `ledger_events.product_id`를 nullable로 변경한다

이유:

- 임의 대표 product를 넣는 것은 감사 추적상 부정확하다
- 가장 큰 active staking product를 자동 선택하는 것도 정책 근거가 없다
- reward 전용 별도 ledger를 지금 도입하면 구조가 과도하게 분기된다

### 18.3 Runtime expectation

향후 `RANK_BONUS` ledger row는:

- `account_id = 보상 수령 회원`
- `related_account_id = null`
- `product_id = null`
- `event_type = 'RANK_BONUS'`

## 19. User and Admin API Plan

### 19.1 User API plan

조회 후보:

- `GET /api/me/rank-status`
- `GET /api/me/rank-history`
- `GET /api/me/rank-progress`
- `GET /api/me/rewards?reward_type=RANK_BONUS`

### 19.2 Admin API plan

실행 후보:

- `POST /api/admin/rewards/rank-qualification/run`
- `POST /api/admin/rewards/rank-bonus/run`

조회 후보:

- `GET /api/admin/accounts/:accountId/rank-status`
- `GET /api/admin/accounts/:accountId/rank-history`
- `GET /api/admin/rank-qualification-results`
- `GET /api/admin/calc-runs/:calcRunId/rank-results`

## 20. Risks

- 원본 BJC office 자료가 없어 직급명/주기/하락정책은 확정할 수 없다.
- 현재 원격 DB의 `rank_rules`는 구조만 있고 실제 row가 비어 있다.
- `ledger_events.product_id nullable`은 기존 TypeScript read model이 non-null로 가정한 부분이 있는지 후속 구현 단계에서 검토가 필요하다.
- 레그 매출 포함 상태(`ACTIVE` vs `CANCEL_REQUESTED` 포함 여부)는 운영 확인이 필요하다.
- 자동 demotion 미구현 상태에서는 qualification 결과와 current status가 달라질 수 있다.

## 21. Recommended Next Steps

1. 원본 BJC 자료를 확보해 실제 직급명과 지급 주기를 확정한다.
2. `RANK_QUALIFICATION` runtime service를 구현한다.
3. qualification result와 current status read API를 추가한다.
4. 이후 `RANK_BONUS` reward runtime을 구현한다.
5. 마지막 단계에서 User/Admin UI를 붙인다.
