set sql_safe_updates = 0;

-- Usage:
-- mysql --force < mysql/smoke/bjc_reward_withdrawals_smoketest.sql
-- The script intentionally triggers several failing statements and rolls back at the end.

set @suffix := replace(uuid(), '-', '');
set @before_withdrawal_count := (select count(*) from reward_withdrawals);
set @before_allocation_count := (select count(*) from reward_withdrawal_allocations);

start transaction;

set @admin_id := uuid();
set @member_id := uuid();
set @policy_id := uuid();
set @reward_id_ok := uuid();
set @withdrawal_id_ok := uuid();
set @requested_at_ok := timestamp('2026-06-19 09:00:00.000000');
set @idempotency_key_ok := concat('withdrawal-smoke-', @suffix);

insert into accounts (
  id,
  login_id,
  display_name,
  role,
  status,
  referral_code,
  joined_at,
  updated_at
) values
(
  @admin_id,
  concat('withdrawal_smoke_admin_', left(@suffix, 12)),
  concat('Withdrawal Smoke Admin ', left(@suffix, 8)),
  'ADMIN',
  'ACTIVE',
  concat('WSA', left(@suffix, 12)),
  current_timestamp(6),
  current_timestamp(6)
),
(
  @member_id,
  concat('withdrawal_smoke_user_', left(@suffix, 12)),
  concat('Withdrawal Smoke User ', left(@suffix, 8)),
  'USER',
  'ACTIVE',
  concat('WSU', left(@suffix, 12)),
  current_timestamp(6),
  current_timestamp(6)
);

insert into policy_versions (
  id,
  status,
  note,
  created_by,
  created_at,
  activated_at
) values (
  @policy_id,
  'DRAFT',
  concat('withdrawal smoke policy ', @suffix),
  @admin_id,
  current_timestamp,
  null
);

insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  policy_version_id,
  calc_run_id,
  reward_type,
  reward_date,
  amount_base,
  status,
  source_reference,
  source_ledger_event_id,
  available_at,
  confirmed_at,
  metadata_json,
  created_at,
  updated_at
) values (
  @reward_id_ok,
  @member_id,
  null,
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  date('2026-05-20'),
  100,
  'CONFIRMED',
  concat('withdrawal.smoke.reward:', @suffix),
  null,
  timestamp('2026-05-20 00:00:00.000000'),
  timestamp('2026-05-20 00:00:00.000000'),
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

-- valid REQUESTED withdrawal row
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  wallet_address,
  network,
  tx_hash,
  requested_kst_date,
  requested_at,
  processing_at,
  approved_at,
  rejected_at,
  completed_at,
  failed_at,
  cancelled_at,
  reject_reason,
  failure_reason,
  created_at,
  updated_at
) values (
  @withdrawal_id_ok,
  @member_id,
  @policy_id,
  'BONUS',
  100,
  20,
  80,
  'DEDUCT_FROM_WITHDRAWAL',
  'REQUESTED',
  @idempotency_key_ok,
  'TTEST1qsmokewalletaddress',
  'BSC',
  null,
  date('2026-06-19'),
  @requested_at_ok,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  current_timestamp(6),
  current_timestamp(6)
);

select
  id,
  account_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  status,
  requested_kst_date,
  requested_at
from reward_withdrawals
where id = @withdrawal_id_ok;

-- valid RESERVED allocation row
insert into reward_withdrawal_allocations (
  withdrawal_id,
  reward_id,
  allocated_amount_base,
  fee_policy_version_id,
  fee_schedule_days_snapshot,
  fee_rate_snapshot,
  fee_mode_snapshot,
  holding_days_snapshot,
  fee_amount_base,
  net_amount_base,
  status,
  reserved_at,
  consumed_at,
  released_at,
  created_at
) values (
  @withdrawal_id_ok,
  @reward_id_ok,
  100,
  @policy_id,
  30,
  2000,
  'DEDUCT_FROM_WITHDRAWAL',
  30,
  20,
  80,
  'RESERVED',
  @requested_at_ok,
  null,
  null,
  current_timestamp(6)
);

select
  withdrawal_id,
  reward_id,
  allocated_amount_base,
  fee_schedule_days_snapshot,
  fee_rate_snapshot,
  fee_amount_base,
  net_amount_base,
  status
from reward_withdrawal_allocations
where withdrawal_id = @withdrawal_id_ok;

-- invalid account FK
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  requested_kst_date,
  requested_at
) values (
  uuid(),
  '00000000-0000-0000-0000-000000000001',
  @policy_id,
  'BONUS',
  100,
  20,
  80,
  'DEDUCT_FROM_WITHDRAWAL',
  'REQUESTED',
  concat('withdrawal.bad-account-', @suffix),
  date('2026-06-19'),
  @requested_at_ok
);

-- invalid withdrawal_type failure
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  requested_kst_date,
  requested_at
) values (
  uuid(),
  @member_id,
  @policy_id,
  'INVALID_WITHDRAWAL_TYPE',
  100,
  20,
  80,
  'DEDUCT_FROM_WITHDRAWAL',
  'REQUESTED',
  concat('withdrawal.bad-type-', @suffix),
  date('2026-06-19'),
  @requested_at_ok
);

