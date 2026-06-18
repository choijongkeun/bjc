# API Contract BJC Auth Member Referral Binary V1

## 1. 목적

이 문서는 BJC 회원가입/로그인/추천인/sponsor/binary leg 구조 도입을 위한 API 계약을 정리한다.

범위:

- auth API
- referral resolve API
- User Front 자기 조직도 API
- Admin Front 회원/조직도 조회 API
- Admin binary placement API

비범위:

- 계산 엔진 자동 실행 API
- User/Admin 전체 화면 계약

---

## 2. 공통 규칙

## 2.1 인증

운영형 기본:

- `httpOnly session cookie` 기반

개발/smoke fallback:

- `x-actor-account-id`

fallback 원칙:

- 기본적으로 `ALLOW_LEGACY_ACTOR_HEADER=true` 일 때만 허용
- 운영 배포 전에는 제거 또는 비활성화 권장

## 2.2 금액/수치

- `amount_base`는 항상 string
- `left_volume_base`, `right_volume_base`, `total_*_amount_base`, `total_*_base`도 string
- JS `Number` / `parseFloat` 금지

## 2.3 권한 기본값

- `USER`: 자기 범위 조회
- `READER`: 관리자 읽기 전용
- `ADMIN`: 관리자 읽기 + 쓰기

## 2.4 에러 코드

- `400` 잘못된 요청
- `401` 인증 없음/세션 만료
- `403` 권한 없음
- `404` 대상 없음
- `409` 중복/상태 충돌/기능 비활성
- `422` 검증 오류
- `500` 서버 오류

## 2.5 audit_log

운영상 회원/구조 변경은 별도 auth/member audit action을 사용한다.

기본 action 제안:

- `AUTH_REGISTER`
- `AUTH_LOGIN`
- `AUTH_LOGOUT`
- `REFERRAL_RESOLVE`
- `BINARY_AUTO_PLACEMENT`
- `BINARY_MANUAL_PLACEMENT`
- `ADMIN_MEMBER_VIEW`
- `ADMIN_MEMBER_TREE_VIEW`

읽기 API는 전부 audit를 남길 필요는 없지만, 민감 조회는 선택적으로 남길 수 있다.

---

## 3. API 계약

## 3.1 `POST /api/auth/register`

- `method/path`: `POST /api/auth/register`
- `request body`:

```json
{
  "login_id": "user01",
  "password": "plain-password",
  "display_name": "User 01",
  "referral_code": "BJC-ABCD-1234",
  "preferred_binary_position": "LEFT"
}
```

- `query params`: 없음
- `response`:

```json
{
  "account": {
    "id": "uuid",
    "login_id": "user01",
    "display_name": "User 01",
    "role": "USER",
    "status": "ACTIVE",
    "referral_code": "BJC-SELF-0001",
    "sponsor_account_id": "uuid",
    "binary_parent_account_id": "uuid",
    "binary_position": "LEFT",
    "joined_at": "2026-06-10T12:00:00.000Z"
  }
}
```

- `권한`: public
- `사용 테이블`:
  - `accounts`
  - `referral_edges`
  - `binary_nodes`
  - `binary_edges`
  - optional `auth_sessions`
  - `admin_audit_log` 또는 auth audit table
- `트랜잭션 여부`: 예
- `SELECT ... FOR UPDATE 대상`:
  - sponsor account
  - binary placement candidate parent / slots
- `audit_log action`:
  - `AUTH_REGISTER`
  - `BINARY_AUTO_PLACEMENT`
- `JWT/session 기준 여부`:
  - session-first
  - 회원가입 직후 자동 로그인은 옵션
- `기존 x-actor-account-id fallback 여부`:
  - 아니오
- `실패 케이스`:
  - 중복 `login_id`
  - 없는 `referral_code`
  - 잘못된 `preferred_binary_position`
  - binary slot 충돌
  - cycle 검출
  - hash 생성 실패
- `HTTP status code`:
  - `409` duplicate `login_id`
  - `422` validation
  - `404` sponsor not found
  - `500` internal

## 3.2 `POST /api/auth/login`

- `method/path`: `POST /api/auth/login`
- `request body`:

```json
{
  "login_id": "user01",
  "password": "plain-password"
}
```

