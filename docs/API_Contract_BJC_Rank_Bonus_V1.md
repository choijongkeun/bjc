# API Contract: BJC Rank Bonus V1

## 1. Scope

- 이 문서는 현재 구현 완료된 `RANK_QUALIFICATION` runtime/API와, 아직 미구현인 `RANK_BONUS` 계약 초안을 함께 정리한다.
- 현재 저장소에서 검증된 범위만 확정한다.
- amount field는 모두 `DECIMAL(65,0)` 문자열로 유지한다.

## 2. Source of Truth

- qualification rule:
  - `rank_rules`
- sponsor/direct line:
  - `accounts.sponsor_account_id`
  - `referral_edges`
- binary leg structure:
  - `binary_nodes`
  - `binary_edges`
- qualification snapshots:
  - `account_rank_qualification_results`
- current rank projection:
  - `account_rank_status`
- rank transition history:
  - `account_rank_history`
- financial reward facts:
  - `account_rewards`
- ledger facts:
  - `ledger_events`
- batch execution facts:
  - `calc_runs`

## 3. Shared Domain Rules

### 3.1 Qualification rule identity

- 저장소 근거상 확인 가능한 식별자는 `rank_level` 뿐이다.
- V1 API는 `rank_level`을 canonical rank identifier로 사용한다.
- `rank_code` / `rank_name`은 원본 자료 확보 전까지 계약 필수값으로 만들지 않는다.

### 3.2 Qualification formula

저장소에서 검증된 qualification rule input:

- `required_lines`
- `required_weak_volume_base`

저장소에서 검증된 payout formula:

```text
downline_daily_reward_amount_base
= same-day subordinate DAILY_REWARD total

rank_bonus_amount_base
= floor(downline_daily_reward_amount_base * effective_bonus_bps / 10000)
```

### 3.3 Structure separation

```text
direct line count
= sponsor / referral_edges

left/right/weak leg
= binary_nodes / binary_edges
```

### 3.4 V1 policy decisions

- qualification run과 reward run을 분리한다
- `RANK_QUALIFICATION` run은 financial settlement를 만들지 않는다
- `RANK_BONUS` run은 이미 확정된 qualification snapshot을 읽어 reward를 생성한다
- 자동 승급은 지원 대상으로 설계한다
- 유지 계산은 지원 대상으로 설계한다
- 자동 하락은 정책 미확정으로 인해 V1에서 적용하지 않는다
- demotion candidate는 qualification result로 기록한다

## 4. Auth and Role Rules

- Admin read API:
  - `READER` 또는 `ADMIN`
- Admin execution API:
  - `ADMIN` only
- User read API:
  - `USER`

## 5. Qualification Run API

## 5.1 POST `/api/admin/rewards/rank-qualification/run`

- 목적:
  - 특정 `calculation_date`에 대한 직급 qualification snapshot 계산
- 권한:
  - `ADMIN`

### Request

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30"
}
```

V1 rules:

- `policy_version_id` required
- `calculation_date` required
- qualification run은 `calc_runs.run_type = 'RANK_QUALIFICATION'`
- batch 대상은 `policy_version_id` 기준으로 qualification 가능한 `ACTIVE USER`다
- 현재 구현은 해당 policy의 staking 또는 기존 same-policy rank status가 있는 회원을 대상으로 스코프를 제한한다

### Response

```json
{
  "calc_run_id": "uuid",
  "target_count": 120,
  "initial_count": 12,
  "promoted_count": 12,
  "maintained_count": 51,
  "demotion_deferred_count": 4,
  "unqualified_count": 53,
  "failed_count": 0,
  "status": "SUCCEEDED"
}
```

### Errors

- `400`
  - invalid body
  - invalid date format
- `403`
  - actor is not `ADMIN`
- `404`
  - policy missing
- `409`
  - same run is already `PENDING` or `RUNNING`
- `422`
  - active rank rules missing for the policy
- `500`
  - unexpected execution failure

## 5.2 POST `/api/admin/accounts/:accountId/rank-qualification`

- 목적:
  - 특정 `ACTIVE USER` 1명에 대한 qualification 실행
- 권한:
  - `ADMIN`

### Request

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30"
}
```

### Response

```json
{
  "calc_run": {
    "id": "uuid",
    "policy_version_id": "uuid",
    "run_type": "RANK_QUALIFICATION",
    "run_date": "2026-06-30",
    "status": "SUCCEEDED"
  },
  "qualification_result": {
    "id": "uuid",
    "account_id": "uuid",
    "calc_run_id": "uuid",
    "result_status": "QUALIFIED"
  }
}
```

## 5.3 Qualification Result Shape

