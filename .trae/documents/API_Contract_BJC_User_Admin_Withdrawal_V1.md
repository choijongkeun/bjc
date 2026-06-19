# API Contract: BJC User and Admin Withdrawal V1

## 1. Scope

- This document defines the planned V1 contract for reward-withdrawal balance, preview, request, detail, list, and admin status operations.
- This phase defines contract only.
- Service, route, UI, wallet transfer, and blockchain confirmation implementation remain out of scope.
- All amount fields sourced from `DECIMAL(65,0)` remain string values in API requests and responses.

## 2. Source of Truth

- `account_rewards`
  - reward accrual / reversal source of truth
- `reward_withdrawals`
  - withdrawal request header source of truth
- `reward_withdrawal_allocations`
  - reward-to-withdrawal reservation and consumption source of truth
- `ledger_events`
  - append-only audit trail

## 3. Shared Domain Rules

### 3.1 Withdrawal types

- `DAILY_REWARD`
- `BONUS`

### 3.2 Eligible reward buckets

- `DAILY_REWARD`
  - original reward type = `DAILY_REWARD`
- `BONUS`
  - original reward type in:
    - `DIRECT_REFERRAL`
    - `RANK_BONUS`
    - `CONTRIBUTION`
    - `SIDECAR`

### 3.3 Exclusions

- `WITHDRAWAL_FEE` reward rows are excluded from withdrawable source balance.
- `ADJUSTMENT` reward rows are excluded by default until a future policy explicitly classifies them.
- `REVERSAL` rows are included only by inheriting the original reward bucket and reducing the net amount.

### 3.4 Amount rules

- API must not use JavaScript `Number`, `parseInt`, or `parseFloat` for reward or withdrawal amounts.
- Request validation must keep integer-string semantics.
- V1 fee mode is fixed to `DEDUCT_FROM_WITHDRAWAL`.

### 3.5 Recalculation rule

- `POST /api/me/withdrawal-preview`
  - returns an estimate only
- `POST /api/me/withdrawals`
  - must recompute candidate allocations and fees inside the create transaction
  - must not trust the preview result

### 3.6 Balance semantics

For one account and one withdrawal bucket:

```text
available
= eligible confirmed rewards and reversal net sum
- RESERVED allocation sum
- CONSUMED allocation sum
```

## 4. Auth and Role Rules

- User APIs
  - bearer token required
  - owner scope only
- Admin read APIs
  - `READER` or `ADMIN`
- Admin mutate APIs
  - `ADMIN` only
- `USER`
  - cannot access admin withdrawal routes

## 5. Shared Objects

### 5.1 Withdrawal object

```json
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
  "wallet_address": "string or null",
  "network": "string or null",
  "tx_hash": "string or null",
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
  }
}
```

### 5.2 Withdrawal allocation object

```json
{
  "id": 1,
  "withdrawal_id": "string",
  "reward_id": "string",
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
    "reward_type": "DIRECT_REFERRAL",
    "reward_date": "2026-05-12",
    "amount_base": "60",
    "confirmed_at": "2026-05-12T00:00:00.000Z",
    "available_at": "2026-05-12T00:00:00.000Z"
  }
}
```

## 6. User APIs

## 6.1 GET `/api/me/withdrawal-balance`

- Purpose:
  - return member-facing balance cards for withdrawal entry UI
- Auth:
  - bearer token required
- Response:

```json
{
  "daily_reward_available_amount_base": "1200",
  "bonus_available_amount_base": "800",
  "reserved_amount_base": "100",
  "completed_amount_base": "300",
  "as_of": "2026-06-19T00:00:00.000Z",
  "notes": [
    "preview values are not final",
    "create request recalculates allocations in a transaction"
  ]
}
```

### Error codes

- `401`
  - missing or invalid bearer token
- `403`
  - blocked / withdrawn account

## 6.2 POST `/api/me/withdrawal-preview`

- Purpose:
  - estimate allocation / fee / net result before creation
- Auth:
  - bearer token required
- Request:

```json
{
  "withdrawal_type": "BONUS",
  "requested_amount_base": "100"
}
```

