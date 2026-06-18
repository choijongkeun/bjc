# API Contract: BJC User / Admin Staking V1

## 1. Scope

- This document defines the first contract for account staking APIs only.
- This phase does not implement UI or service code.
- Amount fields must be returned as strings to preserve `DECIMAL(65,0)` precision.
- `staking_products` remains the source of truth for product policy definitions.
- `account_stakings` is introduced as the source of truth for member staking applications and lifecycle state.

## 2. Shared Rules

- Auth:
  - User endpoints require a valid member bearer token.
  - Admin endpoints require `ADMIN` or `READER` according to each operation.
- Amount serialization:
  - `principal_amount_base`
  - `minimum_amount_base`
  - `maximum_amount_base`
  - every future reward / fee / payout amount
  - all must be serialized as string values
- Idempotency:
  - `POST /api/me/stakings` requires `idempotency_key`
  - retried requests with the same `idempotency_key` must return the existing staking row instead of creating a duplicate
- Audit:
  - all admin mutations create `admin_audit_log` rows
  - user staking request / cancel actions should also create audit rows with actor = current member account
- Pagination:
  - default `page=1`
  - default `limit=20`
  - max `limit=100`

## 3. Canonical Types

### 3.1 Staking Product

```json
{
  "id": "string",
  "policy_version_id": "string",
  "name": "string",
  "symbol": "string",
  "decimals": 6,
  "minimum_amount_base": "1000000",
  "maximum_amount_base": "1000000000",
  "duration_days": 30,
  "daily_interest_bps": "50",
  "status": "ACTIVE",
  "display_order": 10,
  "effective_from": "2026-06-20T00:00:00.000Z",
  "effective_to": null,
  "created_at": "2026-06-18T10:00:00.000Z",
  "updated_at": "2026-06-18T10:00:00.000Z"
}
```

### 3.2 Account Staking

```json
{
  "id": "string",
  "account_id": "string",
  "staking_product_id": "string",
  "policy_version_id": "string",
  "principal_amount_base": "1000000",
  "daily_interest_bps_snapshot": "50",
  "duration_days_snapshot": 30,
  "status": "PENDING",
  "idempotency_key": "staking-request-001",
  "started_at": null,
  "matures_at": null,
  "activated_at": null,
  "cancel_requested_at": null,
  "cancelled_at": null,
  "matured_at": null,
  "closed_at": null,
  "source_ledger_event_id": null,
  "cancellation_ledger_event_id": null,
  "created_at": "2026-06-18T10:00:00.000Z",
  "updated_at": "2026-06-18T10:00:00.000Z",
  "staking_product": {
    "id": "string",
    "name": "30D",
    "symbol": "USDC",
    "decimals": 6
  }
}
```

## 4. State Machine

### 4.1 Recommended lifecycle

```text
PENDING
-> ACTIVE
-> MATURED
-> CLOSED
```

### 4.2 Cancel lifecycle

```text
PENDING -> CANCELLED
ACTIVE -> CANCEL_REQUESTED -> CANCELLED
```

### 4.3 Admin reject mapping

- `POST /api/admin/stakings/:stakingId/reject` is mapped to `PENDING -> CANCELLED`
- audit action must be `ACCOUNT_STAKING_REJECT`
- rejection reason should be written into audit metadata and response payload

## 5. User APIs

### 5.1 GET `/api/staking-products`

- Purpose:
  - list products visible to users
- Auth:
  - authenticated user
- Query:
  - `status=ACTIVE` default
  - `symbol` optional
  - `page`, `limit`
- Response:

