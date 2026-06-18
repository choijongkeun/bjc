# API Contract: BJC User / Admin Staking V1

## 1. Scope

- This document reflects the implemented v1 backend contract for account staking APIs.
- This phase implements repository, service, route, unit test, and smoke coverage only.
- This phase does not implement User/Admin staking screens, reward accrual, reward payout, withdrawals, maturity batch, wallet funding confirmation, or real balance deduction.
- Amount fields mapped from `DECIMAL(65,0)` remain string values in request validation, service logic, DB write inputs, and API responses.

## 2. Shared Rules

- `staking_products` remains the product definition source of truth.
- `account_stakings` is the lifecycle source of truth for member staking applications and contracts.
- Public product list excludes inactive products.
- Admin product list compatibility remains on `GET /api/staking-products` when `x-actor-account-id` is present.
- Pagination defaults:
  - `page=1`
  - `limit=20`
  - `limit <= 100`
- Sort values for staking lists:
  - `created_at_desc`
  - `created_at_asc`
  - `matures_at_asc`
  - `matures_at_desc`

## 3. Auth / Role Rules

- User endpoints:
  - require bearer token via session auth
  - require current account status `ACTIVE` for create/cancel mutations
- Admin read endpoints:
  - allow `READER` and `ADMIN`
- Admin write endpoints:
  - allow `ADMIN` only
- Ownership:
  - `GET /api/me/stakings/:stakingId` returns `404` when the row is missing or owned by another account
  - `POST /api/me/stakings/:stakingId/cancel` also hides foreign rows behind `404`

## 4. Canonical Response Shapes

### 4.1 Public Product Summary

```json
{
  "id": "string",
  "name": "30D USDC",
  "symbol": "USDC",
  "decimals": 6,
  "min_stake_amount_base": "100",
  "max_stake_amount_base": "1000000",
  "staking_days": 30,
  "daily_interest_bps": "50",
  "is_active": true
}
```

### 4.2 Staking Summary

```json
{
  "id": "string",
  "account_id": "string",
  "principal_amount_base": "1000",
  "daily_interest_bps_snapshot": "50",
  "duration_days_snapshot": 30,
  "status": "PENDING",
  "started_at": null,
  "matures_at": null,
  "activated_at": null,
  "cancel_requested_at": null,
  "cancelled_at": null,
  "matured_at": null,
  "closed_at": null,
  "source_ledger_event_id": "string",
  "cancellation_ledger_event_id": null,
  "created_at": "2026-06-18T12:00:00.000Z",
  "updated_at": "2026-06-18T12:00:00.000Z",
  "product": {
    "id": "string",
    "name": "30D USDC",
    "symbol": "USDC",
    "decimals": 6,
    "min_stake_amount_base": "100",
    "max_stake_amount_base": "1000000",
    "staking_days": 30,
    "daily_interest_bps": "50",
    "is_active": true
  }
}
```

### 4.3 Admin Staking Summary

```json
{
  "staking": {
    "...staking fields": true,
    "account": {
      "id": "string",
      "login_id": "member001",
      "display_name": "Member 001"
    }
  }
}
```

## 5. Implemented State Machine

```text
PENDING -> ACTIVE
PENDING -> CANCELLED
ACTIVE -> CANCEL_REQUESTED
ACTIVE -> CANCELLED
CANCEL_REQUESTED -> CANCELLED
```

- `POST /api/admin/stakings/:stakingId/reject` maps `PENDING -> CANCELLED`.
- `ACTIVE -> MATURED` is not implemented in this phase.
- `MATURED -> CLOSED` is not implemented in this phase.

## 6. Idempotency

### 6.1 Create staking

- `POST /api/me/stakings` requires `idempotency_key`.
- Storage key is `account_stakings.idempotency_key` with a unique constraint.
- Same key + same `account_id` + same `staking_product_id` + same `principal_amount_base`:
  - returns the existing staking response
- Same key + different request payload:
  - returns `409`

### 6.2 Status transitions

- Ledger `reference_id` values are unique and used to prevent duplicate transition events:
  - `staking.request:<staking_id>`
  - `staking.lock:<staking_id>`
  - `staking.activate:<staking_id>`
  - `staking.cancel:<staking_id>`
  - `staking.release:<staking_id>`
  - `staking.mature:<staking_id>`
- `POST /api/me/stakings/:stakingId/cancel` treats `CANCEL_REQUESTED` as idempotent success and returns the current row.

## 7. Ledger / Audit Mapping

### 7.1 Ledger events

- Create request:
  - `STAKING_REQUESTED`
- User cancel on `PENDING`:
  - `STAKING_CANCELLED`
- Admin activate:
  - `STAKING_PRINCIPAL_LOCKED`
  - `STAKING_ACTIVATED`
- Admin reject:
  - `STAKING_CANCELLED`
- Admin cancel from `ACTIVE` or `CANCEL_REQUESTED`:
  - `STAKING_CANCELLED`
  - `STAKING_PRINCIPAL_RELEASED`

### 7.2 Audit actions

- `USER_STAKING_REQUEST`
- `USER_STAKING_CANCEL_REQUEST`
- `USER_STAKING_CANCELLED`
- `ADMIN_STAKING_ACTIVATE`
- `ADMIN_STAKING_REJECT`
- `ADMIN_STAKING_CANCEL`

### 7.3 Audit metadata principles

- include only limited identifiers and transition context
- do not include password, session token, password hash, session token hash, or raw access token
- store cancel / reject reason in audit metadata because there is no dedicated DB reason column in `account_stakings`

