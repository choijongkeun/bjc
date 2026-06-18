# BJC Reward Ledger Implementation Plan V1

## 1. Goal

- Define the implementation plan for reward ledger and daily reward accrual after staking v1 is complete.
- Finalize schema, contracts, and operational rules before repo/service/API/front implementation starts.
- Keep the reward domain compatible with later withdrawal, dashboard summary, and admin reporting work.

## 2. Current Gap Analysis

### 2.1 What already exists

- `calc_runs`
  - tracks calculation execution lifecycle by `policy_version_id`, `run_type`, and `run_date`
- `settlement_items`
  - fits settlement proposal artifacts for existing calculation flows
- `ledger_events`
  - provides append-only financial audit history with unique `reference_id`
- `account_stakings`
  - provides immutable member staking snapshots required for reward accrual

### 2.2 Gaps in the current model

- `ledger_events` alone does not model:
  - reward row lifecycle `PENDING / CONFIRMED / REVERSED`
  - reward availability via `available_at`
  - one-staking reward detail list
  - direct reversal linkage between original and reversal rows
  - member reward summary buckets
- `settlement_items` alone does not model:
  - reward ownership as a user-facing ledger
  - staking-level reward history
  - withdrawable reward balance
  - reward reversal lifecycle

## 3. Chosen Source of Truth

### 3.1 Final choice

- `account_rewards` is the reward domain source of truth.
- `ledger_events` remains the append-only financial audit ledger.
- `calc_runs` remains the batch execution traceability source of truth.

### 3.2 Why not ledger-only

- reward list APIs need row-oriented detail beyond raw ledger event scans
- reward status and availability need first-class columns
- duplicate prevention is simpler with one business-row contract
- reversal handling is clearer with explicit original/reversal row linkage
- admin reporting by account, staking, reward type, and run is easier to query

## 4. Reward Ledger Model

### 4.1 Table

- table name:
  - `account_rewards`

### 4.2 Core fields

- identity / ownership:
  - `id`
  - `account_id`
  - `account_staking_id`
  - `policy_version_id`
  - `calc_run_id`
- business classification:
  - `reward_type`
  - `reward_date`
  - `status`
- monetary fields:
  - `amount_base`
- traceability:
  - `source_reference`
  - `source_ledger_event_id`
  - `reversal_reward_id`
- lifecycle timestamps:
  - `available_at`
  - `confirmed_at`
  - `reversed_at`
  - `created_at`
  - `updated_at`
- extension:
  - `metadata_json`

### 4.3 Reward types

- `DAILY_REWARD`
- `DIRECT_REFERRAL`
- `RANK_BONUS`
- `CONTRIBUTION`
- `WITHDRAWAL_FEE`
- `SIDECAR`
- `ADJUSTMENT`
- `REVERSAL`

### 4.4 Statuses

- `PENDING`
- `CONFIRMED`
- `REVERSED`

## 5. DAILY_REWARD Calculation Policy

### 5.1 Snapshot inputs

- `principal_amount_base`
- `daily_interest_bps_snapshot`
- `duration_days_snapshot`
- `started_at`
- `matures_at`

### 5.2 Formula

```text
daily_reward_base =
  floor(principal_amount_base * daily_interest_bps_snapshot / 10000)
```

### 5.3 Precision rules

- denominator is `10000`
- use MySQL `DECIMAL` or application `BigInt`
- do not use JavaScript `Number`
- discard sub-base-unit remainder by per-row floor
- if the result is `0`, do not insert a reward row in V1

### 5.4 Eligibility policy

Operationally, the runtime target set is expected to be current `ACTIVE` and `CANCEL_REQUESTED` rows. Replay-safe evaluation must use timestamps:

```text
started_at is not null
and started_at < reward_day_start
and matures_at > reward_day_start
and (cancelled_at is null or cancelled_at > reward_day_start)
and (closed_at is null or closed_at > reward_day_start)
```

Policy decisions:

- `CANCEL_REQUESTED` continues to accrue until admin cancel is finalized
- `CANCELLED`, `MATURED`, and `CLOSED` do not accrue after their terminal timestamp
- first reward day begins on the next business date after activation when activation occurred after midnight

## 6. Balance Aggregation Model

### 6.1 V1 choice

- use `account_rewards` as source of truth
- calculate summaries with aggregate `SUM` queries
- do not add `account_reward_balances` cache table in this phase

