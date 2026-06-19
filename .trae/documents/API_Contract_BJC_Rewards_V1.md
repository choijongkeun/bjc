# API Contract: BJC Rewards V1

## 1. Scope

- This document defines the planned V1 contract for reward ledger, reward summary, and daily reward batch APIs.
- Reward repo/service, daily reward batch, and User/Admin reward APIs are implemented in the API server.
- Reward UI screens, withdrawal flows, and scheduler automation remain out of scope in this phase.
- All amount fields sourced from `DECIMAL(65,0)` remain string values in API responses and request bodies.

## 2. Source of Truth

- `account_rewards` is the reward domain source of truth.
- `ledger_events` is the append-only financial audit ledger.
- `calc_runs` is the execution / traceability source of truth for batch jobs.
- `settlement_items` remains available for existing calc flows, but `DAILY_REWARD` batch does not require it in V1.

## 3. Shared Domain Rules

### 3.1 Reward row lifecycle

- `PENDING`
  - reward row exists
  - not financially confirmed yet
  - `confirmed_at = null`
- `CONFIRMED`
  - reward row is financially posted or approved
  - `confirmed_at != null`
- `REVERSED`
  - original reward row was reversed
  - a separate `REVERSAL` row must exist

### 3.2 Reward types

- `DAILY_REWARD`
- `DIRECT_REFERRAL`
- `RANK_BONUS`
- `CONTRIBUTION`
- `WITHDRAWAL_FEE`
- `SIDECAR`
- `ADJUSTMENT`
- `REVERSAL`

### 3.3 Reversal rules

- Original reward row:
  - keeps the original positive `amount_base`
  - transitions to `status = REVERSED`
  - stores `reversed_at`
- Reversal row:
  - `reward_type = REVERSAL`
  - negative `amount_base`
  - `reversal_reward_id = original_reward.id`
  - own `source_reference = reward.reversal:<original_reward_id>`
- One original reward row may have only one reversal row.

### 3.4 Amount / precision rules

- JavaScript `Number`, `parseInt`, and `parseFloat` must not be used for reward amounts.
- Internal calculation must use `BigInt` or MySQL `DECIMAL`.
- Daily reward denominator is `10000`.
- Example:

```text
daily_reward_base = floor(principal_amount_base * daily_interest_bps_snapshot / 10000)
```

### 3.5 Reward availability rules

- `confirmed_reward_base`
  - net sum of `account_rewards.amount_base` where `status = CONFIRMED`
- `pending_reward_base`
  - net sum where `status = PENDING`
- `withdrawable_reward_base`
  - confirmed rows whose `available_at <= now`
  - reduced later by reward-withdrawal reservation / withdrawal models
- `withdrawn_reward_base`
  - future withdrawal-domain aggregate
  - not derivable from `account_rewards` alone until reward withdrawal tables / mappings exist

## 4. Auth / Role Rules

- User reward read APIs:
  - require bearer session auth
  - owner scope only
- Admin reward read APIs:
  - allow `READER` and `ADMIN`
- Admin reward mutate / batch APIs:
  - allow `ADMIN` only
- `USER` cannot access admin reward routes.

## 5. Planned User APIs

## 5.1 GET `/api/me/rewards`

- Purpose:
  - list reward ledger rows for the current member
- Auth:
  - bearer token required
- Query:
  - `reward_type`
  - `status`
  - `staking_id`
  - `reward_date_from`
  - `reward_date_to`
  - `page`
  - `limit`
  - `sort`
- Sort values:
  - `reward_date_desc`
  - `reward_date_asc`
  - `created_at_desc`
  - `created_at_asc`
- Response:

```json
{
  "items": [
    {
      "id": "string",
      "account_id": "string",
      "account_staking_id": "string or null",
      "policy_version_id": "string",
      "calc_run_id": "string or null",
      "reward_type": "DAILY_REWARD",
      "reward_date": "2026-06-19",
      "amount_base": "5",
      "status": "CONFIRMED",
      "source_reference": "reward.daily:staking-id:2026-06-19",
      "source_ledger_event_id": "string or null",
      "reversal_reward_id": null,
      "available_at": "2026-06-19T00:05:00.000Z",
      "confirmed_at": "2026-06-19T00:05:00.000Z",
      "reversed_at": null,
      "created_at": "2026-06-19T00:05:00.000Z",
      "updated_at": "2026-06-19T00:05:00.000Z",
      "staking": {
        "id": "string",
        "principal_amount_base": "1000",
        "daily_interest_bps_snapshot": "50",
        "duration_days_snapshot": 30,
        "status": "ACTIVE"
      },
      "product": {
        "id": "string",
        "name": "BJC 30D",
        "symbol": "USDC",
        "decimals": 6
      }
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 1
}
```

### Error codes

- `400`
  - invalid filter or pagination value
- `401`
  - missing or invalid bearer token
- `403`
  - blocked / withdrawn account

## 5.2 GET `/api/me/rewards/summary`

- Purpose:
  - reward summary cards for User rewards page and dashboard
- Auth:
  - bearer token required
- Response:

```json
{
  "pending_reward_amount_base": "0",
  "confirmed_reward_amount_base": "1200",
  "withdrawable_reward_amount_base": "1200",
  "withdrawn_reward_amount_base": "0",
  "daily_reward_amount_base": "1200",
  "reward_count": 3
}
```

