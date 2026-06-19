# BJC Reward Withdrawal Implementation Plan V1

## 1. Goal

- Implement the reward-withdrawal domain on top of the completed `0005` schema.
- Preserve compatibility with existing reward, member, staking, ledger, and admin/reporting flows.
- Keep the model append-only on the reward side and transactional on the withdrawal side.
- Complete runtime repository, service, route, unit test, and smoke validation in this phase.

## 2. Implementation Summary

- Implemented repositories:
  - `src/repos/rewardWithdrawalsRepo.ts`
  - `src/repos/rewardWithdrawalAllocationsRepo.ts`
- Implemented domain helpers:
  - `src/domain/rewardBucket.ts`
  - `src/domain/withdrawalFee.ts`
  - `src/domain/withdrawalStatus.ts`
- Implemented service:
  - `src/services/rewardWithdrawalService.ts`
- Connected routes:
  - `src/server.ts`
- Implemented unit test:
  - `src/services/rewardWithdrawalService.test.ts`
- Implemented smoke:
  - `scripts/reward_withdrawal_smoke.ts`
- Enhanced reward summary:
  - `withdrawable_reward_amount_base`
  - `withdrawn_reward_amount_base`

## 3. Current Rewards Analysis

### 3.1 Source tables

- `account_rewards`
  - reward domain source of truth
  - statuses:
    - `PENDING`
    - `CONFIRMED`
    - `REVERSED`
- `reward_withdrawals`
  - withdrawal request header source of truth
- `reward_withdrawal_allocations`
  - withdrawal reservation and consumption source of truth
- `withdrawal_fee_rules`
  - fee rule lookup table
  - key = `(policy_version_id, withdrawal_source_type, schedule_days)`
  - `fee_mode = DEDUCT_FROM_WITHDRAWAL | PREPAY_BJC`
- `ledger_events`
  - append-only financial ledger
- admin audit log table
  - lifecycle actor/action trail

### 3.2 Reward lifecycle facts

- Positive reward rows are stored in `account_rewards`.
- Reversal is append-only:
  - original reward row keeps the original positive amount
  - original row transitions to `status = REVERSED`
  - separate `REVERSAL` row is inserted with negative `amount_base`
- Withdrawal-safe balance therefore must net reversal rows by original reward bucket.

### 3.3 Reward summary gap status

- `withdrawable_reward_amount_base`
  - now subtracts `RESERVED` and `CONSUMED` allocation amounts from the eligible confirmed/reversal net
- `withdrawn_reward_amount_base`
  - now reflects `CONSUMED` allocation total

## 4. Withdrawal Type Decision

### 4.1 Final enum

- `DAILY_REWARD`
- `BONUS`

### 4.2 Bucket classification

- `DAILY_REWARD`
  - original reward type = `DAILY_REWARD`
- `BONUS`
  - original reward type in:
    - `DIRECT_REFERRAL`
    - `RANK_BONUS`
    - `CONTRIBUTION`
    - `SIDECAR`

### 4.3 Excluded reward rows

- `WITHDRAWAL_FEE`
  - excluded from withdrawal source balance
- `ADJUSTMENT`
  - excluded in V1
- `PENDING`
  - excluded
- original `REVERSED` positive reward rows
  - excluded from new positive sources
- `REVERSAL`
  - inherits the original reward bucket and reduces net availability

### 4.4 Mixed-type request policy

- One withdrawal request contains exactly one `withdrawal_type`.
- A request never mixes `DAILY_REWARD` and `BONUS` allocations.

## 5. Balance Model

### 5.1 Chosen model

- Realtime aggregation is used instead of a projection table.
- Source of truth:
  - rewards side = `account_rewards`
  - reservation and consumption side = `reward_withdrawal_allocations`

### 5.2 Balance definition

For one account and one withdrawal bucket:

```text
confirmed_amount_base
= eligible confirmed positive rewards
+ eligible confirmed reversal negative rewards

available_amount_base
= confirmed_amount_base
- reserved_allocation_sum
- consumed_allocation_sum
```

Where:

- eligible reward rows must satisfy:
  - `status = CONFIRMED`
  - `available_at is null or available_at <= now`
- `reserved_allocation_sum`
  - allocation `status = RESERVED`
- `consumed_allocation_sum`
  - allocation `status = CONSUMED`
- `released_allocation_sum`
  - allocation `status = RELEASED`
  - excluded from active deductions

### 5.3 Consistency rule

