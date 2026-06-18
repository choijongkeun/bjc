# BJC Account Rewards 0004 SQL Review V1

## 1. Review Scope

- migration file:
  - `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
- smoke file:
  - `mysql/smoke/bjc_account_rewards_smoketest.sql`

## 2. Existing Schema Review

- `calc_runs` already includes:
  - `run_type`
  - `run_date`
  - lifecycle statuses
  - unique `(policy_version_id, run_type, run_date)`
- `ledger_events` already includes:
  - `DAILY_REWARD_ACCRUAL`
  - `ADJUSTMENT`
  - unique `reference_id`
- `account_stakings` already includes immutable reward input snapshots:
  - `principal_amount_base`
  - `daily_interest_bps_snapshot`
  - `duration_days_snapshot`
  - `started_at`
  - `matures_at`

Conclusion:

- `0004` only needs an additive reward detail table
- `calc_runs` expansion is not required
- ledger enum expansion is not required for V1

## 3. Migration Summary

### 3.1 Added object

- new table:
  - `account_rewards`

### 3.2 Intentionally not changed

- `calc_runs`
- `settlement_items`
- `policy_versions`
- `staking_products`
- `account_stakings`
- `ledger_events` enum values

### 3.3 Additive compatibility

- no destructive alter
- no trigger / function / procedure
- no existing data rewrite
- no FK removal

## 4. Table Design Review

### 4.1 Key business design

- one reward row per reward fact
- one optional staking link for staking-derived rewards
- one optional calc run link for batch traceability
- one optional ledger link for audit traceability
- one optional original reward link for reversal rows

### 4.2 Naming review

- `account_rewards` is appropriate because:
  - it aligns with `accounts` and `account_stakings`
  - it does not overfit to only daily rewards
  - it remains valid when referral / rank / adjustment rewards are added later

## 5. Constraint Review

### 5.1 Foreign keys

- `account_id -> accounts.id`
- `account_staking_id -> account_stakings.id`
- `policy_version_id -> policy_versions.id`
- `calc_run_id -> calc_runs.id`
- `source_ledger_event_id -> ledger_events.id`
- `reversal_reward_id -> account_rewards.id`

### 5.2 Positive / structural checks

- `source_reference` must not be blank
- `DAILY_REWARD` requires non-null `account_staking_id`
- `amount_base <> 0`
- non-reversal rows require positive amounts
- reversal rows require negative amounts
- reversal rows require `reversal_reward_id`
- non-reversal rows must not carry `reversal_reward_id`
- reversal row cannot reference itself

### 5.3 Status / timestamp checks

- `PENDING`
  - `confirmed_at is null`
  - `reversed_at is null`
- `CONFIRMED`
  - `confirmed_at is not null`
  - `reversed_at is null`
- `REVERSED`
  - `confirmed_at is not null`
  - `reversed_at is not null`
- `available_at` requires `confirmed_at`
- `available_at >= confirmed_at`
- `reversed_at >= confirmed_at`

## 6. Unique / Idempotency Review

### 6.1 DAILY_REWARD duplicate prevention

- generated column:
  - `daily_reward_dedupe_key`
- unique key:
  - `uniq_account_rewards_daily_reward_dedupe`

Effect:

- one `DAILY_REWARD` row per `(account_staking_id, reward_date)`
- non-daily reward rows are unaffected because the generated key becomes `null`

### 6.2 Source reference uniqueness

- unique key:
  - `uniq_account_rewards_reward_type_source_reference`

Effect:

- duplicate idempotent writes are blocked within the same reward type
- different reward types may reuse separate reference namespaces when intentionally required

### 6.3 Reversal uniqueness

- `source_ledger_event_id` unique
- `reversal_reward_id` unique

Effect:

- one reward row maps to at most one ledger row
- one original reward row can have at most one reversal row

## 7. Index Review

- `account_id, status, reward_date`
  - supports member reward list and admin account reward list
- `account_staking_id, reward_date`
  - supports staking detail reward history and daily dedupe lookups
- `reward_type, status, reward_date`
  - supports admin reporting and reward-type filters
- `calc_run_id`
  - supports run inspection
- `available_at, status`
  - supports withdrawable summary scans
- `created_at`
  - supports recent feeds and admin newest-first views
- `policy_version_id, reward_date`
  - supports policy-level reconciliation

## 8. Reversal Modeling Review

### 8.1 Approved direction

- use append-only reversal rows
- keep original positive row for audit readability
- update original row status to `REVERSED`
- insert one negative `REVERSAL` row

### 8.2 Why not status-only reversal

- status-only reversal would hide the financial offset amount as a first-class row
- later withdrawals and reports need explicit negative flow rows
- append-only history is more consistent with ledger and audit patterns

## 9. Smoke SQL Review

### 9.1 Fixture policy

- smoke creates its own:
  - admin account
  - member account
  - policy version
  - staking product
  - calc run
  - ledger event
  - account staking
- smoke does not reuse live member/staking rows

### 9.2 Positive checks

- valid `DAILY_REWARD` insert
- confirmed timestamp persistence
- valid reversal linkage

### 9.3 Negative checks

- invalid account FK
- invalid staking FK
- zero amount
- negative non-reversal amount
- invalid reward type
- invalid status
- duplicate daily reward for same staking/date
- duplicate `source_reference`

### 9.4 Cleanup behavior

- smoke runs inside one transaction
- final `ROLLBACK` returns row count to pre-smoke state
- residue must remain zero relative to the before-count baseline

## 10. Open Considerations

- the DB cannot validate that a reversal row matches the original reward amount exactly; service logic must enforce that later
- the DB cannot validate that `account_id` matches the linked `account_staking_id`; service logic should guarantee consistency
- `reward_type + source_reference` uniqueness is sufficient for V1, but future reward types may need additional domain-specific idempotency keys

## 11. Review Conclusion

- approve `account_rewards` as the V1 reward source-of-truth table
- approve additive-only `0004` strategy
- approve reuse of existing `calc_runs` and ledger enums
- approve transaction rollback smoke strategy with dedicated fixtures
