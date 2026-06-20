# BJC Rank Bonus 0007 SQL Review V1

## 1. Review Scope

- migration file:
  - `mysql/migrations/0007_bjc_rank_bonus_mysql.sql`
- SQL smoke file:
  - `mysql/smoke/bjc_rank_bonus_smoketest.sql`
- adjacent schema/runtime fit:
  - `mysql/migrations/0001_bjc_offchain_core_mysql.sql`
  - `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
  - `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
  - `mysql/migrations/0006_bjc_direct_referral_rewards_mysql.sql`
  - `src/services/networkService.ts`
  - `src/services/adminAccountService.ts`
  - `src/repos/accountRewardsRepo.ts`
  - `src/repos/accountStakingsRepo.ts`

## 2. Current State Summary

0007 적용 전 writable `bjc_db` 기준으로 확인된 상태:

- `rank_rules` 테이블은 존재하지만 실제 row는 비어 있다.
- `RANK_BONUS` enum은 `calc_runs`, `ledger_events`, `settlement_items`, `account_rewards`에 이미 존재한다.
- `rank_level`은 서비스 응답에서 placeholder `0`으로 채워지는 부분이 많다.
- `ledger_events.product_id`는 현재 `NOT NULL`이다.
- qualification snapshot 전용 테이블과 current rank projection 테이블은 아직 없다.
- 당시 `RANK_QUALIFICATION` runtime/API는 아직 연결되지 않은 상태였다.

## 3. 0007 Design Summary

0007의 핵심 목적:

- 기존 `rank_rules`를 재사용 가능한 상태로 유지
- qualification / status / history를 financial reward와 분리
- `RANK_QUALIFICATION` calc run을 명시적으로 추가
- `RANK_BONUS` ledger가 특정 staking product에 묶이지 않도록 `ledger_events.product_id` nullable 확장

## 4. Reuse Review

### 4.1 `rank_rules` reuse

재사용 결정:

- 신규 `rank_definitions`를 만들지 않고 기존 `rank_rules`를 유지한다.

사유:

- 저장소에서 검증된 qualification rule이 이미 `rank_rules` shape와 일치한다.
- 실제 rank name/code는 저장소에 없어서 새로운 naming column을 이번 단계에서 강제하면 임의 설계가 된다.

0007에서 추가하는 최소 보강:

- `updated_at`
- `required_weak_volume_base >= 0` check

### 4.2 `account_rewards` reuse

재사용 결정:

- `RANK_BONUS`도 기존 `account_rewards`를 그대로 사용한다.

사유:

- `reward_type = 'RANK_BONUS'`가 이미 존재한다.
- `source_reference` unique가 이미 있어 period-key 기반 중복 방지가 가능하다.
- rank bonus는 특정 staking 한 건의 source가 아니므로 `account_staking_id`, `source_account_id`, `source_account_staking_id`를 모두 `null`로 둘 수 있다.

### 4.3 `calc_runs` reuse with one additive enum

재사용 + 확장:

- 기존 `RANK_BONUS` run type은 유지
- 신규 `RANK_QUALIFICATION` run type을 추가

사유:

- qualification run과 bonus reward run은 목적이 다르다.
- qualification run은 financial settlement가 없어도 독립 감사 대상이다.

## 5. New Tables Review

### 5.1 `account_rank_status`

역할:

- 회원별 latest rank projection

장점:

- `accounts` 핵심 인증/조직 정보와 rank projection을 분리한다.
- 재계산이나 backfill 시 projection refresh가 쉬워진다.

주요 제약:

- `account_id` PK
- nullable `current_rank_level`
- `current_rank_level` range check

### 5.2 `account_rank_qualification_results`

역할:

- 특정 qualification calc run의 immutable snapshot

장점:

- demotion candidate, unqualified 상태를 financial reward 없이도 보존한다.
- 추후 `RANK_BONUS` run이 qualification snapshot을 재사용할 수 있다.

주요 제약:

- unique `(calc_run_id, account_id)`
- `period_from <= period_to`
- metrics non-negative check
- nullable rank levels with range check

### 5.3 `account_rank_history`

역할:

- 실제 applied rank transition 이력

장점:

- current projection만으로 잃어버리는 “언제 / 왜 / 무엇이 바뀌었는지”를 보존한다.
- `qualification_result_id`를 통해 계산 근거를 추적할 수 있다.

