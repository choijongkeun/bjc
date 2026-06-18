# BJC Daily Reward Batch Design V1

## 1. Goal

- Define the business contract for daily staking reward accrual before service implementation.
- Reuse existing `calc_runs`.
- Persist reward rows into `account_rewards`.
- Append financial audit rows into `ledger_events`.
- Keep the design compatible with later reversal, withdrawal, and dashboard summary work.

## 2. Timezone / Business Date

- Business timezone: `Asia/Seoul`
- Batch input: `reward_date` in `YYYY-MM-DD`
- `reward_date` means one business day keyed by Korea local date, not UTC date.

### 2.1 Reward window

For a given `reward_date = D`:

```text
reward_day_start = D 00:00:00 Asia/Seoul
reward_day_end   = D+1 00:00:00 Asia/Seoul
```

### 2.2 Why Asia/Seoul

- user-facing product / rewards operation is planned around Korea service time
- dashboard, admin reconciliation, and manual batch execution are easier with one fixed business date
- it avoids silent drift between UTC day boundaries and local accounting expectations

## 3. Calculation Basis

## 3.1 Required snapshot columns

Daily reward calculation must use immutable staking snapshots:

- `account_stakings.principal_amount_base`
- `account_stakings.daily_interest_bps_snapshot`
- `account_stakings.duration_days_snapshot`
- `account_stakings.started_at`
- `account_stakings.matures_at`

### 3.2 Denominator

- `daily_interest_bps_snapshot` uses basis points with denominator `10000`
- Example:
  - `50` -> `0.50%`
  - `70` -> `0.70%`
  - `100` -> `1.00%`
  - `120` -> `1.20%`

### 3.3 Formula

```text
daily_reward_base =
  floor(principal_amount_base * daily_interest_bps_snapshot / 10000)
```

## 4. Eligibility Rules

## 4.1 Normal operational target

Operationally, the daily batch targets positions that are still open for accrual on `reward_day_start`.

Primary runtime statuses:

- `ACTIVE`
- `CANCEL_REQUESTED`

Policy:

- `CANCEL_REQUESTED` continues to accrue reward until admin cancel is finalized.
- `CANCELLED`, `MATURED`, `CLOSED` do not accrue after their terminal timestamp.

## 4.2 Replay-safe timestamp rule

To support replay / backfill safely, the implementation must not rely on current status alone.

A staking is eligible for `reward_date = D` when:

```text
started_at is not null
and started_at < reward_day_start
and matures_at > reward_day_start
and (cancelled_at is null or cancelled_at > reward_day_start)
and (closed_at is null or closed_at > reward_day_start)
```

Result:

- activation day does not accrue same-day reward when activation happened after `00:00`
- the first reward date is the next Asia/Seoul business day
- the maturity date still accrues when `matures_at > reward_day_start`
- cancel-requested rows still accrue until actual cancel
- replay after later cancellation remains correct because timestamps preserve history

## 4.3 Zero-result rows

- If `daily_reward_base = 0`, no `account_rewards` row is created.
- Reason:
  - avoids noise
  - avoids unnecessary ledger rows
  - does not change future replay results because the formula is deterministic

## 5. Rounding Policy

- Use integer arithmetic only.
- Use floor division.
- No fractional remainder carry table is introduced in V1.
- Any fractional dust below base-unit resolution is discarded per row per day.

### Example

```text
principal_amount_base = 999
daily_interest_bps_snapshot = 1
daily_reward_base = floor(999 * 1 / 10000) = 0
```

## 6. Batch Persistence Model

## 6.1 Chosen model

The batch writes directly to:

1. `calc_runs`
2. `account_rewards`
3. `ledger_events`
4. `admin_audit_log`

`settlement_items` is not required for `DAILY_REWARD` V1.

## 6.2 Why `settlement_items` is not used here

- `DAILY_REWARD` is a high-volume, repeatable operational accrual
- `account_rewards` already captures:
  - per-account detail
  - per-staking detail
  - status
  - availability
  - reversal linkage
  - calc run linkage
- keeping both `settlement_items` and `account_rewards` as primary outputs would duplicate the same detail set

## 7. Calc Run Lifecycle

## 7.1 Reuse of existing `calc_runs`

No `0004` additive column is required.

Existing fields are sufficient:

- `policy_version_id`
- `run_type = DAILY_REWARD`
- `run_date`
- `status`
- `started_at`
- `finished_at`
- `finalized_at`
- `error_message`

## 7.2 Meaning in the daily reward context

- `PENDING`
  - run row created
- `RUNNING`
  - reward rows are being generated
- `SUCCEEDED`
  - all target reward rows and ledger rows for the run were written successfully
- `FAILED`
  - batch stopped and requires retry / investigation