- Rules:
  - request amount must be an integer string greater than `0`
  - one preview covers one `withdrawal_type`
  - preview does not reserve balance
- Response:

```json
{
  "withdrawal_type": "BONUS",
  "requested_amount_base": "100",
  "estimated_fee_amount_base": "20",
  "estimated_net_amount_base": "80",
  "fee_mode_snapshot": "DEDUCT_FROM_WITHDRAWAL",
  "fee_policy": {
    "fee_policy_version_id": "string",
    "age_basis": "CONFIRMED_AT_KST",
    "rule_selection": "greatest schedule_days <= holding_days"
  },
  "allocation_preview": [
    {
      "reward_id": "reward-1",
      "reward_type": "DIRECT_REFERRAL",
      "reward_date": "2026-05-20",
      "confirmed_at": "2026-05-20T00:00:00.000Z",
      "allocated_amount_base": "100",
      "holding_days_snapshot": 30,
      "fee_schedule_days_snapshot": 30,
      "fee_rate_snapshot": "2000",
      "fee_amount_base": "20",
      "net_amount_base": "80"
    }
  ],
  "disclaimer": "Preview is informational only. Final validation and fee calculation happen inside the create transaction."
}
```

### Error codes

- `400`
  - invalid payload
- `401`
  - missing or invalid bearer token
- `403`
  - blocked / withdrawn account
- `422`
  - insufficient available amount
  - no fee schedule matches the current holding age

## 6.3 POST `/api/me/withdrawals`

- Purpose:
  - create one withdrawal request and reserve reward allocations
- Auth:
  - bearer token required
- Request:

```json
{
  "withdrawal_type": "BONUS",
  "requested_amount_base": "100",
  "idempotency_key": "client-generated-key",
  "wallet_address": "string",
  "network": "BSC"
}
```

- Rules:
  - request amount must be an integer string greater than `0`
  - `idempotency_key` is unique per account
  - create transaction must:
    - lock candidate rewards and overlapping allocations
    - recompute available balance
    - choose FIFO allocations
    - compute fee snapshots per allocation
    - insert one `reward_withdrawals` row
    - insert matching `reward_withdrawal_allocations` rows
- Response:
  - `201 Created`
  - body = created withdrawal object plus allocation list

### Error codes

- `400`
  - invalid payload
- `401`
  - missing or invalid bearer token
- `403`
  - blocked / withdrawn account
- `409`
  - duplicate `idempotency_key`
- `422`
  - insufficient available amount after transaction-time recalculation
  - requested amount mixes unsupported policy state
  - wallet / network fails validation

## 6.4 GET `/api/me/withdrawals`

- Purpose:
  - list member withdrawal history
- Auth:
  - bearer token required
- Query:
  - `withdrawal_type`
  - `status`
  - `requested_date_from`
  - `requested_date_to`
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
      "withdrawal_type": "BONUS",
      "requested_amount_base": "100",
      "fee_amount_base": "20",
      "net_amount_base": "80",
      "status": "REQUESTED",
      "network": "BSC",
      "tx_hash": null,
      "requested_at": "2026-06-19T00:00:00.000Z"
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
  - one withdrawal object with allocation list and lightweight reward details

### Error codes

- `401`
  - missing or invalid bearer token
- `404`
  - withdrawal missing or not owned by current user

## 6.6 POST `/api/me/withdrawals/:withdrawalId/cancel`

- Purpose:
  - cancel a member withdrawal before processing
- Auth:
  - bearer token required
- Allowed states:
  - `REQUESTED`
  - `APPROVED`
- Rules:
  - not allowed once `PROCESSING` begins
  - same transaction must:
    - set withdrawal `status = CANCELLED`
    - set allocation rows to `RELEASED`
    - append ledger audit events
- Request body:
  - empty body or optional reason in a future version
- Response:
  - updated withdrawal object

### Error codes

- `401`
  - missing or invalid bearer token
- `404`
  - withdrawal missing or not owned by current user
- `409`
  - withdrawal already terminal or already processing

## 7. Admin APIs

## 7.1 GET `/api/admin/withdrawals`

