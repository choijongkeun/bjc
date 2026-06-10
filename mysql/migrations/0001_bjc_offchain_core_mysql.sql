set sql_safe_updates = 0;

create table if not exists accounts (
  id char(36) not null,
  display_name varchar(255) null,
  role enum('USER','READER','ADMIN') not null default 'USER',
  created_at timestamp not null default current_timestamp,
  primary key (id)
) engine=InnoDB default charset=utf8mb4;

create table if not exists policy_versions (
  id char(36) not null default (uuid()),
  status enum('DRAFT','ACTIVE','RETIRED') not null,
  note text null,
  effective_from date null,
  effective_to date null,
  created_by char(36) null,
  created_at timestamp not null default current_timestamp,
  activated_at timestamp null,
  retired_at timestamp null,
  active_key tinyint generated always as (case when status = 'ACTIVE' then 1 else null end) stored,
  primary key (id),
  key idx_policy_versions_status (status),
  key idx_policy_versions_effective (effective_from, effective_to),
  unique key uniq_policy_versions_active (active_key),
  constraint fk_policy_versions_created_by foreign key (created_by) references accounts(id)
) engine=InnoDB default charset=utf8mb4;

create table if not exists staking_products (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  name varchar(255) not null,
  symbol varchar(32) not null,
  decimals int not null,
  min_stake_amount_base decimal(65,0) not null,
  max_stake_amount_base decimal(65,0) not null,
  staking_days int not null,
  daily_interest_bps decimal(20,0) not null,
  is_active tinyint(1) not null default 1,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  key idx_staking_products_policy (policy_version_id),
  key idx_staking_products_active (is_active),
  constraint fk_staking_products_policy foreign key (policy_version_id) references policy_versions(id),
  constraint chk_staking_products_decimals check (decimals between 0 and 30),
  constraint chk_staking_products_amount_range check (min_stake_amount_base <= max_stake_amount_base),
  constraint chk_staking_products_staking_days check (staking_days > 0),
  constraint chk_staking_products_daily_interest_bps check (daily_interest_bps >= 0)
) engine=InnoDB default charset=utf8mb4;

create table if not exists referral_edges (
  id char(36) not null default (uuid()),
  parent_account_id char(36) not null,
  child_account_id char(36) not null,
  depth int not null,
  path text null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_referral_edges_parent_child (parent_account_id, child_account_id),
  key idx_referral_edges_parent_depth (parent_account_id, depth),
  key idx_referral_edges_child (child_account_id),
  constraint fk_referral_edges_parent foreign key (parent_account_id) references accounts(id),
  constraint fk_referral_edges_child foreign key (child_account_id) references accounts(id),
  constraint chk_referral_edges_depth check (depth > 0),
  constraint chk_referral_edges_no_self check (parent_account_id <> child_account_id)
) engine=InnoDB default charset=utf8mb4;

create table if not exists referral_bonus_rules (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  depth int not null,
  bonus_bps decimal(20,0) not null,
  is_active tinyint(1) not null default 1,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_referral_bonus_rules_version_depth (policy_version_id, depth),
  constraint fk_referral_bonus_rules_policy foreign key (policy_version_id) references policy_versions(id),
  constraint chk_referral_bonus_rules_depth check (depth > 0),
  constraint chk_referral_bonus_rules_bonus_bps check (bonus_bps >= 0)
) engine=InnoDB default charset=utf8mb4;

create table if not exists rank_rules (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  rank_level int not null,
  required_lines int not null,
  required_weak_volume_base decimal(65,0) not null,
  rank_share_bps decimal(20,0) not null,
  effective_bonus_bps decimal(20,0) not null,
  is_active tinyint(1) not null default 1,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_rank_rules_version_level (policy_version_id, rank_level),
  constraint fk_rank_rules_policy foreign key (policy_version_id) references policy_versions(id),
  constraint chk_rank_rules_level check (rank_level between 1 and 10),
  constraint chk_rank_rules_required_lines check (required_lines >= 0),
  constraint chk_rank_rules_rank_share_bps check (rank_share_bps between 0 and 10000),
  constraint chk_rank_rules_effective_bonus_bps check (effective_bonus_bps between 0 and 10000)
) engine=InnoDB default charset=utf8mb4;

