set sql_safe_updates = 0;

-- BJC rank bonus additive migration
-- Assumes 0001_bjc_offchain_core_mysql.sql through
-- 0006_bjc_direct_referral_rewards_mysql.sql are already applied.
--
-- Design decisions in this migration:
-- - Reuse existing `rank_rules` instead of inventing unverified rank_code/rank_name columns.
-- - Introduce qualification/status/history tables so rank calculation is separated from
--   financial reward creation.
-- - Add `RANK_QUALIFICATION` to `calc_runs.run_type` to separate qualification runs from
--   `RANK_BONUS` reward runs.
-- - Make `ledger_events.product_id` nullable so `RANK_BONUS` can be recorded without
--   assigning an arbitrary staking product.
-- - Keep `account_rewards` unchanged for rank bonus dedupe because
--   `unique (reward_type, source_reference)` is already sufficient.

alter table rank_rules
  add column updated_at datetime(6) not null
    default current_timestamp(6)
    on update current_timestamp(6)
    after created_at,
  add constraint chk_rank_rules_required_weak_volume_base
    check (required_weak_volume_base >= 0);

alter table calc_runs
  modify column run_type enum(
    'DAILY_REWARD',
    'DIRECT_REFERRAL',
    'RANK_QUALIFICATION',
    'RANK_BONUS',
    'CONTRIBUTION',
    'WITHDRAWAL_FEE',
    'SIDECAR'
  ) not null;

alter table ledger_events
  modify column product_id char(36) null;

create table if not exists account_rank_status (
  account_id char(36) not null,
  policy_version_id char(36) not null,
  current_rank_level int null,
  qualified_at datetime(6) null,
  maintained_until date null,
  last_qualification_calc_run_id char(36) null,
  last_bonus_calc_run_id char(36) null,
  last_change_type enum('INITIAL', 'PROMOTED', 'MAINTAINED', 'DEMOTED') null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (account_id),
  key idx_account_rank_status_policy_rank (policy_version_id, current_rank_level),
  key idx_account_rank_status_last_qualification (last_qualification_calc_run_id),
  key idx_account_rank_status_last_bonus (last_bonus_calc_run_id),
  constraint fk_account_rank_status_account
    foreign key (account_id) references accounts(id),
  constraint fk_account_rank_status_policy
    foreign key (policy_version_id) references policy_versions(id),
  constraint fk_account_rank_status_last_qualification
    foreign key (last_qualification_calc_run_id) references calc_runs(id),
  constraint fk_account_rank_status_last_bonus
    foreign key (last_bonus_calc_run_id) references calc_runs(id),
  constraint chk_account_rank_status_current_rank_level
    check (current_rank_level is null or current_rank_level between 1 and 10),
  constraint chk_account_rank_status_maintained_until
    check (maintained_until is null or current_rank_level is not null)
) engine=InnoDB default charset=utf8mb4;

create table if not exists account_rank_qualification_results (
  id char(36) not null default (uuid()),
  calc_run_id char(36) not null,
  account_id char(36) not null,
  policy_version_id char(36) not null,
  calculation_date date not null,
  period_from date not null,
  period_to date not null,
  previous_rank_level int null,
  qualified_rank_level int null,
  applied_rank_level int null,
  result_status enum('QUALIFIED', 'UNQUALIFIED', 'DEMOTION_CANDIDATE', 'NO_CHANGE') not null,
  personal_active_stake_amount_base decimal(65,0) not null default 0,
  personal_cumulative_stake_amount_base decimal(65,0) not null default 0,
  direct_referral_count int not null default 0,
  direct_active_referral_count int not null default 0,
  left_leg_volume_base decimal(65,0) not null default 0,
  right_leg_volume_base decimal(65,0) not null default 0,
  weak_leg_volume_base decimal(65,0) not null default 0,
  strong_leg_volume_base decimal(65,0) not null default 0,
  downline_daily_reward_amount_base decimal(65,0) not null default 0,
  qualification_snapshot_json json null,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key uniq_account_rank_qualification_results_run_account (calc_run_id, account_id),
  key idx_account_rank_qualification_results_account_date (account_id, calculation_date),
  key idx_account_rank_qualification_results_policy_date (policy_version_id, calculation_date),
  key idx_account_rank_qualification_results_status_date (result_status, calculation_date),
  constraint fk_account_rank_qualification_results_calc_run
    foreign key (calc_run_id) references calc_runs(id),
  constraint fk_account_rank_qualification_results_account
    foreign key (account_id) references accounts(id),
  constraint fk_account_rank_qualification_results_policy
    foreign key (policy_version_id) references policy_versions(id),
  constraint chk_account_rank_qualification_results_period
    check (period_from <= period_to),
  constraint chk_account_rank_qualification_results_previous_rank
    check (previous_rank_level is null or previous_rank_level between 1 and 10),
  constraint chk_account_rank_qualification_results_qualified_rank
    check (qualified_rank_level is null or qualified_rank_level between 1 and 10),
  constraint chk_account_rank_qualification_results_applied_rank
    check (applied_rank_level is null or applied_rank_level between 1 and 10),
  constraint chk_account_rank_qualification_results_personal_active
    check (personal_active_stake_amount_base >= 0),
  constraint chk_account_rank_qualification_results_personal_cumulative
    check (personal_cumulative_stake_amount_base >= 0),
  constraint chk_account_rank_qualification_results_direct_referral_count
    check (direct_referral_count >= 0),
  constraint chk_account_rank_qualification_results_direct_active_referral_count
    check (direct_active_referral_count >= 0),
  constraint chk_account_rank_qualification_results_left_leg_volume
    check (left_leg_volume_base >= 0),
  constraint chk_account_rank_qualification_results_right_leg_volume
    check (right_leg_volume_base >= 0),
  constraint chk_account_rank_qualification_results_weak_leg_volume
    check (weak_leg_volume_base >= 0),
  constraint chk_account_rank_qualification_results_strong_leg_volume
    check (strong_leg_volume_base >= 0),
  constraint chk_account_rank_qualification_results_downline_daily_reward
    check (downline_daily_reward_amount_base >= 0)
) engine=InnoDB default charset=utf8mb4;