### 6.2 Summary buckets

- `pending_reward_base`
  - net sum where `status = PENDING`
- `confirmed_reward_base`
  - net sum where `status = CONFIRMED`
- `withdrawable_reward_base`
  - confirmed net sum where `available_at <= now`
- `withdrawn_reward_base`
  - reserved for future withdrawal-domain aggregation

### 6.3 Future extension for withdrawals

Later withdrawal flows may require:

- `AVAILABLE`
- `RESERVED`
- `WITHDRAWN`

V1 does not add those state columns yet. The contract reserves those concepts for future withdrawal tables and summary logic.

## 7. Calc Run Integration

### 7.1 Reuse decision

- reuse existing `calc_runs`
- do not change `calc_runs` in `0004`

### 7.2 Why reuse is sufficient

- `run_type` already exists
- `run_date` already exists and maps to `reward_date`
- unique `(policy_version_id, run_type, run_date)` already prevents duplicate daily runs
- existing `PENDING / RUNNING / SUCCEEDED / FAILED / FINALIZED` lifecycle is already compatible

### 7.3 Planned run flow

```text
create calc_run
-> RUNNING
-> scan eligible account_stakings
-> insert account_rewards
-> append ledger_events
-> write audit rows
-> SUCCEEDED
-> FINALIZED when operator lock is required
```

## 8. Ledger Integration

### 8.1 Positive accrual

- insert one `account_rewards` row
- append one `ledger_events` row with `event_type = DAILY_REWARD_ACCRUAL`
- store the ledger id into `account_rewards.source_ledger_event_id`

### 8.2 Reference rules

- daily reward:
  - `reward.daily:<account_staking_id>:<YYYY-MM-DD>`
- reversal:
  - `reward.reversal:<original_reward_id>`

### 8.3 Reversal policy

- original reward row keeps the original positive `amount_base`
- original reward row transitions to `status = REVERSED`
- insert one new `REVERSAL` row with negative `amount_base`
- link reversal via `reversal_reward_id`
- ledger side uses existing `ADJUSTMENT` with negative amount in V1

## 9. User / Admin API Plan

### 9.1 User APIs

- `GET /api/me/rewards`
- `GET /api/me/rewards/summary`
- `GET /api/me/rewards/:rewardId`
- `GET /api/me/stakings/:stakingId/rewards`

### 9.2 Admin APIs

- `GET /api/admin/rewards`
- `GET /api/admin/rewards/:rewardId`
- `GET /api/admin/accounts/:accountId/rewards`
- `POST /api/admin/rewards/:rewardId/reverse`
- `POST /api/admin/calc-runs/daily-reward`
- `GET /api/admin/calc-runs/:id/rewards`

### 9.3 Dashboard summaries

Recommended user summary split:

- `GET /api/me/stakings/summary`
- `GET /api/me/rewards/summary`

Reason:

- cleaner domain ownership
- easier dashboard parallel fetch
- reward evolution stays decoupled from staking summary changes

## 10. Future UI Scope

### 10.1 User Rewards screen

- reward summary cards
- reward list filters by type, status, date, and staking
- reward detail page
- staking detail reward tab

### 10.2 Admin Rewards / Calc screen

- global reward list with run filters
- reward detail with reversal linkage
- calc run reward inspection
- manual daily reward run trigger
- reversal action and audit visibility

## 11. Risks

- high daily row volume may require chunked execution and later cache tables
- reversal policy needs careful coordination with future withdrawal deductions
- reward availability may diverge from confirmation once withdrawals introduce holds
- admin rerun behavior must stay compatible with `FINALIZED` lock semantics

## 12. Deferred / Open Policy Items

- whether reversal ledger events deserve a dedicated enum after implementation starts
- whether future reward withdrawal uses separate domain tables or reward-type rows
- whether `metadata_json` needs stricter schema conventions by reward type
- whether same-run retry should always reuse the same `calc_run_id` or create sub-attempt logs

## 13. Recommended Implementation Order

1. apply `0004` and validate schema/smoke
2. add reward repository reads/writes
3. add daily reward batch service using `calc_runs`
4. add admin trigger and run inspection APIs
5. add user/admin reward read APIs
6. add dashboard reward summary APIs
7. add user/admin reward screens
8. design reward withdrawal and reservation model