- Service rejects negative computed availability as an internal consistency error.
- V1 intentionally does not hide negative availability by clamping to `0`.

## 6. Concurrency and Transaction Model

### 6.1 Create transaction

- Create-withdrawal runs in one transaction.
- The transaction performs:
  - account lock
  - idempotency lookup
  - candidate reward lock with `FOR UPDATE`
  - overlapping active allocation lock
  - transaction-time recalculation of FIFO allocations and fees
  - insertion of withdrawal header and allocations
  - ledger append
  - audit append

### 6.2 State transition transactions

- Each user cancel and admin status mutation runs in one transaction.
- The transaction always includes:
  - withdrawal `FOR UPDATE`
  - allocation rows `FOR UPDATE`
  - state revalidation
  - ledger append
  - audit append

### 6.3 Why this model is required

- SQL check constraints alone cannot prevent active cross-row over-allocation of one reward.
- Partial allocation across multiple withdrawals is allowed, so service-layer locking is mandatory.

## 7. FIFO Allocation Policy

### 7.1 Base policy

- Allocate oldest eligible reward first.
- Sort order:
  - `confirmed_at asc`
  - `reward_date asc`
  - `id asc`

### 7.2 Runtime hardening

- The sorter handles both string timestamps and runtime `Date` objects.
- This avoids unstable ordering caused by implicit stringification of `Date` values.

### 7.3 Partial allocation

- A single reward row may be partially allocated across multiple withdrawals.
- Allocation uses:

```text
allocatable_for_reward
= reward.amount_base
- active_reserved_or_consumed_allocations_for_reward
```

- Each reward slice may be partially consumed to satisfy the request total exactly.

## 8. Fee Policy

### 8.1 Fee lookup source

- Fee lookup uses `withdrawal_fee_rules`.
- Lookup inputs:
  - `policy_version_id`
  - `withdrawal_source_type`
  - active rules only

### 8.2 Holding age basis

- Use KST business date derived from `confirmed_at`.
- Request date uses current KST date at preview/create time.

Formula:

```text
holding_days
= datediff(requested_kst_date, confirmed_at_kst_date)
```

### 8.3 Rule selection

- Select the greatest `schedule_days` where:

```text
schedule_days <= holding_days
```

- If no rule matches, the candidate reward slice is not allocatable.

### 8.4 V1 fee mode

- Runtime V1 accepts only:
  - `DEDUCT_FROM_WITHDRAWAL`
- If an active rule resolves to `PREPAY_BJC`, the service rejects the request because that execution path is not implemented.

### 8.5 Rounding

- Fee amount uses integer floor:

```text
fee_amount_base = floor((allocated_amount_base * fee_bps) / 10000)
```

- Allocation fee totals must match the header fee total exactly.

### 8.6 Snapshot placement

- `reward_withdrawals`
  - stores aggregate `fee_amount_base` and `net_amount_base`
- `reward_withdrawal_allocations`
  - stores exact per-slice snapshots:
    - `fee_policy_version_id`
    - `fee_schedule_days_snapshot`
    - `fee_rate_snapshot`
    - `holding_days_snapshot`
    - `fee_amount_base`
    - `net_amount_base`

## 9. State Machines

### 9.1 Implemented withdrawal status transitions

```text
REQUESTED -> APPROVED
REQUESTED -> REJECTED
REQUESTED -> CANCELLED
APPROVED  -> PROCESSING
PROCESSING -> COMPLETED
PROCESSING -> FAILED
```

- `APPROVED -> CANCELLED` is not implemented in V1 user flow.
- Invalid transitions return `409`.

### 9.2 Allocation status transitions

```text
RESERVED -> CONSUMED
RESERVED -> RELEASED
```

### 9.3 Allocation mapping by withdrawal status

```text
REQUESTED  = RESERVED
APPROVED   = RESERVED
PROCESSING = RESERVED
COMPLETED  = CONSUMED
REJECTED   = RELEASED
CANCELLED  = RELEASED
FAILED     = RELEASED
```

## 10. Ledger and Audit Integration

### 10.1 Implemented ledger event types

- `WITHDRAWAL_REQUESTED`
- `WITHDRAWAL_RESERVED`
- `WITHDRAWAL_APPROVED`
- `WITHDRAWAL_PROCESSING`
- `WITHDRAWAL_COMPLETED`
- `WITHDRAWAL_REJECTED`
- `WITHDRAWAL_FAILED`
- `WITHDRAWAL_CANCELLED`
- `WITHDRAWAL_FEE_CHARGED`

