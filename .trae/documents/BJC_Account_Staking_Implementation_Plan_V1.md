# BJC Account Staking Implementation Plan V1

## 1. Goal

- Resolve test-data cleanup risk before staking implementation.
- Freeze the DB schema, ledger linkage, and API contract first.
- Defer actual backend API handlers and frontend screens to the next phase.

## 2. Current Implementation Analysis

### 2.1 What already exists

- `staking_products`
  - stores product policy definitions
  - current columns are product/policy oriented, not account contract oriented
- `policy_versions`
  - versioned policy owner for staking products and calculation rules
- `ledger_events`
  - append-only event store with unique `reference_id`
- `settlement_items`
  - finalized or staged settlement output rows linked to `calc_runs`
- Admin UI
  - can create/list policy versions and create/list staking products
- User UI
  - currently exposes `Staking`, `Rewards`, `Withdrawals` as disabled placeholders only

### 2.2 What is missing

- no member staking application table
- no user staking API
- no admin staking approval / cancellation API
- no persistent lifecycle row to represent `PENDING -> ACTIVE -> MATURED -> CLOSED`
- no direct way to preserve product snapshots when policy products are later edited

## 3. Reuse Decision

### 3.1 `staking_products`

- Reuse as product policy definition table
- Do not repurpose it as member subscription / position table
- Reason:
  - one row represents a product template
  - one product can be used by many member staking contracts
  - product policy may change in the future while old contracts must preserve original terms

### 3.2 Admin policy / product screen

- Reuse the existing Admin product screen as the product catalog manager
- Expand later with:
  - display order
  - effective window
  - active/inactive status
  - optional archived history filters

## 4. New Table Proposal

### 4.1 Canonical name

- Recommended table: `account_stakings`
- Reason:
  - aligns with existing naming such as `accounts`, `auth_sessions`, `calc_runs`
  - makes ownership explicit
  - clearly distinguishes policy definition from member contract rows

### 4.2 Table role

- `account_stakings` is the source of truth for each member staking application / contract.
- It is not a derived report table.
- It must survive later product changes and reward engine changes.

## 5. Proposed Schema

### 5.1 Core columns

- `id char(36)`
- `account_id char(36)`
- `staking_product_id char(36)`
- `policy_version_id char(36)`
- `principal_amount_base decimal(65,0)`
- `daily_interest_bps_snapshot decimal(20,0)`
- `duration_days_snapshot int`
- `status varchar(20)`
- `idempotency_key varchar(128)`
- `started_at datetime(6) nullable`
- `matures_at datetime(6) nullable`
- `activated_at datetime(6) nullable`
- `cancel_requested_at datetime(6) nullable`
- `cancelled_at datetime(6) nullable`
- `matured_at datetime(6) nullable`
- `closed_at datetime(6) nullable`
- `source_ledger_event_id char(36) nullable`
- `cancellation_ledger_event_id char(36) nullable`
- `created_at datetime(6)`
- `updated_at datetime(6)`

### 5.2 Snapshot rationale

- Snapshot fields are mandatory because future `staking_products` edits must not rewrite historical contracts.
- Snapshot columns:
  - `daily_interest_bps_snapshot`
  - `duration_days_snapshot`
- `principal_amount_base` must remain string in API serialization.

## 6. State Machine

### 6.1 Recommended default

```text
PENDING
-> ACTIVE
-> MATURED
-> CLOSED
```

### 6.2 Cancel path

```text
PENDING -> CANCELLED
ACTIVE -> CANCEL_REQUESTED -> CANCELLED
```

### 6.3 Notes

- `REJECTED` is not added as a separate DB status in v1.
- Admin reject is represented as `PENDING -> CANCELLED` plus an explicit audit action.
- This keeps the state set smaller while preserving audit meaning.

## 7. Activation Policy Review

### 7.1 Option A

- request immediately becomes `ACTIVE`
- requires an already-defined off-chain balance deduction model
- weak fit for the current project because:
  - no member wallet or balance ledger exists
  - no deposit confirmation flow exists
  - current admin ledger writes are explicit and controlled

### 7.2 Option B

