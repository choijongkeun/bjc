set sql_safe_updates = 0;

-- BJC account staking additive migration
-- Assumes 0001_bjc_offchain_core_mysql.sql and 0002_bjc_member_referral_binary_auth_mysql.sql
-- are already applied.

create table if not exists account_stakings (
  id char(36) not null default (uuid()),
  account_id char(36) not null,
  staking_product_id char(36) not null,
  policy_version_id char(36) not null,
  principal_amount_base decimal(65,0) not null,
  daily_interest_bps_snapshot decimal(20,0) not null,
  duration_days_snapshot int not null,
  status varchar(20) not null,
  idempotency_key varchar(128) not null,
  started_at datetime(6) null,
  matures_at datetime(6) null,
  activated_at datetime(6) null,
  cancel_requested_at datetime(6) null,
  cancelled_at datetime(6) null,
  matured_at datetime(6) null,
  closed_at datetime(6) null,
  source_ledger_event_id char(36) null,
  cancellation_ledger_event_id char(36) null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key uniq_account_stakings_idempotency_key (idempotency_key),
  key idx_account_stakings_account_status (account_id, status),
  key idx_account_stakings_product_status (staking_product_id, status),
  key idx_account_stakings_policy_status (policy_version_id, status),
  key idx_account_stakings_started_at (started_at),
  key idx_account_stakings_matures_at (matures_at),
  key idx_account_stakings_created_at (created_at),
  key idx_account_stakings_source_ledger_event_id (source_ledger_event_id),
  key idx_account_stakings_cancellation_ledger_event_id (cancellation_ledger_event_id),
  constraint fk_account_stakings_account
    foreign key (account_id) references accounts(id),
  constraint fk_account_stakings_product
    foreign key (staking_product_id) references staking_products(id),
  constraint fk_account_stakings_policy
    foreign key (policy_version_id) references policy_versions(id),
  constraint fk_account_stakings_source_ledger_event
    foreign key (source_ledger_event_id) references ledger_events(id),
  constraint fk_account_stakings_cancellation_ledger_event
    foreign key (cancellation_ledger_event_id) references ledger_events(id),
  constraint chk_account_stakings_status
    check (status in ('PENDING', 'ACTIVE', 'CANCEL_REQUESTED', 'CANCELLED', 'MATURED', 'CLOSED')),
  constraint chk_account_stakings_principal_amount_base
    check (principal_amount_base > 0),
  constraint chk_account_stakings_daily_interest_bps_snapshot
    check (daily_interest_bps_snapshot >= 0),
  constraint chk_account_stakings_duration_days_snapshot
    check (duration_days_snapshot > 0),
  constraint chk_account_stakings_idempotency_key
    check (char_length(trim(idempotency_key)) > 0),
  constraint chk_account_stakings_started_matures_pair
    check (
      (started_at is null and matures_at is null)
      or
      (started_at is not null and matures_at is not null and matures_at >= started_at)
    )
) engine=InnoDB default charset=utf8mb4;

-- Keep the legacy DAILY_REWARD_ACCRUAL enum and add staking lifecycle events only.
alter table ledger_events
  modify column event_type enum(
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
    'ADJUSTMENT',
    'STAKING_REQUESTED',
    'STAKING_PRINCIPAL_LOCKED',
    'STAKING_ACTIVATED',
    'STAKING_CANCELLED',
    'STAKING_PRINCIPAL_RELEASED',
    'STAKING_MATURED'
  ) not null;