create table if not exists contribution_weight_rules (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  depth int not null,
  weight_bps decimal(20,0) not null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_contribution_weight_rules_version_depth (policy_version_id, depth),
  constraint fk_contribution_weight_rules_policy foreign key (policy_version_id) references policy_versions(id),
  constraint chk_contribution_weight_rules_depth check (depth between 1 and 45),
  constraint chk_contribution_weight_rules_weight_bps check (weight_bps between 0 and 10000)
) engine=InnoDB default charset=utf8mb4;

create table if not exists withdrawal_fee_rules (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  withdrawal_source_type enum('DAILY_REWARD','BONUS') not null,
  schedule_days int not null,
  fee_bps decimal(20,0) not null,
  fee_mode enum('DEDUCT_FROM_WITHDRAWAL','PREPAY_BJC') not null default 'PREPAY_BJC',
  is_active tinyint(1) not null default 1,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_withdrawal_fee_rules (policy_version_id, withdrawal_source_type, schedule_days),
  constraint fk_withdrawal_fee_rules_policy foreign key (policy_version_id) references policy_versions(id),
  constraint chk_withdrawal_fee_rules_schedule_days check (schedule_days > 0),
  constraint chk_withdrawal_fee_rules_fee_bps check (fee_bps between 0 and 10000)
) engine=InnoDB default charset=utf8mb4;

create table if not exists sidecar_events (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  status enum('NORMAL','SIDECAR_ACTIVE','RELEASED') not null,
  trigger_reason text null,
  freeze_bps decimal(20,0) not null default 3000,
  release_bps decimal(20,0) not null default 7000,
  triggered_at timestamp null,
  released_at timestamp null,
  created_by char(36) null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  key idx_sidecar_events_policy_created (policy_version_id, created_at),
  constraint fk_sidecar_events_policy foreign key (policy_version_id) references policy_versions(id),
  constraint fk_sidecar_events_created_by foreign key (created_by) references accounts(id),
  constraint chk_sidecar_events_freeze_bps check (freeze_bps between 0 and 10000),
  constraint chk_sidecar_events_release_bps check (release_bps between 0 and 10000),
  constraint chk_sidecar_events_sum check (freeze_bps + release_bps = 10000)
) engine=InnoDB default charset=utf8mb4;

create table if not exists calc_runs (
  id char(36) not null default (uuid()),
  policy_version_id char(36) not null,
  run_type enum('DAILY_REWARD','DIRECT_REFERRAL','RANK_BONUS','CONTRIBUTION','WITHDRAWAL_FEE','SIDECAR') not null,
  run_date date not null,
  status enum('PENDING','RUNNING','SUCCEEDED','FAILED','FINALIZED') not null,
  started_at timestamp null,
  finished_at timestamp null,
  finalized_at timestamp null,
  created_by char(36) null,
  created_at timestamp not null default current_timestamp,
  error_message text null,
  primary key (id),
  unique key uniq_calc_runs (policy_version_id, run_type, run_date),
  key idx_calc_runs_status (status),
  key idx_calc_runs_date (run_date),
  constraint fk_calc_runs_policy foreign key (policy_version_id) references policy_versions(id),
  constraint fk_calc_runs_created_by foreign key (created_by) references accounts(id)
) engine=InnoDB default charset=utf8mb4;