## 5.3 GET `/api/me/rewards/:rewardId`

- Purpose:
  - reward detail for one row
- Auth:
  - bearer token required
- Ownership:
  - foreign reward rows are hidden behind `404`
- Response:
  - same reward object as list item, with optional related reward info:
    - original reward when the row is a reversal
    - reversal reward when the row has already been reversed

## 5.4 GET `/api/me/stakings/:stakingId/rewards`

- Purpose:
  - reward history for one staking contract
- Auth:
  - bearer token required
- Ownership:
  - foreign staking rows are hidden behind `404`
- Query:
  - `status`
  - `reward_date_from`
  - `reward_date_to`
  - `page`
  - `limit`
- Response:
  - same pagination envelope as `GET /api/me/rewards`

## 6. Planned Admin APIs

## 6.1 GET `/api/admin/rewards`

- Auth:
  - `READER` or `ADMIN`
- Filters:
  - `q`
  - `account_id`
  - `account_staking_id`
  - `policy_version_id`
  - `calc_run_id`
  - `reward_type`
  - `status`
  - `reward_date_from`
  - `reward_date_to`
  - `available_before`
  - `available_after`
  - `page`
  - `limit`
  - `sort`
- Sort values:
  - `reward_date_desc`
  - `reward_date_asc`
  - `created_at_desc`
  - `created_at_asc`
  - `available_at_asc`
  - `available_at_desc`

## 6.2 GET `/api/admin/rewards/:rewardId`

- Auth:
  - `READER` or `ADMIN`
- Includes:
  - reward row
  - related account summary
  - related staking summary when present
  - related calc run summary when present
  - related ledger event summary when present

## 6.3 GET `/api/admin/accounts/:accountId/rewards`

- Auth:
  - `READER` or `ADMIN`
- Filters:
  - same reward list filters except `account_id`
- Returns `404` when target account does not exist.

## 6.4 POST `/api/admin/rewards/:rewardId/reverse`

- Auth:
  - `ADMIN`
- Request:

```json
{
  "reason": "required string"
}
```

- Rules:
  - only original rows may be reversed
  - original row must be `CONFIRMED`
  - original row must not be `REVERSAL`
  - reversal creates:
    - original row status update -> `REVERSED`
    - one new `REVERSAL` row
    - one `ADJUSTMENT` ledger entry with negative amount
    - admin audit row
- Errors:
  - `404` reward row missing
  - `409` already reversed
  - `422` not reversible by policy

## 6.5 POST `/api/admin/calc-runs/daily-reward`

- Auth:
  - `ADMIN`
- Purpose:
  - create or trigger one `DAILY_REWARD` calc run for one `reward_date`
- Request:

```json
{
  "policy_version_id": "string",
  "reward_date": "2026-06-19"
}
```

- Rules:
  - same `(policy_version_id, run_type='DAILY_REWARD', run_date)` must be unique
  - `SUCCEEDED` or `FINALIZED` rerun returns `409`
  - `FAILED` run is retried with the same `calc_run_id`
  - `available_at = confirmed_at` for created daily reward rows in V1

## 6.6 GET `/api/admin/calc-runs/:id/rewards`

- Auth:
  - `READER` or `ADMIN`
- Purpose:
  - inspect reward rows produced by one calc run
- Query:
  - `status`
  - `reward_type`
  - `page`
  - `limit`
  - `sort`

## 7. Dashboard Summary Contracts

## 7.1 Recommended split

- `GET /api/me/stakings/summary`
- `GET /api/me/rewards/summary`

- Reason:
  - domain ownership is clearer
  - dashboard can fetch both in parallel
  - reward evolution will not force staking summary changes

## 7.2 Optional aggregator

- `GET /api/me/dashboard-summary`
- This is optional and may internally compose domain summaries later.

## 7.3 Planned staking summary shape

```json
{
  "pending_count": 1,
  "active_count": 4,
  "cancel_requested_count": 1,
  "cancelled_count": 1,
  "matured_count": 1,
  "closed_count": 1,
  "active_principal_amount_base": "4000000",
  "pending_principal_amount_base": "500000"
}
```

## 7.4 Planned reward summary shape

```json
{
  "pending_reward_amount_base": "0",
  "confirmed_reward_amount_base": "1200",
  "withdrawable_reward_amount_base": "1200",
  "withdrawn_reward_amount_base": "0",
  "daily_reward_amount_base": "1200",
  "reward_count": 3
}
```

## 8. Sensitive Data Rules

- Reward APIs must not expose:
  - password / password hash
  - session token / session token hash
  - DB connection details
  - raw internal SQL errors
- `metadata_json` must not store credentials or session tokens.
- Amounts must remain strings.

## 9. Audit Rules

- Planned audit actions:
  - `ADMIN_DAILY_REWARD_RUN`
  - `ADMIN_REWARD_REVERSE`
- Audit metadata should contain:
  - `reward_id`
  - `calc_run_id`
  - `reward_date`
  - `source_reference`
  - minimal reason fields

## 10. Implemented / Deferred

- Implemented:
  - reward repo/service implementation
  - reward API routes
  - actual daily reward batch runner
  - reward/staking summary APIs
  - reward reversal flow
- Deferred:
  - reward front screens
  - reward withdrawal flows
  - reward reservation / withdrawal deduction tables
  - scheduler / cron automation
