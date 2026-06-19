# API Contract: BJC User and Admin Withdrawal V1

## 1. Scope

- This document records the implemented V1 contract for reward-withdrawal balance, preview, create, list, detail, cancel, and admin lifecycle APIs.
- Runtime repository, service, route, ledger, audit, unit test, and smoke coverage are implemented.
- User/Admin withdrawal screens, actual wallet transfer execution, blockchain confirmation polling, and `PREPAY_BJC` settlement remain out of scope.
- All amount fields sourced from `DECIMAL(65,0)` remain string values in API requests and responses.

## 2. Source of Truth

- `account_rewards`
  - reward accrual, confirmation, and reversal source of truth
- `reward_withdrawals`
  - withdrawal request header source of truth
- `reward_withdrawal_allocations`
  - reward-to-withdrawal reservation and consumption source of truth
- `ledger_events`
  - append-only withdrawal lifecycle ledger source of truth
- admin audit log table
  - actor/action audit source of truth for withdrawal lifecycle operations

## 3. Shared Domain Rules

### 3.1 Withdrawal types

- `DAILY_REWARD`
- `BONUS`

### 3.2 Eligible reward buckets

- `DAILY_REWARD`
  - reward rows with original reward type `DAILY_REWARD`
- `BONUS`
  - reward rows with original reward type in:
    - `DIRECT_REFERRAL`
    - `RANK_BONUS`
    - `CONTRIBUTION`
    - `SIDECAR`

### 3.3 Exclusions

- `WITHDRAWAL_FEE`
  - excluded from withdrawable source balance
- `ADJUSTMENT`
  - excluded from V1 withdrawal eligibility
- `PENDING`
  - excluded
- original rows whose status is `REVERSED`
  - excluded as positive sources
- `REVERSAL`
  - included only by inheriting the original reward bucket and reducing the net amount

### 3.4 Amount and fee rules

- Service logic must not use JavaScript `Number`, `parseInt`, or `parseFloat` for reward or withdrawal amounts.
- Request validation keeps integer-string semantics.
- Service uses `BigInt` for arithmetic and returns strings again.
- V1 fee mode is fixed to `DEDUCT_FROM_WITHDRAWAL`.
- Allocation fee rounding uses integer floor:

```text
fee_amount_base = floor((allocated_amount_base * fee_bps) / 10000)
```

### 3.5 Recalculation rule

- `POST /api/me/withdrawal-preview`
  - returns an estimate only
  - does not reserve balance
- `POST /api/me/withdrawals`
  - recomputes candidate allocations and fees inside the create transaction
  - does not trust the preview result

### 3.6 Balance semantics

For one account and one withdrawal bucket:

```text
confirmed_amount_base
= eligible confirmed positive rewards
+ eligible confirmed reversal negative rewards

available_amount_base
= confirmed_amount_base
- RESERVED allocation sum
- CONSUMED allocation sum
```

- `RELEASED` allocations do not reduce balance.
- If computed available balance is negative, the API raises an internal consistency error instead of coercing to `0`.

### 3.7 FIFO allocation order

- candidate reward order:
  - `confirmed_at asc`
  - `reward_date asc`
  - `id asc`

### 3.8 Fee schedule selection

- holding age basis:
  - KST business date derived from `confirmed_at`
- request age basis:
  - current KST date at preview/create time
- rule selection:
  - choose the greatest active `schedule_days` where `schedule_days <= holding_days`
- if no active matching rule exists for a candidate reward slice:
  - that slice is not allocatable

### 3.9 State machine

```text
REQUESTED -> APPROVED
REQUESTED -> REJECTED
REQUESTED -> CANCELLED
APPROVED  -> PROCESSING
PROCESSING -> COMPLETED
PROCESSING -> FAILED
```

- invalid transitions return `409`

### 3.10 Allocation state mapping

```text
REQUESTED  = RESERVED
APPROVED   = RESERVED
PROCESSING = RESERVED
COMPLETED  = CONSUMED
REJECTED   = RELEASED
CANCELLED  = RELEASED
FAILED     = RELEASED
```

