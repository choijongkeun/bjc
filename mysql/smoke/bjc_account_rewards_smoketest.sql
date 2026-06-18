set sql_safe_updates = 0;

-- Usage:
-- mysql --force < mysql/smoke/bjc_account_rewards_smoketest.sql
-- The script intentionally triggers several failing statements and rolls back at the end.

set @suffix := replace(uuid(), '-', '');
set @before_reward_count := (select count(*) from account_rewards);

start transaction;

set @admin_id := uuid();
set @member_id := uuid();
set @policy_id := uuid();
set @product_id := uuid();
set @calc_run_id := uuid();
set @staking_event_id := uuid();
set @staking_id := uuid();
set @reward_id_ok := uuid();
set @reward_date_ok := date('2026-06-19');
set @reward_ref_ok := concat('reward.daily:', @staking_id, ':', cast(@reward_date_ok as char(10)));

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
  concat('reward_smoke_admin_', left(@suffix, 12)),
  concat('Reward Smoke Admin ', left(@suffix, 8)),
  'ADMIN',
  'ACTIVE',
  concat('RSA', left(@suffix, 12)),
  current_timestamp(6),
  current_timestamp(6)
),
(
  @member_id,
  concat('reward_smoke_user_', left(@suffix, 12)),
  concat('Reward Smoke User ', left(@suffix, 8)),
  'USER',
  'ACTIVE',
  concat('RSU', left(@suffix, 12)),
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
  concat('reward smoke policy ', @suffix),
  @admin_id,
  current_timestamp,
  null
);

insert into staking_products (
  id,
  policy_version_id,
  name,
  symbol,
  decimals,
  min_stake_amount_base,
  max_stake_amount_base,
  staking_days,
  daily_interest_bps,
  is_active
) values (
  @product_id,
  @policy_id,
  concat('Reward Smoke Product ', left(@suffix, 8)),
  'USDC',
  6,
  100,
  1000000,
  30,
  50,
  1
);

insert into calc_runs (
  id,
  policy_version_id,
  run_type,
  run_date,
  status,
  started_at,
  finished_at,
  created_by,
  created_at
) values (
  @calc_run_id,
  @policy_id,
  'DAILY_REWARD',
  @reward_date_ok,
  'SUCCEEDED',
  current_timestamp,
  current_timestamp,
  @admin_id,
  current_timestamp
);

insert into ledger_events (
  id,
  account_id,
  product_id,
  policy_version_id,
  calc_run_id,
  event_time,
  event_type,
  amount_base,
  decimals,
  symbol,
  reference_id,
  related_account_id,
  meta,
  created_by
) values (
  @staking_event_id,
  @member_id,
  @product_id,
  @policy_id,
  null,
  current_timestamp,
  'STAKING_ACTIVATED',
  1000,
  6,
  'USDC',
  concat('reward-smoke-staking-activated:', @suffix),
  null,
  json_object('smoke', true),
  @admin_id
);

insert into account_stakings (
  id,
  account_id,
  staking_product_id,
  policy_version_id,
  principal_amount_base,
  daily_interest_bps_snapshot,
  duration_days_snapshot,
  status,
  idempotency_key,
  started_at,
  matures_at,
  activated_at,
  source_ledger_event_id,
  created_at,
  updated_at
) values (
  @staking_id,
  @member_id,
  @product_id,
  @policy_id,
  1000,
  50,
  30,
  'ACTIVE',
  concat('reward-smoke-staking-', @suffix),
  timestamp('2026-06-18 00:00:00.000000'),
  timestamp('2026-07-18 00:00:00.000000'),
  timestamp('2026-06-18 00:00:00.000000'),
  @staking_event_id,
  current_timestamp(6),
  current_timestamp(6)
);

-- valid DAILY_REWARD row
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
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  @reward_date_ok,
  5,
  'CONFIRMED',
  @reward_ref_ok,
  null,
  timestamp('2026-06-19 00:05:00.000000'),
  timestamp('2026-06-19 00:05:00.000000'),
  json_object(
    'principal_amount_base', '1000',
    'daily_interest_bps_snapshot', '50',
    'duration_days_snapshot', 30
  ),
  current_timestamp(6),
  current_timestamp(6)
);

