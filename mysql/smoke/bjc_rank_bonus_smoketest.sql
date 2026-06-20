set sql_safe_updates = 0;

-- Usage:
-- mysql --force < mysql/smoke/bjc_rank_bonus_smoketest.sql
-- The script intentionally triggers several failing statements and rolls back at the end.

set @suffix := replace(uuid(), '-', '');
set @before_rank_rule_count := (select count(*) from rank_rules);
set @before_rank_status_count := (select count(*) from account_rank_status);
set @before_rank_result_count := (select count(*) from account_rank_qualification_results);
set @before_rank_history_count := (select count(*) from account_rank_history);
set @before_reward_count := (select count(*) from account_rewards);
set @before_ledger_count := (select count(*) from ledger_events);

start transaction;

set @admin_id := uuid();
set @member_id := uuid();
set @policy_id := uuid();
set @qualification_run_id := uuid();
set @bonus_run_id := uuid();
set @qualification_result_id := uuid();
set @history_id := uuid();
set @rank_reward_id := uuid();
set @rank_ledger_id := uuid();
set @calculation_date := date('2026-06-30');
set @rank_source_reference := concat('rank_bonus:', @calculation_date, ':', @member_id, ':3');

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
  concat('rank_admin_', left(@suffix, 12)),
  concat('Rank Admin ', left(@suffix, 8)),
  'ADMIN',
  'ACTIVE',
  concat('RKA', left(@suffix, 12)),
  null,
  current_timestamp(6),
  current_timestamp(6)
),
(
  @member_id,
  concat('rank_member_', left(@suffix, 12)),
  concat('Rank Member ', left(@suffix, 8)),
  'USER',
  'ACTIVE',
  concat('RKM', left(@suffix, 12)),
  null,
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
  concat('rank bonus smoke policy ', @suffix),
  @admin_id,
  current_timestamp(6),
  null
);

