# BJC Member Referral Binary 0002 SQL Review V1

## 1. 0002 마이그레이션 목적

`0002_bjc_member_referral_binary_auth_mysql.sql`의 목적은 기존 `0001_bjc_offchain_core_mysql.sql` 위에 아래 기능을 위한 스키마 기반을 추가하는 것이다.

- 회원가입
- 운영형 로그인
- sponsor 추천인 구조
- 바이너리 레그 구조
- session-first 인증 저장소

이번 단계는 실제 DB 적용이 아니라 SQL 초안과 smoke SQL 작성, 그리고 0001과의 호환성 검토가 목적이다.

관련 파일:

- [0002_bjc_member_referral_binary_auth_mysql.sql](file:///Users/faster/Projects/bjc/mysql/migrations/0002_bjc_member_referral_binary_auth_mysql.sql)
- [bjc_member_referral_binary_smoketest.sql](file:///Users/faster/Projects/bjc/mysql/smoke/bjc_member_referral_binary_smoketest.sql)
- [0001_bjc_offchain_core_mysql.sql](file:///Users/faster/Projects/bjc/mysql/migrations/0001_bjc_offchain_core_mysql.sql)

---

## 2. accounts 변경 요약

기존 0001의 `accounts.id`는 `char(36)`이다.

따라서 0002에서도 account FK 컬럼 타입은 모두 `char(36)`으로 맞췄다.

추가 컬럼:

- `login_id varchar(64) null`
- `password_hash varchar(255) null`
- `status varchar(20) not null default 'ACTIVE'`
- `referral_code varchar(32) null`
- `sponsor_account_id char(36) null`
- `binary_parent_account_id char(36) null`
- `binary_position varchar(10) null`
- `joined_at datetime(6) null`
- `last_login_at datetime(6) null`
- `updated_at datetime(6) null`

추가 제약:

- `uniq_accounts_login_id`
- `uniq_accounts_referral_code`
- `idx_accounts_sponsor_account_id`
- `idx_accounts_binary_parent_account_id`
- `uniq_accounts_binary_parent_position`
- `fk_accounts_sponsor_account`
- `fk_accounts_binary_parent_account`
- `chk_accounts_status`
- `chk_accounts_binary_position`
- `chk_accounts_sponsor_not_self`
- `chk_accounts_binary_parent_not_self`

설계 의도:

- `login_id/password_hash/referral_code`는 기존 데이터 호환을 위해 우선 `NULL` 허용
- backfill 이후 후속 migration에서 `NOT NULL` 강화 검토

---

## 3. auth_sessions 설계 요약

신규 테이블:

- `auth_sessions`

핵심 필드:

- `id bigint auto_increment`
- `account_id char(36)`
- `session_token_hash varchar(255)`
- `expires_at datetime(6)`
- `revoked_at datetime(6)`
- `created_at datetime(6)`
- `last_seen_at datetime(6)`
- `user_agent varchar(255)`
- `ip_address varchar(64)`

핵심 제약:

- `uniq_auth_sessions_token_hash`
- `idx_auth_sessions_account_id`
- `idx_auth_sessions_expires_at`
- `idx_auth_sessions_revoked_at`
- `fk_auth_sessions_account`

중요 원칙:

- 실제 token 원문 저장 금지
- `session_token_hash`만 저장

---

## 4. referral_edges 재사용 판단

결론:

- 기존 `referral_edges`는 sponsor closure table로 재사용 가능하다.

0001 현재 구조:

- `parent_account_id`
- `child_account_id`
- `depth`
- `path`
- `created_at`
- `unique(parent_account_id, child_account_id)`
- `idx_referral_edges_parent_depth`

판단 근거:

- 직접 추천 depth=1 표현 가능
- closure 구조로 2대/3대 이상 표현 가능
- 기존 FK/unique/check가 sponsor closure 요구사항과 맞는다

이번 0002에서는 `referral_edges`를 drop/recreate 하지 않았다.

---

## 5. binary_nodes 설계 요약

신규 테이블:

- `binary_nodes`

용도:

- 직접 부모-자식 바이너리 관계의 source of truth

주요 필드:

- `account_id char(36) primary key`
- `parent_account_id char(36) null`
- `position varchar(10) null`
- `root_account_id char(36) null`
- `created_at datetime(6)`
- `updated_at datetime(6)`

핵심 제약:

- `uniq_binary_nodes_parent_position`
- `fk_binary_nodes_account`
- `fk_binary_nodes_parent_account`
- `fk_binary_nodes_root_account`
- `chk_binary_nodes_position`
- `chk_binary_nodes_parent_not_self`

설계 의도:

- root 회원은 `parent_account_id = null`, `position = null`
- 한 parent 밑에는 `LEFT` 1명, `RIGHT` 1명만 허용

---

## 6. binary_edges 설계 요약

신규 테이블:

- `binary_edges`

용도:

- closure table
- 조상 기준 하위 전체 조회
- 레그별 집계
- weak leg 계산

주요 필드:

- `id bigint auto_increment`
- `ancestor_account_id char(36)`
- `descendant_account_id char(36)`
- `depth int`
- `root_leg varchar(10) null`
- `path varchar(1000) null`
- `created_at datetime(6)`

이번 초안의 결정:

- self row 저장 허용
- self row는 `ancestor = descendant`, `depth = 0`, `root_leg = null`
- non-self row는 `depth > 0`, `root_leg in ('LEFT','RIGHT')`

이를 위해 `chk_binary_edges_self_row`를 추가했다.

핵심 제약:

- `uniq_binary_edges_ancestor_descendant`
- `idx_binary_edges_ancestor_depth`
- `idx_binary_edges_descendant`
- `idx_binary_edges_root_leg`
- `idx_binary_edges_ancestor_root_leg_depth`
- `fk_binary_edges_ancestor_account`
- `fk_binary_edges_descendant_account`
- `chk_binary_edges_depth`
- `chk_binary_edges_root_leg`
- `chk_binary_edges_self_row`

---

## 7. FK / UNIQUE / CHECK / INDEX 목록

## 7.1 accounts

- `uniq_accounts_login_id`
- `uniq_accounts_referral_code`
- `idx_accounts_sponsor_account_id`
- `idx_accounts_binary_parent_account_id`
- `uniq_accounts_binary_parent_position`
- `fk_accounts_sponsor_account`
- `fk_accounts_binary_parent_account`
- `chk_accounts_status`
- `chk_accounts_binary_position`
- `chk_accounts_sponsor_not_self`
- `chk_accounts_binary_parent_not_self`

## 7.2 auth_sessions

- `uniq_auth_sessions_token_hash`
- `idx_auth_sessions_account_id`
- `idx_auth_sessions_expires_at`
- `idx_auth_sessions_revoked_at`
- `fk_auth_sessions_account`

## 7.3 binary_nodes

- `uniq_binary_nodes_parent_position`
- `idx_binary_nodes_parent_account_id`
- `idx_binary_nodes_root_account_id`
- `fk_binary_nodes_account`
- `fk_binary_nodes_parent_account`
- `fk_binary_nodes_root_account`
- `chk_binary_nodes_position`
- `chk_binary_nodes_parent_not_self`

## 7.4 binary_edges

- `uniq_binary_edges_ancestor_descendant`
- `idx_binary_edges_ancestor_depth`
- `idx_binary_edges_descendant`
- `idx_binary_edges_root_leg`
- `idx_binary_edges_ancestor_root_leg_depth`
- `fk_binary_edges_ancestor_account`
- `fk_binary_edges_descendant_account`
- `chk_binary_edges_depth`
- `chk_binary_edges_root_leg`
- `chk_binary_edges_self_row`

---

## 8. 기존 0001과의 호환성

호환성 판단:

- `accounts.id` 타입을 그대로 유지했으므로 FK 타입 충돌 없음
- `role`은 기존 `enum('USER','READER','ADMIN')` 유지
- 기존 `referral_edges`는 재사용만 하고 변경하지 않음
- 기존 계산/정산/원장 테이블과 직접 충돌하는 이름 없음
- 신규 constraint/index 이름도 0001과 충돌하지 않도록 별도 이름 사용

주의사항:

- `accounts`에 `uniq_accounts_binary_parent_position`를 추가했으므로, 나중에 `binary_nodes`와 제약 중복이 발생한다
- 이는 의도적 중복 보호지만, 실제 구현 단계에서 “accounts만 믿을지 / binary_nodes만 믿을지”를 정리할 필요가 있다

현재 초안 판단:

- 1차는 둘 다 유지 가능
- 구현 단계에서 중복 제약을 줄이고 싶으면 `accounts` 쪽 unique를 제거하는 후속 조정 검토 가능

---

## 9. 실제 DB 적용 전 확인할 점

- MySQL 8.0에서 `CHECK`가 실제 enforce 되는지 환경 확인
- 운영 DB에 기존 `accounts` row가 얼마나 있는지 확인
- `login_id`, `referral_code` backfill 전략 수립
- `joined_at`, `updated_at` backfill 필요 여부 확인
- `binary_nodes`, `binary_edges` 초기 데이터 생성 전략 필요
- `auth_sessions` retention / cleanup 정책 필요

---

## 10. trigger / stored routine 미사용 사유

현재 프로젝트 제약:

- MySQL 권한에서 trigger / stored routine 생성 제약 가능성 존재
- 이전 작업에서도 DB trigger 대신 app-layer policy engine 방향을 확정함

따라서 이번 0002는 아래만 사용한다.

- FK
- UNIQUE
- CHECK
- INDEX

복잡한 검증은 app layer에서 강제한다.

---

## 11. app layer에서 반드시 막아야 할 것

- 추천인 순환
- 바이너리 순환
- 자동 배치 동시성 충돌
- session token 원문 저장
- password plain 저장
- 수동 배치 시 이미 배치된 회원 재배치 정책
- sponsor와 binary parent 불일치 허용 범위

추가로 서비스 계층에서 필요한 것:

- deterministic BFS placement
- `SELECT ... FOR UPDATE` 기반 slot 점유 경쟁 제어
- sponsor closure 생성 트랜잭션
- binary closure 생성 트랜잭션

---

## 12. smoke SQL 요약

[bjc_member_referral_binary_smoketest.sql](file:///Users/faster/Projects/bjc/mysql/smoke/bjc_member_referral_binary_smoketest.sql)에는 아래 항목을 넣었다.

- T1 root/admin 계정 insert
- T2 sponsor 계정 insert
- T3 신규 USER 계정 insert
- T4 duplicate `login_id` 실패 기대
- T5 duplicate `referral_code` 실패 기대
- T6 없는 `sponsor_account_id` FK 실패 기대
- T7 `binary_nodes` root insert
- T8 `binary_nodes` LEFT insert 성공
- T9 같은 parent LEFT 중복 실패 기대
- T10 같은 parent RIGHT insert 성공
- T11 `binary_edges` closure insert
- T12 `binary_edges` duplicate ancestor/descendant 실패 기대
- T13 `auth_sessions` insert 성공
- T14 duplicate `session_token_hash` 실패 기대
- T15 invalid `status` 실패 기대
- T16 invalid `binary_position` 실패 기대

이 smoke SQL은 자동 PASS/FAIL 스크립트가 아니라 수동 실행 로그 검토용이다.

---

## 13. 이번 초안의 보류 항목

이번 0002에서는 만들지 않았다.

- `account_security_events`
- `password_reset_tokens`
- `account_login_attempts`

권장:

- 필요 시 `0003` 이후로 분리

---

## 14. 다음 구현 단계

1. `accountsRepo` 확장
2. `auth repo/service`
3. `referral service`
4. `binary placement service`
5. `auth API`
6. `me/*`, `admin/accounts/*` 조회 API
7. TypeScript smoke script

---

## 15. 결론

이번 0002 초안은 아래를 달성한다.

- 운영형 auth 저장 기반 추가
- sponsor / binary 구조 스키마 추가
- 기존 0001과의 타입 호환 유지
- trigger 없이도 최소 DB 보호선 확보

다만 실제 서비스 무결성의 핵심은 여전히 app layer에 있다.
