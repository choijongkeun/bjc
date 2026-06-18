# BJC Account Staking 0003 SQL Review V1

## 1. Review Scope

- migration file:
  - `mysql/migrations/0003_bjc_account_stakings_mysql.sql`
- smoke file:
  - `mysql/smoke/bjc_account_stakings_smoketest.sql`

## 2. Existing Schema Observations

- `staking_products` currently stores only policy/template fields:
  - `policy_version_id`
  - `name`
  - `symbol`
  - `decimals`
  - `min_stake_amount_base`
  - `max_stake_amount_base`
  - `staking_days`
  - `daily_interest_bps`
  - `is_active`
- `ledger_events` already provides:
  - append-only behavior
  - unique `reference_id`
  - account/product/policy linkage
- there is no table that can hold one member staking contract row across its lifecycle

## 3. 0003 Migration Summary

### 3.1 Added object

- new table: `account_stakings`

### 3.2 Altered object

- `ledger_events.event_type` is extended with:
  - `STAKING_REQUESTED`
  - `STAKING_PRINCIPAL_LOCKED`
  - `STAKING_ACTIVATED`
  - `STAKING_CANCELLED`
  - `STAKING_PRINCIPAL_RELEASED`
  - `STAKING_MATURED`

### 3.3 Intentionally not changed

- `settlement_items`
- `staking_products`
- `policy_versions`
- reward engine tables

## 4. Table Design Review

### 4.1 Naming

- `account_stakings` is preferred over `member_stakings` or `staking_positions`
- reason:
  - matches `accounts`
  - avoids conflict with product policy naming
  - does not imply on-chain position semantics

### 4.2 Required fields

- `account_id`
- `staking_product_id`
- `policy_version_id`
- `principal_amount_base`
- `daily_interest_bps_snapshot`
- `duration_days_snapshot`
- `status`
- `idempotency_key`
- lifecycle timestamps
- two optional ledger event links

### 4.3 Snapshot review

- approved
- policy edits after activation must not mutate contract terms retroactively

## 5. Constraint Review

### 5.1 Positive checks

- `principal_amount_base > 0`
- `daily_interest_bps_snapshot >= 0`
- `duration_days_snapshot > 0`
- `idempotency_key` must not be blank
- `status` constrained by `CHECK`
- `started_at` and `matures_at` must be null together or valid in order

### 5.2 FK review

- `account_id -> accounts.id`
- `staking_product_id -> staking_products.id`
- `policy_version_id -> policy_versions.id`
- `source_ledger_event_id -> ledger_events.id`
- `cancellation_ledger_event_id -> ledger_events.id`

### 5.3 Deferred constraints

- no strict cross-column check between status and timestamps yet
- no dedicated `reject_reason_code`
- no maturity/close event FK yet

## 6. Index Review

- `idx_account_stakings_account_status`
  - supports user list and admin account detail
- `idx_account_stakings_product_status`
  - supports admin product-based filters
- `idx_account_stakings_policy_status`
  - supports policy review and future migrations
- `idx_account_stakings_started_at`
  - supports activation and maturity scheduling
- `idx_account_stakings_matures_at`
  - supports maturity scans
- `idx_account_stakings_created_at`
  - supports recent request feeds
- unique `idempotency_key`
  - prevents duplicate application rows

## 7. Ledger Review

### 7.1 Why add new staking event types

- the current `STAKE` / `UNSTAKE` pair is too coarse for a staged workflow
- a member request, principal lock, activation, and release are distinct operational steps

### 7.2 Why not add `DAILY_REWARD_ACCRUED`

- `DAILY_REWARD_ACCRUAL` already exists
- adding a second near-synonym would fragment reporting and filters
- recommendation:
  - keep the existing reward accrual event name

## 8. Compatibility Review

- migration is additive for tables
- enum extension is additive for allowed event values
- no trigger/function/procedure introduced
- no FK removal
- no destructive schema rewrite

## 9. Smoke SQL Review

### 9.1 Positive path

- inserts one valid `PENDING` row
- verifies snapshot fields and nullable lifecycle timestamps

### 9.2 Negative path

- invalid account FK
- invalid product FK
- principal zero
- principal negative
- invalid status
- duplicate idempotency key

### 9.3 Rollback behavior

- the script begins a transaction
- all positive and negative checks run inside the same transaction
- final `ROLLBACK` leaves no residue
- row counts before / after rollback are selected for verification

## 10. Operational Review

- cleanup of `smoke_user_front_20260618_1928` should happen before schema migration only if exact-match target is safe
- the inspection tool being read-only is a tool configuration issue, not proof that the DB user itself is read-only
- direct application-path cleanup is preferred for future smoke runs

## 11. Open Policy Items

- whether `CANCEL_REQUESTED` needs SLA / reason code fields
- whether `CLOSED` requires an explicit principal release event link
- whether `staking_products` should later gain:
  - `display_order`
  - `effective_from`
  - `effective_to`
  - `status ACTIVE/INACTIVE`

## 12. Review Conclusion

- approve `account_stakings` as the contract table for v1
- approve `PENDING -> ACTIVE` activation model
- approve ledger event expansion for staking lifecycle
- defer reward calculation and principal payout automation to the next phase