```json
{
  "id": "uuid",
  "calc_run_id": "uuid",
  "account_id": "uuid",
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30",
  "period_from": "2026-06-30",
  "period_to": "2026-06-30",
  "previous_rank_level": 2,
  "qualified_rank_level": 3,
  "applied_rank_level": 3,
  "result_status": "QUALIFIED",
  "personal_active_stake_amount_base": "1000000",
  "personal_cumulative_stake_amount_base": "3000000",
  "direct_referral_count": 5,
  "direct_active_referral_count": 4,
  "left_leg_volume_base": "15000000",
  "right_leg_volume_base": "13000000",
  "weak_leg_volume_base": "13000000",
  "strong_leg_volume_base": "15000000",
  "downline_daily_reward_amount_base": "1200000",
  "qualification_snapshot": {
    "formula_version": "rank_qualification_v1",
    "policy_version_id": "uuid",
    "rule_shape": {
      "required_lines": "direct_active_referral_count",
      "required_weak_volume_base": "weak_leg_volume_base"
    },
    "metrics": {
      "personal_active_stake_amount_base": "1000000",
      "personal_cumulative_stake_amount_base": "3000000",
      "direct_referral_count": 5,
      "direct_active_referral_count": 4,
      "left_leg_volume_base": "15000000",
      "right_leg_volume_base": "13000000",
      "weak_leg_volume_base": "13000000",
      "strong_leg_volume_base": "15000000",
      "downline_daily_reward_amount_base": "1200000"
    },
    "evaluated_rules": [
      {
        "rule_id": "uuid",
        "rank_level": 3,
        "qualified": true,
        "unmet_conditions": []
      }
    ],
    "demotion_deferred": false
  }
}
```

## 6. Current Rank and History APIs

## 6.1 GET `/api/me/rank`

- 목적:
  - 본인의 현재 적용 직급 projection 조회

### Response

```json
{
  "account": {
    "id": "uuid",
    "login_id": "user01",
    "display_name": "User 01",
    "role": "USER",
    "status": "ACTIVE"
  },
  "rank_status": {
    "account_id": "uuid",
    "policy_version_id": "uuid",
    "current_rank_level": 3,
    "qualified_at": "2026-06-30T00:00:00.000Z",
    "maintained_until": null,
    "last_qualification_calc_run_id": "uuid",
    "last_bonus_calc_run_id": null,
    "last_change_type": "PROMOTED",
    "updated_at": "2026-06-30T00:00:00.000Z"
  },
  "latest_qualification_result": {
    "id": "uuid",
    "result_status": "QUALIFIED"
  },
  "next_rank": {
    "rank_level": 4
  },
  "next_rank_progress": [
    {
      "metric": "direct_active_referral_count",
      "current": 3,
      "required": 4,
      "met": false
    },
    {
      "metric": "weak_leg_volume_base",
      "current": "13000000",
      "required": "15000000",
      "met": false
    }
  ]
}
```

## 6.2 GET `/api/me/rank-history`

- 목적:
  - 본인의 applied rank transition 이력 조회

### Response item

```json
{
  "id": "uuid",
  "calc_run_id": "uuid",
  "effective_date": "2026-06-30",
  "previous_rank_level": 2,
  "calculated_rank_level": 3,
  "final_rank_level": 3,
  "change_type": "PROMOTED",
  "left_leg_volume_base": "15000000",
  "right_leg_volume_base": "13000000",
  "weak_leg_volume_base": "13000000",
  "downline_daily_reward_amount_base": "1200000",
  "created_at": "2026-06-30T00:00:00.000Z"
}
```

## 6.3 GET `/api/admin/accounts/:accountId/rank`

- 목적:
  - Admin/Reader가 특정 회원의 현재 직급 projection 조회
- 권한:
  - `READER` 또는 `ADMIN`

## 6.4 GET `/api/admin/accounts/:accountId/rank-history`

- 목적:
  - Admin/Reader가 특정 회원의 rank history 조회
- 권한:
  - `READER` 또는 `ADMIN`

## 6.5 GET `/api/admin/calc-runs/:calcRunId/rank-results`

- 목적:
  - 특정 qualification calc run의 결과 목록 조회
- 권한:
  - `READER` 또는 `ADMIN`

## 7. Rank Bonus Run API

## 7.1 POST `/api/admin/rewards/rank-bonus/run`

- 목적:
  - 확정된 qualification 결과를 바탕으로 `RANK_BONUS` reward 생성
- 권한:
  - `ADMIN`

### Request

```json
{
  "policy_version_id": "uuid",
  "calculation_date": "2026-06-30",
  "period_from": "2026-06-30",
  "period_to": "2026-06-30",
  "qualification_calc_run_id": "uuid"
}
```

