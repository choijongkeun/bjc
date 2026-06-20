# BJC Contribution / Sidecar SQL Review V1

## 1. Review Goal

- verify whether `CONTRIBUTION` / `SIDECAR` runtime requires a new migration
- verify schema coverage for run type, reward type, ledger type, rule table, and duplicate constraints
- document the actual repository-backed SQL outcome for this phase

## 2. Files Reviewed

- `mysql/migrations/0001_bjc_offchain_core_mysql.sql`
- `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
- `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- `mysql/migrations/0007_bjc_rank_bonus_mysql.sql`

## 3. Confirmed Existing Schema Coverage

### 3.1 Contribution

Already present before this phase:

- `contribution_weight_rules`
- `contribution_daily_pools`
- `contribution_rewards`
- `calc_runs.run_type = CONTRIBUTION`
- `settlement_items.settlement_type = CONTRIBUTION`
- `ledger_events.event_type = CONTRIBUTION_BONUS`
- `account_rewards.reward_type = CONTRIBUTION`

Existing duplicate / integrity controls:

- `contribution_weight_rules`
  - unique `(policy_version_id, depth)`
- `contribution_daily_pools`
  - unique `(policy_version_id, pool_date)`
- `contribution_rewards`
  - unique `(calc_run_id, account_id)`
- `account_rewards`
  - unique `(reward_type, source_reference)`
- `ledger_events`
  - unique `reference_id`

### 3.2 Sidecar

Already present before this phase:

- `sidecar_events`
- `calc_runs.run_type = SIDECAR`
- `ledger_events.event_type = WITHDRAWAL_RELEASE`
- `ledger_events.event_type = WITHDRAWAL_FREEZE`
- `account_rewards.reward_type = SIDECAR`

Important design note:

- repository design describes `SIDECAR` as settlement / ledger split, not reward accrual
- therefore the presence of `account_rewards.reward_type = SIDECAR` in enum coverage does not imply mandatory runtime insertion

## 4. Migration Decision

- New migration was **not** required.
- `mysql/migrations/0008_bjc_contribution_sidecar_mysql.sql` was therefore **not created**.
- No schema rewrite, trigger, procedure, or data delete was needed.

## 5. Repository Fixes Made Without Migration

### 5.1 Contribution daily pool snapshot

The existing table requires:

```sql
total_withdrawal_amount_base decimal(65,0) not null
```

The runtime repository wiring initially omitted this field during insert.

Shipped fix in this phase:

- `src/repos/contributionMetricsRepo.ts`
  - now inserts `total_withdrawal_amount_base`
  - now reads it back in `getContributionDailyPoolByDate()`
- `src/services/contributionRewardService.ts`
  - now stores the total withdrawal snapshot in `contribution_daily_pools`
  - now includes the field in conflict comparison

This was an application-level fix only; no SQL migration was necessary.

### 5.2 Calc-run report aggregation

The admin calc-run report query previously over-counted runs when multiple admin audit rows existed for the same `calc_run_id`.

Shipped fix:

- `src/repos/reportsRepo.ts`
  - aggregates audit metrics per `target_id`
  - counts distinct calc runs per run type

This was also repository/query wiring only; no schema change was necessary.

## 6. SQL Smoke Outcome in This Phase

Operational smoke coverage executed against the running API:

- `npm run smoke:contribution`
- `npm run smoke:sidecar`
- `npm run smoke:all`

Verified by those smoke runs:

- `CONTRIBUTION` pool / reward insert path works with current schema
- `CONTRIBUTION` reward row, ledger row, calc-run summary, report, CSV path work
- `SIDECAR` release / freeze ledger split works with current schema
- `SIDECAR` calc-run summary and calc-run CSV/report path work
- `product_id = null` is safe for sidecar release/freeze ledger rows
- fixture cleanup leaves no policy-scoped test rows

## 7. Remaining SQL-Level Non-Goals

Not implemented in this phase:

- automatic sidecar recovery / unfreeze SQL flow
- scheduler-driven recurring calc execution
- undocumented strong-leg cap or carry-over columns
- undocumented fixed payout amount columns
