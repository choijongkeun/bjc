# BJC Reward Withdrawal Implementation Plan V1

## 1. Goal

- Define the reward-withdrawal domain before building service, API, or UI execution flows.
- Keep the design aligned with the current implemented reward ledger, staking, and admin/reporting model.
- Add only additive MySQL schema in this phase.
- Validate the schema with local migration apply and SQL smoke, but do not implement runtime withdrawal logic yet.

## 2. Current Rewards Analysis

### 2.1 Current source tables

- `account_rewards`
  - current reward domain source of truth
  - statuses:
    - `PENDING`
    - `CONFIRMED`
    - `REVERSED`
- `ledger_events`
  - append-only financial audit ledger
  - unique `reference_id`
  - already contains legacy withdrawal event types:
    - `WITHDRAWAL_REQUEST`
    - `WITHDRAWAL_FEE`
    - `WITHDRAWAL_RELEASE`
    - `WITHDRAWAL_FREEZE`
    - `WITHDRAWAL_UNFREEZE`
- `withdrawal_fee_rules`
  - current fee policy table
  - key = `(policy_version_id, withdrawal_source_type, schedule_days)`
  - `withdrawal_source_type = DAILY_REWARD | BONUS`
  - `fee_mode = DEDUCT_FROM_WITHDRAWAL | PREPAY_BJC`
- `calc_runs`
  - batch execution / traceability source of truth
  - `FINALIZED` locks settlement artifacts, not reward ownership itself
- `settlement_items`
  - settlement proposal table for calc flows
  - not chosen as the withdrawal source of truth

### 2.2 Current reward lifecycle facts

- Positive reward rows are stored in `account_rewards`.
- Reversal is append-only:
  - original reward row keeps the original positive amount
  - original row transitions to `status = REVERSED`
  - separate `REVERSAL` row is inserted with negative `amount_base`
- Therefore, withdrawal-safe balance cannot be derived from positive rewards only.
- `REVERSAL` must be netted naturally in balance aggregation.

### 2.3 Current summary gaps

- `withdrawable_reward_amount_base`
  - currently means `CONFIRMED` reward rows where `available_at <= now`
  - does not subtract withdrawal reservation or completed usage yet
- `withdrawn_reward_amount_base`
  - current implementation is a literal placeholder `'0'`
  - it is not a real aggregate today

### 2.4 Settlement finalization relation

- `FINALIZED` on `calc_runs` currently locks `settlement_items` mutation.
- Withdrawal requests should not mutate historical `settlement_items`.
- Historical rewards produced by a finalized calc run remain withdrawable if:
  - they are still financially available
  - they are not reversed away by a matching `REVERSAL`
  - they are not already reserved or consumed by withdrawal allocation rows

## 3. Withdrawal Type Decision

### 3.1 Final enum

- `DAILY_REWARD`
- `BONUS`

This matches the existing `withdrawal_fee_rules.withdrawal_source_type` model and avoids introducing a second naming convention.

### 3.2 Bucket classification

- `DAILY_REWARD`
  - only reward rows whose original reward type is `DAILY_REWARD`
- `BONUS`
  - reward rows whose original reward type is one of:
    - `DIRECT_REFERRAL`
    - `RANK_BONUS`
    - `CONTRIBUTION`
    - `SIDECAR`

### 3.3 Excluded reward rows

- `WITHDRAWAL_FEE`
  - excluded from member withdrawal source balance
- `REVERSAL`
  - not independently classified
  - the reversal amount inherits the bucket of the original reward row it references
- `ADJUSTMENT`
  - excluded by default in V1 because generic adjustment intent is ambiguous
  - later policy may explicitly whitelist an adjustment subtype

### 3.4 Mixed-type request policy

- One withdrawal request must contain exactly one `withdrawal_type`.
- A request must not mix `DAILY_REWARD` and `BONUS` allocations.
- This keeps fee lookup, user UX, admin review, and audit semantics simple.

## 4. Balance Definitions

### 4.1 Chosen model

