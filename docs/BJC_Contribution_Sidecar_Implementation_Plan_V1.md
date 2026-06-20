# BJC Contribution / Sidecar Implementation Plan V1

## 1. Goal

- Ship `CONTRIBUTION` and `SIDECAR` runtime, Admin execution routes, Admin/User read-model wiring, report/CSV support, unit tests, smoke scripts, and UI integration in the current BJC repository.
- Reuse the existing `policy_versions`, `account_rewards`, `ledger_events`, `calc_runs`, and rule tables first.
- Avoid undocumented fixed amounts or undocumented scheduler behavior.

## 2. Source of Truth

Repository-backed policy sources used in this phase:

- `.trae/documents/BJC_Calculation_Engine_Design_V1.md`
- `mysql/migrations/0001_bjc_offchain_core_mysql.sql`
- `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
- `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- existing reward / withdrawal / calc-run services and repos already shipped in the repository

The repository did not contain a committed `docs/BJC_Calculation_Engine_Design_V1.md` in this session, so the design basis was verified from `.trae/documents/...` and the actual schema.

## 3. Confirmed Contribution Policy

Confirmed from repository materials:

- batch type:
  - `calc_runs.run_type = CONTRIBUTION`
- reward type:
  - `account_rewards.reward_type = CONTRIBUTION`
- ledger event:
  - `ledger_events.event_type = CONTRIBUTION_BONUS`
- rule table:
  - `contribution_weight_rules(policy_version_id, depth, weight_bps)`
- score scope:
  - referral lineage only
  - `referral_edges.depth between 1 and 45`
- input base:
  - same-day `ledger_events.event_type = WITHDRAWAL_REQUEST`
- pool formula:
  - `pool_amount_base = floor(total_withdrawal_amount_base * 2000 / 10000)`
- account formula:
  - `depth_score_base = floor(depth_volume_base * weight_bps / 10000)`
  - `account_score = sum(depth_score_base)`
  - `reward_amount_base = floor(pool_amount_base * account_score / total_score)`

Implemented behavior:

- `CONTRIBUTION` creates:
  - `contribution_daily_pools`
  - `contribution_rewards`
  - `settlement_items`
  - `ledger_events`
  - `account_rewards`
- idempotency key:
  - `calc:CONTRIBUTION:<calculation_date>:acct:<account_id>`
- identical snapshot:
  - `duplicate`
- mismatched snapshot:
  - `conflict`

## 4. Confirmed Sidecar Policy

Confirmed from repository materials:

- batch type:
  - `calc_runs.run_type = SIDECAR`
- rule source:
  - latest `sidecar_events` row per policy
- input base:
  - same-day `ledger_events.event_type = WITHDRAWAL_REQUEST`
- split formula:
  - `release_base = floor(requested_amount_base * release_bps / 10000)`
  - `freeze_base = requested_amount_base - release_base`
- default documented example:
  - `SIDECAR_ACTIVE => 7000 / 3000`
- output settlement / ledger:
  - `WITHDRAWAL_RELEASE`
  - `WITHDRAWAL_FREEZE`
- output reference:
  - `calc:SIDECAR:<run_date>:<calc_run_id>:release:<withdrawal_ref>`
  - `calc:SIDECAR:<run_date>:<calc_run_id>:freeze:<withdrawal_ref>`

Implemented behavior:

- `SIDECAR` creates:
  - `settlement_items`
  - `ledger_events`
  - `calc_runs`
  - admin audit summaries
- `ledger_events.product_id = null`
- duplicate / conflict is determined from release/freeze reference reuse

## 5. Explicitly Unconfirmed / Unsupported

The following were not confirmed by repository policy materials and therefore are not force-defined in code:

- actual blockchain transfer execution
- automatic scheduler registration
- automatic demotion
- strong leg cap
- carry-over / burn semantics
- undocumented weekly / monthly repetition semantics
- undocumented fixed contribution or sidecar payout amounts

