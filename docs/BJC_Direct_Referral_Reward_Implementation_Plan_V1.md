# BJC Direct Referral Reward Implementation Plan V1

## 1. Goal

- Define the V1 direct referral reward policy and execution design on top of the already completed member, staking, reward, withdrawal, and User/Admin foundations.
- Keep this phase limited to design, migration, SQL smoke, and API contract work.
- Do not implement the actual direct referral service, API handler, or User/Admin UI in this phase.

## 2. Scope

Included in this phase:

- policy analysis from the current repository materials
- sponsor and referral source analysis
- reward trigger timing decision
- duplicate prevention design
- reward source tracking design
- `calc_runs` execution design for `DIRECT_REFERRAL`
- additive migration draft
- SQL smoke draft
- API contract draft

Excluded from this phase:

- `DIRECT_REFERRAL` runtime service implementation
- `DIRECT_REFERRAL` API route implementation
- User/Admin new screens
- `RANK_BONUS`
- `CONTRIBUTION`
- `SIDECAR`
- binary matching payout
- actual wallet transfer

## 3. Source Analysis

### 3.1 Files reviewed

- local migration files:
  - `mysql/migrations/0001_bjc_offchain_core_mysql.sql`
  - `mysql/migrations/0003_bjc_account_stakings_mysql.sql`
  - `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
  - `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- current services:
  - `src/services/accountStakingService.ts`
  - `src/services/dailyRewardService.ts`
  - `src/services/accountRewardService.ts`
- current repositories:
  - `src/repos/accountRewardsRepo.ts`
- existing design documents:
  - `.trae/documents/BJC_Calculation_Engine_Design_V1.md`
  - `.trae/documents/BJC_Member_Referral_Binary_Leg_Design_V1.md`
  - `.trae/documents/BJC_Reward_Withdrawal_Implementation_Plan_V1.md`
  - `.trae/documents/API_Contract_BJC_Rewards_V1.md`

### 3.2 Missing original materials

- The repository does not currently contain:
  - `BJC-디파이플랜.xlsx`
  - `BJC-디파이플랜해설.xlsx`
  - `BJC-608.pptx`
- Therefore this plan uses the repository-contained BJC design documents and schema as the only verifiable source in this session.

## 4. Confirmed Policy

The following points are confirmed from repository materials:

- reward type already exists:
  - `account_rewards.reward_type = 'DIRECT_REFERRAL'`
- batch type already exists:
  - `calc_runs.run_type = 'DIRECT_REFERRAL'`
- ledger event already exists:
  - `ledger_events.event_type = 'DIRECT_REFERRAL_BONUS'`
- policy table already exists:
  - `referral_bonus_rules(policy_version_id, depth, bonus_bps, is_active)`
- referral basis is sponsor lineage, not binary lineage:
  - primary source = `accounts.sponsor_account_id`
  - verification source = `referral_edges.depth = 1`
- repository design documents state the business sentence:
  - when a directly referred member purchases a staking package, the sponsor receives `15%` of the staking amount
- repository design documents also align the rule with:
  - `referral_bonus_rules.depth = 1`
  - `bonus_bps = 1500`

## 5. Unconfirmed Policy

The following points are not fully confirmed by the repository materials and must remain policy-open:

- whether `BLOCKED` sponsor should always be excluded
- whether reward is created immediately as `CONFIRMED` or starts as `PENDING`
- whether a later `ACTIVE -> CANCELLED` source staking should reverse an already confirmed direct referral reward
- whether policy will later add:
  - minimum staking amount
  - maximum reward amount
  - limited claim window
  - repeated payout rules
- whether sponsor change after member signup is operationally allowed and, if so, how already created rewards should be handled

V1 design decision for this phase:

- do not auto-implement reversal
- do not add min/max rule columns yet
- do not assume sponsor reassignment support

## 6. Sponsor Rule

The reward beneficiary is determined by:

```text
account_stakings.account_id
-> accounts.sponsor_account_id
```

Rules:

- `binary_parent_account_id` must not be used
- `referral_edges.depth = 1` may be used as consistency verification only
- if sponsor is missing, the source staking is skipped
- self-sponsor is already prevented by `accounts` table check constraints

### 6.1 Recommended beneficiary eligibility

