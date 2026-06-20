# BJC Direct Referral Reward 0006 SQL Review V1

## 1. Review Scope

- migration file:
  - `mysql/migrations/0006_bjc_direct_referral_rewards_mysql.sql`
- SQL smoke file:
  - `mysql/smoke/bjc_direct_referral_rewards_smoketest.sql`
- adjacent runtime fit review:
  - `src/services/accountStakingService.ts`
  - `src/services/dailyRewardService.ts`
  - `src/services/accountRewardService.ts`
  - `src/repos/accountRewardsRepo.ts`

This review covers schema correctness, additive safety, duplicate prevention, source tracking, and implementation compatibility.

Current runtime implementation that now depends on this schema:

- `src/services/directReferralRewardService.ts`
- `src/repos/directReferralRewardRulesRepo.ts`
- `src/repos/accountRewardsRepo.ts`
- `src/services/accountRewardService.ts`
- `scripts/direct_referral_reward_smoke.ts`

## 2. Schema Review Summary

### 2.1 Reused policy table

- `referral_bonus_rules`

Changes:

- add `updated_at`
- add `bonus_bps <= 10000` validation

### 2.2 Existing table change

- `account_rewards`

Changes:

- add `source_account_id`
- add `source_account_staking_id`
- add `direct_referral_dedupe_key`
- add direct referral source-tracking indexes
- add source-tracking foreign keys
- add direct referral check constraints

### 2.3 No schema changes made to

- `calc_runs`
- `ledger_events`
- `account_stakings`
- `reward_withdrawals`
- `withdrawal_fee_rules`

## 3. Additive Safety Review

- The migration does not drop tables, columns, indexes, or constraints.
- The migration does not rewrite existing reward facts.
- The migration does not add triggers, procedures, or functions.
- Existing `calc_runs.run_type = DIRECT_REFERRAL` is already present, so enum expansion is not needed.
- Existing `ledger_events.event_type = DIRECT_REFERRAL_BONUS` is already present, so ledger enum expansion is not needed.

## 4. Policy Table Review

### 4.1 Reuse decision

Reusing `referral_bonus_rules` is appropriate for V1 because the verified direct referral rule is depth-based and bps-based only.

Current required shape:

- `policy_version_id`
- `depth`
- `bonus_bps`
- `is_active`

### 4.2 Added guardrail

The existing table already enforced:

- `depth > 0`
- `bonus_bps >= 0`
- unique `(policy_version_id, depth)`

The `0006` migration adds:

- `bonus_bps <= 10000`

This prevents invalid bps values while keeping the table reusable for direct referral policy snapshots.

### 4.3 Deferred rule dimensions

Not added in `0006`:

- minimum staking amount
- maximum reward cap
- validity window per rule row

Reason:

- those fields are not verified by the repository policy evidence in this session
- adding them now would overfit undocumented behavior

## 5. Reward Source Tracking Review

### 5.1 Why `account_staking_id` alone is insufficient

For `DIRECT_REFERRAL`:

- reward receiver = sponsor
- source staking owner = referred member

Nearby runtime code currently assumes reward row and staking row are ownership-aligned, especially in reversal logic.

Therefore using only `account_staking_id` would create semantic confusion and future runtime bugs.

### 5.2 Chosen columns

- `source_account_id`
- `source_account_staking_id`

This keeps:

- `account_id`
  - beneficiary sponsor
- `account_staking_id`
  - available for beneficiary-owned reward types such as `DAILY_REWARD`

### 5.3 Check-constraint decision

For `reward_type = 'DIRECT_REFERRAL'`, the migration requires:

- `account_staking_id is null`
- `source_account_id is not null`
- `source_account_staking_id is not null`
- `account_id <> source_account_id`

For every other reward type in this design phase:

- `source_account_id is null`
- `source_account_staking_id is null`

This is intentionally strict so that source semantics remain explicit and nearby code cannot silently misinterpret rows.

## 6. Duplicate Prevention Review

### 6.1 Existing guarantee

Already present:

- `unique (reward_type, source_reference)`

This remains the primary application-level idempotency key.

### 6.2 New guarantee

`0006` adds:

```text
direct_referral_dedupe_key
= <source_account_staking_id>:<account_id>
```

with a unique index.

This protects against:

- accidental changes to source reference formatting
- duplicate reward creation for the same source staking and same sponsor