- Choose realtime aggregation over a balance table in V1.
- Source of truth:
  - rewards side = `account_rewards`
  - reservation / consumption side = `reward_withdrawal_allocations`
- No `account_reward_balances` projection table is added in this phase.

### 4.2 Available amount definition

For one account and one withdrawal bucket:

```text
available_amount_base
= eligible_confirmed_reward_ledger_sum
- reserved_allocation_sum
- consumed_allocation_sum
```

Where:

- `eligible_confirmed_reward_ledger_sum`
  - sum of positive eligible reward rows with `status = CONFIRMED` and `available_at <= now`
  - plus negative `REVERSAL` rows with `status = CONFIRMED` and `available_at <= now`
  - reversal rows are mapped by joining to the original reward row and inheriting its bucket
- `reserved_allocation_sum`
  - sum of `reward_withdrawal_allocations.allocated_amount_base`
  - where allocation `status = RESERVED`
- `consumed_allocation_sum`
  - sum of `reward_withdrawal_allocations.allocated_amount_base`
  - where allocation `status = CONSUMED`

### 4.3 Reserved / completed definitions

- `reserved_amount_base`
  - allocation gross sum where allocation `status = RESERVED`
- `completed_amount_base`
  - allocation gross sum where allocation `status = CONSUMED`
- `released_amount_base`
  - allocation gross sum where allocation `status = RELEASED`
  - excluded from active balance deductions

### 4.4 Why reward status is not extended

- one reward may be partially allocated
- one reward may be used across multiple withdrawal requests
- reward rows represent financial accrual facts
- allocation rows more precisely model reservation and consumption

### 4.5 Concurrency rule

- Preview queries are informational only.
- The actual create-withdrawal transaction must:
  - lock candidate reward rows with `FOR UPDATE`
  - lock overlapping allocation rows for those rewards
  - recompute remaining available amount inside the same transaction
  - insert withdrawal + allocation rows only after the final validation succeeds

## 5. FIFO Allocation Policy

### 5.1 Base policy

- Allocate oldest eligible reward first.
- Sort order:
  - `confirmed_at asc`
  - `reward_date asc`
  - `id asc`

### 5.2 Why `confirmed_at` is the primary age basis

- current reward availability becomes effective from `confirmed_at`
- `reward_date` is a business date and may not fully represent manual or future reward types
- reversal timing and admin adjustments align more naturally with financial confirmation time

### 5.3 Partial allocation

- A single reward row may be partially allocated across multiple withdrawals.
- Cross-row over-allocation is not prevented by SQL check constraints alone.
- Service-level transaction locking must guarantee:

```text
sum(active allocations for reward) <= reward gross available amount after reversals
```

### 5.4 Release policy

- withdrawal request creation:
  - allocation status = `RESERVED`
- withdrawal completion:
  - allocation status = `CONSUMED`
- withdrawal rejection / cancellation / failure:
  - allocation status = `RELEASED`

### 5.5 Failed withdrawal policy

- `FAILED` releases allocations immediately in V1.
- Retry is modeled as a brand new withdrawal request.
- This avoids hidden held balances and simplifies duplicate-processing prevention.

## 6. Fee Policy Decision

### 6.1 Fee lookup source

- Use `withdrawal_fee_rules`.
- Lookup key:
  - `policy_version_id`
  - `withdrawal_source_type`
  - `schedule_days`
  - `is_active = 1`

### 6.2 Holding age basis

- Use KST business date derived from `confirmed_at`.
- Snapshot values at request time:
  - `requested_kst_date`
  - allocation `holding_days_snapshot`

Formula:

```text
holding_days_snapshot =
  datediff(requested_kst_date, date(convert_tz(confirmed_at, 'UTC', 'Asia/Seoul')))
```

### 6.3 Fee schedule selection

- `schedule_days` is treated as a minimum holding threshold.
- Select the greatest active rule where:

```text
rule.schedule_days <= holding_days_snapshot
```

- If no rule matches, the reward amount is not withdrawable for that request.

