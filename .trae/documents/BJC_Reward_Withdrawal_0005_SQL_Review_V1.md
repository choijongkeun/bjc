# BJC Reward Withdrawal 0005 SQL Review V1

## 1. Review Scope

- migration file:
  - `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- SQL smoke file:
  - `mysql/smoke/bjc_reward_withdrawals_smoketest.sql`
- runtime implementation validation:
  - repository and service integration against the applied schema
  - end-to-end API smoke against the real app server

This review covers schema correctness, additive safety, operational compatibility, SQL smoke coverage, and runtime implementation fit.

## 2. Schema Review Summary

### 2.1 New tables

- `reward_withdrawals`
- `reward_withdrawal_allocations`

### 2.2 Existing table change

- `ledger_events.event_type`
  - adds explicit withdrawal lifecycle enums
  - keeps legacy withdrawal enums for backward compatibility

### 2.3 No changes made to

- `account_rewards`
- `withdrawal_fee_rules`
- `calc_runs`
- `settlement_items`

## 3. Additive Safety Review

- The migration does not drop columns, tables, or indexes.
- The migration does not rewrite or backfill existing reward facts.
- The migration does not introduce triggers, procedures, or functions.
- The new tables are independent domain tables connected by foreign keys only.
- Existing reward summary and reward list queries remain compatible because `account_rewards` is unchanged.

## 4. Table Design Review

### 4.1 `reward_withdrawals`

Strengths:

- explicit request header row
- account-scoped idempotency via `(account_id, idempotency_key)`
- aggregate fee and net storage for reporting and detail responses
- lifecycle timestamps for admin workflow
- status and reason consistency enforced with `CHECK`

Trade-offs:

- V1 fixes `fee_mode_snapshot` to `DEDUCT_FROM_WITHDRAWAL`
- `tx_hash` uniqueness is not enforced yet because chain/network policy is still open

### 4.2 `reward_withdrawal_allocations`

Strengths:

- exact reward-to-withdrawal mapping
- supports partial allocation because uniqueness is only `(withdrawal_id, reward_id)`
- fee snapshot is stored per allocation, which is necessary when one request spans multiple fee bands
- `RESERVED / CONSUMED / RELEASED` gives clear active-balance semantics

Trade-offs:

- SQL alone cannot prevent cross-row over-allocation of one reward
- service transaction with `FOR UPDATE` remains mandatory

## 5. Balance Model Review

- chosen model:
  - realtime aggregation from `account_rewards` and `reward_withdrawal_allocations`
- accepted in V1 because:
  - strongest correctness
  - no projection drift risk
  - reversible and auditable
- implemented detail:
  - eligible rewards require `status = CONFIRMED`
  - positive rows and reversal rows both require `available_at <= now`
  - reversal rows inherit the original reward bucket

## 6. Fee Snapshot Review

- `withdrawal_fee_rules` already keys on:
  - `policy_version_id`
  - `withdrawal_source_type`
  - `schedule_days`
- review conclusion:
  - a single withdrawal-level fee rate is not sufficient
  - allocation-level snapshots are required

Stored per allocation:

- `fee_policy_version_id`
- `fee_schedule_days_snapshot`
- `fee_rate_snapshot`
- `holding_days_snapshot`
- `fee_amount_base`
- `net_amount_base`

Runtime implementation notes:

- holding age uses KST business date derived from `confirmed_at`
- rule selection uses the greatest `schedule_days <= holding_days`
- fee amount uses floor integer math
- `PREPAY_BJC` is rejected at runtime in V1

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
  - current documents and adjacent code still reference legacy names
  - the schema change remains additive

## 8. SQL Smoke Review

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
- post-rollback counts equal pre-run counts

## 9. Runtime Validation Review

### 9.1 Repository and service fit

- header and allocation tables map cleanly to repo and service responsibilities
- list/detail/report queries fit the schema without schema changes
- transaction-time locking is sufficient to protect partial allocation and idempotency flows

### 9.2 Runtime issues found and resolved

- timestamp re-read during `APPROVED -> PROCESSING`
  - issue:
    - `getWithdrawalByIdForUpdate()` read MySQL timestamps into runtime `Date` values
    - round-tripping them into update statements triggered `chk_reward_withdrawals_timestamp_order`
  - fix:
    - read timestamp columns as formatted SQL datetime strings in the `FOR UPDATE` repo path
- FIFO ordering stability
  - issue:
    - candidate reward timestamps could arrive as `Date` objects at runtime
    - naive string comparison could reorder rows unexpectedly
  - fix:
    - normalize sortable timestamp/date values in service helpers before comparing

### 9.3 Runtime smoke result

- app-level smoke passed for:
  - balance
  - preview
  - create
  - idempotent replay
  - cancel
  - reader/admin authz
  - approve
  - processing
  - complete
  - reject
  - fail
  - admin summary
  - cleanup

## 10. Operational Review

- backup is required before apply
- apply order remains:
  - `0001`
  - `0002`
  - `0003`
  - `0004`
  - `0005`
- validation after apply should include:
  - `SHOW CREATE TABLE reward_withdrawals`
  - `SHOW CREATE TABLE reward_withdrawal_allocations`
  - `SHOW CREATE TABLE ledger_events`
  - FK review
  - check-constraint review
  - index review
  - SQL smoke execution
  - app-level runtime smoke execution

## 11. Known Limits

- No DB-level constraint can prove:

```text
sum(active allocations for reward) <= reward remaining amount
```

- This is intentionally enforced by transaction-time application logic.
- Actual wallet transfer execution is still outside the schema and runtime scope.
- `tx_hash` uniqueness policy remains deferred.

## 12. Validation Run Notes

### 12.1 Migration validation

- backup result:
  - success via `mysqldump --no-tablespaces`
- migration apply result:
  - success
- `SHOW CREATE TABLE` review:
  - verified `reward_withdrawals`
  - verified `reward_withdrawal_allocations`
  - verified `ledger_events.event_type` includes all new withdrawal lifecycle enums
  - verified foreign keys, check constraints, unique keys, and secondary indexes

### 12.2 SQL smoke validation

- SQL smoke result:
  - pass with intentional negative-path failures
- rollback verification:
  - residual `reward_withdrawals` rows after rollback = `0`
  - residual `reward_withdrawal_allocations` rows after rollback = `0`

### 12.3 Runtime validation

- `npm test`
  - pass
- `npm run build`
  - pass
- `npm run smoke:member`
  - pass
- `npm run smoke:staking`
  - pass
- `npm run smoke:reward`
  - pass
- `npm run smoke:withdrawal`
  - pass

## 13. Review Conclusion

- The `0005` schema is additive and compatible with the current reward domain.
- The design preserves append-only reward history and models withdrawal reservation without mutating reward facts.
- The main active risk remains service-layer concurrency correctness, and the implemented `FOR UPDATE` transaction model addresses that risk for V1.
- SQL smoke and runtime smoke both confirm that the schema is fit for the implemented withdrawal APIs.