select
  id,
  account_id,
  account_staking_id,
  reward_type,
  reward_date,
  amount_base,
  status,
  source_reference,
  available_at,
  confirmed_at,
  reversed_at
from account_rewards
where id = @reward_id_ok;

-- invalid account FK
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
  confirmed_at
) values (
  uuid(),
  '00000000-0000-0000-0000-000000000001',
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  date('2026-06-20'),
  5,
  'CONFIRMED',
  concat('reward.bad-account:', @suffix),
  current_timestamp(6)
);

-- invalid staking FK
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  '00000000-0000-0000-0000-000000000002',
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  date('2026-06-21'),
  5,
  'CONFIRMED',
  concat('reward.bad-staking:', @suffix),
  current_timestamp(6)
);

-- zero amount failure
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  date('2026-06-20'),
  0,
  'CONFIRMED',
  concat('reward.zero:', @suffix),
  current_timestamp(6)
);

-- negative amount is allowed only for REVERSAL
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  date('2026-06-20'),
  -5,
  'CONFIRMED',
  concat('reward.negative-non-reversal:', @suffix),
  current_timestamp(6)
);

-- invalid reward_type failure
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'INVALID_REWARD_TYPE',
  date('2026-06-20'),
  5,
  'CONFIRMED',
  concat('reward.invalid-type:', @suffix),
  current_timestamp(6)
);

-- invalid status failure
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  date('2026-06-20'),
  5,
  'BROKEN',
  concat('reward.invalid-status:', @suffix),
  current_timestamp(6)
);

-- duplicate DAILY_REWARD for same staking/date should fail
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  @reward_date_ok,
  5,
  'CONFIRMED',
  concat('reward.daily-duplicate:', @suffix),
  current_timestamp(6)
);

-- duplicate source_reference under same reward_type should fail
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
  confirmed_at
) values (
  uuid(),
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'DAILY_REWARD',
  date('2026-06-20'),
  5,
  'CONFIRMED',
  @reward_ref_ok,
  current_timestamp(6)
);

-- valid reversal row linked to the original reward row
set @reversal_reward_id := uuid();

update account_rewards
set
  status = 'REVERSED',
  reversed_at = timestamp('2026-06-20 01:00:00.000000'),
  updated_at = current_timestamp(6)
where id = @reward_id_ok;

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
  reversal_reward_id,
  available_at,
  confirmed_at,
  metadata_json,
  created_at,
  updated_at
) values (
  @reversal_reward_id,
  @member_id,
  @staking_id,
  @policy_id,
  @calc_run_id,
  'REVERSAL',
  date('2026-06-20'),
  -5,
  'CONFIRMED',
  concat('reward.reversal:', @reward_id_ok),
  @reward_id_ok,
  timestamp('2026-06-20 01:00:00.000000'),
  timestamp('2026-06-20 01:00:00.000000'),
  json_object('reason', 'smoke reversal'),
  current_timestamp(6),
  current_timestamp(6)
);

select
  original.id as original_reward_id,
  original.status as original_status,
  original.reversed_at as original_reversed_at,
  reversal.id as reversal_reward_id,
  reversal.reward_type as reversal_reward_type,
  reversal.amount_base as reversal_amount_base,
  reversal.reversal_reward_id as reversal_target_id
from account_rewards original
join account_rewards reversal
  on reversal.reversal_reward_id = original.id
where original.id = @reward_id_ok;

select
  (select count(*) from account_rewards) as reward_count_inside_transaction,
  (select count(*) from account_rewards where status = 'CONFIRMED') as confirmed_count_inside_transaction,
  (select count(*) from account_rewards where status = 'REVERSED') as reversed_count_inside_transaction;

rollback;

select
  @before_reward_count as before_reward_count,
  (select count(*) from account_rewards) as after_rollback_reward_count;