주요 제약:

- unique `(calc_run_id, account_id)`
- `change_type` enum
- qualification metric snapshot column 보유

## 6. `ledger_events.product_id` Review

### 6.1 Problem

현재 `ledger_events.product_id`는 `NOT NULL` + FK다.

이 구조는 다음 reward 유형과 충돌한다.

- `RANK_BONUS`
- 향후 일부 `CONTRIBUTION`
- 기타 특정 product 1건과 직접 연결되지 않는 운영형 보상

### 6.2 Rejected alternatives

- 대표 product를 임의 사용:
  - 감사 추적이 왜곡된다
- 가장 큰 active staking product 사용:
  - 정책 근거가 없고 deterministic business rule도 아니다
- reward 전용 별도 ledger 추가:
  - 이번 단계 범위를 넘는 구조 확장이다

### 6.3 Chosen solution

0007에서:

- `ledger_events.product_id`를 nullable로 변경한다

장점:

- `RANK_BONUS` 원장이 product-independent fact라는 의미를 정확히 보존한다
- 기존 row는 모두 non-null이므로 historical compatibility는 유지된다

### 6.4 Risk

기존 TypeScript/runtime 일부는 `product_id`가 항상 존재한다고 암묵적으로 가정할 수 있다.

후속 구현 결과:

- `shared/bjc-types.ts`
- `src/repos/ledgerEventsRepo.ts`
- `src/services/ledgerEventsCsv.ts`
- `src/server.ts`

에서 `product_id: string | null` 처리를 반영했다.

## 7. Duplicate Prevention Review

`RANK_BONUS` 전용 새 dedupe column은 추가하지 않는다.

이유:

- `account_rewards`에는 이미 `unique (reward_type, source_reference)`가 있다
- rank bonus는 period-key 기반 `source_reference`만으로 충분히 멱등 처리할 수 있다

권장 포맷:

```text
rank_bonus:<period_key>:<account_id>:<rank_level>
```

## 8. Additive Safety Review

0007이 지키는 원칙:

- 기존 table drop 없음
- 기존 data rewrite 없음
- trigger/function/procedure 추가 없음
- 기존 `RANK_BONUS` enum 재사용
- 신규 table은 qualification/history/projection 용도에만 한정

유일한 기존 table meaning change:

- `ledger_events.product_id`를 `NOT NULL -> NULL`로 완화

이는 destructive change는 아니지만, downstream null handling 영향은 존재한다.

## 9. SQL Smoke Coverage Review

`mysql/smoke/bjc_rank_bonus_smoketest.sql`에서 검증하는 범위:

- valid `rank_rules` insert
- duplicate `(policy_version_id, rank_level)` 실패
- negative `required_weak_volume_base` 실패
- invalid bps range 실패
- `RANK_QUALIFICATION` calc run enum 동작
- valid `account_rank_status` insert
- invalid `account_rank_status` FK 실패
- valid `account_rank_qualification_results` insert
- duplicate qualification result unique 실패
- valid `account_rank_history` insert
- invalid `change_type` 실패
- `ledger_events.product_id is null` + `event_type = RANK_BONUS` insert 성공
- `account_rewards.reward_type = RANK_BONUS` duplicate `source_reference` 실패
- rollback 후 잔존 count 원복

## 10. Actual Apply and Validation Status

이번 세션에서는 MCP read-only 연결이 아니라, 앱과 smoke가 사용하는 writable `bjc_db` 연결로 실제 적용을 수행했다.

연결 요약:

- `db_connection = ok`
- `db_name = bj***`
- 적용 전 상태:
  - `migration_0007_state = NOT_APPLIED`
  - `account_rank_status` 없음
  - `account_rank_qualification_results` 없음
  - `account_rank_history` 없음
  - `calc_runs.run_type`에 `RANK_QUALIFICATION` 없음
  - `ledger_events.product_id = NOT NULL`
  - `rank_rules.updated_at` 없음

백업:

- 관련 테이블(`rank_rules`, `calc_runs`, `ledger_events`, `account_rewards`, `accounts`, `policy_versions`)을 저장소 밖 `/tmp/bjc_backups/` 경로로 백업했다.

실제 적용 과정:

1. `mysql/migrations/0007_bjc_rank_bonus_mysql.sql`를 writable `bjc_db`에 실행
2. 최초 실행은 `PARTIALLY_APPLIED` 상태가 됨
3. 실패 원인:
   - `account_rank_qualification_results`의 CHECK constraint 이름 `chk_account_rank_qualification_results_direct_active_referral_count`가 MySQL identifier 64자 제한을 초과
4. 조치:
   - 0007의 qualification/history CHECK constraint 이름을 짧은 이름으로 수정
   - 이미 적용된 앞선 `ALTER`/`account_rank_status`는 유지
   - 남은 `account_rank_qualification_results`, `account_rank_history` 생성문만 이어서 적용
5. 최종 상태:
   - `migration_0007_state = APPLIED`

적용 후 확인 결과:

- `calc_runs.run_type`에 `RANK_QUALIFICATION` 포함
- 기존 `RANK_BONUS` 유지
- `ledger_events.product_id = NULLABLE`
- `rank_rules.updated_at` 존재
- `account_rank_status` 생성 완료
- `account_rank_qualification_results` 생성 완료
- `account_rank_history` 생성 완료
- FK 개수:
  - `account_rank_status = 4`
  - `account_rank_qualification_results = 3`
  - `account_rank_history = 4`

`SHOW CREATE TABLE` 확인 결과:

- `account_rank_status`:
  - PK, 3개 secondary index, 4개 FK, 2개 CHECK 존재
- `account_rank_qualification_results`:
  - PK, unique `(calc_run_id, account_id)`, 3개 secondary index, 3개 FK, shortened CHECK names 존재
- `account_rank_history`:
  - PK, unique `(calc_run_id, account_id)`, 4개 secondary index, 4개 FK, shortened CHECK names 존재

rank SQL smoke 결과:

- `mysql --force < mysql/smoke/bjc_rank_bonus_smoketest.sql` 실행 완료
- 의도한 실패가 실제로 확인됨:
  - duplicate rank level
  - invalid weak volume
  - invalid bps range
  - invalid `account_rank_status` FK
  - duplicate qualification result unique
  - invalid `change_type`
  - duplicate rank reward
- 정상 검증도 확인됨:
  - valid rank rule insert
  - `RANK_QUALIFICATION` enum insert
  - valid `account_rank_status`
  - valid qualification result
  - valid history row
  - `ledger_events.product_id is null` + `event_type = RANK_BONUS` insert 성공
- rollback 결과:
  - rank 전용 fixture row는 잔존하지 않음
  - smoke 시작 전/후 총 row count가 동일함
- 이후 runtime 상태:
  - `RANK_QUALIFICATION` service/API 구현 완료
  - qualification은 reward / ledger를 생성하지 않음
  - `RANK_BONUS` service/API 미구현
  - User/Admin 직급 UI 미구현
- qualification runtime 반영 파일:
  - `src/domain/rankQualification.ts`
  - `src/repos/rankRulesRepo.ts`
  - `src/repos/rankQualificationMetricsRepo.ts`
  - `src/repos/accountRankStatusRepo.ts`
  - `src/repos/accountRankQualificationResultsRepo.ts`
  - `src/repos/accountRankHistoryRepo.ts`
  - `src/services/rankQualificationService.ts`
  - `src/server.ts`
  - `scripts/rank_qualification_smoke.ts`

## 11. Review Conclusion

- 0007은 기존 `rank_rules`를 버리지 않고 qualification/history/projection을 덧붙이는 방향으로 타당하다.
- qualification run과 reward run을 분리하기 위해 `RANK_QUALIFICATION` enum 추가가 필요하다.
- `ledger_events.product_id nullable`은 `RANK_BONUS`에 가장 정합적인 해결책이다.
- 실제 writable `bjc_db`에 0007 적용과 rank SQL smoke 검증까지 완료했다.
- 0007은 MySQL constraint identifier 길이 제한을 고려해 짧은 CHECK 이름을 사용해야 한다.
- nullable `product_id` read-model 회귀도 unit test와 runtime DTO에서 반영 완료했다.

## 12. Follow-up Items

1. `RANK_BONUS` runtime 구현 단계에서 qualification snapshot을 reward/ledger로 연결한다.
2. Admin/User rank UI를 붙이기 전 rank read API를 화면 DTO에 연결한다.
3. 원격 운영 DB 반영 시에도 동일한 identifier 길이 제약이 없도록 현재 0007 파일 기준으로 적용한다.