-- invalid status failure
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  requested_kst_date,
  requested_at
) values (
  uuid(),
  @member_id,
  @policy_id,
  'BONUS',
  100,
  20,
  80,
  'DEDUCT_FROM_WITHDRAWAL',
  'BROKEN',
  concat('withdrawal.bad-status-', @suffix),
  date('2026-06-19'),
  @requested_at_ok
);

-- non-positive amount failure
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  requested_kst_date,
  requested_at
) values (
  uuid(),
  @member_id,
  @policy_id,
  'BONUS',
  0,
  0,
  0,
  'DEDUCT_FROM_WITHDRAWAL',
  'REQUESTED',
  concat('withdrawal.zero-amount-', @suffix),
  date('2026-06-19'),
  @requested_at_ok
);

-- fee + net mismatch failure
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  requested_kst_date,
  requested_at
) values (
  uuid(),
  @member_id,
  @policy_id,
  'BONUS',
  100,
  10,
  95,
  'DEDUCT_FROM_WITHDRAWAL',
  'REQUESTED',
  concat('withdrawal.bad-sum-', @suffix),
  date('2026-06-19'),
  @requested_at_ok
);

-- duplicate account idempotency key should fail
insert into reward_withdrawals (
  id,
  account_id,
  fee_policy_version_id,
  withdrawal_type,
  requested_amount_base,
  fee_amount_base,
  net_amount_base,
  fee_mode_snapshot,
  status,
  idempotency_key,
  requested_kst_date,
  requested_at
) values (
  uuid(),
  @member_id,
  @policy_id,
  'BONUS',
  100,
  20,
  80,
  'DEDUCT_FROM_WITHDRAWAL',
  'REQUESTED',
  @idempotency_key_ok,
  date('2026-06-19'),
  @requested_at_ok
);

-- invalid reward FK
insert into reward_withdrawal_allocations (
  withdrawal_id,
  reward_id,
  allocated_amount_base,
  fee_policy_version_id,
  fee_schedule_days_snapshot,
  fee_rate_snapshot,
  fee_mode_snapshot,
  holding_days_snapshot,
  fee_amount_base,
  net_amount_base,
  status,
  reserved_at
) values (
  @withdrawal_id_ok,
  '00000000-0000-0000-0000-000000000002',
  100,
  @policy_id,
  30,
  2000,
  'DEDUCT_FROM_WITHDRAWAL',
  30,
  20,
  80,
  'RESERVED',
  @requested_at_ok
);

-- allocation amount positive check
insert into reward_withdrawal_allocations (
  withdrawal_id,
  reward_id,
  allocated_amount_base,
  fee_policy_version_id,
  fee_schedule_days_snapshot,
  fee_rate_snapshot,
  fee_mode_snapshot,
  holding_days_snapshot,
  fee_amount_base,
  net_amount_base,
  status,
  reserved_at
) values (
  @withdrawal_id_ok,
  @reward_id_ok,
  0,
  @policy_id,
  30,
  2000,
  'DEDUCT_FROM_WITHDRAWAL',
  30,
  0,
  0,
  'RESERVED',
  @requested_at_ok
);

-- duplicate withdrawal/reward pair should fail
insert into reward_withdrawal_allocations (
  withdrawal_id,
  reward_id,
  allocated_amount_base,
  fee_policy_version_id,
  fee_schedule_days_snapshot,
  fee_rate_snapshot,
  fee_mode_snapshot,
  holding_days_snapshot,
  fee_amount_base,
  net_amount_base,
  status,
  reserved_at
) values (
  @withdrawal_id_ok,
  @reward_id_ok,
  50,
  @policy_id,
  30,
  2000,
  'DEDUCT_FROM_WITHDRAWAL',
  30,
  10,
  40,
  'RESERVED',
  @requested_at_ok
);

-- allocation status failure
insert into reward_withdrawal_allocations (
  withdrawal_id,
  reward_id,
  allocated_amount_base,
  fee_policy_version_id,
  fee_schedule_days_snapshot,
  fee_rate_snapshot,
  fee_mode_snapshot,
  holding_days_snapshot,
  fee_amount_base,
  net_amount_base,
  status,
  reserved_at
) values (
  @withdrawal_id_ok,
  uuid(),
  30,
  @policy_id,
  30,
  2000,
  'DEDUCT_FROM_WITHDRAWAL',
  30,
  6,
  24,
  'BROKEN',
  @requested_at_ok
);

select
  (select count(*) from reward_withdrawals) as withdrawal_count_inside_transaction,
  (select count(*) from reward_withdrawal_allocations) as allocation_count_inside_transaction;

rollback;

select
  @before_withdrawal_count as before_withdrawal_count,
  (select count(*) from reward_withdrawals) as after_rollback_withdrawal_count,
  @before_allocation_count as before_allocation_count,
  (select count(*) from reward_withdrawal_allocations) as after_rollback_allocation_count;