- `FINALIZED`
  - operator-level lock meaning that further mutation for that run must happen by reversal / adjustment only

## 7.3 Duplicate prevention

Duplicate prevention works at three levels:

1. `calc_runs`
   - unique `(policy_version_id, run_type, run_date)`
2. `account_rewards`
   - one daily reward per `(account_staking_id, reward_date)`
3. `ledger_events`
   - unique `reference_id`

## 8. Reference and Ledger Rules

## 8.1 Reward source reference

Daily reward rows use:

```text
reward.daily:<account_staking_id>:<YYYY-MM-DD>
```

Example:

```text
reward.daily:7d2c...:2026-06-19
```

## 8.2 Ledger event reference

Use the same logical key for the financial accrual event:

```text
reward.daily:<account_staking_id>:<YYYY-MM-DD>
```

## 8.3 Ledger event type

- daily accrual uses existing `DAILY_REWARD_ACCRUAL`
- no new ledger enum is required in 0004 for positive accrual

## 8.4 Reversal ledger policy

Recommended V1 choice:

- reversal inserts one `REVERSAL` row in `account_rewards`
- ledger side uses existing `ADJUSTMENT` with negative amount
- metadata must include:
  - `reward_type = REVERSAL`
  - `original_reward_id`
  - `original_source_reference`

Why:

- avoids DB / code enum drift in this design-only phase
- keeps reversal financially explicit
- preserves append-only ledger behavior

## 9. Reward Row Status Policy

## 9.1 Daily reward write mode

For daily reward accrual, V1 writes rows directly as `CONFIRMED`.

Reason:

- the batch appends the financial ledger event in the same persistence flow
- there is no separate operator approval step for each daily reward row

## 9.2 Timestamp policy

- `confirmed_at = batch row creation time`
- `available_at = confirmed_at` in V1
- future withdrawal hold / reservation policies may delay `available_at`

## 10. Transaction Strategy

## 10.1 Recommended approach

- run metadata:
  - short transaction
- reward generation:
  - chunk transaction or staking-level transaction
- each written reward row must commit atomically with its ledger row

## 10.2 Why not one giant transaction

- daily reward can grow with active staking count
- long transactions increase rollback cost and lock duration
- retry is easier when idempotency is handled by unique keys

## 10.3 Partial failure policy

- if one chunk fails:
  - mark `calc_run` as `FAILED`
  - preserve already committed rows
  - retry must be idempotent and skip duplicates via unique keys

## 10.4 Retry policy

- retry uses the same `calc_run_id` after `FAILED -> RUNNING`
- the executor scans all eligible rows again
- already inserted daily reward rows are skipped by:
  - `account_rewards` unique daily reward key
  - `ledger_events.reference_id` unique key

## 11. Recalculation / Replay Policy

## 11.1 Same-date rerun

- a new run for the same `(policy_version_id, DAILY_REWARD, reward_date)` is blocked by `calc_runs` unique key
- replay must reuse the existing run row

## 11.2 Historical replay

- historical replay is allowed only through the existing run or through explicit reversal / adjustment procedures
- once a run is `FINALIZED`, mutation is prohibited except:
  - admin reverse action
  - admin adjustment flow in a separate run

## 12. Performance / Index Usage

## 12.1 Read path

The daily batch will mainly need:

- `account_stakings.started_at`
- `account_stakings.matures_at`
- `account_stakings.account_id, status`
- `account_rewards.account_staking_id, reward_date`
- `ledger_events.reference_id`

## 12.2 Added 0004 indexes

- `account_id, status, reward_date`
- `account_staking_id, reward_date`
- `reward_type, status, reward_date`
- `calc_run_id`
- `available_at, status`
- `created_at`
- `policy_version_id, reward_date`

## 13. Audit Rules

Recommended audit actions:

- `DAILY_REWARD_RUN_CREATE`
- `DAILY_REWARD_RUN_START`
- `DAILY_REWARD_RUN_SUCCEED`
- `DAILY_REWARD_RUN_FAIL`
- `DAILY_REWARD_ROW_REVERSE`

Audit metadata should include:

- `calc_run_id`
- `reward_date`
- `inserted_count`
- `skipped_duplicate_count`
- `failed_account_staking_id` when present

## 14. Operations

## 14.1 Manual execution

Manual operation should support:

- selecting one `policy_version_id`
- selecting one `reward_date`
- dry-run option
- rerun of a failed run

## 14.2 Scheduler

Future scheduler recommendation:

- trigger once per day after Korea midnight
- process `reward_date = yesterday in Asia/Seoul`

## 15. Open Items Deferred To Next Phase

- actual batch service implementation
- dry-run output artifact format
- admin calc UI changes for reward-specific run inspection
- reward withdrawal reservation / deduction tables
- whether reversal ledger event gets its own dedicated enum after implementation begins