### 6.3 Trade-off

The extra unique key is intentionally specific to direct referral rows only because the generated column is `NULL` for all other reward types.

## 7. Index Review

Added indexes:

- `idx_account_rewards_source_account_reward_date`
- `idx_account_rewards_source_staking_reward_date`

These support:

- admin investigation by referred member
- source staking traceability
- future conflict review and back-office reconciliation

## 8. Runtime Fit Review

### 8.1 Fits well with current activation flow

`accountStakingService.activateAdminStaking()` already produces:

- authoritative activation time
- source staking ID
- source product ID
- activation ledger reference

This is enough to seed a later `DIRECT_REFERRAL` batch scan.

### 8.2 Fits well with current batch pattern

`dailyRewardService` already demonstrates the preferred pattern:

- one `calc_run`
- paged source scan
- per-row short transaction
- `account_rewards + ledger_events` atomic insert
- duplicate and zero-result skip counters

`DIRECT_REFERRAL` should follow the same structure.

### 8.3 Implemented runtime fit

The shipped runtime now follows this review:

- direct referral rule lookup uses `referral_bonus_rules.depth = 1` and `is_active = 1`
- `BLOCKED` and `WITHDRAWN` sponsors are skipped as `inactive_sponsor`
- `CANCEL_REQUESTED` source staking is excluded from new direct referral reward creation
- `account_rewards.account_staking_id` remains `null` for `DIRECT_REFERRAL`
- `source_account_id` and `source_account_staking_id` are populated for reward tracing
- reward insert, ledger insert, and reward-to-ledger linkage run in one transaction
- duplicate rows are counted, conflicting rows are audited, and rule-missing failures stop the run

### 8.3 Known runtime gap

`accountRewardService.reverseReward()` assumes:

- `reward.account_staking_id` exists
- staking owner equals reward owner

That is another reason `0006` does not reuse `account_staking_id` for direct referral source staking.

## 9. SQL Smoke Review

### 9.1 Positive path

- valid `referral_bonus_rules` depth-1 insert
- valid `DIRECT_REFERRAL` reward insert with explicit source account and source staking

### 9.2 Negative path coverage

- invalid `policy_version_id` FK
- invalid `depth`
- invalid `bonus_bps > 10000`
- duplicate `(policy_version_id, depth)`
- invalid `source_account_id` FK
- invalid `source_account_staking_id` FK
- invalid direct referral source check
- duplicate `(reward_type, source_reference)`
- duplicate generated direct referral dedupe key
- illegal source columns on non-direct-referral reward

### 9.3 Rollback review

- smoke captures before-counts
- smoke rolls back at the end
- post-rollback counts must equal pre-run counts

## 10. Operational Review

- backup remains required before any real apply
- validation after apply should include:
  - `SHOW CREATE TABLE referral_bonus_rules`
  - `SHOW CREATE TABLE account_rewards`
  - check-constraint review
  - foreign key review
  - index review
  - SQL smoke execution

## 11. Validation Status In This Session

### 11.1 Migration and SQL smoke status

Verified in the project before runtime implementation:

- `calc_runs` already includes `DIRECT_REFERRAL`
- `ledger_events` already includes `DIRECT_REFERRAL_BONUS`
- `0006` adds `account_rewards.source_account_id`
- `0006` adds `account_rewards.source_account_staking_id`
- `0006` adds generated `direct_referral_dedupe_key`
- `mysql/smoke/bjc_direct_referral_rewards_smoketest.sql` validates the DDL contract

### 11.2 Runtime verification after apply

Runtime verification now confirms that the applied schema supports:

- batch direct referral creation
- duplicate rerun handling
- single-staking duplicate handling
- reward detail/list source joins
- reward summary `BONUS` aggregation
- withdrawal balance `BONUS` aggregation
- fixture cleanup without leftover direct referral rows

## 12. Review Conclusion

- `0006` stays additive and focused.
- Reusing `referral_bonus_rules` is the correct V1 choice.
- Explicit source tracking in `account_rewards` is necessary to avoid reward/staking ownership ambiguity.
- Duplicate prevention is strong enough with both `source_reference` and generated direct-referral dedupe.
- The runtime implementation proves the schema fits batch execution, single execution, reward reads, and withdrawal aggregation.
- The main remaining risk is not SQL shape but future reversal policy and any later backfill policy for blocked sponsors.
