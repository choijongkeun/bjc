# API Contract: BJC Direct Referral Reward V1

## 1. Scope

- This document defines the planned V1 contract for direct referral reward calculation and inspection APIs.
- This phase does not implement the runtime service or routes.
- The contract is intended to guide the later implementation of the admin execution flow and reuse of existing reward read APIs.
- All amount fields sourced from `DECIMAL(65,0)` remain string values in request and response bodies.

## 2. Source of Truth

- policy rules:
  - `referral_bonus_rules`
- source staking lifecycle:
  - `account_stakings`
  - `ledger_events.event_type = STAKING_ACTIVATED`
- reward facts:
  - `account_rewards`
- financial audit facts:
  - `ledger_events`
- batch execution facts:
  - `calc_runs`

## 3. Shared Domain Rules

### 3.1 Beneficiary resolution

```text
source staking owner
-> accounts.sponsor_account_id
```

Rules:

- use sponsor lineage only
- do not use binary parent lineage
- `referral_edges.depth = 1` may be used for verification only

### 3.2 Trigger timing

- reward source becomes eligible when:

```text
account_stakings.status
PENDING -> ACTIVE
```

- V1 contract assumes a separate `DIRECT_REFERRAL` batch execution after activation, not immediate reward creation inside staking activation.

### 3.3 Formula

```text
reward_amount_base
= floor(principal_amount_base * bonus_bps / 10000)
```

Rules:

- amount math uses `BigInt` or MySQL `DECIMAL`
- float math is forbidden
- zero result means no reward row is created

### 3.4 Reward storage rules

For `DIRECT_REFERRAL`:

- `account_id`
  - sponsor account ID
- `account_staking_id`
  - `null`
- `source_account_id`
  - referred member account ID
- `source_account_staking_id`
  - source staking ID
- `reward_type`
  - `DIRECT_REFERRAL`
- `source_reference`
  - `direct_referral:<source_staking_id>:<sponsor_account_id>`

### 3.5 Idempotency rules

- the same source staking and same sponsor may create at most one direct referral reward
- primary uniqueness:
  - `reward_type + source_reference`
- secondary uniqueness:
  - generated direct referral dedupe key from `source_account_staking_id + account_id`
- rerun behavior:
  - existing identical row -> `duplicate_skip_count += 1`
  - existing conflicting row -> `409` or explicit audit conflict handling

## 4. Auth and Role Rules

- admin read APIs:
  - `READER` or `ADMIN`
- admin execution APIs:
  - `ADMIN` only
- user read APIs:
  - reuse existing authenticated reward endpoints
- `USER` cannot trigger calc runs

## 5. Planned Admin Execution APIs

## 5.1 POST `/api/admin/rewards/direct-referral/run`

- Purpose:
  - execute a batch `DIRECT_REFERRAL` calc run for a policy and activation window
- Auth:
  - `ADMIN`

### Request

```json
{
  "policy_version_id": "uuid",
  "activated_from": "2026-06-01",
  "activated_to": "2026-06-19",
  "staking_ids": ["optional-source-staking-id"]
}
```

Rules:

- `policy_version_id` is required
- at least one targeting method is required:
  - activation window
  - explicit `staking_ids`
- when `staking_ids` is omitted, the service scans activated source stakings in the requested window
- the run uses `calc_runs.run_type = 'DIRECT_REFERRAL'`

### Response

```json
{
  "calc_run": {
    "id": "uuid",
    "policy_version_id": "uuid",
    "run_type": "DIRECT_REFERRAL",
    "run_date": "2026-06-19",
    "status": "SUCCEEDED",
    "started_at": "2026-06-19T00:00:00.000Z",
    "finished_at": "2026-06-19T00:00:10.000Z",
    "finalized_at": null,
    "error_message": null
  },
  "target_count": 10,
  "created_count": 7,
  "no_sponsor_skip_count": 1,
  "inactive_sponsor_skip_count": 1,
  "non_user_sponsor_skip_count": 0,
  "zero_reward_skip_count": 0,
  "duplicate_skip_count": 1,
  "failed_count": 0,
  "total_reward_amount_base": "1050000"
}
```

### Errors

- `400`
  - invalid request body
  - invalid date format
  - missing targeting condition
- `403`
  - actor is not `ADMIN`
- `404`
  - policy version missing
- `409`
  - same completed run already exists
  - existing conflicting reward row detected during rerun
- `422`
  - policy or source data invalid for execution
- `500`
  - unexpected execution failure

## 5.2 POST `/api/admin/stakings/:stakingId/direct-referral-calculate`

- Purpose:
  - execute direct referral calculation for one source staking only