## 4. Auth and Role Rules

- User APIs
  - bearer token required
  - current account must be `ACTIVE`
  - owner scope only
- Admin APIs
  - actor header required:
    - `x-actor-account-id`
- Admin read APIs
  - `READER` or `ADMIN`
- Admin mutate APIs
  - `ADMIN` only
- `USER`
  - cannot access admin withdrawal routes

## 5. Shared Objects

### 5.1 Withdrawal detail object

```json
{
  "withdrawal": {
    "id": "string",
    "account_id": "string",
    "fee_policy_version_id": "string",
    "withdrawal_type": "BONUS",
    "requested_amount_base": "100",
    "fee_amount_base": "20",
    "net_amount_base": "80",
    "fee_mode_snapshot": "DEDUCT_FROM_WITHDRAWAL",
    "status": "REQUESTED",
    "idempotency_key": "string",
    "wallet_address": "string",
    "network": "BASE",
    "tx_hash": null,
    "requested_kst_date": "2026-06-19",
    "requested_at": "2026-06-19T00:00:00.000Z",
    "approved_at": null,
    "processing_at": null,
    "completed_at": null,
    "rejected_at": null,
    "failed_at": null,
    "cancelled_at": null,
    "reject_reason": null,
    "failure_reason": null,
    "created_at": "2026-06-19T00:00:00.000Z",
    "updated_at": "2026-06-19T00:00:00.000Z",
    "allocation_summary": {
      "allocation_count": 2,
      "reserved_amount_base": "100",
      "consumed_amount_base": "0",
      "released_amount_base": "0"
    },
    "allocations": [
      {
        "id": 1,
        "withdrawal_id": "string",
        "reward_id": "reward-id",
        "allocated_amount_base": "60",
        "fee_policy_version_id": "string",
        "fee_schedule_days_snapshot": 30,
        "fee_rate_snapshot": "3000",
        "fee_mode_snapshot": "DEDUCT_FROM_WITHDRAWAL",
        "holding_days_snapshot": 37,
        "fee_amount_base": "18",
        "net_amount_base": "42",
        "status": "RESERVED",
        "reserved_at": "2026-06-19T00:00:00.000Z",
        "consumed_at": null,
        "released_at": null,
        "created_at": "2026-06-19T00:00:00.000Z",
        "reward": {
          "id": "reward-id",
          "account_id": "string",
          "account_staking_id": "string",
          "policy_version_id": "string",
          "reward_type": "DIRECT_REFERRAL",
          "reward_date": "2026-05-12",
          "amount_base": "60",
          "status": "CONFIRMED",
          "source_reference": "string",
          "available_at": "2026-05-12T00:00:00.000Z",
          "confirmed_at": "2026-05-12T00:00:00.000Z",
          "reversed_at": null
        }
      }
    ]
  }
}
```

### 5.2 Admin-only additions on detail

- admin detail responses also include:
  - `withdrawal.account`
  - `withdrawal.ledger_events`
  - `withdrawal.audit_logs`
- admin detail does not mask `wallet_address`
- admin list and per-account list mask `wallet_address`

## 6. User APIs

## 6.1 GET `/api/me/withdrawal-balance`

- Purpose:
  - return member-facing withdrawal balance cards
- Auth:
  - bearer token required
  - current account must be `ACTIVE`
- Response:

```json
{
  "daily_reward": {
    "confirmed_amount_base": "1200",
    "reserved_amount_base": "100",
    "completed_amount_base": "300",
    "available_amount_base": "800"
  },
  "bonus": {
    "confirmed_amount_base": "900",
    "reserved_amount_base": "50",
    "completed_amount_base": "100",
    "available_amount_base": "750"
  },
  "total": {
    "reserved_amount_base": "150",
    "completed_amount_base": "400"
  }
}
```

### Error codes

- `401`
  - missing or invalid bearer token
- `403`
  - account is not active
- `500`
  - internal consistency error if available amount becomes negative

## 6.2 POST `/api/me/withdrawal-preview`