- request is created as `PENDING`
- admin approval or funding confirmation converts it to `ACTIVE`
- strong fit for the current project because:
  - aligns with the current admin-first control model
  - avoids pretending that principal is locked before verification exists
  - matches append-only ledger flow better

### 7.3 Recommendation

- Choose Option B as v1 default
- `started_at` and `matures_at` remain null while `PENDING`
- set both values at activation time

## 8. Ledger Integration

### 8.1 Relationship

- `account_stakings` is the lifecycle table
- `ledger_events` is the immutable financial event log
- the same business action can update `account_stakings` and append one or more `ledger_events` rows in a single transaction

### 8.2 Event mapping

- request create
  - `account_stakings.status = PENDING`
  - `ledger_events.event_type = STAKING_REQUESTED`
- activation
  - append `STAKING_PRINCIPAL_LOCKED`
  - append `STAKING_ACTIVATED`
  - transition `PENDING -> ACTIVE`
- cancel
  - append `STAKING_CANCELLED`
  - append `STAKING_PRINCIPAL_RELEASED` only when principal is actually released
- maturity
  - append `STAKING_MATURED`
  - future reward engine continues to use existing `DAILY_REWARD_ACCRUAL`

### 8.3 `reference_id` strategy

- Keep using unique `reference_id` in `ledger_events`
- Recommended format:
  - `staking.request:<staking_id>`
  - `staking.lock:<staking_id>`
  - `staking.activate:<staking_id>`
  - `staking.cancel:<staking_id>`
  - `staking.release:<staking_id>`
  - `staking.mature:<staking_id>`
- This avoids collision with current `uniq_ledger_events_reference`

## 9. User / Admin API List

### 9.1 User

- `GET /api/staking-products`
- `POST /api/me/stakings`
- `GET /api/me/stakings`
- `GET /api/me/stakings/:stakingId`
- `POST /api/me/stakings/:stakingId/cancel`

### 9.2 Admin

- `GET /api/admin/stakings`
- `GET /api/admin/stakings/:stakingId`
- `POST /api/admin/stakings/:stakingId/activate`
- `POST /api/admin/stakings/:stakingId/reject`
- `POST /api/admin/stakings/:stakingId/cancel`
- `GET /api/admin/accounts/:accountId/stakings`

## 10. User / Admin Screen Connection Plan

### 10.1 User

- `web-user`
  - enable `Staking` menu
  - show active products from `GET /api/staking-products`
  - show application modal / form
  - list own staking rows
  - detail drawer or page
  - cancel button gated by state

### 10.2 Admin

- `web`
  - add staking list tab
  - add staking detail panel
  - account detail page should include a staking history block
  - existing product policy tab remains the product source of truth

## 11. Smoke Cleanup Improvement Plan

- Problem:
  - browser smoke successfully wrote data through the app/API path
  - SQL inspection tool remained read-only
- Root cause:
  - the MySQL MCP is configured as read-only at the tool layer
  - this is separate from application-side DB write capability
- Improvement:
  - future smoke should use the same application DB path for cleanup
  - recommended options:
    - internal cleanup service callable only in local/dev mode
    - dedicated `tsx` cleanup script sharing the same DB connection/env as the server
  - cleanup should target explicit prefixes only and run in one transaction

## 12. Risks

- enum expansion in `ledger_events` can require table metadata lock during migration
- current product schema lacks `effective_from`, `effective_to`, `display_order`, and explicit `ACTIVE/INACTIVE` status columns
- admin reject semantics are currently mapped to `CANCELLED`; future business requirements may demand a dedicated rejection reason column
- there is still no confirmed principal funding / wallet model
- maturity close and principal release policy are not finalized

## 13. Implementation Order

1. finalize schema and SQL review
2. apply `0003` migration
3. add repository layer for `account_stakings`
4. add user APIs for request/list/detail/cancel
5. add admin APIs for approve/reject/cancel/list/detail
6. add Admin staking screens
7. add User staking screens
8. add integration smoke and E2E regression coverage

## 14. Deferred Policy Decisions

- whether user self-cancel after `ACTIVE` should be allowed at all
- whether principal release happens immediately on admin cancel
- whether maturity auto-close is scheduled or admin-triggered
- whether future product policy needs fixed `display_order` and effective-window columns in `staking_products`