## 8. User APIs

### 8.1 GET `/api/staking-products`

- Public mode:
  - no auth required
  - returns active products only
  - response shape:

```json
{
  "staking_products": [
    {
      "id": "string",
      "name": "30D USDC",
      "symbol": "USDC",
      "decimals": 6,
      "min_stake_amount_base": "100",
      "max_stake_amount_base": "1000000",
      "staking_days": 30,
      "daily_interest_bps": "50",
      "is_active": true
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

- Compatibility mode:
  - when `x-actor-account-id` exists, the legacy admin staking product listing path remains available

### 8.2 POST `/api/me/stakings`

- Request:

```json
{
  "staking_product_id": "string",
  "principal_amount_base": "1000",
  "idempotency_key": "create-001"
}
```

- Validation:
  - `staking_product_id` required
  - `principal_amount_base` must be a positive integer string
  - `idempotency_key` required and `<= 128`
  - product must exist
  - product must be active
  - amount must be within min/max product range
  - linked policy status must not be `RETIRED`
  - current account must be `ACTIVE`
- Transaction:
  - lock account
  - check idempotency row
  - lock product
  - lock policy version
  - insert `account_stakings` as `PENDING`
  - append `STAKING_REQUESTED`
  - update `source_ledger_event_id`
  - insert `USER_STAKING_REQUEST` audit row
- Success:
  - `201 Created`

### 8.3 GET `/api/me/stakings`

- Query:
  - `status` optional
  - `product_id` optional
  - `page`
  - `limit`
  - `sort`
- Response:

```json
{
  "items": [],
  "page": 1,
  "limit": 20,
  "total": 0
}
```

### 8.4 GET `/api/me/stakings/:stakingId`

- Returns only the owner row.
- Returns `404` when missing or not owned by the current session account.

### 8.5 POST `/api/me/stakings/:stakingId/cancel`

- Request:

```json
{
  "reason": "optional string",
  "idempotency_key": "cancel-001"
}
```

- Rules:
  - `PENDING -> CANCELLED`
  - `ACTIVE -> CANCEL_REQUESTED`
  - `CANCEL_REQUESTED -> current row returned`
  - `CANCELLED`, `MATURED`, `CLOSED` -> `409`
- Ledger:
  - only `PENDING -> CANCELLED` appends `STAKING_CANCELLED`
  - `ACTIVE -> CANCEL_REQUESTED` writes audit only in this phase

## 9. Admin APIs

### 9.1 GET `/api/admin/stakings`

- Auth:
  - `READER` or `ADMIN`
- Filters:
  - `q`
  - `account_id`
  - `product_id`
  - `status`
  - `created_from`
  - `created_to`
  - `matures_from`
  - `matures_to`
  - `page`
  - `limit`
  - `sort`

### 9.2 GET `/api/admin/stakings/:stakingId`

- Auth:
  - `READER` or `ADMIN`
- Includes account summary and product snapshot/current product fields from the joined view.

### 9.3 POST `/api/admin/stakings/:stakingId/activate`

- Auth:
  - `ADMIN`
- Rules:
  - only `PENDING`
  - account must still be `ACTIVE`
  - product must still be active
  - linked policy must not be `RETIRED`
  - sets `status=ACTIVE`
  - sets `activated_at`
  - sets `started_at=activated_at`
  - sets `matures_at = started_at + duration_days_snapshot`
- Notes:
  - `STAKING_PRINCIPAL_LOCKED` is an off-chain contract event only in this phase
  - no actual balance deduction happens yet

### 9.4 POST `/api/admin/stakings/:stakingId/reject`

- Auth:
  - `ADMIN`
- Request:

```json
{
  "reason": "required string"
}
```

- Rules:
  - only `PENDING`
  - mapped to `status=CANCELLED`
  - appends `STAKING_CANCELLED`
  - writes reject reason to ledger/audit metadata

### 9.5 POST `/api/admin/stakings/:stakingId/cancel`

- Auth:
  - `ADMIN`
- Request:

```json
{
  "reason": "optional string"
}
```

- Rules:
  - only `ACTIVE` or `CANCEL_REQUESTED`
  - transitions to `CANCELLED`
  - appends `STAKING_CANCELLED`
  - appends `STAKING_PRINCIPAL_RELEASED`
- Notes:
  - release is still an off-chain ledger event only in this phase
  - no actual balance return is implemented

### 9.6 GET `/api/admin/accounts/:accountId/stakings`

- Auth:
  - `READER` or `ADMIN`
- Returns `404` when the target account does not exist.
- Query:
  - `status`
  - `product_id`
  - `page`
  - `limit`
  - `sort`

## 10. Security / Data Exposure

- API responses do not include:
  - `password_hash`
  - `session_token_hash`
  - raw session token except normal login response `access_token`
- Staking responses do not include raw `idempotency_key`.
- Service validation compares amount strings with `BigInt`; it does not convert to JavaScript `Number`.

## 11. Smoke Status

- `npm run smoke:staking`: pass
- Covered flows:
  - public product list
  - create + create idempotency replay
  - create conflict on same key
  - min amount failure
  - inactive product failure
  - my list/detail
  - foreign detail blocked
  - user cancel from `PENDING`
  - reader list/detail
  - reader activate forbidden
  - admin activate
  - user cancel request from `ACTIVE`
  - admin cancel
  - admin reject
  - ledger/audit verification
  - sensitive field absence
  - fixture cleanup to zero residual rows