create table if not exists ledger_events (
  id char(36) not null default (uuid()),
  account_id char(36) not null,
  product_id char(36) not null,
  policy_version_id char(36) not null,
  calc_run_id char(36) null,
  event_time timestamp not null,
  event_type enum(
    'STAKE',
    'UNSTAKE',
    'DAILY_REWARD_ACCRUAL',
    'DAILY_REWARD_PAYOUT',
    'DIRECT_REFERRAL_BONUS',
    'RANK_BONUS',
    'CONTRIBUTION_BONUS',
    'WITHDRAWAL_REQUEST',
    'WITHDRAWAL_FEE',
    'WITHDRAWAL_RELEASE',
    'WITHDRAWAL_FREEZE',
    'WITHDRAWAL_UNFREEZE',
    'SIDECAR_TRIGGER',
    'SIDECAR_RELEASE',
    'ADJUSTMENT'
  ) not null,
  amount_base decimal(65,0) not null,
  decimals int not null,
  symbol varchar(32) not null,
  reference_id varchar(255) not null,
  related_account_id char(36) null,
  meta json not null,
  created_by char(36) null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_ledger_events_reference (reference_id),
  key idx_ledger_events_account_time (account_id, event_time),
  key idx_ledger_events_policy_time (policy_version_id, event_time),
  key idx_ledger_events_type_time (event_type, event_time),
  constraint fk_ledger_events_account foreign key (account_id) references accounts(id),
  constraint fk_ledger_events_product foreign key (product_id) references staking_products(id),
  constraint fk_ledger_events_policy foreign key (policy_version_id) references policy_versions(id),
  constraint fk_ledger_events_calc_run foreign key (calc_run_id) references calc_runs(id),
  constraint fk_ledger_events_related_account foreign key (related_account_id) references accounts(id),
  constraint fk_ledger_events_created_by foreign key (created_by) references accounts(id),
  constraint chk_ledger_events_decimals check (decimals between 0 and 30)
) engine=InnoDB default charset=utf8mb4;

create table if not exists settlement_items (
  id char(36) not null default (uuid()),
  calc_run_id char(36) not null,
  settlement_type enum(
    'DAILY_REWARD',
    'DIRECT_REFERRAL',
    'RANK_BONUS',
    'CONTRIBUTION',
    'WITHDRAWAL_FEE',
    'WITHDRAWAL_FREEZE',
    'WITHDRAWAL_RELEASE',
    'ADJUSTMENT'
  ) not null,
  account_id char(36) not null,
  ledger_event_id char(36) null,
  amount_base decimal(65,0) not null,
  decimals int not null,
  symbol varchar(32) not null,
  reference_id varchar(255) null,
  meta json not null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  key idx_settlement_items_calc_account (calc_run_id, account_id),
  key idx_settlement_items_type (settlement_type),
  constraint fk_settlement_items_calc_run foreign key (calc_run_id) references calc_runs(id),
  constraint fk_settlement_items_account foreign key (account_id) references accounts(id),
  constraint fk_settlement_items_ledger_event foreign key (ledger_event_id) references ledger_events(id),
  constraint chk_settlement_items_decimals check (decimals between 0 and 30)
) engine=InnoDB default charset=utf8mb4;

create table if not exists contribution_daily_pools (
  id char(36) not null default (uuid()),
  calc_run_id char(36) not null,
  policy_version_id char(36) not null,
  pool_date date not null,
  total_withdrawal_amount_base decimal(65,0) not null,
  pool_amount_base decimal(65,0) not null,
  decimals int not null,
  symbol varchar(32) not null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_contribution_daily_pools_policy_date (policy_version_id, pool_date),
  constraint fk_contribution_daily_pools_calc_run foreign key (calc_run_id) references calc_runs(id),
  constraint fk_contribution_daily_pools_policy foreign key (policy_version_id) references policy_versions(id),
  constraint chk_contribution_daily_pools_decimals check (decimals between 0 and 30)
) engine=InnoDB default charset=utf8mb4;

create table if not exists contribution_rewards (
  id char(36) not null default (uuid()),
  calc_run_id char(36) not null,
  account_id char(36) not null,
  score decimal(38,10) not null,
  total_score decimal(38,10) not null,
  reward_amount_base decimal(65,0) not null,
  decimals int not null,
  symbol varchar(32) not null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  unique key uniq_contribution_rewards_run_account (calc_run_id, account_id),
  constraint fk_contribution_rewards_calc_run foreign key (calc_run_id) references calc_runs(id),
  constraint fk_contribution_rewards_account foreign key (account_id) references accounts(id),
  constraint chk_contribution_rewards_decimals check (decimals between 0 and 30)
) engine=InnoDB default charset=utf8mb4;

create table if not exists admin_audit_log (
  id char(36) not null default (uuid()),
  actor_account_id char(36) null,
  action varchar(255) not null,
  target_table varchar(255) null,
  target_id char(36) null,
  meta json not null,
  created_at timestamp not null default current_timestamp,
  primary key (id),
  key idx_admin_audit_log_created (created_at),
  constraint fk_admin_audit_log_actor foreign key (actor_account_id) references accounts(id)
) engine=InnoDB default charset=utf8mb4;