Important explicit limitation in this phase:

- repository design materials define `SIDECAR` as withdrawal split settlement, not as reward accrual
- therefore this implementation keeps `SIDECAR` as ledger / settlement flow
- `SIDECAR` reward rows in `account_rewards` are not materialized because that behavior is not supported by the verified design basis
- reward read-model and BONUS summary code paths accept `SIDECAR` as a future-compatible enum value, but current shipped runtime does not create `SIDECAR` reward rows

## 6. DB Review Outcome

- No additive migration was required in this phase.
- Existing schema already contained:
  - `contribution_weight_rules`
  - `contribution_daily_pools`
  - `contribution_rewards`
  - `sidecar_events`
  - `calc_runs` enum values for `CONTRIBUTION`, `SIDECAR`
  - `ledger_events` enum values for `CONTRIBUTION_BONUS`, `WITHDRAWAL_RELEASE`, `WITHDRAWAL_FREEZE`
  - `account_rewards.reward_type` values for `CONTRIBUTION`, `SIDECAR`
- The shipped backend fix in this phase was repository wiring:
  - `contribution_daily_pools.total_withdrawal_amount_base` snapshot is now inserted and compared during conflict detection

## 7. API / UI Scope Shipped

- Admin batch APIs:
  - `POST /api/admin/rewards/contribution/run`
  - `POST /api/admin/rewards/sidecar/run`
- Admin single-account APIs:
  - `POST /api/admin/accounts/:accountId/contribution`
  - `POST /api/admin/accounts/:accountId/sidecar`
- Admin report APIs:
  - `GET /api/admin/reports/reward-summary`
  - `GET /api/admin/reports/reward-by-type`
  - `GET /api/admin/reports/calc-run-summary`
  - `GET /api/admin/reports/rewards.csv`
  - `GET /api/admin/reports/calc-runs.csv`
- Admin UI:
  - `Rewards` tab batch execution for `CONTRIBUTION`, `SIDECAR`
  - `Accounts` tab single-account execution for `CONTRIBUTION`, `SIDECAR`
  - `Reports` tab report + CSV download
  - `Calc` tab common calc-run summary and drill-down
- User UI:
  - reward metadata allowlist expanded for `CONTRIBUTION`
  - reward summary / withdrawal BONUS path reflects `CONTRIBUTION`
  - dashboard shows BONUS aggregate card

## 8. Tests and Smoke

Added or updated:

- backend unit tests:
  - `src/services/contributionRewardService.test.ts`
  - `src/services/sidecarRewardService.test.ts`
  - `src/services/accountRewardService.test.ts`
- admin web tests:
  - `web/src/components/bonusAdmin.test.tsx`
  - `web/src/lib/rewards.test.ts`
- user web tests:
  - `web-user/src/lib/rewards.test.ts`
- smoke scripts:
  - `scripts/contribution_reward_smoke.ts`
  - `scripts/sidecar_reward_smoke.ts`

Executed in this phase:

- backend `npm test`
- backend `npm run build`
- admin `npm test`
- admin `npm run build`
- user `npm test`
- user `npm run build`
- `npm run preflight:smoke`
- `npm run smoke:contribution`
- `npm run smoke:sidecar`
- `npm run smoke:all`

## 9. Browser Verification Scope

Recommended browser verification targets for this shipped phase:

- Admin:
  - run `CONTRIBUTION`
  - run `SIDECAR`
  - inspect calc-run summary
  - inspect reports and CSV download
  - inspect account detail single-run form
- Reader:
  - confirm execute buttons are hidden
- User:
  - inspect `CONTRIBUTION` reward detail and BONUS summary
  - inspect withdrawal BONUS balance

Current known limitation:

- because `SIDECAR` is implemented as settlement/ledger flow from repository policy, user reward history does not show `SIDECAR` reward rows in this V1.