### 10.2 Reference ID convention

- `withdrawal.request:<withdrawal_id>`
- `withdrawal.reserve:<withdrawal_id>`
- `withdrawal.approve:<withdrawal_id>`
- `withdrawal.processing:<withdrawal_id>`
- `withdrawal.complete:<withdrawal_id>`
- `withdrawal.reject:<withdrawal_id>`
- `withdrawal.fail:<withdrawal_id>`
- `withdrawal.cancel:<withdrawal_id>`
- `withdrawal.fee:<withdrawal_id>`

### 10.3 Audit actions

- user actions:
  - `USER_WITHDRAWAL_CREATE`
  - `USER_WITHDRAWAL_CANCEL`
- admin actions:
  - `ADMIN_WITHDRAWAL_APPROVE`
  - `ADMIN_WITHDRAWAL_REJECT`
  - `ADMIN_WITHDRAWAL_PROCESSING`
  - `ADMIN_WITHDRAWAL_COMPLETE`
  - `ADMIN_WITHDRAWAL_FAIL`

## 11. Implemented APIs

### 11.1 User APIs

- `GET /api/me/withdrawal-balance`
- `POST /api/me/withdrawal-preview`
- `POST /api/me/withdrawals`
- `GET /api/me/withdrawals`
- `GET /api/me/withdrawals/:withdrawalId`
- `POST /api/me/withdrawals/:withdrawalId/cancel`

### 11.2 Admin APIs

- `GET /api/admin/withdrawals`
- `GET /api/admin/withdrawals/:withdrawalId`
- `POST /api/admin/withdrawals/:withdrawalId/approve`
- `POST /api/admin/withdrawals/:withdrawalId/reject`
- `POST /api/admin/withdrawals/:withdrawalId/processing`
- `POST /api/admin/withdrawals/:withdrawalId/complete`
- `POST /api/admin/withdrawals/:withdrawalId/fail`
- `GET /api/admin/accounts/:accountId/withdrawals`
- `GET /api/admin/reports/withdrawal-summary`

### 11.3 Auth rules

- user routes:
  - bearer session auth
- admin routes:
  - `x-actor-account-id`
- admin read:
  - `READER` or `ADMIN`
- admin mutate:
  - `ADMIN`

## 12. Testing and Verification

### 12.1 Unit coverage

- reward bucket classification
- reversal original-type inheritance
- FIFO sort
- fee rule selection
- fee floor calculation
- partial allocation
- available, reserved, completed calculation
- state transition allow and deny cases
- idempotency match and conflict
- owner-scope enforcement
- `ADMIN` and `READER` authz behavior

### 12.2 Smoke coverage

- health
- balance for `DAILY_REWARD` and `BONUS`
- preview
- create request
- allocation `RESERVED`
- idempotent replay
- conflicting idempotency key
- insufficient balance failure
- cross-user `404`
- user cancel and allocation release
- `READER` read access and mutate denial
- admin approve
- admin processing
- admin complete
- allocation `CONSUMED`
- completed and fee ledger events
- separate reject
- separate fail
- withdrawal summary
- amount string contract
- sensitive field non-exposure
- cleanup verification

### 12.3 Regression status

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

## 13. Remaining Out of Scope

- User/Admin withdrawal UI implementation
- actual wallet transfer integration
- blockchain receipt confirmation or retry flows
- `PREPAY_BJC` execution
- automatic reprocessing
- withdrawal eligibility for `ADJUSTMENT`
- bonus source calculation for:
  - `DIRECT_REFERRAL`
  - `RANK_BONUS`
  - `CONTRIBUTION`
  - `SIDECAR`

## 14. Risks and Follow-up Items

- If reward volume grows, realtime aggregation may later need a projection table.
- `tx_hash` uniqueness policy is still intentionally deferred.
- `PREPAY_BJC` requires a separate contract and settlement design.
- `ADJUSTMENT` eligibility remains policy-dependent.
- `npm start` still has a separate `dist/server.js` path issue; smoke uses `npx tsx src/server.ts`.

## 15. Recommended Next Steps

1. add User/Admin withdrawal screens on top of the stabilized API
2. define `tx_hash` uniqueness and replay policy
3. design and implement actual wallet transfer execution flow
4. define `PREPAY_BJC` execution semantics if needed
5. revisit projection strategy if withdrawal volume grows
