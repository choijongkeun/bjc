# BJC Account Staking Implementation Plan V1

## 1. Goal

- Implement the v1 backend for account staking on top of the completed `0003` schema.
- Preserve existing member/auth/network/admin APIs without regression.
- Finish with repeatable unit tests, build verification, and API smoke coverage using writable app DB cleanup.

## 2. Implemented Result

### 2.1 Repository / service split

- Repository layer:
  - `src/repos/accountStakingsRepo.ts`
  - `src/repos/stakingProductsRepo.ts` single-row + `FOR UPDATE` helpers
  - `src/repos/ledgerEventsRepo.ts` event-time normalization for MySQL `DATETIME`
- Service layer:
  - `src/services/accountStakingService.ts`
  - owns transaction boundaries, idempotency, role checks, state transitions, ledger writes, and audit writes
- Route layer:
  - `src/server.ts`
  - keeps request validation and service invocation only

### 2.2 Implemented endpoints

- User:
  - `GET /api/staking-products`
  - `POST /api/me/stakings`
  - `GET /api/me/stakings`
  - `GET /api/me/stakings/:stakingId`
  - `POST /api/me/stakings/:stakingId/cancel`
- Admin:
  - `GET /api/admin/stakings`
  - `GET /api/admin/stakings/:stakingId`
  - `POST /api/admin/stakings/:stakingId/activate`
  - `POST /api/admin/stakings/:stakingId/reject`
  - `POST /api/admin/stakings/:stakingId/cancel`
  - `GET /api/admin/accounts/:accountId/stakings`

## 3. Core Design Decisions

### 3.1 Product reuse

- `staking_products` stays as the policy definition table.
- `account_stakings` stores immutable member-level commercial snapshots.
- Snapshot columns used by the service:
  - `policy_version_id`
  - `daily_interest_bps_snapshot`
  - `duration_days_snapshot`

### 3.2 Public product policy

- `GET /api/staking-products` now has two modes:
  - public mode without `x-actor-account-id`
  - admin compatibility mode with `x-actor-account-id`
- Public mode returns active products only and limits fields to the user-facing summary contract.

### 3.3 Amount precision policy

- Request amount validation uses string checks plus `BigInt` range comparison.
- Staking amounts are never converted to JavaScript `Number`.
- DB write values remain decimal strings for `DECIMAL(65,0)` columns.

## 4. State Machine

```text
PENDING -> ACTIVE
PENDING -> CANCELLED
ACTIVE -> CANCEL_REQUESTED
ACTIVE -> CANCELLED
CANCEL_REQUESTED -> CANCELLED
```

- Not implemented:
  - `ACTIVE -> MATURED`
  - `MATURED -> CLOSED`
- Reject remains:
  - `PENDING -> CANCELLED`
  - reason stored in ledger/audit metadata

## 5. Transaction Flows

### 5.1 User create staking

- Validate active account, product state, amount range, and policy usability.
- Lock account, idempotency row, product, and policy in one transaction.
- Insert `account_stakings` as `PENDING`.
- Append `STAKING_REQUESTED`.
- Save the ledger id into `source_ledger_event_id`.
- Insert `USER_STAKING_REQUEST` audit row.

### 5.2 User cancel staking

- Lock account and target staking row.
- `PENDING -> CANCELLED`
  - append `STAKING_CANCELLED`
  - save `cancellation_ledger_event_id`
  - insert `USER_STAKING_CANCELLED`
- `ACTIVE -> CANCEL_REQUESTED`
  - update row only
  - insert `USER_STAKING_CANCEL_REQUEST`
- `CANCEL_REQUESTED`
  - return current row as idempotent success

### 5.3 Admin transitions

- Activate:
  - lock staking, account, product, and policy
  - append `STAKING_PRINCIPAL_LOCKED`
  - append `STAKING_ACTIVATED`
  - set `activated_at`, `started_at`, `matures_at`
  - insert `ADMIN_STAKING_ACTIVATE`
- Reject:
  - `PENDING -> CANCELLED`
  - append `STAKING_CANCELLED`
  - insert `ADMIN_STAKING_REJECT`
- Cancel:
  - `ACTIVE` or `CANCEL_REQUESTED` -> `CANCELLED`
  - append `STAKING_CANCELLED`
  - append `STAKING_PRINCIPAL_RELEASED`
  - insert `ADMIN_STAKING_CANCEL`

## 6. Ledger / Audit Integration

### 6.1 Ledger references

- `staking.request:<staking_id>`
- `staking.lock:<staking_id>`
- `staking.activate:<staking_id>`
- `staking.cancel:<staking_id>`
- `staking.release:<staking_id>`
- `staking.mature:<staking_id>`

### 6.2 Important implementation note

- MySQL `ledger_events.event_time` is `DATETIME`, so repo writes normalize ISO timestamps to MySQL datetime strings.
- This fixed the original `smoke:staking` failure caused by ISO `...T...Z` values.

### 6.3 Off-chain-only events in this phase

- `STAKING_PRINCIPAL_LOCKED`
- `STAKING_PRINCIPAL_RELEASED`

- These are contractual ledger events only.
- No real balance deduction or balance return is implemented yet.

## 7. Verification

### 7.1 Unit / build

- Root:
  - `npm test` pass
  - `npm run build` pass
- `web`:
  - `npm test` pass
  - `npm run build` pass
- `web-user`:
  - `npm test` pass
  - `npm run build` pass

### 7.2 Smoke

- `npm run smoke:member` pass
- `npm run smoke:staking` pass
- `git diff --check` pass

### 7.3 Staking smoke coverage

- public product list
- create request + idempotent replay
- idempotency conflict
- min amount validation
- inactive product rejection
- my list/detail
- ownership protection
- user cancel from `PENDING`
- reader list/detail + reader mutate forbidden
- admin activate
- user cancel request from `ACTIVE`
- admin cancel
- admin reject
- ledger rows present
- audit rows present
- sensitive field absence
- fixture cleanup to zero rows

## 8. Remaining Scope

- User staking screen in `web-user`
- Admin staking screen in `web`
- actual principal balance deduction
- actual principal release / payout accounting
- daily reward calculation and payout
- withdrawal flow
- maturity scheduler / batch
- `MATURED` and `CLOSED` lifecycle handling
- wallet / deposit confirmation linkage

## 9. Risks / Follow-up

- Current product table still lacks display ordering and effective-window fields for richer catalog control.
- Reject/cancel reasons still live in metadata because there is no dedicated DB reason column.
- Policy usability currently rejects `RETIRED` only to remain compatible with existing fixtures that still reference `DRAFT` policies.
- Future work should define whether cancel requests need explicit idempotency persistence beyond current status-return behavior.