- Auth:
  - `READER` or `ADMIN`
- Filters:
  - `q`
  - `account_id`
  - `withdrawal_type`
  - `status`
  - `network`
  - `requested_date_from`
  - `requested_date_to`
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

## 7.2 GET `/api/admin/withdrawals/:withdrawalId`

- Auth:
  - `READER` or `ADMIN`
- Includes:
  - withdrawal row
  - allocation list
  - member summary
  - related reward rows
  - ledger event summary when present

## 7.3 POST `/api/admin/withdrawals/:withdrawalId/approve`

- Auth:
  - `ADMIN`
- Allowed state:
  - `REQUESTED`
- Request:

```json
{}
```

- Rules:
  - updates status to `APPROVED`
  - stamps `approved_at`
  - appends `WITHDRAWAL_APPROVED` ledger audit event

### Error codes

- `404`
  - withdrawal missing
- `409`
  - invalid state transition

## 7.4 POST `/api/admin/withdrawals/:withdrawalId/reject`

- Auth:
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
  - `reason` required
  - updates status to `REJECTED`
  - releases allocations
  - appends `WITHDRAWAL_REJECTED`

## 7.5 POST `/api/admin/withdrawals/:withdrawalId/processing`

- Auth:
  - `ADMIN`
- Allowed state:
  - `APPROVED`
- Request:

```json
{
  "network": "BSC",
  "tx_hash": "optional string"
}
```

- Rules:
  - `network` required
  - stamps `processing_at`
  - appends `WITHDRAWAL_PROCESSING`

## 7.6 POST `/api/admin/withdrawals/:withdrawalId/complete`

- Auth:
  - `ADMIN`
- Allowed state:
  - `PROCESSING`
- Request:

```json
{
  "network": "BSC",
  "tx_hash": "required string"
}
```

- Rules:
  - `tx_hash` required
  - marks withdrawal `COMPLETED`
  - marks allocations `CONSUMED`
  - appends:
    - `WITHDRAWAL_COMPLETED`
    - `WITHDRAWAL_FEE_CHARGED`

## 7.7 POST `/api/admin/withdrawals/:withdrawalId/fail`

- Auth:
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
  - `reason` required
  - marks withdrawal `FAILED`
  - releases allocations
  - appends `WITHDRAWAL_FAILED`

## 7.8 GET `/api/admin/accounts/:accountId/withdrawals`

- Auth:
  - `READER` or `ADMIN`
- Purpose:
  - list withdrawals for one account
- Filters:
  - same as admin list except `account_id`
- Returns `404` if the account does not exist.

## 7.9 GET `/api/admin/reports/withdrawal-summary`

- Auth:
  - `READER` or `ADMIN`
- Purpose:
  - aggregate operational view for finance / operations
- Query:
  - `requested_date_from`
  - `requested_date_to`
  - `withdrawal_type`
  - `network`
- Response:

```json
{
  "requested_amount_base": "1000",
  "fee_amount_base": "200",
  "net_amount_base": "800",
  "requested_count": 10,
  "completed_count": 8,
  "failed_count": 1,
  "cancelled_count": 1,
  "by_type": [
    {
      "withdrawal_type": "BONUS",
      "requested_amount_base": "1000",
      "fee_amount_base": "200",
      "net_amount_base": "800",
      "count": 10
    }
  ]
}
```

## 8. Validation Notes

- `wallet_address`
  - must be a non-empty trimmed string when provided
  - stricter network-specific validation may be added later
- `network`
  - required for create if product policy requires an external payout route
  - required for admin `processing` and `complete`
- `tx_hash`
  - required for admin `complete`
- `reason`
  - required for admin `reject` and `fail`

## 9. Sensitive Data Rules

- Do not expose:
  - password / password hash
  - session token / session token hash
  - DB connection details
  - raw SQL errors
- Amounts remain strings in all JSON contracts.

## 10. Deferred

- external wallet transfer execution
- chain receipt reconciliation
- webhook / polling callbacks
- `PREPAY_BJC` execution contract
- adjustment-type withdrawal eligibility