V1 rules:

- `qualification_calc_run_id` optional
- omitted 시 동일 `policy_version_id + calculation_date`의 최신 successful qualification run을 사용
- `RANK_BONUS` run은 reward rows와 ledger rows를 생성한다

### Response

```json
{
  "calc_run_id": "uuid",
  "target_count": 63,
  "reward_created_count": 61,
  "duplicate_skip_count": 2,
  "conflict_count": 0,
  "failed_count": 0,
  "total_reward_amount_base": "2200000",
  "status": "SUCCEEDED"
}
```

### Errors

- `400`
  - invalid body
- `403`
  - actor is not `ADMIN`
- `404`
  - policy missing
  - qualification run missing
- `409`
  - same run already active
  - conflicting existing reward
- `422`
  - usable qualification snapshot missing
- `500`
  - unexpected execution failure

## 7.2 Reward Row Contract

`RANK_BONUS` reward row:

```json
{
  "id": "uuid",
  "account_id": "uuid",
  "account_staking_id": null,
  "source_account_id": null,
  "source_account_staking_id": null,
  "policy_version_id": "uuid",
  "calc_run_id": "uuid",
  "reward_type": "RANK_BONUS",
  "reward_date": "2026-06-30",
  "amount_base": "2200000",
  "status": "CONFIRMED",
  "source_reference": "rank_bonus:2026-06-30:account-uuid:3",
  "metadata": {
    "rank_level": 3,
    "period_from": "2026-06-30",
    "period_to": "2026-06-30",
    "downline_daily_reward_amount_base": "1200000",
    "effective_bonus_bps": "1200",
    "rank_share_bps": "3000",
    "qualification_calc_run_id": "uuid"
  }
}
```

## 7.3 Idempotency Rules

- primary uniqueness:
  - existing `account_rewards` unique `(reward_type, source_reference)`
- source reference rule:

```text
rank_bonus:<period_key>:<account_id>:<rank_level>
```

- same `period_key + account_id + rank_level` may create at most one reward
- identical existing row -> duplicate skip
- conflicting existing row -> conflict

## 8. Ledger Contract

향후 `RANK_BONUS` ledger row:

```json
{
  "account_id": "uuid",
  "product_id": null,
  "policy_version_id": "uuid",
  "calc_run_id": "uuid",
  "event_time": "2026-06-30T00:00:00.000Z",
  "event_type": "RANK_BONUS",
  "amount_base": "2200000",
  "reference_id": "rank_bonus:2026-06-30:account-uuid:3",
  "related_account_id": null,
  "meta": {
    "rank_level": 3,
    "qualification_calc_run_id": "uuid"
  }
}
```

계약 전제:

- `ledger_events.product_id`는 0007에서 nullable로 확장한다

## 9. User and Admin Read Reuse

재사용:

- `GET /api/me/rewards?reward_type=RANK_BONUS`
- `GET /api/me/rewards/:rewardId`
- `GET /api/admin/rewards?reward_type=RANK_BONUS`
- `GET /api/admin/rewards/:rewardId`
- `GET /api/admin/calc-runs/:calcRunId/rewards`

기대사항:

- `RANK_BONUS`는 BONUS bucket에 계속 포함된다
- withdrawal 가능 보상도 BONUS 기준으로 집계된다

## 10. Implemented Runtime Notes

- 실제 구현 파일:
  - `src/domain/rankQualification.ts`
  - `src/repos/rankRulesRepo.ts`
  - `src/repos/rankQualificationMetricsRepo.ts`
  - `src/repos/accountRankStatusRepo.ts`
  - `src/repos/accountRankQualificationResultsRepo.ts`
  - `src/repos/accountRankHistoryRepo.ts`
  - `src/services/rankQualificationService.ts`
  - `src/server.ts`
  - `scripts/rank_qualification_smoke.ts`
- ACTIVE staking 기준:
  - `status = 'ACTIVE'`
  - `cancel_requested_at is null`
- cumulative staking 기준:
  - `activated_at is not null`
  - `status in ('ACTIVE', 'CANCEL_REQUESTED', 'MATURED', 'CLOSED')`
- LEFT/RIGHT leg volume:
  - `binary_edges.root_leg`
  - 하위 계정의 active staking principal 합
- qualification run은 `account_rewards` / `ledger_events`를 생성하지 않는다
- `ledger_events.product_id` nullable read-model은 repo/CSV/API DTO에서 `string | null`로 반영했다
- `RANK_BONUS` reward/ledger/runtime은 아직 구현하지 않았다

## 11. Deferred Items

- 실제 직급명/코드 응답
- automatic demotion application
- monthly/weekly period semantics
- manual override API