- `query params`: 없음
- `response`:

```json
{
  "access_token": "optional-if-bearer-enabled",
  "account": {
    "id": "uuid",
    "login_id": "user01",
    "display_name": "User 01",
    "role": "USER",
    "status": "ACTIVE",
    "referral_code": "BJC-SELF-0001"
  }
}
```

- `권한`: public
- `사용 테이블`:
  - `accounts`
  - optional `auth_sessions`
  - auth audit
- `트랜잭션 여부`: 예
- `SELECT ... FOR UPDATE 대상`:
  - login target account
  - optional session row insert path
- `audit_log action`:
  - `AUTH_LOGIN`
- `JWT/session 기준 여부`:
  - session-first
  - bearer token 병행 가능
- `기존 x-actor-account-id fallback 여부`:
  - 아니오
- `실패 케이스`:
  - 없는 `login_id`
  - 비밀번호 불일치
  - `BLOCKED`
  - `WITHDRAWN`
- `HTTP status code`:
  - `401` invalid credential
  - `403` blocked/withdrawn
  - `422` validation
  - `500` internal

## 3.3 `POST /api/auth/logout`

- `method/path`: `POST /api/auth/logout`
- `request body`: 없음
- `query params`: 없음
- `response`:

```json
{
  "ok": true
}
```

- `권한`: authenticated
- `사용 테이블`:
  - optional `auth_sessions`
  - auth audit
- `트랜잭션 여부`: 예
- `SELECT ... FOR UPDATE 대상`:
  - current session row
- `audit_log action`:
  - `AUTH_LOGOUT`
- `JWT/session 기준 여부`:
  - session-first
- `기존 x-actor-account-id fallback 여부`:
  - dev/smoke에서는 허용 가능하나 실제 logout 의미는 제한적
- `실패 케이스`:
  - 세션 없음
  - 이미 만료
- `HTTP status code`:
  - `401` unauthenticated
  - `500` internal

## 3.4 `GET /api/auth/me`

- `method/path`: `GET /api/auth/me`
- `request body`: 없음
- `query params`: 없음
- `response`:

```json
{
  "account": {
    "id": "uuid",
    "login_id": "user01",
    "display_name": "User 01",
    "role": "USER",
    "status": "ACTIVE",
    "referral_code": "BJC-SELF-0001",
    "sponsor_account_id": "uuid",
    "binary_parent_account_id": "uuid",
    "binary_position": "LEFT",
    "joined_at": "2026-06-10T12:00:00.000Z",
    "last_login_at": "2026-06-11T09:00:00.000Z"
  }
}
```

- `권한`: authenticated
- `사용 테이블`:
  - `accounts`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `AUTH_ME_VIEW`
- `JWT/session 기준 여부`:
  - session-first
- `기존 x-actor-account-id fallback 여부`:
  - 예, dev/smoke only
- `실패 케이스`:
  - 세션 없음
  - actor 미존재
- `HTTP status code`:
  - `401` unauthenticated
  - `404` account not found
  - `500` internal

## 3.5 `GET /api/referrals/resolve?referral_code=`

- `method/path`: `GET /api/referrals/resolve`
- `request body`: 없음
- `query params`:
  - `referral_code`
- `response`:

```json
{
  "sponsor_account_id": "uuid",
  "sponsor_login_id": "sponsor01",
  "sponsor_display_name": "Sponsor 01",
  "referral_code_valid": true
}
```

- `권한`: public
- `사용 테이블`:
  - `accounts`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `REFERRAL_RESOLVE`
- `JWT/session 기준 여부`: 해당 없음
- `기존 x-actor-account-id fallback 여부`: 해당 없음
- `실패 케이스`:
  - 빈 `referral_code`
  - 존재하지 않는 코드
  - sponsor status invalid
- `HTTP status code`:
  - `400` missing query
  - `404` not found
  - `500` internal

## 3.6 `GET /api/me/referral-tree`

- `method/path`: `GET /api/me/referral-tree`
- `request body`: 없음
- `query params`:
  - `depth` optional
- `response`:

```json
{
  "account_id": "uuid",
  "login_id": "user01",
  "display_name": "User 01",
  "depth": 0,
  "children": [
    {
      "account_id": "child-uuid",
      "login_id": "user02",
      "display_name": "User 02",
      "depth": 1,
      "children": []
    }
  ]
}
```