- sponsor exists
- sponsor `role = USER`
- sponsor `status = ACTIVE`
- sponsor is not the same account as the staking owner

### 6.2 Conservative skip buckets

- `no_sponsor`
- `inactive_sponsor`
- `non_user_sponsor`
- `self_sponsor_conflict`

## 7. Reward Trigger Timing

### 7.1 Recommended source event

Use the staking lifecycle transition:

```text
account_stakings.status
PENDING -> ACTIVE
```

Reason:

- `PENDING` is not financially final
- admin activation already creates authoritative lifecycle ledger events
- source staking ID and activation time are both available
- later recovery and re-run are easier than on-request reward creation

### 7.2 Final decision

Choose:

- record the eligible source when staking activation succeeds
- calculate reward in a separate `DIRECT_REFERRAL` calc run

Why this is preferred over immediate in-transaction creation:

- keeps `activateAdminStaking()` focused on staking lifecycle integrity
- avoids coupling staking activation to reward policy engine failures
- matches the batch auditability pattern already used by `dailyRewardService`
- allows retry with idempotent duplicate detection

## 8. Calculation Formula

### 8.1 Source amount

Use:

```text
account_stakings.principal_amount_base
```

### 8.2 Formula

```text
reward_amount_base
= floor(principal_amount_base * bonus_bps / 10000)
```

Rules:

- all DB amounts remain `DECIMAL(65,0)` string values
- runtime math must use `BigInt`
- `Number`, `parseInt`, and `parseFloat` must not be used
- zero result means no reward row is created

### 8.3 V1 policy depth

- V1 uses `referral_bonus_rules.depth = 1` only
- deeper referral levels remain out of scope for this phase

## 9. Policy Table Decision

### 9.1 Reuse decision

Reuse `referral_bonus_rules` instead of creating `direct_referral_reward_rules`.

Reason:

- the table already maps directly to the needed rule:
  - `policy_version_id`
  - `depth`
  - `bonus_bps`
  - `is_active`
- current repository policy evidence only needs a depth-based bps rate
- no verified evidence currently requires min/max columns

### 9.2 0006 adjustment

The `0006` migration strengthens reuse by:

- adding `updated_at`
- adding upper-bound validation:
  - `bonus_bps <= 10000`

Deferred:

- `minimum_staking_amount_base`
- `maximum_reward_amount_base`

## 10. Reward Storage Design

### 10.1 Existing issue

`account_rewards.account_staking_id` is currently treated in nearby code as if it points to the reward receiver's staking.

That assumption is safe for:

- `DAILY_REWARD`
- current reversal flow

It is not safe for `DIRECT_REFERRAL`, because:

- reward receiver = sponsor
- source staking owner = referred member

### 10.2 Chosen solution

Do not overload `account_staking_id` for direct referral.

Use:

- `account_id`
  - sponsor account ID
- `account_staking_id`
  - `null` for `DIRECT_REFERRAL`
- `source_account_id`
  - referred member account ID
- `source_account_staking_id`
  - source staking ID

### 10.3 Snapshot policy

Keep operational snapshot data in `metadata_json`:

- `policy_version_id`
- `source_account_id`
- `source_staking_id`
- `principal_amount_base`
- `direct_referral_rate_bps`
- `sponsor_account_id`
- `source_activation_reference`
- `calculation_formula_version`

User exposure should stay minimal:

- source display information
- principal amount
- applied direct referral rate

## 11. Duplicate Prevention

### 11.1 Source reference

Use:

```text
direct_referral:<source_staking_id>:<sponsor_account_id>
```

### 11.2 DB-level dedupe

Keep existing:

- `unique (reward_type, source_reference)`

Add in `0006`:

- generated key:

```text
direct_referral_dedupe_key
= <source_account_staking_id>:<account_id>
```

- unique index on `direct_referral_dedupe_key`

### 11.3 Re-run policy

- if the same source staking and sponsor pair already produced a reward, count it as `duplicate_skip`
- if the row exists but key snapshot does not match the expected policy snapshot, treat it as a conflict and audit case
- do not silently overwrite an existing reward

## 12. Calc Run Design

### 12.1 Run type

Reuse existing:

```text
calc_runs.run_type = DIRECT_REFERRAL
```

### 12.2 Execution unit

Primary:

