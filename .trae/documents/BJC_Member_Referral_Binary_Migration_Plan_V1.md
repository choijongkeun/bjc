# BJC Member Referral Binary Migration Plan V1

## 1. 목적

이 문서는 BJC 서비스의 회원가입/로그인/추천인/sponsor 구조/바이너리 레그 구조를 도입하기 위한 MySQL 마이그레이션 설계안을 정리한다.

범위:

- `accounts` 확장
- `referral_edges` sponsor closure 재사용 방안
- `binary_nodes` 신규 테이블
- `binary_edges` 신규 closure table
- 인증 운영형 전환에 필요한 최소 auth 저장 구조 검토
- 기존 데이터 마이그레이션 및 rollback 전략

비범위:

- 실제 계산 엔진 구현
- `DAILY_REWARD`, `DIRECT_REFERRAL`, `RANK_BONUS`, `CONTRIBUTION`, `WITHDRAWAL_FEE`, `SIDECAR` 자동 계산 구현
- User/Admin 전체 프론트 구현

참조:

- [BJC_Member_Referral_Binary_Leg_Design_V1.md](file:///Users/faster/Projects/bjc/.trae/documents/BJC_Member_Referral_Binary_Leg_Design_V1.md)
- [BJC_Service_Architecture_User_Admin_API_V1.md](file:///Users/faster/Projects/bjc/.trae/documents/BJC_Service_Architecture_User_Admin_API_V1.md)
- [0001_bjc_offchain_core_mysql.sql](file:///Users/faster/Projects/bjc/mysql/migrations/0001_bjc_offchain_core_mysql.sql)

---

## 2. 현재 상태

현재 `accounts`는 아래 최소 구조만 가진다.

```sql
create table if not exists accounts (
  id char(36) not null,
  display_name varchar(255) null,
  role enum('USER','READER','ADMIN') not null default 'USER',
  created_at timestamp not null default current_timestamp,
  primary key (id)
)
```

현재 이미 존재하는 sponsor closure 후보:

```sql
create table if not exists referral_edges (
  id char(36) not null default (uuid()),
  parent_account_id char(36) not null,
  child_account_id char(36) not null,
  depth int not null,
  path text null,
  created_at timestamp not null default current_timestamp,
  unique key uniq_referral_edges_parent_child (parent_account_id, child_account_id)
)
```

문제:

- 운영형 로그인 불가
- 추천 코드 기반 회원가입 불가
- sponsor와 binary parent를 분리 저장할 수 없음
- 바이너리 레그 및 weak leg 계산 기반이 없음

---

## 3. 마이그레이션 원칙

- 기존 `accounts.id`를 그대로 유지한다.
- 기존 정책/원장/정산 테이블과의 FK는 보존한다.
- 신규 컬럼은 가능한 한 단계적으로 추가한다.
- `accounts`는 backfill 가능한 컬럼부터 추가하고, 나중에 `NOT NULL` 강화한다.
- sponsor 구조와 binary 구조는 물리적으로 분리한다.
- 운영형 인증은 session-first로 설계하되, 기존 `x-actor-account-id`는 개발/smoke fallback으로만 유지한다.

---

## 4. accounts 확장 설계

## 4.1 추가 컬럼

추가 대상:

- `login_id varchar(64)`
- `password_hash varchar(255)`
- `status enum('ACTIVE','BLOCKED','WITHDRAWN')`
- `referral_code varchar(64)`
- `sponsor_account_id char(36)`
- `binary_parent_account_id char(36)`
- `binary_position enum('LEFT','RIGHT')`
- `joined_at timestamp`
- `last_login_at timestamp`
- `updated_at timestamp`

권장 DDL 방향:

```sql
alter table accounts
  add column login_id varchar(64) null,
  add column password_hash varchar(255) null,
  add column status enum('ACTIVE','BLOCKED','WITHDRAWN') not null default 'ACTIVE',
  add column referral_code varchar(64) null,
  add column sponsor_account_id char(36) null,
  add column binary_parent_account_id char(36) null,
  add column binary_position enum('LEFT','RIGHT') null,
  add column joined_at timestamp null default current_timestamp,
  add column last_login_at timestamp null,
  add column updated_at timestamp null default current_timestamp on update current_timestamp;
```

## 4.2 FK / CHECK / UNIQUE

추가 제약:

- `unique(login_id)`
- `unique(referral_code)`
- `fk_accounts_sponsor_account`
- `fk_accounts_binary_parent_account`
- `check (sponsor_account_id is null or sponsor_account_id <> id)`
- `check (binary_parent_account_id is null or binary_parent_account_id <> id)`

주의:

- MySQL `check`는 버전별 동작 차이가 있어, 애플리케이션 검증도 함께 둔다.

## 4.3 컬럼 의미

- `sponsor_account_id`
  - 직추천 기준
- `binary_parent_account_id`
  - 바이너리 tree 부모
- `binary_position`
  - `LEFT` / `RIGHT`

즉, sponsor와 binary는 같을 수도 있지만 별도 컬럼으로 유지한다.

---

## 5. 비밀번호 저장 전략

## 5.1 저장 규칙

- plain password 저장 금지
- `password_hash`만 저장

## 5.2 알고리즘 선택

권장 1순위:

- `argon2id`

선정 이유:

- 현재 시점 기준 패스워드 해시 권장안
- GPU/ASIC 저항성이 bcrypt보다 우수
- 메모리 비용 기반 조절이 가능

운영 제약이 있으면 차선:

- `bcrypt`

1차 구현 준비 기준 결론:

- 설계 문서 기준 기본값은 `argon2id`
- 구현 환경 제약이 있으면 `bcrypt` fallback 허용
- `password_hash` 포맷에 알고리즘 prefix를 포함시켜 향후 migration 가능하게 설계

예:

- `$argon2id$v=19$m=65536,t=3,p=1$...`
- `$2b$12$...`

---

## 6. 인증 저장 구조 검토

## 6.1 권장 방식

운영형은 `session cookie + auth_sessions` 를 기본으로 권장한다.

이유:

- 웹앱(User/Admin) 중심 서비스에 적합
- `logout` 무효화가 단순
- 세션 만료/강제 로그아웃/관리자 차단 처리 용이

## 6.2 선택 추가 테이블

### `auth_sessions`

필드:

- `id char(36)`
- `account_id char(36)`
- `session_token_hash varchar(255)`
- `user_agent varchar(255)`
- `ip_address varchar(64)`
- `expires_at timestamp`
- `revoked_at timestamp null`
- `created_at timestamp`
- `updated_at timestamp`

인덱스:

- `idx_auth_sessions_account`
- `idx_auth_sessions_expires`
- `unique(session_token_hash)`

비고:

- 이번 작업의 핵심은 회원/추천/바이너리 구조이므로 `auth_sessions`는 “필요 시 함께 추가” 항목으로 둔다.
- JWT access token을 쓰더라도 refresh/session 관리용으로 재사용 가능하다.

---

## 7. referral_edges 재사용 방안

## 7.1 결론

기존 `referral_edges`는 sponsor closure table로 재사용 가능하다.

필드:

- `parent_account_id`
- `child_account_id`
- `depth`
- `path`
- `created_at`

## 7.2 규칙

- 직접 추천은 `depth = 1`
- 2대 이상은 closure row로 생성
- `parent_account_id <> child_account_id`
- 중복 관계 금지
- 순환 관계 금지

## 7.3 path 전략

`path`는 아래 형식 권장:

```text
/ancestor_uuid/parent_uuid/child_uuid/
```

용도:

- 디버깅
- 순환 점검
- 운영자 분석용

실제 조회는 인덱스와 FK 기반으로 하고, `path`는 보조 필드로 본다.

---

## 8. binary_nodes 신규 테이블 설계

## 8.1 목적

직접 부모-자식 관계의 source of truth

## 8.2 제안 스키마

```sql
create table binary_nodes (
  account_id char(36) not null,
  parent_account_id char(36) null,
  position enum('LEFT','RIGHT') null,
  root_account_id char(36) not null,
  path text null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp on update current_timestamp,
  primary key (account_id),
  unique key uniq_binary_nodes_parent_position (parent_account_id, position),
  key idx_binary_nodes_parent (parent_account_id),
  key idx_binary_nodes_root (root_account_id),
  constraint fk_binary_nodes_account foreign key (account_id) references accounts(id),
  constraint fk_binary_nodes_parent foreign key (parent_account_id) references accounts(id),
  constraint fk_binary_nodes_root foreign key (root_account_id) references accounts(id)
);
```

## 8.3 규칙

- 루트 계정은 `parent_account_id = null`, `position = null`
- 일반 계정은 `parent_account_id`와 `position`이 모두 필요
- 한 parent의 `LEFT`, `RIGHT`는 각각 1명만 허용

---

## 9. binary_edges 신규 closure table 설계

## 9.1 목적

- 조상 기준 전체 하위 조회
- left/right leg 집계
- weak leg 계산
- depth별 레그 분석

## 9.2 제안 스키마

```sql
create table binary_edges (
  id char(36) not null default (uuid()),
  ancestor_account_id char(36) not null,
  descendant_account_id char(36) not null,
  depth int not null,
  root_leg enum('LEFT','RIGHT') not null,
  path text null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_binary_edges_ancestor_descendant (ancestor_account_id, descendant_account_id),
  key idx_binary_edges_ancestor_depth_leg (ancestor_account_id, depth, root_leg),
  key idx_binary_edges_descendant (descendant_account_id),
  constraint fk_binary_edges_ancestor foreign key (ancestor_account_id) references accounts(id),
  constraint fk_binary_edges_descendant foreign key (descendant_account_id) references accounts(id),
  constraint chk_binary_edges_no_self check (ancestor_account_id <> descendant_account_id),
  constraint chk_binary_edges_depth check (depth > 0)
);
```

## 9.3 root_leg 의미

- `ancestor_account_id` 기준으로 descendant가 첫 분기에서 어느 레그에 속하는지 저장
- 같은 descendant라도 ancestor가 바뀌면 `root_leg`가 달라질 수 있다

예:

- A -> B(LEFT)
- B -> C(RIGHT)
- A 기준 C는 `LEFT`
- B 기준 C는 `RIGHT`

---

## 10. 인덱스/유니크 제약

## 10.1 accounts

- `uniq_accounts_login_id`
- `uniq_accounts_referral_code`
- `idx_accounts_sponsor_account_id`
- `idx_accounts_binary_parent_account_id`
- `idx_accounts_role_status`

## 10.2 referral_edges

기존 유지:

- `uniq_referral_edges_parent_child`
- `idx_referral_edges_parent_depth`
- `idx_referral_edges_child`

추가 고려:

- `idx_referral_edges_child_depth`

## 10.3 binary_nodes

- `primary(account_id)`
- `uniq_binary_nodes_parent_position`
- `idx_binary_nodes_parent`
- `idx_binary_nodes_root`

## 10.4 binary_edges

- `uniq_binary_edges_ancestor_descendant`
- `idx_binary_edges_ancestor_depth_leg`
- `idx_binary_edges_descendant`

---

## 11. 순환 방지 전략

DB 제약만으로는 완전한 순환 방지가 어렵다.

따라서 애플리케이션 레벨에서 아래를 강제한다.

## 11.1 sponsor 순환 방지

회원가입 또는 sponsor 변경 시:

- 후보 sponsor가 신규 계정 본인인지 검사
- 기존 `referral_edges`에서 `child -> sponsor` 경로가 있는지 검사
- 있으면 순환으로 거부

## 11.2 binary 순환 방지

배치 시:

- 후보 parent가 대상 account 본인인지 검사
- `binary_edges`에서 대상 account가 candidate parent의 조상인지 검사
- 조상이면 순환으로 거부

## 11.3 path 보조 점검

`path`는 디버깅과 운영 분석용이며, 순환 방지의 최종 근거는 조회 + 트랜잭션 잠금으로 처리한다.

---

## 12. LEFT/RIGHT 중복 방지 전략

DB 레벨:

- `binary_nodes unique(parent_account_id, position)`

애플리케이션 레벨:

1. candidate parent row lock
2. 해당 parent의 child slot 조회 `FOR UPDATE`
3. LEFT/RIGHT 점유 여부 확인
4. 비어 있으면 insert
5. 차 있으면 deterministic auto placement 탐색

즉, DB unique는 최종 보호막이고, 서비스 로직에서 먼저 충돌을 제어한다.

---

## 13. 자동 배치 전략

## 13.1 기본 규칙

1차 기본 규칙:

1. 추천인 하위 `LEFT` 빈자리 우선
2. `LEFT`가 차 있으면 `RIGHT`
3. 둘 다 차 있으면 하위 빈자리 자동 탐색

## 13.2 deterministic 탐색

반드시 같은 입력이면 같은 결과가 나와야 한다.

권장 알고리즘:

- BFS 탐색
- 정렬 기준:
  1. depth 오름차순
  2. `path` 오름차순
  3. `created_at` 오름차순
  4. slot 우선순위는 `LEFT -> RIGHT`

이 규칙을 고정하면 동일 입력에서 배치 결과가 바뀌지 않는다.

## 13.3 관리자 수동 배치

- API 계약은 이번에 정의
- 실제 구현은 2차 가능
- 수동 배치도 같은 순환/중복 제약을 따라야 한다

---

## 14. 트랜잭션 / FOR UPDATE 전략

회원가입 트랜잭션:

1. sponsor account `FOR UPDATE`
2. candidate binary parent 탐색 구간의 relevant `binary_nodes` row lock
3. `accounts` insert
4. `referral_edges` closure insert
5. `binary_nodes` insert
6. `binary_edges` closure insert
7. audit log insert
8. commit

수동 binary placement 트랜잭션:

1. target account `FOR UPDATE`
2. candidate parent `FOR UPDATE`
3. candidate parent child slot row `FOR UPDATE`
4. 순환 검증
5. `binary_nodes`, `binary_edges` update/rebuild
6. audit log insert
7. commit

---

## 15. rollback 전략

rollback 기준:

- 중복 `login_id`
- 중복 `referral_code`
- 없는 추천 코드
- sponsor/self/cycle 위반
- binary slot 중복
- auto placement 실패
- closure insert 실패
- audit log insert 실패

원칙:

- `accounts` insert 후 closure 생성에 실패하면 전체 rollback
- binary placement 실패 시 회원가입 전체 rollback
- 부분 성공 금지

---

## 16. 기존 데이터 마이그레이션 전략

## 16.1 accounts backfill

기존 계정은 운영형 로그인 정보가 없으므로 단계적 마이그레이션이 필요하다.

권장 순서:

1. 신규 컬럼 모두 nullable 또는 default 가능한 상태로 추가
2. 기존 계정에 대해:
   - `status = ACTIVE`
   - `joined_at = created_at`
   - `updated_at = created_at`
   - `referral_code`는 임시 코드 생성
3. `login_id`, `password_hash`는 관리자 운영 계정부터 수동 또는 별도 스크립트로 부여
4. 백필 완료 후 필요한 컬럼에 `NOT NULL` 강화

## 16.2 referral backfill

기존 sponsor 정보가 없다면:

- 과거 데이터는 sponsor null 허용
- 신규 가입부터 sponsor 필수로 적용

또는:

- 운영팀이 CSV/관리자 스크립트로 sponsor 매핑 후 closure 생성

## 16.3 binary backfill

기존 회원이 많고 binary 구조 정보가 없다면:

- 루트 계정부터 계층 배치 기준을 운영팀이 정의
- 별도 일괄 배치 스크립트로 `binary_nodes`, `binary_edges` 생성
- 계산 엔진 연결 전까지는 binary 미배치 회원을 제외 또는 보류 상태로 둘 수 있음

---

## 17. 단계별 마이그레이션 권장 순서

### Step 1

- `accounts` 컬럼 추가
- 인덱스 추가
- FK 추가

### Step 2

- `binary_nodes` 생성
- `binary_edges` 생성

### Step 3

- optional `auth_sessions` 생성

### Step 4

- 기존 데이터 backfill 스크립트 실행

### Step 5

- 애플리케이션 레벨 validation + auth + placement 로직 배포

### Step 6

- 운영 확인 후 일부 컬럼 `NOT NULL` 강화

---

## 18. 영향도 요약

- `accounts`: 매우 큼
- `accountsRepo.ts`: 매우 큼
- auth middleware: 큼
- sponsor closure logic: 신규
- binary placement logic: 신규
- User/Admin 조회 API: 신규
- 기존 policy/calc API: 직접 영향은 작음

---

## 19. 결론

1차 구현 준비 기준의 핵심은 아래 3가지다.

1. `accounts`를 운영형 계정 모델로 확장
2. `referral_edges`를 sponsor closure로 재사용
3. `binary_nodes` + `binary_edges`를 새로 도입

이 구조가 준비되어야 이후:

- 직추천 수당
- weak leg
- rank bonus
- 레그별 매출
- downline 분석

이 모두 안정적으로 계산될 수 있다.