-- valid rank rule
insert into rank_rules (
  id,
  policy_version_id,
  rank_level,
  required_lines,
  required_weak_volume_base,
  rank_share_bps,
  effective_bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  3,
  4,
  10000000,
  3000,
  1200,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

select
  policy_version_id,
  rank_level,
  required_lines,
  required_weak_volume_base,
  rank_share_bps,
  effective_bonus_bps
from rank_rules
where policy_version_id = @policy_id;

-- duplicate rank level
insert into rank_rules (
  id,
  policy_version_id,
  rank_level,
  required_lines,
  required_weak_volume_base,
  rank_share_bps,
  effective_bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  3,
  5,
  12000000,
  3500,
  1500,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid weak volume
insert into rank_rules (
  id,
  policy_version_id,
  rank_level,
  required_lines,
  required_weak_volume_base,
  rank_share_bps,
  effective_bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  4,
  5,
  -1,
  3500,
  1500,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid rate
insert into rank_rules (
  id,
  policy_version_id,
  rank_level,
  required_lines,
  required_weak_volume_base,
  rank_share_bps,
  effective_bonus_bps,
  is_active,
  created_at,
  updated_at
) values (
  uuid(),
  @policy_id,
  4,
  5,
  12000000,
  10001,
  1500,
  1,
  current_timestamp(6),
  current_timestamp(6)
);

-- qualification calc run uses new enum
insert into calc_runs (
  id,
  policy_version_id,
  run_type,
  run_date,
  status,
  started_at,
  finished_at,
  finalized_at,
  created_by,
  created_at,
  error_message
) values
(
  @qualification_run_id,
  @policy_id,
  'RANK_QUALIFICATION',
  @calculation_date,
  'SUCCEEDED',
  current_timestamp(6),
  current_timestamp(6),
  null,
  @admin_id,
  current_timestamp(6),
  null
),
(
  @bonus_run_id,
  @policy_id,
  'RANK_BONUS',
  @calculation_date,
  'SUCCEEDED',
  current_timestamp(6),
  current_timestamp(6),
  null,
  @admin_id,
  current_timestamp(6),
  null
);

-- valid account rank status
insert into account_rank_status (
  account_id,
  policy_version_id,
  current_rank_level,
  qualified_at,
  maintained_until,
  last_qualification_calc_run_id,
  last_bonus_calc_run_id,
  last_change_type,
  created_at,
  updated_at
) values (
  @member_id,
  @policy_id,
  3,
  current_timestamp(6),
  null,
  @qualification_run_id,
  @bonus_run_id,
  'PROMOTED',
  current_timestamp(6),
  current_timestamp(6)
);

-- invalid account rank status FK
insert into account_rank_status (
  account_id,
  policy_version_id,
  current_rank_level,
  qualified_at,
  maintained_until,
  last_qualification_calc_run_id,
  last_bonus_calc_run_id,
  last_change_type,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000010',
  @policy_id,
  2,
  current_timestamp(6),
  null,
  @qualification_run_id,
  null,
  'INITIAL',
  current_timestamp(6),
  current_timestamp(6)
);

-- valid qualification result
insert into account_rank_qualification_results (
  id,
  calc_run_id,
  account_id,
  policy_version_id,
  calculation_date,
  period_from,
  period_to,
  previous_rank_level,
  qualified_rank_level,
  applied_rank_level,
  result_status,
  personal_active_stake_amount_base,
  personal_cumulative_stake_amount_base,
  direct_referral_count,
  direct_active_referral_count,
  left_leg_volume_base,
  right_leg_volume_base,
  weak_leg_volume_base,
  strong_leg_volume_base,
  downline_daily_reward_amount_base,
  qualification_snapshot_json,
  created_at
) values (
  @qualification_result_id,
  @qualification_run_id,
  @member_id,
  @policy_id,
  @calculation_date,
  @calculation_date,
  @calculation_date,
  2,
  3,
  3,
  'QUALIFIED',
  1000000,
  3000000,
  5,
  4,
  15000000,
  13000000,
  13000000,
  15000000,
  1200000,
  json_object(
    'required_lines', 4,
    'required_weak_volume_base', '10000000',
    'rank_share_bps', '3000',
    'effective_bonus_bps', '1200'
  ),
  current_timestamp(6)
);

-- duplicate qualification result unique
insert into account_rank_qualification_results (
  id,
  calc_run_id,
  account_id,
  policy_version_id,
  calculation_date,
  period_from,
  period_to,
  previous_rank_level,
  qualified_rank_level,
  applied_rank_level,
  result_status,
  personal_active_stake_amount_base,
  personal_cumulative_stake_amount_base,
  direct_referral_count,
  direct_active_referral_count,
  left_leg_volume_base,
  right_leg_volume_base,
  weak_leg_volume_base,
  strong_leg_volume_base,
  downline_daily_reward_amount_base,
  qualification_snapshot_json,
  created_at
) values (
  uuid(),
  @qualification_run_id,
  @member_id,
  @policy_id,
  @calculation_date,
  @calculation_date,
  @calculation_date,
  2,
  3,
  3,
  'QUALIFIED',
  1000000,
  3000000,
  5,
  4,
  15000000,
  13000000,
  13000000,
  15000000,
  1200000,
  json_object('duplicate', true),
  current_timestamp(6)
);

-- valid history row
insert into account_rank_history (
  id,
  account_id,
  policy_version_id,
  calc_run_id,
  qualification_result_id,
  effective_date,
  previous_rank_level,
  calculated_rank_level,
  final_rank_level,
  change_type,
  personal_active_stake_amount_base,
  personal_cumulative_stake_amount_base,
  direct_referral_count,
  direct_active_referral_count,
  left_leg_volume_base,
  right_leg_volume_base,
  weak_leg_volume_base,
  strong_leg_volume_base,
  downline_daily_reward_amount_base,
  qualification_snapshot_json,
  created_at
) values (
  @history_id,
  @member_id,
  @policy_id,
  @qualification_run_id,
  @qualification_result_id,
  @calculation_date,
  2,
  3,
  3,
  'PROMOTED',
  1000000,
  3000000,
  5,
  4,
  15000000,
  13000000,
  13000000,
  15000000,
  1200000,
  json_object('history', true),
  current_timestamp(6)
);

-- invalid change_type
insert into account_rank_history (
  id,
  account_id,
  policy_version_id,
  calc_run_id,
  qualification_result_id,
  effective_date,
  previous_rank_level,
  calculated_rank_level,
  final_rank_level,
  change_type,
  personal_active_stake_amount_base,
  personal_cumulative_stake_amount_base,
  direct_referral_count,
  direct_active_referral_count,
  left_leg_volume_base,
  right_leg_volume_base,
  weak_leg_volume_base,
  strong_leg_volume_base,
  downline_daily_reward_amount_base,
  qualification_snapshot_json,
  created_at
) values (
  uuid(),
  @member_id,
  @policy_id,
  @qualification_run_id,
  @qualification_result_id,
  @calculation_date,
  2,
  3,
  3,
  'BAD',
  1000000,
  3000000,
  5,
  4,
  15000000,
  13000000,
  13000000,
  15000000,
  1200000,
  json_object('bad', true),
  current_timestamp(6)
);

-- nullable product_id for rank bonus ledger
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
  created_by,
  created_at
) values (
  @rank_ledger_id,
  @member_id,
  null,
  @policy_id,
  @bonus_run_id,
  current_timestamp(6),
  'RANK_BONUS',
  2200000,
  6,
  'USDC',
  concat('ledger:', @rank_source_reference),
  null,
  json_object('rank_level', 3),
  @admin_id,
  current_timestamp(6)
);

select
  id,
  account_id,
  product_id,
  event_type,
  amount_base,
  reference_id
from ledger_events
where id = @rank_ledger_id;

-- valid rank bonus reward row
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
  reversal_reward_id,
  available_at,
  confirmed_at,
  reversed_at,
  metadata_json,
  created_at,
  updated_at
) values (
  @rank_reward_id,
  @member_id,
  null,
  null,
  null,
  @policy_id,
  @bonus_run_id,
  'RANK_BONUS',
  @calculation_date,
  2200000,
  'CONFIRMED',
  @rank_source_reference,
  null,
  null,
  current_timestamp(6),
  current_timestamp(6),
  null,
  json_object(
    'rank_level', 3,
    'qualification_calc_run_id', @qualification_run_id,
    'effective_bonus_bps', '1200'
  ),
  current_timestamp(6),
  current_timestamp(6)
);

-- duplicate period reward
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
  reversal_reward_id,
  available_at,
  confirmed_at,
  reversed_at,
  metadata_json,
  created_at,
  updated_at
) values (
  uuid(),
  @member_id,
  null,
  null,
  null,
  @policy_id,
  @bonus_run_id,
  'RANK_BONUS',
  @calculation_date,
  2200000,
  'CONFIRMED',
  @rank_source_reference,
  null,
  null,
  current_timestamp(6),
  current_timestamp(6),
  null,
  json_object('duplicate', true),
  current_timestamp(6),
  current_timestamp(6)
);

select
  (select count(*) from rank_rules) as rank_rule_count_inside_transaction,
  (select count(*) from account_rank_status) as rank_status_count_inside_transaction,
  (select count(*) from account_rank_qualification_results) as rank_result_count_inside_transaction,
  (select count(*) from account_rank_history) as rank_history_count_inside_transaction,
  (select count(*) from account_rewards) as reward_count_inside_transaction,
  (select count(*) from ledger_events) as ledger_count_inside_transaction;

rollback;

select
  @before_rank_rule_count as before_rank_rule_count,
  (select count(*) from rank_rules) as after_rollback_rank_rule_count,
  @before_rank_status_count as before_rank_status_count,
  (select count(*) from account_rank_status) as after_rollback_rank_status_count,
  @before_rank_result_count as before_rank_result_count,
  (select count(*) from account_rank_qualification_results) as after_rollback_rank_result_count,
  @before_rank_history_count as before_rank_history_count,
  (select count(*) from account_rank_history) as after_rollback_rank_history_count,
  @before_reward_count as before_reward_count,
  (select count(*) from account_rewards) as after_rollback_reward_count,
  @before_ledger_count as before_ledger_count,
  (select count(*) from ledger_events) as after_rollback_ledger_count;