### 6.4 V1 fee mode

- Although `withdrawal_fee_rules` supports `PREPAY_BJC`, this withdrawal domain V1 fixes the snapshot mode to:
  - `DEDUCT_FROM_WITHDRAWAL`
- Reason:
  - user contract expects `requested_amount = fee_amount + net_amount`
  - the current phase does not model external fee prepayment settlement

### 6.5 Per-type schedule intent

- `DAILY_REWARD`
  - 1 day -> 20%
  - 7 day -> 10%
  - 15 day -> 6%
  - 30 day -> 3%
- `BONUS`
  - 30 day -> 30%
  - 60 day -> 20%
  - 90 day -> 10%
  - 180 day -> 0%

### 6.6 Snapshot placement

- `reward_withdrawals`
  - stores aggregate `fee_amount_base` and `net_amount_base`
- `reward_withdrawal_allocations`
  - stores exact fee snapshots per reward slice:
    - `fee_policy_version_id`
    - `fee_schedule_days_snapshot`
    - `fee_rate_snapshot`
    - `holding_days_snapshot`
    - `fee_amount_base`
    - `net_amount_base`

This rejects a single authoritative withdrawal-level `fee_rate_snapshot`, because one request may combine allocations that fall into different fee bands.

## 7. New Tables

### 7.1 `reward_withdrawals`

- purpose:
  - one member withdrawal request header
- key fields:
  - `id`
  - `account_id`
  - `fee_policy_version_id`
  - `withdrawal_type`
  - `requested_amount_base`
  - `fee_amount_base`
  - `net_amount_base`
  - `fee_mode_snapshot`
  - `status`
  - `idempotency_key`
  - `wallet_address`
  - `network`
  - `tx_hash`
  - `requested_kst_date`
  - request / transition timestamps
  - reject / failure reasons
- key constraints:
  - `requested_amount_base > 0`
  - `fee_amount_base >= 0`
  - `net_amount_base >= 0`
  - `requested_amount_base = fee_amount_base + net_amount_base`
  - account-scoped idempotency unique:
    - `(account_id, idempotency_key)`
  - timestamp and reason consistency by status

### 7.2 `reward_withdrawal_allocations`

- purpose:
  - map one withdrawal request to one or more reward rows
- key fields:
  - `withdrawal_id`
  - `reward_id`
  - `allocated_amount_base`
  - `fee_policy_version_id`
  - `fee_schedule_days_snapshot`
  - `fee_rate_snapshot`
  - `holding_days_snapshot`
  - `fee_amount_base`
  - `net_amount_base`
  - `status`
  - `reserved_at`
  - `consumed_at`
  - `released_at`
- key constraints:
  - `allocated_amount_base > 0`
  - `allocated_amount_base = fee_amount_base + net_amount_base`
  - unique `(withdrawal_id, reward_id)`
  - FK to `reward_withdrawals`
  - FK to `account_rewards`
  - timestamp consistency by allocation status

## 8. State Machines

### 8.1 Withdrawal status

```text
REQUESTED
-> APPROVED
-> PROCESSING
-> COMPLETED

REQUESTED -> REJECTED
REQUESTED -> CANCELLED
APPROVED  -> CANCELLED
PROCESSING -> FAILED
```

### 8.2 Allocation status

```text
RESERVED
-> CONSUMED

RESERVED
-> RELEASED
```

### 8.3 Status transition notes

- `REJECTED`
  - admin policy rejection before processing
- `CANCELLED`
  - member or admin cancellation before processing starts
- `FAILED`
  - processing started but external payout did not complete successfully
- `COMPLETED`
  - payout is final and allocations become consumed

## 9. Ledger Integration Plan

### 9.1 New explicit event types

- `WITHDRAWAL_REQUESTED`
- `WITHDRAWAL_RESERVED`
- `WITHDRAWAL_APPROVED`
- `WITHDRAWAL_PROCESSING`
- `WITHDRAWAL_COMPLETED`
- `WITHDRAWAL_REJECTED`
- `WITHDRAWAL_FAILED`
- `WITHDRAWAL_CANCELLED`
- `WITHDRAWAL_FEE_CHARGED`