- batch run by activation window

Optional operator helper:

- single staking run for one source staking

### 12.3 Recommended request shapes

Batch:

```json
{
  "policy_version_id": "uuid",
  "activated_from": "2026-06-01",
  "activated_to": "2026-06-19"
}
```

Single staking:

```json
{
  "policy_version_id": "uuid"
}
```

### 12.4 Recommended response fields

- `calc_run_id`
- `target_count`
- `created_count`
- `no_sponsor_skip_count`
- `inactive_sponsor_skip_count`
- `non_user_sponsor_skip_count`
- `zero_reward_skip_count`
- `duplicate_skip_count`
- `failed_count`
- `total_reward_amount_base`
- `status`

### 12.5 Runtime pattern

Mirror `dailyRewardService`:

- short transaction for `calc_run` state transition
- paged source staking scan
- one short transaction per reward creation
- `reward + ledger + reward.source_ledger_event_id` in one transaction
- partial success allowed with final run status:
  - `SUCCEEDED`
  - `FAILED`

## 13. Ledger Integration

Reuse:

```text
ledger_events.event_type = DIRECT_REFERRAL_BONUS
```

Recommended ledger mapping:

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
- `amount_base`
  - reward amount
- `reference_id`
  - same as reward `source_reference`
- `meta`
  - limited snapshot only

## 14. Reversal Policy

Current recommendation:

- reversal remains unimplemented in V1
- automatic reversal on source staking cancellation is explicitly deferred

Open decision items:

- if `ACTIVE -> CANCELLED` after reward creation, should the reward remain or reverse
- if the reward was already reserved or withdrawn, how should reversal interact with withdrawal tables
- whether reversal should be:
  - a negative `REVERSAL` reward row
  - an `ADJUSTMENT`
  - a blocked admin-only exception flow

## 15. Migration Summary

New migration:

- `mysql/migrations/0006_bjc_direct_referral_rewards_mysql.sql`

Contents:

- `referral_bonus_rules.updated_at`
- `referral_bonus_rules.bonus_bps <= 10000` check
- `account_rewards.source_account_id`
- `account_rewards.source_account_staking_id`
- direct referral generated dedupe key and unique index
- source tracking foreign keys, checks, and indexes

Not changed:

- `calc_runs`
- `ledger_events`
- `reward_withdrawals`
- `withdrawal_fee_rules`

## 16. SQL Smoke Summary

New smoke file:

- `mysql/smoke/bjc_direct_referral_rewards_smoketest.sql`

Coverage:

- valid depth-1 rule insert
- invalid policy FK
- invalid depth
- invalid bps upper bound
- duplicate `(policy_version_id, depth)`
- valid direct referral reward insert with source tracking
- invalid `source_account_id` FK
- invalid `source_account_staking_id` FK
- invalid direct referral source check
- duplicate `source_reference`
- duplicate direct referral dedupe key
- rollback residual verification

## 17. API and UI Follow-up

### 17.1 Planned admin endpoints

- `POST /api/admin/rewards/direct-referral/run`
- `POST /api/admin/stakings/:stakingId/direct-referral-calculate`

### 17.2 Reused read endpoints

- `GET /api/admin/calc-runs/:calcRunId/rewards`
- `GET /api/admin/rewards`
- `GET /api/admin/rewards/:rewardId`
- `GET /api/me/rewards`
- `GET /api/me/rewards/:rewardId`

### 17.3 UI follow-up

- admin:
  - calc run trigger
  - calc run summary
  - reward detail with source member summary
- user:
  - direct referral reward row in rewards history
  - minimal source display only

## 18. Risks

- repository evidence for the original BJC office files is absent in this session
- current reversal service assumes reward account and staking owner match
- sponsor status policy for `BLOCKED` is not fully settled
- source staking cancellation policy is not yet defined
- direct referral reward detail and list queries will need explicit source joins once implementation starts

## 19. Recommended Next Steps

1. confirm the business treatment of `BLOCKED` sponsor accounts
2. confirm whether source staking cancellation causes direct referral reversal
3. implement repository support for `source_account_id` and `source_account_staking_id`
4. implement `DirectReferralRewardService` using the `dailyRewardService` batch pattern
5. wire planned admin endpoints and read-model exposure after service validation