- Purpose:
  - estimate allocation, fee, and net result before creation
- Auth:
  - bearer token required
  - current account must be `ACTIVE`
- Request:

```json
{
  "withdrawal_type": "BONUS",
  "requested_amount_base": "100"
}
```

- Rules:
  - request amount must be a positive integer string
  - one preview covers one `withdrawal_type`
  - preview performs FIFO allocation simulation only
- Response:

```json
{
  "withdrawal_type": "BONUS",
  "requested_amount_base": "100",
  "fee_amount_base": "20",
  "net_amount_base": "80",
  "available_amount_base": "500",
  "allocations": [
    {
      "reward_id": "reward-1",
      "allocated_amount_base": "100",
      "holding_days": 30,
      "fee_schedule_days": 30,
      "fee_rate_bps": "2000",
      "fee_amount_base": "20",
      "net_amount_base": "80"
    }
  ],
  "preview_only": true
}
```

### Error codes

- `400`
  - invalid payload
- `401`
  - missing or invalid bearer token
- `403`
  - account is not active
- `422`
  - insufficient available amount
  - no matching fee rule for the requested allocation set
  - unsupported fee mode such as `PREPAY_BJC`

## 6.3 POST `/api/me/withdrawals`

- Purpose:
  - create one withdrawal request and reserve reward allocations
- Auth:
  - bearer token required
  - current account must be `ACTIVE`
- Request:

```json
{
  "withdrawal_type": "BONUS",
  "requested_amount_base": "100",
  "idempotency_key": "client-generated-key",
  "wallet_address": "string",
  "network": "BASE"
}
```

- Transaction rules:
  - lock account row
  - check `(account_id, idempotency_key)`
  - lock candidate rewards with `FOR UPDATE`
  - lock overlapping active allocations
  - recompute available amount and fee snapshots
  - insert one `reward_withdrawals` row
  - insert matching `reward_withdrawal_allocations` rows with `RESERVED`
  - append `WITHDRAWAL_REQUESTED`
  - append `WITHDRAWAL_RESERVED`
  - insert audit log
- Response:
  - `201 Created` for a new request
  - `200 OK` for an idempotent replay with the same payload
  - body = withdrawal detail object

### Error codes

- `400`
  - invalid payload
- `401`
  - missing or invalid bearer token
- `403`
  - account is not active
- `409`
  - same `idempotency_key` with different `withdrawal_type`, `requested_amount_base`, `wallet_address`, or `network`
- `422`
  - insufficient available amount after transaction-time recalculation
  - no matching fee rule for the requested allocation set
  - unsupported fee mode such as `PREPAY_BJC`

## 6.4 GET `/api/me/withdrawals`

- Purpose:
  - list member withdrawal history
- Auth:
  - bearer token required
- Query:
  - `withdrawal_type`
  - `status`
  - `requested_from`
  - `requested_to`
  - `page`
  - `limit`
  - `sort`
- Sort values:
  - `requested_at_desc`
  - `requested_at_asc`
  - `created_at_desc`
  - `created_at_asc`
- Response:

```json
{
  "items": [
    {
      "id": "string",
      "account_id": "string",
      "fee_policy_version_id": "string",
      "withdrawal_type": "BONUS",
      "requested_amount_base": "100",
      "fee_amount_base": "20",
      "net_amount_base": "80",
      "fee_mode_snapshot": "DEDUCT_FROM_WITHDRAWAL",
      "status": "REQUESTED",
      "idempotency_key": "string",
      "wallet_address": "wallet-address",
      "network": "BASE",
      "tx_hash": null,
      "requested_kst_date": "2026-06-19",
      "requested_at": "2026-06-19T00:00:00.000Z",
      "approved_at": null,
      "processing_at": null,
      "completed_at": null,
      "rejected_at": null,
      "failed_at": null,
      "cancelled_at": null,
      "reject_reason": null,
      "failure_reason": null,
      "created_at": "2026-06-19T00:00:00.000Z",
      "updated_at": "2026-06-19T00:00:00.000Z"
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

## 6.5 GET `/api/me/withdrawals/:withdrawalId`

- Purpose:
  - return one member withdrawal detail
- Auth:
  - bearer token required
- Ownership:
  - foreign rows are hidden behind `404`
- Response:
  - withdrawal detail object
  - excludes admin `ledger_events` and `audit_logs`

### Error codes

- `401`
  - missing or invalid bearer token
- `404`
  - withdrawal missing or not owned by current user

## 6.6 POST `/api/me/withdrawals/:withdrawalId/cancel`

- Purpose:
  - cancel a member withdrawal before admin approval
- Auth:
  - bearer token required
- Allowed states:
  - `REQUESTED`
- Rules:
  - same transaction must:
    - set withdrawal `status = CANCELLED`
    - stamp `cancelled_at`
    - set allocation rows to `RELEASED`
    - append `WITHDRAWAL_CANCELLED`
    - insert audit log
- Request body:
  - empty body
- Response:
  - updated withdrawal detail object

### Error codes

- `401`
  - missing or invalid bearer token
- `404`
  - withdrawal missing or not owned by current user
- `409`
  - invalid state transition

## 7. Admin APIs

## 7.1 GET `/api/admin/withdrawals`

- Auth:
  - `x-actor-account-id` header required
  - `READER` or `ADMIN`
- Filters:
  - `q`
  - `account_id`
  - `withdrawal_type`
  - `status`
  - `network`
  - `requested_from`
  - `requested_to`
  - `completed_from`
  - `completed_to`
  - `page`
  - `limit`
  - `sort`
- Sort values:
  - `requested_at_desc`
  - `requested_at_asc`
  - `created_at_desc`
  - `created_at_asc`
  - `completed_at_desc`
  - `completed_at_asc`
- Response:
  - paginated list of withdrawal list items
  - each item includes `account`
  - `wallet_address` is masked

## 7.2 GET `/api/admin/withdrawals/:withdrawalId`

- Auth:
  - `x-actor-account-id` header required
  - `READER` or `ADMIN`
- Includes:
  - withdrawal row
  - account summary
  - allocation list
  - related reward rows
  - `ledger_events`
  - `audit_logs`

## 7.3 POST `/api/admin/withdrawals/:withdrawalId/approve`

- Auth:
  - `x-actor-account-id` header required
  - `ADMIN`
- Allowed state:
  - `REQUESTED`
- Rules:
  - updates status to `APPROVED`
  - stamps `approved_at`
  - keeps allocations `RESERVED`
  - appends `WITHDRAWAL_APPROVED`
  - inserts audit log

### Error codes

- `401`
  - missing actor header
- `403`
  - actor is not `ADMIN`
- `404`
  - withdrawal missing
- `409`
  - invalid state transition

## 7.4 POST `/api/admin/withdrawals/:withdrawalId/reject`

- Auth:
  - `x-actor-account-id` header required
  - `ADMIN`
- Allowed state:
  - `REQUESTED`
- Request:

```json
{
  "reason": "required string"
}
```

- Rules:
  - updates status to `REJECTED`
  - stamps `rejected_at`
  - stores `reject_reason`
  - releases allocations
  - appends `WITHDRAWAL_REJECTED`
  - inserts audit log

## 7.5 POST `/api/admin/withdrawals/:withdrawalId/processing`

- Auth:
  - `x-actor-account-id` header required
  - `ADMIN`
- Allowed state:
  - `APPROVED`
- Request:

```json
{
  "network": "BASE"
}
```

- Rules:
  - `network` required
  - updates status to `PROCESSING`
  - stamps `processing_at`
  - keeps allocations `RESERVED`
  - appends `WITHDRAWAL_PROCESSING`
  - inserts audit log

## 7.6 POST `/api/admin/withdrawals/:withdrawalId/complete`

- Auth:
  - `x-actor-account-id` header required
  - `ADMIN`
- Allowed state:
  - `PROCESSING`
- Request:

```json
{
  "network": "BASE",
  "tx_hash": "required string"
}
```

- Rules:
  - `tx_hash` required
  - updates status to `COMPLETED`
  - stamps `completed_at`
  - stores `tx_hash` and `network`
  - validates allocation totals against header totals
  - marks allocations `CONSUMED`
  - appends:
    - `WITHDRAWAL_COMPLETED`
    - `WITHDRAWAL_FEE_CHARGED`
  - inserts audit log

## 7.7 POST `/api/admin/withdrawals/:withdrawalId/fail`

- Auth:
  - `x-actor-account-id` header required
  - `ADMIN`
- Allowed state:
  - `PROCESSING`
- Request:

```json
{
  "reason": "required string"
}
```

- Rules:
  - updates status to `FAILED`
  - stamps `failed_at`
  - stores `failure_reason`
  - releases allocations
  - appends `WITHDRAWAL_FAILED`
  - inserts audit log

## 7.8 GET `/api/admin/accounts/:accountId/withdrawals`

- Auth:
  - `x-actor-account-id` header required
  - `READER` or `ADMIN`
- Purpose:
  - list withdrawals for one account
- Filters:
  - same as admin list except `q` and `account_id`
- Returns:
  - `account`
  - `items`
  - `page`
  - `limit`
  - `total`
- `404` if the account does not exist

## 7.9 GET `/api/admin/reports/withdrawal-summary`

- Auth:
  - `x-actor-account-id` header required
  - `READER` or `ADMIN`
- Query:
  - `date_from`
  - `date_to`
  - `withdrawal_type`
  - `network`
- Response:

```json
{
  "requested_amount_base": "1000",
  "approved_amount_base": "0",
  "processing_amount_base": "0",
  "completed_amount_base": "800",
  "rejected_amount_base": "100",
  "failed_amount_base": "50",
  "cancelled_amount_base": "50",
  "fee_amount_base": "200",
  "net_completed_amount_base": "600",
  "requested_count": 4,
  "completed_count": 1
}
```

## 8. Ledger and Audit Contract

- implemented ledger event types:
  - `WITHDRAWAL_REQUESTED`
  - `WITHDRAWAL_RESERVED`
  - `WITHDRAWAL_APPROVED`
  - `WITHDRAWAL_PROCESSING`
  - `WITHDRAWAL_COMPLETED`
  - `WITHDRAWAL_REJECTED`
  - `WITHDRAWAL_FAILED`
  - `WITHDRAWAL_CANCELLED`
  - `WITHDRAWAL_FEE_CHARGED`
- reference id convention:
  - `withdrawal.request:<withdrawal_id>`
  - `withdrawal.reserve:<withdrawal_id>`
  - `withdrawal.approve:<withdrawal_id>`
  - `withdrawal.processing:<withdrawal_id>`
  - `withdrawal.complete:<withdrawal_id>`
  - `withdrawal.reject:<withdrawal_id>`
  - `withdrawal.fail:<withdrawal_id>`
  - `withdrawal.cancel:<withdrawal_id>`
  - `withdrawal.fee:<withdrawal_id>`
- admin detail surfaces ledger and audit summaries only
- user detail does not expose internal audit metadata

## 9. Validation Notes

- `wallet_address`
  - required on create
  - must be a non-empty trimmed string with max length `255`
- `network`
  - required on create
  - required on admin `processing`
  - required on admin `complete`
  - max length `64`
- `tx_hash`
  - required on admin `complete`
  - non-empty trimmed string with max length `255`
- `reason`
  - required on admin `reject` and `fail`
  - non-empty trimmed string with max length `500`

## 10. Sensitive Data Rules

- do not expose:
  - password / password hash
  - session token / session token hash
  - DB connection details
  - raw SQL errors
  - raw stack traces
- amounts remain strings in all JSON contracts
- user APIs return only the current user's withdrawals
- admin list endpoints mask wallet address values

## 11. Deferred

- User withdrawal screen implementation
- Admin withdrawal screen implementation
- actual wallet transfer execution
- chain receipt reconciliation
- webhook or polling callbacks
- `PREPAY_BJC` execution contract
- adjustment-type withdrawal eligibility