- `권한`: authenticated USER/READER/ADMIN 자기 자신
- `사용 테이블`:
  - `accounts`
  - `referral_edges`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `REFERRAL_TREE_VIEW_SELF`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예, dev/smoke only
- `실패 케이스`:
  - 세션 없음
  - actor 미존재
  - depth invalid
- `HTTP status code`:
  - `401`
  - `422`
  - `500`

## 3.7 `GET /api/me/binary-tree`

- `method/path`: `GET /api/me/binary-tree`
- `request body`: 없음
- `query params`:
  - `depth` optional
- `response`:

```json
{
  "account_id": "uuid",
  "login_id": "user01",
  "display_name": "User 01",
  "binary_position": null,
  "depth": 0,
  "left_volume_base": "1000000",
  "right_volume_base": "700000",
  "children": []
}
```

- `권한`: authenticated USER/READER/ADMIN 자기 자신
- `사용 테이블`:
  - `accounts`
  - `binary_nodes`
  - `binary_edges`
  - `ledger_events` 집계용
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `BINARY_TREE_VIEW_SELF`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예, dev/smoke only
- `실패 케이스`:
  - 세션 없음
  - actor 미존재
  - binary 미배치
- `HTTP status code`:
  - `401`
  - `404`
  - `500`

## 3.8 `GET /api/me/binary-legs`

- `method/path`: `GET /api/me/binary-legs`
- `request body`: 없음
- `query params`:
  - `as_of_date` optional
- `response`:

```json
{
  "account_id": "uuid",
  "left_volume_base": "1000000",
  "right_volume_base": "700000",
  "weak_leg_volume_base": "700000",
  "left_member_count": 12,
  "right_member_count": 9,
  "total_stake_amount_base": "2500000",
  "total_sales_amount_base": "2800000",
  "total_reward_amount_base": "140000"
}
```

- `권한`: authenticated USER/READER/ADMIN 자기 자신
- `사용 테이블`:
  - `accounts`
  - `binary_edges`
  - `ledger_events`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `BINARY_LEGS_VIEW_SELF`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예, dev/smoke only
- `실패 케이스`:
  - 세션 없음
  - actor 미존재
- `HTTP status code`:
  - `401`
  - `404`
  - `500`

## 3.9 `GET /api/me/downlines`

- `method/path`: `GET /api/me/downlines`
- `request body`: 없음
- `query params`:
  - `tree_type=sponsor|binary`
  - `depth` optional
  - `page` optional
  - `limit` optional
- `response`:

```json
{
  "items": [
    {
      "account_id": "uuid",
      "login_id": "user02",
      "display_name": "User 02",
      "depth": 1,
      "sponsor_account_id": "uuid",
      "binary_parent_account_id": "uuid",
      "binary_position": "LEFT",
      "total_stake_amount_base": "1000000",
      "total_reward_amount_base": "12000"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

- `권한`: authenticated USER/READER/ADMIN 자기 자신
- `사용 테이블`:
  - `accounts`
  - `referral_edges` or `binary_edges`
  - `ledger_events`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `DOWNLINES_VIEW_SELF`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예, dev/smoke only
- `실패 케이스`:
  - tree_type invalid
  - pagination invalid
  - unauthenticated
- `HTTP status code`:
  - `401`
  - `422`
  - `500`

## 3.10 `GET /api/admin/accounts`

- `method/path`: `GET /api/admin/accounts`
- `request body`: 없음
- `query params`:
  - `page`
  - `limit`
  - `login_id`
  - `display_name`
  - `role`
  - `status`
  - `sponsor_account_id`
  - `binary_parent_account_id`
- `response`:

```json
{
  "items": [
    {
      "id": "uuid",
      "login_id": "user01",
      "display_name": "User 01",
      "role": "USER",
      "status": "ACTIVE",
      "referral_code": "BJC-SELF-0001",
      "sponsor_account_id": "uuid",
      "binary_parent_account_id": "uuid",
      "binary_position": "LEFT",
      "joined_at": "2026-06-10T12:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

- `권한`: `ADMIN`, `READER`
- `사용 테이블`:
  - `accounts`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `ADMIN_MEMBER_LIST_VIEW`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예, dev/smoke/admin console only
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - invalid filter
- `HTTP status code`:
  - `401`
  - `403`
  - `422`
  - `500`

## 3.11 `GET /api/admin/accounts/:accountId`

- `method/path`: `GET /api/admin/accounts/:accountId`
- `request body`: 없음
- `query params`: 없음
- `response`:

```json
{
  "account": {
    "id": "uuid",
    "login_id": "user01",
    "display_name": "User 01",
    "role": "USER",
    "status": "ACTIVE",
    "referral_code": "BJC-SELF-0001",
    "sponsor_account_id": "uuid",
    "binary_parent_account_id": "uuid",
    "binary_position": "LEFT",
    "joined_at": "2026-06-10T12:00:00.000Z",
    "last_login_at": "2026-06-11T09:00:00.000Z"
  }
}
```

- `권한`: `ADMIN`, `READER`
- `사용 테이블`:
  - `accounts`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `ADMIN_MEMBER_VIEW`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `500`

## 3.12 `GET /api/admin/accounts/:accountId/referral-tree`

- `method/path`: `GET /api/admin/accounts/:accountId/referral-tree`
- `request body`: 없음
- `query params`:
  - `depth` optional
- `response`:

```json
{
  "account_id": "uuid",
  "login_id": "user01",
  "display_name": "User 01",
  "children": []
}
```

- `권한`: `ADMIN`, `READER`
- `사용 테이블`:
  - `accounts`
  - `referral_edges`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `ADMIN_MEMBER_REFERRAL_TREE_VIEW`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
  - depth invalid
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `422`
  - `500`

## 3.13 `GET /api/admin/accounts/:accountId/binary-tree`

- `method/path`: `GET /api/admin/accounts/:accountId/binary-tree`
- `request body`: 없음
- `query params`:
  - `depth` optional
- `response`:

```json
{
  "account_id": "uuid",
  "login_id": "user01",
  "display_name": "User 01",
  "left_volume_base": "1000000",
  "right_volume_base": "700000",
  "children": []
}
```

- `권한`: `ADMIN`, `READER`
- `사용 테이블`:
  - `accounts`
  - `binary_nodes`
  - `binary_edges`
  - `ledger_events`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `ADMIN_MEMBER_BINARY_TREE_VIEW`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `500`

## 3.14 `GET /api/admin/accounts/:accountId/binary-legs`

- `method/path`: `GET /api/admin/accounts/:accountId/binary-legs`
- `request body`: 없음
- `query params`:
  - `as_of_date` optional
- `response`:

```json
{
  "account_id": "uuid",
  "left_volume_base": "1000000",
  "right_volume_base": "700000",
  "weak_leg_volume_base": "700000",
  "total_stake_amount_base": "2500000",
  "total_sales_amount_base": "2800000",
  "total_reward_amount_base": "140000"
}
```

- `권한`: `ADMIN`, `READER`
- `사용 테이블`:
  - `accounts`
  - `binary_edges`
  - `ledger_events`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `ADMIN_MEMBER_BINARY_LEGS_VIEW`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `500`

## 3.15 `GET /api/admin/accounts/:accountId/downlines`

- `method/path`: `GET /api/admin/accounts/:accountId/downlines`
- `request body`: 없음
- `query params`:
  - `tree_type=sponsor|binary`
  - `depth` optional
  - `page` optional
  - `limit` optional
- `response`:

```json
{
  "items": [
    {
      "account_id": "uuid",
      "login_id": "user02",
      "display_name": "User 02",
      "depth": 1,
      "binary_position": "LEFT",
      "total_stake_amount_base": "1000000",
      "total_reward_amount_base": "12000"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

- `권한`: `ADMIN`, `READER`
- `사용 테이블`:
  - `accounts`
  - `referral_edges` or `binary_edges`
  - `ledger_events`
- `트랜잭션 여부`: 아니오
- `SELECT ... FOR UPDATE 대상`: 없음
- `audit_log action`: optional `ADMIN_MEMBER_DOWNLINES_VIEW`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
  - tree_type invalid
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `422`
  - `500`

## 3.16 `POST /api/admin/accounts/:accountId/binary-placement`

- `method/path`: `POST /api/admin/accounts/:accountId/binary-placement`
- `request body`:

```json
{
  "mode": "AUTO",
  "parent_account_id": "optional-uuid",
  "preferred_position": "LEFT",
  "reason": "manual adjustment requested"
}
```

- `query params`: 없음
- `response`:

```json
{
  "account_id": "target-uuid",
  "binary_parent_account_id": "parent-uuid",
  "binary_position": "LEFT",
  "placement_mode": "AUTO",
  "path": "/root/parent/target/"
}
```

- `권한`: `ADMIN`
- `사용 테이블`:
  - `accounts`
  - `binary_nodes`
  - `binary_edges`
  - `admin_audit_log`
- `트랜잭션 여부`: 예
- `SELECT ... FOR UPDATE 대상`:
  - target account
  - candidate parent
  - candidate parent slots
  - relevant binary subtree rows
- `audit_log action`:
  - `BINARY_AUTO_PLACEMENT`
  - `BINARY_MANUAL_PLACEMENT`
- `JWT/session 기준 여부`: session-first
- `기존 x-actor-account-id fallback 여부`: 예, dev/admin smoke only
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
  - target already placed
  - manual placement disabled
  - invalid parent
  - cycle detected
  - slot collision
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `409` already placed / feature disabled / slot conflict
  - `422` validation / cycle
  - `500` internal

## 3.17 `POST /api/admin/accounts/:accountId/status`

- `method/path`: `POST /api/admin/accounts/:accountId/status`
- `request body`:

```json
{
  "status": "BLOCKED",
  "reason": "member requested temporary hold"
}
```

- `query params`: 없음
- `response`:

```json
{
  "account": {
    "id": "uuid",
    "login_id": "user01",
    "display_name": "User 01",
    "role": "USER",
    "status": "BLOCKED",
    "referral_code": "BJC-SELF-0001",
    "sponsor_account_id": "uuid",
    "binary_parent_account_id": "uuid",
    "binary_position": "LEFT",
    "joined_at": "2026-06-10T12:00:00.000Z",
    "last_login_at": "2026-06-11T09:00:00.000Z"
  },
  "previous_status": "ACTIVE",
  "revoked_session_count": 2
}
```

- `권한`: `ADMIN`
- `사용 테이블`:
  - `accounts`
  - `auth_sessions`
  - `admin_audit_log`
- `트랜잭션 여부`: 예
- `SELECT ... FOR UPDATE 대상`:
  - actor account
  - target account
  - target active sessions revoke 대상 row
- `audit_log action`:
  - `ADMIN_ACCOUNT_STATUS_UPDATED`
- `JWT/session 기준 여부`: 관리자 write API이므로 session-first 또는 개발용 `x-actor-account-id` fallback
- `기존 x-actor-account-id fallback 여부`: 예
- `실패 케이스`:
  - unauthenticated
  - forbidden
  - target not found
  - self status change
  - `USER`가 아닌 운영 계정 상태 변경 시도
  - 허용되지 않은 상태 전이
  - 동일 상태 재요청
- `HTTP status code`:
  - `401`
  - `403`
  - `404`
  - `409` invalid transition / already same status
  - `422` validation
  - `500` internal

---

## 4. 권장 구현 순서

1. `GET /api/referrals/resolve`
2. `POST /api/auth/register`
3. `POST /api/auth/login`
4. `GET /api/auth/me`
5. `GET /api/me/referral-tree`
6. `GET /api/me/binary-tree`
7. `GET /api/me/binary-legs`
8. `GET /api/admin/accounts`
9. `GET /api/admin/accounts/:accountId`
10. `GET /api/admin/accounts/:accountId/referral-tree`
11. `GET /api/admin/accounts/:accountId/binary-tree`
12. `POST /api/admin/accounts/:accountId/binary-placement`

---

## 5. 결론

이 계약의 핵심은 아래 두 가지다.

1. 운영형 인증은 session-first로 설계하되, 기존 `x-actor-account-id`는 개발/smoke fallback으로만 유지
2. sponsor와 binary를 분리한 API 집합을 먼저 고정해 이후 계산 엔진 입력 계약을 안정화