create table if not exists account_rank_history (
  id char(36) not null default (uuid()),
  account_id char(36) not null,
  policy_version_id char(36) not null,
  calc_run_id char(36) not null,
  qualification_result_id char(36) null,
  effective_date date not null,
  previous_rank_level int null,
  calculated_rank_level int null,
  final_rank_level int null,
  change_type enum('INITIAL', 'PROMOTED', 'MAINTAINED', 'DEMOTED') not null,
  personal_active_stake_amount_base decimal(65,0) not null default 0,
  personal_cumulative_stake_amount_base decimal(65,0) not null default 0,
  direct_referral_count int not null default 0,
  direct_active_referral_count int not null default 0,
  left_leg_volume_base decimal(65,0) not null default 0,
  right_leg_volume_base decimal(65,0) not null default 0,
  weak_leg_volume_base decimal(65,0) not null default 0,
  strong_leg_volume_base decimal(65,0) not null default 0,
  downline_daily_reward_amount_base decimal(65,0) not null default 0,
  qualification_snapshot_json json null,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key uniq_account_rank_history_run_account (calc_run_id, account_id),
  key idx_account_rank_history_account_effective (account_id, effective_date),
  key idx_account_rank_history_policy_effective (policy_version_id, effective_date),
  key idx_account_rank_history_change_type (change_type, effective_date),
  key idx_account_rank_history_qualification_result (qualification_result_id),
  constraint fk_account_rank_history_account
    foreign key (account_id) references accounts(id),
  constraint fk_account_rank_history_policy
    foreign key (policy_version_id) references policy_versions(id),
  constraint fk_account_rank_history_calc_run
    foreign key (calc_run_id) references calc_runs(id),
  constraint fk_account_rank_history_qualification_result
    foreign key (qualification_result_id) references account_rank_qualification_results(id),
  constraint chk_account_rank_history_previous_rank
    check (previous_rank_level is null or previous_rank_level between 1 and 10),
  constraint chk_account_rank_history_calculated_rank
    check (calculated_rank_level is null or calculated_rank_level between 1 and 10),
  constraint chk_account_rank_history_final_rank
    check (final_rank_level is null or final_rank_level between 1 and 10),
  constraint chk_account_rank_history_personal_active
    check (personal_active_stake_amount_base >= 0),
  constraint chk_account_rank_history_personal_cumulative
    check (personal_cumulative_stake_amount_base >= 0),
  constraint chk_account_rank_history_direct_referral_count
    check (direct_referral_count >= 0),
  constraint chk_account_rank_history_direct_active_referral_count
    check (direct_active_referral_count >= 0),
  constraint chk_account_rank_history_left_leg_volume
    check (left_leg_volume_base >= 0),
  constraint chk_account_rank_history_right_leg_volume
    check (right_leg_volume_base >= 0),
  constraint chk_account_rank_history_weak_leg_volume
    check (weak_leg_volume_base >= 0),
  constraint chk_account_rank_history_strong_leg_volume
    check (strong_leg_volume_base >= 0),
  constraint chk_account_rank_history_downline_daily_reward
    check (downline_daily_reward_amount_base >= 0)
) engine=InnoDB default charset=utf8mb4;