- Auth:
  - `ADMIN`

### Request

```json
{
  "policy_version_id": "uuid"
}
```

### Response

Same response envelope as the batch endpoint, but:

- `target_count` is `0` or `1`
- the execution target is the given staking only

### Errors

- `404`
  - staking missing
  - policy version missing
- `409`
  - duplicate or conflicting reward already exists
- `422`
  - staking is not eligible for direct referral calculation

## 6. Planned Admin Read APIs

### 6.1 Reuse existing calc-run reward inspection

Reuse:

- `GET /api/admin/calc-runs/:calcRunId/rewards`

Recommended behavior:

- support `reward_type=DIRECT_REFERRAL`
- include source member summary and source staking summary when available

### 6.2 Reuse existing reward list APIs

Reuse:

- `GET /api/admin/rewards`
- `GET /api/admin/rewards/:rewardId`
- `GET /api/admin/accounts/:accountId/rewards`

Recommended filter additions for the future implementation:

- `source_account_id`
- `source_staking_id`

## 7. User Read APIs

Reuse:

- `GET /api/me/rewards`
- `GET /api/me/rewards/:rewardId`

Expected `DIRECT_REFERRAL` list/detail behavior:

- reward row appears in the existing reward timeline
- user-visible metadata remains minimal
- internal IDs are not overexposed

Recommended user metadata shape:

```json
{
  "source_display_name": "member name",
  "principal_amount_base": "1000000",
  "direct_referral_rate_bps": "1500"
}
```

## 8. Reward Detail Shape

Recommended `DIRECT_REFERRAL` reward response additions:

```json
{
  "id": "uuid",
  "account_id": "sponsor-account-id",
  "account_staking_id": null,
  "source_account_id": "referred-account-id",
  "source_account_staking_id": "source-staking-id",
  "policy_version_id": "uuid",
  "calc_run_id": "uuid",
  "reward_type": "DIRECT_REFERRAL",
  "reward_date": "2026-06-19",
  "amount_base": "150000",
  "status": "CONFIRMED",
  "source_reference": "direct_referral:source-staking-id:sponsor-account-id",
  "available_at": "2026-06-19T00:00:00.000Z",
  "confirmed_at": "2026-06-19T00:00:00.000Z",
  "metadata": {
    "principal_amount_base": "1000000",
    "direct_referral_rate_bps": "1500",
    "source_display_name": "member name"
  },
  "source_account": {
    "id": "referred-account-id",
    "display_name": "member name"
  },
  "source_staking": {
    "id": "source-staking-id",
    "principal_amount_base": "1000000",
    "status": "ACTIVE"
  },
  "calc_run": {
    "id": "uuid",
    "status": "SUCCEEDED",
    "run_type": "DIRECT_REFERRAL",
    "run_date": "2026-06-19"
  }
}
```

## 9. Ledger Contract

For each created direct referral reward, create one ledger event in the same transaction.

Required fields:

- `event_type`
  - `DIRECT_REFERRAL_BONUS`
- `account_id`
  - sponsor
- `related_account_id`
  - referred member
- `product_id`
  - source staking product
- `policy_version_id`
  - reward snapshot policy version
- `calc_run_id`
  - producing run ID
- `reference_id`
  - same as reward `source_reference`
- `amount_base`
  - positive reward amount

## 10. State and Status Rules

- created direct referral rewards are expected to be stored as `CONFIRMED` in V1
- `available_at = confirmed_at` is the current recommended behavior unless later policy introduces a holding delay
- reward rows participate in the existing reward summary and withdrawal bucket logic as `BONUS`

## 11. Reversal Scope

Not included in V1 implementation contract:

- automatic reversal on source staking cancellation
- special reversal endpoint for direct referral only
- withdrawal-aware reversal settlement rules

If reversal is later required, it should reuse the existing append-only reward reversal pattern and must explicitly define:

- source staking cancellation rule
- already reserved/withdrawn reward handling
- admin-only exception flow

## 12. Sensitive Data Rules

- do not expose:
  - password or password hash
  - session token or session hash
  - DB connection details
  - raw SQL error text
- keep all amount fields as strings
- keep internal source IDs out of broad user list payloads unless needed for a detail page

## 13. Implementation Notes

- implementation should follow the batch pattern proven by `dailyRewardService`
- source query should be based on activated staking rows, not raw binary structure
- duplicate detection must happen before insert and be reinforced by DB constraints
- reward and ledger writes must be in one transaction

## 14. Deferred Items

- runtime service implementation
- route wiring
- response DTO wiring for source account and source staking
- admin button/UI work
- user display refinements
- reversal automation