```json
{
  "staking_products": [
    {
      "id": "string",
      "policy_version_id": "string",
      "name": "30D",
      "symbol": "USDC",
      "decimals": 6,
      "minimum_amount_base": "1000000",
      "maximum_amount_base": "1000000000",
      "duration_days": 30,
      "daily_interest_bps": "50",
      "status": "ACTIVE",
      "display_order": 10,
      "effective_from": null,
      "effective_to": null,
      "created_at": "2026-06-18T10:00:00.000Z",
      "updated_at": "2026-06-18T10:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

- Errors:
  - `401 unauthorized`
  - `403 forbidden`

### 5.2 POST `/api/me/stakings`

- Purpose:
  - create a staking application row
- Auth:
  - authenticated user
- Request:

```json
{
  "staking_product_id": "string",
  "principal_amount_base": "1000000",
  "idempotency_key": "staking-request-001"
}
```

- Processing rules:
  - validate active account
  - load `staking_products`
  - snapshot `policy_version_id`, `daily_interest_bps`, `duration_days`
  - validate min/max range using product settings
  - create `account_stakings` in `PENDING`
  - create `ledger_events` row with `event_type=STAKING_REQUESTED`
  - store the ledger row id as `source_ledger_event_id`
  - all writes happen in one transaction
- Success response:
  - `201 Created`

```json
{
  "staking": {
    "id": "string",
    "account_id": "string",
    "staking_product_id": "string",
    "policy_version_id": "string",
    "principal_amount_base": "1000000",
    "daily_interest_bps_snapshot": "50",
    "duration_days_snapshot": 30,
    "status": "PENDING",
    "idempotency_key": "staking-request-001",
    "started_at": null,
    "matures_at": null,
    "activated_at": null,
    "cancel_requested_at": null,
    "cancelled_at": null,
    "matured_at": null,
    "closed_at": null,
    "source_ledger_event_id": "string",
    "cancellation_ledger_event_id": null,
    "created_at": "2026-06-18T10:00:00.000Z",
    "updated_at": "2026-06-18T10:00:00.000Z"
  }
}
```

- Errors:
  - `400 invalid_request`
  - `401 unauthorized`
  - `403 forbidden`
  - `404 staking_product_not_found`
  - `409 duplicate_idempotency_key`
  - `422 amount_out_of_range`
  - `422 account_status_invalid`

### 5.3 GET `/api/me/stakings`

- Purpose:
  - list current member staking rows
- Auth:
  - authenticated user
- Query:
  - `status` optional
  - `page`, `limit`
  - `from`, `to` optional on `created_at`
- Response:

```json
{
  "stakings": [],
  "page": 1,
  "limit": 20,
  "total": 0
}
```

### 5.4 GET `/api/me/stakings/:stakingId`

- Purpose:
  - detail view of a single member staking row
- Auth:
  - authenticated user
- Rules:
  - only own `stakingId` is visible
- Errors:
  - `404 staking_not_found`
  - `403 forbidden`

### 5.5 POST `/api/me/stakings/:stakingId/cancel`

- Purpose:
  - request cancel or immediate cancel depending on current status
- Auth:
  - authenticated user
- Request:

```json
{
  "reason": "optional string"
}
```

- State rules:
  - `PENDING -> CANCELLED`
  - `ACTIVE -> CANCEL_REQUESTED`
  - any other state -> `409 invalid_state_transition`
- Ledger:
  - `PENDING -> CANCELLED`: optional `STAKING_CANCELLED` only
  - `ACTIVE -> CANCEL_REQUESTED`: no principal release event yet
- Errors:
  - `404 staking_not_found`
  - `409 invalid_state_transition`

## 6. Admin APIs

### 6.1 GET `/api/admin/stakings`

- Purpose:
  - list staking rows across accounts
- Auth:
  - `READER` or above
- Filters:
  - `account_id`
  - `login_id`
  - `staking_product_id`
  - `policy_version_id`
  - `status`
  - `created_from`
  - `created_to`
  - `page`, `limit`

### 6.2 GET `/api/admin/stakings/:stakingId`

- Purpose:
  - full detail with member account and product summary
- Auth:
  - `READER` or above

### 6.3 POST `/api/admin/stakings/:stakingId/activate`

- Purpose:
  - convert `PENDING` request into active contract
- Auth:
  - `ADMIN`
- Rules:
  - only `PENDING` allowed
  - set `status=ACTIVE`
  - set `activated_at`
  - set `started_at=activated_at`
  - set `matures_at = activated_at + duration_days_snapshot`
- Ledger:
  - create `STAKING_PRINCIPAL_LOCKED`
  - create `STAKING_ACTIVATED`
  - same transaction as status transition
- Errors:
  - `404 staking_not_found`
  - `409 invalid_state_transition`

### 6.4 POST `/api/admin/stakings/:stakingId/reject`

- Purpose:
  - reject a pending application
- Auth:
  - `ADMIN`
- Rules:
  - only `PENDING` allowed
  - mapped to `status=CANCELLED`
  - set `cancelled_at`
  - write rejection reason into audit log meta

### 6.5 POST `/api/admin/stakings/:stakingId/cancel`

- Purpose:
  - force cancel a request or active staking
- Auth:
  - `ADMIN`
- Rules:
  - `PENDING -> CANCELLED`
  - `ACTIVE or CANCEL_REQUESTED -> CANCELLED`
- Ledger:
  - optional `STAKING_CANCELLED`
  - if principal release is confirmed, add `STAKING_PRINCIPAL_RELEASED`

### 6.6 GET `/api/admin/accounts/:accountId/stakings`

- Purpose:
  - account detail screen support
- Auth:
  - `READER` or above
- Query:
  - `status`
  - `page`, `limit`

## 7. Ledger Mapping

### 7.1 Recommended event usage

- `STAKING_REQUESTED`
  - emitted when a `PENDING` row is created
  - `reference_id = staking.request:<account_staking_id>`
- `STAKING_PRINCIPAL_LOCKED`
  - emitted when admin activation locks principal
  - `reference_id = staking.lock:<account_staking_id>`
- `STAKING_ACTIVATED`
  - emitted when status becomes `ACTIVE`
  - `reference_id = staking.activate:<account_staking_id>`
- `STAKING_CANCELLED`
  - emitted when a staking request or position is cancelled
  - `reference_id = staking.cancel:<account_staking_id>`
- `STAKING_PRINCIPAL_RELEASED`
  - emitted only when principal is actually released
  - `reference_id = staking.release:<account_staking_id>`
- `STAKING_MATURED`
  - emitted when a staking contract reaches maturity
  - `reference_id = staking.mature:<account_staking_id>`

### 7.2 Existing event reuse

- `DAILY_REWARD_ACCRUAL` already exists.
- Do not introduce `DAILY_REWARD_ACCRUED` as a second synonym.
- Future reward accrual should reuse `DAILY_REWARD_ACCRUAL`.

## 8. Recommended Initial Policy

- Product durations must always be read from `staking_products.staking_days`
- The UI can seed default product candidates:
  - `30 days -> 50 bps/day`
  - `90 days -> 70 bps/day`
  - `180 days -> 100 bps/day`
  - `360 days -> 120 bps/day`
- The code must not hard-code `160 days`

## 9. Recommendation Summary

- User staking should create `PENDING` first
- Admin activation should be required before `ACTIVE`
- `account_stakings` should hold immutable commercial snapshots
- `staking_products` should remain policy definition only
- `ledger_events.reference_id` unique constraint is compatible with `staking.<action>:<staking_id>` naming
