set sql_safe_updates = 0;

-- BJC account rewards additive migration
-- Assumes 0001_bjc_offchain_core_mysql.sql, 0002_bjc_member_referral_binary_auth_mysql.sql,
-- and 0003_bjc_account_stakings_mysql.sql are already applied.
--
-- Design decisions in this migration:
-- - `account_rewards` becomes the reward source of truth.
-- - `ledger_events` remains the append-only financial audit ledger.
-- - `calc_runs` is reused as-is; no additive column is required in 0004.
-- - reward reversal is modeled as a separate append-only row with:
--   - `reward_type = 'REVERSAL'`
--   - negative `amount_base`
--   - `reversal_reward_id` pointing to the original reward row

create table if not exists account_rewards (
  id char(36) not null default (uuid()),
  account_id char(36) not null,
  account_staking_id char(36) null,
  policy_version_id char(36) not null,
  calc_run_id char(36) null,
  reward_type enum(
    'DAILY_REWARD',
    'DIRECT_REFERRAL',
    'RANK_BONUS',
    'CONTRIBUTION',
    'WITHDRAWAL_FEE',
    'SIDECAR',
    'ADJUSTMENT',
    'REVERSAL'
  ) not null,
  reward_date date not null,
  amount_base decimal(65,0) not null,
  status enum('PENDING', 'CONFIRMED', 'REVERSED') not null default 'PENDING',
  source_reference varchar(255) not null,
  source_ledger_event_id char(36) null,
  reversal_reward_id char(36) null,
  available_at datetime(6) null,
  confirmed_at datetime(6) null,
  reversed_at datetime(6) null,
  metadata_json json null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  daily_reward_dedupe_key varchar(255)
    generated always as (
      case
        when reward_type = 'DAILY_REWARD'
          then concat(account_staking_id, ':', cast(reward_date as char(10)))
        else null
      end
    ) stored,
  primary key (id),
  unique key uniq_account_rewards_daily_reward_dedupe (daily_reward_dedupe_key),
  unique key uniq_account_rewards_reward_type_source_reference (reward_type, source_reference),
  unique key uniq_account_rewards_source_ledger_event_id (source_ledger_event_id),
  unique key uniq_account_rewards_reversal_reward_id (reversal_reward_id),
  key idx_account_rewards_account_status_reward_date (account_id, status, reward_date),
  key idx_account_rewards_account_staking_reward_date (account_staking_id, reward_date),
  key idx_account_rewards_reward_type_status_reward_date (reward_type, status, reward_date),
  key idx_account_rewards_calc_run_id (calc_run_id),
  key idx_account_rewards_available_at_status (available_at, status),
  key idx_account_rewards_created_at (created_at),
  key idx_account_rewards_policy_reward_date (policy_version_id, reward_date),
  constraint fk_account_rewards_account
    foreign key (account_id) references accounts(id),
  constraint fk_account_rewards_account_staking
    foreign key (account_staking_id) references account_stakings(id),
  constraint fk_account_rewards_policy
    foreign key (policy_version_id) references policy_versions(id),
  constraint fk_account_rewards_calc_run
    foreign key (calc_run_id) references calc_runs(id),
  constraint fk_account_rewards_source_ledger_event
    foreign key (source_ledger_event_id) references ledger_events(id),
  constraint fk_account_rewards_reversal_reward
    foreign key (reversal_reward_id) references account_rewards(id),
  constraint chk_account_rewards_source_reference
    check (char_length(trim(source_reference)) > 0),
  constraint chk_account_rewards_daily_reward_staking
    check (
      (reward_type = 'DAILY_REWARD' and account_staking_id is not null)
      or
      (reward_type <> 'DAILY_REWARD')
    ),
  constraint chk_account_rewards_amount_non_zero
    check (amount_base <> 0),
  constraint chk_account_rewards_amount_direction
    check (
      (reward_type = 'REVERSAL' and amount_base < 0)
      or
      (reward_type <> 'REVERSAL' and amount_base > 0)
    ),
  constraint chk_account_rewards_reversal_link
    check (
      (reward_type = 'REVERSAL' and reversal_reward_id is not null)
      or
      (reward_type <> 'REVERSAL' and reversal_reward_id is null)
    ),
  constraint chk_account_rewards_reversal_not_self
    check (reversal_reward_id is null or reversal_reward_id <> id),
  constraint chk_account_rewards_status_timestamps
    check (
      (status = 'PENDING' and confirmed_at is null and reversed_at is null)
      or
      (status = 'CONFIRMED' and confirmed_at is not null and reversed_at is null)
      or
      (status = 'REVERSED' and confirmed_at is not null and reversed_at is not null)
    ),
  constraint chk_account_rewards_available_requires_confirmed
    check (available_at is null or confirmed_at is not null),
  constraint chk_account_rewards_timestamp_order
    check (
      (confirmed_at is null or available_at is null or available_at >= confirmed_at)
      and
      (confirmed_at is null or reversed_at is null or reversed_at >= confirmed_at)
    )
) engine=InnoDB default charset=utf8mb4;
