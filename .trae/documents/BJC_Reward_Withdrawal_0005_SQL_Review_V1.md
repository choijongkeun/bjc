# BJC Reward Withdrawal 0005 SQL Review V1

## 1. Review Scope

- migration file:
  - `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- smoke file:
  - `mysql/smoke/bjc_reward_withdrawals_smoketest.sql`

This review focuses on schema correctness, additive safety, operational compatibility, and smoke coverage.

## 2. Schema Review Summary

### 2.1 New tables

- `reward_withdrawals`
- `reward_withdrawal_allocations`

### 2.2 Existing table change

- `ledger_events.event_type`
  - append new explicit withdrawal lifecycle enums
  - keep existing legacy withdrawal enums for backward compatibility

### 2.3 No changes made to

- `account_rewards`
- `withdrawal_fee_rules`
- `calc_runs`
- `settlement_items`

## 3. Additive Safety Review

- The migration does not drop columns, tables, or indexes.
- The migration does not rewrite existing reward data.
- The migration does not introduce triggers, procedures, or functions.
- The new tables are independent domain tables connected by foreign keys only.
- Existing reward summary and reward list queries continue to operate because `account_rewards` is unchanged.

## 4. Table Design Review

### 4.1 `reward_withdrawals`

Strengths:

- explicit request header row
- account-scoped idempotency via `(account_id, idempotency_key)`
- aggregate fee / net storage for reporting and detail responses
- lifecycle timestamps for admin workflow
- status / reason consistency enforced with `CHECK`

Trade-offs:

- V1 fixes `fee_mode_snapshot` to `DEDUCT_FROM_WITHDRAWAL`
- `tx_hash` uniqueness is not enforced yet because chain/network policy is not finalized

### 4.2 `reward_withdrawal_allocations`

Strengths:

- exact reward-to-withdrawal mapping
- supports partial allocation because uniqueness is only `(withdrawal_id, reward_id)`
- fee snapshot is stored per allocation, which avoids distortion when one request spans multiple fee bands
- `RESERVED / CONSUMED / RELEASED` gives clear availability semantics

Trade-offs:

- SQL alone cannot prevent cross-row over-allocation of one reward
- service transaction with `FOR UPDATE` remains mandatory

## 5. Balance Model Review

- chosen model:
  - realtime aggregation from `account_rewards` + `reward_withdrawal_allocations`
- accepted in V1 because:
  - strongest correctness
  - no projection drift risk
  - reversible and auditable
- deferred:
  - future balance projection table if query volume grows

## 6. Fee Snapshot Review

- `withdrawal_fee_rules` already keys on:
  - `policy_version_id`
  - `withdrawal_source_type`
  - `schedule_days`
- review conclusion:
  - a single authoritative withdrawal-level `fee_rate_snapshot` is not sufficient
  - allocation-level snapshots are required

Stored per allocation:

- `fee_policy_version_id`
- `fee_schedule_days_snapshot`
- `fee_rate_snapshot`
- `holding_days_snapshot`
- `fee_amount_base`
- `net_amount_base`

## 7. Ledger Enum Review

### 7.1 New enums

- `WITHDRAWAL_REQUESTED`
- `WITHDRAWAL_RESERVED`
- `WITHDRAWAL_APPROVED`
- `WITHDRAWAL_PROCESSING`
- `WITHDRAWAL_COMPLETED`
- `WITHDRAWAL_REJECTED`
- `WITHDRAWAL_FAILED`
- `WITHDRAWAL_CANCELLED`
- `WITHDRAWAL_FEE_CHARGED`

### 7.2 Compatibility decision

- Keep:
  - `WITHDRAWAL_REQUEST`
  - `WITHDRAWAL_FEE`
  - `WITHDRAWAL_RELEASE`
  - `WITHDRAWAL_FREEZE`
  - `WITHDRAWAL_UNFREEZE`
- Reason:
  - current documents and report code still reference the legacy names
  - the schema change remains additive

## 8. Smoke Review

### 8.1 Positive path

- valid `REQUESTED` withdrawal insert
- valid `RESERVED` allocation insert

### 8.2 Negative path coverage

- invalid account FK
- invalid withdrawal enum value
- invalid withdrawal status enum value
- non-positive requested amount
- `requested != fee + net`
- duplicate `(account_id, idempotency_key)`
- invalid reward FK
- non-positive allocation amount
- duplicate `(withdrawal_id, reward_id)`
- invalid allocation status enum value

### 8.3 Rollback review

- smoke captures before-counts
- transaction rolls back
- post-rollback counts must equal pre-run counts

## 9. Operational Review

- backup is required before apply
- apply order must remain:
  - `0001`
  - `0002`
  - `0003`
  - `0004`
  - `0005`
- validation after apply should include:
  - `SHOW CREATE TABLE reward_withdrawals`
  - `SHOW CREATE TABLE reward_withdrawal_allocations`
  - `SHOW CREATE TABLE ledger_events`
  - index review
  - FK review
  - check-constraint review
  - smoke execution

## 10. Known Limits

- No DB-level constraint can prove:

```text
sum(active allocations for reward) <= reward remaining amount
```

- This is intentionally deferred to transaction-time application logic.

## 11. Validation Run Notes

This section is updated after local apply / verification:

- backup result:
  - success via `mysqldump --no-tablespaces`
  - file:
    - `mysql/backups/bjc_db_pre_0005_reward_withdrawals_20260619_135737.sql`
- migration apply result:
  - success
  - `mysql < mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql` completed without SQL errors
- `SHOW CREATE TABLE` review:
  - verified `reward_withdrawals`
  - verified `reward_withdrawal_allocations`
  - verified `ledger_events.event_type` contains all newly added withdrawal lifecycle enums
  - verified information-schema metadata for:
    - foreign keys
    - check constraints
    - unique keys
    - secondary indexes
- smoke result:
  - success with intentional negative-path failures
  - expected failures confirmed for:
    - invalid account FK
    - invalid withdrawal enum
    - invalid withdrawal status
    - non-positive withdrawal amount
    - fee/net mismatch
    - duplicate account idempotency key
    - invalid reward FK
    - non-positive allocation amount
    - duplicate `(withdrawal_id, reward_id)`
    - invalid allocation status
  - rollback verified:
    - `before_withdrawal_count = 0`
    - `after_rollback_withdrawal_count = 0`
    - `before_allocation_count = 0`
    - `after_rollback_allocation_count = 0`

## 12. Review Conclusion

- The `0005` schema is additive and compatible with the current reward domain.
- The design preserves append-only reward history and models withdrawal reservation without mutating reward facts.
- The main residual risk is not schema shape, but future service-layer concurrency control.
