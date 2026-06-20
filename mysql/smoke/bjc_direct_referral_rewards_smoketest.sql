set sql_safe_updates = 0;

-- Usage:
-- mysql --force < mysql/smoke/bjc_direct_referral_rewards_smoketest.sql
-- The script intentionally triggers several failing statements and rolls back at the end.

set @suffix := replace(uuid(), '-', '');
set @before_rule_count := (select count(*) from referral_bonus_rules);
set @before_reward_count := (select count(*) from account_rewards);

start transaction;

set @admin_id := uuid();
set @sponsor_id := uuid();
set @member_id := uuid();
set @policy_id := uuid();
set @product_id := uuid();
set @source_staking_id := uuid();
set @reward_id_ok := uuid();
set @started_at_ok := timestamp('2026-06-19 09:00:00.000000');
set @matures_at_ok := timestamp('2026-07-19 09:00:00.000000');
set @reward_date_ok := date('2026-06-19');
set @source_reference_ok := concat('direct_referral:', @source_staking_id, ':', @sponsor_id);

insert into accounts (
  id,
  login_id,
  display_name,
  role,
  status,
  referral_code,
  sponsor_account_id,
  joined_at,
  updated_at
) values
(
  @admin_id,
  concat('dr_admin_', left(@suffix, 12)),
  concat('Direct Referral Admin ', left(@suffix, 8)),
  'ADMIN',
  'ACTIVE',
  concat('DRA', left(@suffix, 12)),
  null,
  current_timestamp(6),
  current_timestamp(6)
),
(
  @sponsor_id,
  concat('dr_sponsor_', left(@suffix, 12)),
  concat('Direct Referral Sponsor ', left(@suffix, 8)),
  'USER',
  'ACTIVE',
  concat('DRS', left(@suffix, 12)),
  null,
  current_timestamp(6),
  current_timestamp(6)
),
(
  @member_id,
  concat('dr_member_', left(@suffix, 12)),
  concat('Direct Referral Member ', left(@suffix, 8)),
  'USER',
  'ACTIVE',
  concat('DRM', left(@suffix, 12)),
  @sponsor_id,
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
  concat('direct referral smoke policy ', @suffix),
  @admin_id,
  current_timestamp(6),
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
  is_active,
  created_at
) values (
  @product_id,
  @policy_id,
  concat('Direct Referral Smoke Product ', left(@suffix, 8)),
  'USDC',
  6,
  100,
  1000000000,
  30,
  50,
  1,
  current_timestamp(6)
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
  created_at,
  updated_at
) values (
  @source_staking_id,
  @member_id,
  @product_id,
  @policy_id,
  1000000,
  50,
  30,
  'ACTIVE',
  concat('dr-staking-', @suffix),
  @started_at_ok,
  @matures_at_ok,
  @started_at_ok,
  current_timestamp(6),
  current_timestamp(6)
);

-- valid direct referral rule
insert into referral_bonus_rules (
  id,
  policy_version_id,
  depth,
  bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  1,
  1500,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

select
  policy_version_id,
  depth,
  bonus_bps,
  is_active
from referral_bonus_rules
where policy_version_id = @policy_id;

-- invalid policy FK
insert into referral_bonus_rules (
  id,
  policy_version_id,
  depth,
  bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  '00000000-0000-0000-0000-000000000001',
  1,
  1500,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid depth
insert into referral_bonus_rules (
  id,
  policy_version_id,
  depth,
  bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  0,
  1500,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid rate > 10000
insert into referral_bonus_rules (
  id,
  policy_version_id,
  depth,
  bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  1,
  10001,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- duplicate policy + depth
insert into referral_bonus_rules (
  id,
  policy_version_id,
  depth,
  bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  1,
  1200,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- valid direct referral reward row
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  @sponsor_id,
  null,
  @member_id,
  @source_staking_id,
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  @reward_date_ok,
  150000,
  'CONFIRMED',
  @source_reference_ok,
  null,
  @started_at_ok,
  @started_at_ok,
  json_object(
    'policy_version_id', @policy_id,
    'source_account_id', @member_id,
    'source_staking_id', @source_staking_id,
    'principal_amount_base', '1000000',
    'direct_referral_rate_bps', '1500',
    'calculation_formula_version', 'direct-referral-v1'
  ),
  current_timestamp(6),
  current_timestamp(6)
);

select
  id,
  account_id,
  source_account_id,
  source_account_staking_id,
  reward_type,
  amount_base,
  source_reference
from account_rewards
where id = @reward_id_ok;

-- invalid source account FK
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  uuid(),
  @sponsor_id,
  null,
  '00000000-0000-0000-0000-000000000002',
  @source_staking_id,
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  @reward_date_ok,
  150000,
  'CONFIRMED',
  concat(@source_reference_ok, ':bad-source-account'),
  null,
  @started_at_ok,
  @started_at_ok,
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid source staking FK
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  uuid(),
  @sponsor_id,
  null,
  @member_id,
  '00000000-0000-0000-0000-000000000003',
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  @reward_date_ok,
  150000,
  'CONFIRMED',
  concat(@source_reference_ok, ':bad-source-staking'),
  null,
  @started_at_ok,
  @started_at_ok,
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid direct referral reward: account_staking_id must remain null
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  uuid(),
  @sponsor_id,
  @source_staking_id,
  @member_id,
  @source_staking_id,
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  @reward_date_ok,
  150000,
  'CONFIRMED',
  concat(@source_reference_ok, ':bad-beneficiary-staking'),
  null,
  @started_at_ok,
  @started_at_ok,
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

-- duplicate reward_type + source_reference
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  uuid(),
  @sponsor_id,
  null,
  @member_id,
  @source_staking_id,
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  @reward_date_ok,
  150000,
  'CONFIRMED',
  @source_reference_ok,
  null,
  @started_at_ok,
  @started_at_ok,
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

-- duplicate source staking + sponsor should fail even with a different source_reference
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  uuid(),
  @sponsor_id,
  null,
  @member_id,
  @source_staking_id,
  @policy_id,
  null,
  'DIRECT_REFERRAL',
  @reward_date_ok,
  150000,
  'CONFIRMED',
  concat(@source_reference_ok, ':duplicate-dedupe-key'),
  null,
  @started_at_ok,
  @started_at_ok,
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

-- non direct-referral reward must not carry source columns in 0006 design
insert into account_rewards (
  id,
  account_id,
  account_staking_id,
  source_account_id,
  source_account_staking_id,
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
  uuid(),
  @member_id,
  @source_staking_id,
  @member_id,
  @source_staking_id,
  @policy_id,
  null,
  'DAILY_REWARD',
  @reward_date_ok,
  500,
  'CONFIRMED',
  concat('reward.daily:', @source_staking_id, ':', @reward_date_ok),
  null,
  @started_at_ok,
  @started_at_ok,
  json_object('smoke', true),
  current_timestamp(6),
  current_timestamp(6)
);

select
  (select count(*) from referral_bonus_rules) as rule_count_inside_transaction,
  (select count(*) from account_rewards) as reward_count_inside_transaction;

rollback;

select
  @before_rule_count as before_rule_count,
  (select count(*) from referral_bonus_rules) as after_rollback_rule_count,
  @before_reward_count as before_reward_count,
  (select count(*) from account_rewards) as after_rollback_reward_count;