### 9.2 Legacy compatibility

- Keep existing legacy event types in the enum:
  - `WITHDRAWAL_REQUEST`
  - `WITHDRAWAL_FEE`
  - `WITHDRAWAL_RELEASE`
  - `WITHDRAWAL_FREEZE`
  - `WITHDRAWAL_UNFREEZE`
- Existing docs and calculation engine references are not broken by this additive change.

### 9.3 Reference ID convention

- `withdrawal.request:<withdrawal_id>`
- `withdrawal.reserve:<withdrawal_id>`
- `withdrawal.approve:<withdrawal_id>`
- `withdrawal.processing:<withdrawal_id>`
- `withdrawal.complete:<withdrawal_id>`
- `withdrawal.reject:<withdrawal_id>`
- `withdrawal.fail:<withdrawal_id>`
- `withdrawal.cancel:<withdrawal_id>`
- `withdrawal.fee:<withdrawal_id>`

### 9.4 Transaction rule

- Status mutation, allocation mutation, and ledger append must commit in the same DB transaction.

## 10. User API Plan

- `GET /api/me/withdrawal-balance`
- `POST /api/me/withdrawal-preview`
- `POST /api/me/withdrawals`
- `GET /api/me/withdrawals`
- `GET /api/me/withdrawals/:withdrawalId`
- `POST /api/me/withdrawals/:withdrawalId/cancel`

Key response intent:

- withdrawal balance returns:
  - `daily_reward_available_amount_base`
  - `bonus_available_amount_base`
  - `reserved_amount_base`
  - `completed_amount_base`
- preview returns estimated allocation / fee result only
- create performs the authoritative transaction-time recalculation

## 11. Admin API Plan

- `GET /api/admin/withdrawals`
- `GET /api/admin/withdrawals/:withdrawalId`
- `POST /api/admin/withdrawals/:withdrawalId/approve`
- `POST /api/admin/withdrawals/:withdrawalId/reject`
- `POST /api/admin/withdrawals/:withdrawalId/processing`
- `POST /api/admin/withdrawals/:withdrawalId/complete`
- `POST /api/admin/withdrawals/:withdrawalId/fail`
- `GET /api/admin/accounts/:accountId/withdrawals`
- `GET /api/admin/reports/withdrawal-summary`

Role rules:

- `ADMIN`
  - read and status mutations
- `READER`
  - read only
- `USER`
  - no admin withdrawal access

## 12. Future UI Scope

### 12.1 User

- withdrawal balance cards split by `DAILY_REWARD` and `BONUS`
- withdrawal preview modal
- withdrawal request history
- withdrawal detail with allocation and fee breakdown
- cancel action for `REQUESTED` rows

### 12.2 Admin

- global withdrawal queue
- per-status review flow
- detail panel with allocation ledger
- per-account history
- summary / aging report

## 13. Out of Scope in This Phase

- service implementation
- HTTP route implementation
- User/Admin UI implementation
- wallet transfer integration
- external chain confirmation polling
- balance projection / cache table

## 14. Risks and Open Policy Items

- `ADJUSTMENT` eligibility is intentionally left excluded until policy explicitly defines which adjustment classes are withdrawable.
- If reward volume grows, realtime aggregation may need a projection table later.
- A future `PREPAY_BJC` execution model will require contract changes because V1 fixes `fee_mode_snapshot` to `DEDUCT_FROM_WITHDRAWAL`.
- Existing calculation-engine docs still reference legacy `WITHDRAWAL_REQUEST`; those docs should be updated after runtime withdrawal implementation begins.

## 15. Recommended Next Steps

1. implement repo/service transaction logic with `FOR UPDATE`
2. add User/Admin withdrawal APIs
3. update reward summary to subtract reserved / consumed allocations
4. add admin audit actions for approval / reject / complete / fail
5. add User/Admin withdrawal screens after API stabilization
