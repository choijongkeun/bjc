# API Contract: BJC Contribution / Sidecar V1

## 1. Scope

- This document describes the implemented contract for `CONTRIBUTION` and `SIDECAR` runtime and read APIs in the current repository state.
- All DECIMAL/base-amount fields are returned as strings.
- Internal math remains `BigInt` / MySQL `DECIMAL` based.

## 2. Shared Rules

### 2.1 Auth

- admin read APIs:
  - `READER` or `ADMIN`
- admin execution APIs:
  - `ADMIN` only
- user read APIs:
  - existing authenticated `/api/me/*` endpoints only

### 2.2 Idempotency

- duplicate key is driven by deterministic `source_reference`
- identical snapshot:
  - `duplicate`
- mismatched snapshot:
  - `conflict`
- per-account failure increments `failed_count`
- rule / policy precondition error fails the whole calc run

## 3. Contribution Contract

### 3.1 Rule Source

- `contribution_weight_rules`
- input facts from `ledger_events.event_type = WITHDRAWAL_REQUEST`
- referral scope from `referral_edges.depth between 1 and 45`

### 3.2 Formula

```text
pool_amount_base = floor(total_withdrawal_amount_base * 2000 / 10000)
depth_score_base = floor(depth_volume_base * weight_bps / 10000)
account_score = sum(depth_score_base)
reward_amount_base = floor(pool_amount_base * account_score / total_score)
```

### 3.3 Runtime Outputs

- `contribution_daily_pools`
- `contribution_rewards`
- `settlement_items.settlement_type = CONTRIBUTION`
- `ledger_events.event_type = CONTRIBUTION_BONUS`
- `account_rewards.reward_type = CONTRIBUTION`

### 3.4 Batch API

`POST /api/admin/rewards/contribution/run`

Request:

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30"
}
```

Response:

```json
{
  "calc_run_id": "uuid",
  "target_count": 1,
  "created_count": 1,
  "zero_base_skip_count": 0,
  "zero_reward_skip_count": 0,
  "ineligible_skip_count": 0,
  "duplicate_skip_count": 0,
  "conflict_count": 0,
  "failed_count": 0,
  "total_base_amount_base": "1500",
  "total_reward_amount_base": "300",
  "pool_amount_base": "300",
  "total_score": "1250",
  "status": "SUCCEEDED"
}
```

### 3.5 Single Account API

`POST /api/admin/accounts/:accountId/contribution`

Request:

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30"
}
```

Response example:

```json
{
  "calc_run_id": "uuid",
  "status": "SUCCEEDED",
  "result_type": "duplicate",
  "reward_id": null,
  "existing_reward_id": "uuid",
  "base_amount_base": "1500",
  "reward_amount_base": "300",
  "pool_amount_base": "300",
  "total_score": "1250"
}
```

### 3.6 Source Reference

```text
calc:CONTRIBUTION:<calculation_date>:acct:<account_id>
```

### 3.7 User/Admin Read Path

- `GET /api/me/rewards`
- `GET /api/me/rewards/:rewardId`
- `GET /api/me/rewards/summary`
- `GET /api/admin/rewards`
- `GET /api/admin/rewards/:rewardId`
- `GET /api/admin/accounts/:accountId/rewards`
- `GET /api/admin/calc-runs/:calcRunId/rewards`
- `GET /api/admin/calc-runs/:calcRunId/summary`

Current V1 behavior:

- `CONTRIBUTION` is included in BONUS reward summary
- `CONTRIBUTION` is included in BONUS withdrawal availability

## 4. Sidecar Contract

### 4.1 Rule Source

- latest `sidecar_events` for the given policy
- input facts from `ledger_events.event_type = WITHDRAWAL_REQUEST`

### 4.2 Formula

```text
release_amount_base = floor(requested_amount_base * release_bps / 10000)
freeze_amount_base = requested_amount_base - release_amount_base
```

### 4.3 Runtime Outputs

- `settlement_items.settlement_type = WITHDRAWAL_RELEASE`
- `settlement_items.settlement_type = WITHDRAWAL_FREEZE`
- `ledger_events.event_type = WITHDRAWAL_RELEASE`
- `ledger_events.event_type = WITHDRAWAL_FREEZE`
- `ledger_events.product_id = null`

### 4.4 Batch API

`POST /api/admin/rewards/sidecar/run`

Request:

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30"
}
```

Response:

```json
{
  "calc_run_id": "uuid",
  "target_count": 1,
  "created_count": 1,
  "zero_base_skip_count": 0,
  "ineligible_skip_count": 0,
  "duplicate_skip_count": 0,
  "conflict_count": 0,
  "failed_count": 0,
  "total_requested_amount_base": "1000",
  "total_release_amount_base": "700",
  "total_freeze_amount_base": "300",
  "sidecar_status": "SIDECAR_ACTIVE",
  "status": "SUCCEEDED"
}
```

### 4.5 Single Account API

`POST /api/admin/accounts/:accountId/sidecar`

Request:

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30"
}
```

Response example:

```json
{
  "calc_run_id": "uuid",
  "status": "SUCCEEDED",
  "result_type": "duplicate",
  "target_count": 1,
  "created_count": 1,
  "duplicate_skip_count": 0,
  "conflict_count": 0,
  "zero_base_skip_count": 0,
  "total_requested_amount_base": "1000",
  "total_release_amount_base": "700",
  "total_freeze_amount_base": "300",
  "sidecar_status": "SIDECAR_ACTIVE"
}
```

### 4.6 Source References

```text
calc:SIDECAR:<calculation_date>:<calc_run_id>:release:<withdrawal_ref>
calc:SIDECAR:<calculation_date>:<calc_run_id>:freeze:<withdrawal_ref>
```

### 4.7 Explicit Limitation

- current repository design basis defines `SIDECAR` as withdrawal split settlement
- current V1 runtime therefore does not create `account_rewards.reward_type = SIDECAR` rows
- admin reward filters already accept `SIDECAR` as enum input, but current runtime returns no reward rows for that type
- BONUS summary and BONUS withdrawal balance remain driven by actual `account_rewards` facts only

## 5. Reports / CSV

Implemented:

- `GET /api/admin/reports/reward-summary`
- `GET /api/admin/reports/reward-by-type`
- `GET /api/admin/reports/calc-run-summary`
- `GET /api/admin/reports/rewards.csv`
- `GET /api/admin/reports/calc-runs.csv`

CSV rules:

- amount fields stay as raw string values
- `product_id` null is serialized safely
- reward metadata is sanitized before CSV output
- secrets and raw credential fields are not exported
