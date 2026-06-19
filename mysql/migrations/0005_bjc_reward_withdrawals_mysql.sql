set sql_safe_updates = 0;

-- BJC reward withdrawal additive migration
-- Assumes 0001_bjc_offchain_core_mysql.sql, 0002_bjc_member_referral_binary_auth_mysql.sql,
-- 0003_bjc_account_stakings_mysql.sql, and 0004_bjc_account_rewards_mysql.sql
-- are already applied.
--
-- Design decisions in this migration:
-- - `account_rewards` remains the reward source of truth.
-- - reward availability is derived from `account_rewards` plus
--   `reward_withdrawal_allocations`; no balance projection table is added in V1.
-- - reward rows do not gain a `WITHDRAWN` status; reservation / consumption is modeled
--   by allocation rows to support partial usage and append-only reward history.
-- - fee calculation is snapshotted per allocation row because one withdrawal request may
--   consume multiple rewards with different holding ages and fee schedules.
-- - `withdrawal_fee_rules` remains the policy table; this migration stores only the
--   selected fee policy version and computed snapshots.
-- - legacy withdrawal ledger event types are kept for backward compatibility and the
--   new explicit withdrawal lifecycle event types are appended.

create table if not exists reward_withdrawals (
  id char(36) not null default (uuid()),
  account_id char(36) not null,
  fee_policy_version_id char(36) not null,
  withdrawal_type enum('DAILY_REWARD', 'BONUS') not null,
  requested_amount_base decimal(65,0) not null,
  fee_amount_base decimal(65,0) not null,
  net_amount_base decimal(65,0) not null,
  fee_mode_snapshot enum('DEDUCT_FROM_WITHDRAWAL', 'PREPAY_BJC') not null default 'DEDUCT_FROM_WITHDRAWAL',
  status enum('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED') not null,
  idempotency_key varchar(128) not null,
  wallet_address varchar(255) null,
  network varchar(64) null,
  tx_hash varchar(255) null,
  requested_kst_date date not null,
  requested_at datetime(6) not null,
  processing_at datetime(6) null,
  approved_at datetime(6) null,
  rejected_at datetime(6) null,
  completed_at datetime(6) null,
  failed_at datetime(6) null,
  cancelled_at datetime(6) null,
  reject_reason varchar(500) null,
  failure_reason varchar(500) null,
  created_at datetime(6) not null default current_timestamp(6),
  updated_at datetime(6) not null default current_timestamp(6) on update current_timestamp(6),
  primary key (id),
  unique key uniq_reward_withdrawals_account_idempotency (account_id, idempotency_key),
  key idx_reward_withdrawals_account_type_status_requested_at (account_id, withdrawal_type, status, requested_at),
  key idx_reward_withdrawals_status_requested_at (status, requested_at),
  key idx_reward_withdrawals_fee_policy_requested_at (fee_policy_version_id, requested_at),
  key idx_reward_withdrawals_completed_at (completed_at),
  constraint fk_reward_withdrawals_account
    foreign key (account_id) references accounts(id),
  constraint fk_reward_withdrawals_fee_policy
    foreign key (fee_policy_version_id) references policy_versions(id),
  constraint chk_reward_withdrawals_requested_amount
    check (requested_amount_base > 0),
  constraint chk_reward_withdrawals_fee_amount
    check (fee_amount_base >= 0),
  constraint chk_reward_withdrawals_net_amount
    check (net_amount_base >= 0),
  constraint chk_reward_withdrawals_amount_sum
    check (requested_amount_base = fee_amount_base + net_amount_base),
  constraint chk_reward_withdrawals_fee_mode_snapshot
    check (fee_mode_snapshot = 'DEDUCT_FROM_WITHDRAWAL'),
  constraint chk_reward_withdrawals_idempotency_key
    check (char_length(trim(idempotency_key)) > 0),
  constraint chk_reward_withdrawals_wallet_address
    check (wallet_address is null or char_length(trim(wallet_address)) > 0),
  constraint chk_reward_withdrawals_network
    check (network is null or char_length(trim(network)) > 0),
  constraint chk_reward_withdrawals_tx_hash
    check (tx_hash is null or char_length(trim(tx_hash)) > 0),
  constraint chk_reward_withdrawals_reject_reason
    check (
      (status = 'REJECTED' and reject_reason is not null and char_length(trim(reject_reason)) > 0)
      or
      (status <> 'REJECTED' and reject_reason is null)
    ),
  constraint chk_reward_withdrawals_failure_reason
    check (
      (status = 'FAILED' and failure_reason is not null and char_length(trim(failure_reason)) > 0)
      or
      (status <> 'FAILED' and failure_reason is null)
    ),
  constraint chk_reward_withdrawals_status_timestamps
    check (
      (status = 'REQUESTED'
        and approved_at is null
        and processing_at is null
        and rejected_at is null
        and completed_at is null
        and failed_at is null
        and cancelled_at is null)
      or
      (status = 'APPROVED'
        and approved_at is not null
        and processing_at is null
        and rejected_at is null
        and completed_at is null
        and failed_at is null
        and cancelled_at is null)
      or
      (status = 'PROCESSING'
        and approved_at is not null
        and processing_at is not null
        and rejected_at is null
        and completed_at is null
        and failed_at is null
        and cancelled_at is null)
      or
      (status = 'COMPLETED'
        and approved_at is not null
        and processing_at is not null
        and completed_at is not null
        and rejected_at is null
        and failed_at is null
        and cancelled_at is null)
      or
      (status = 'REJECTED'
        and approved_at is null
        and processing_at is null
        and rejected_at is not null
        and completed_at is null
        and failed_at is null
        and cancelled_at is null)
      or
      (status = 'FAILED'
        and approved_at is not null
        and processing_at is not null
        and rejected_at is null
        and completed_at is null
        and failed_at is not null
        and cancelled_at is null)
      or
      (status = 'CANCELLED'
        and processing_at is null
        and rejected_at is null
        and completed_at is null
        and failed_at is null
        and cancelled_at is not null)
    ),
  constraint chk_reward_withdrawals_timestamp_order
    check (
      requested_at is not null
      and (approved_at is null or approved_at >= requested_at)
      and (processing_at is null or processing_at >= approved_at)
      and (completed_at is null or completed_at >= processing_at)
      and (failed_at is null or failed_at >= processing_at)
      and (rejected_at is null or rejected_at >= requested_at)
      and (cancelled_at is null or cancelled_at >= requested_at)
    )
) engine=InnoDB default charset=utf8mb4;

create table if not exists reward_withdrawal_allocations (
  id bigint not null auto_increment,
  withdrawal_id char(36) not null,
  reward_id char(36) not null,
  allocated_amount_base decimal(65,0) not null,
  fee_policy_version_id char(36) not null,
  fee_schedule_days_snapshot int not null,
  fee_rate_snapshot decimal(20,0) not null,
  fee_mode_snapshot enum('DEDUCT_FROM_WITHDRAWAL', 'PREPAY_BJC') not null default 'DEDUCT_FROM_WITHDRAWAL',
  holding_days_snapshot int not null,
  fee_amount_base decimal(65,0) not null,
  net_amount_base decimal(65,0) not null,
  status enum('RESERVED', 'CONSUMED', 'RELEASED') not null,
  reserved_at datetime(6) not null,
  consumed_at datetime(6) null,
  released_at datetime(6) null,
  created_at datetime(6) not null default current_timestamp(6),
  primary key (id),
  unique key uniq_reward_withdrawal_allocations_withdrawal_reward (withdrawal_id, reward_id),
  key idx_reward_withdrawal_allocations_reward_status (reward_id, status, id),
  key idx_reward_withdrawal_allocations_withdrawal_status (withdrawal_id, status, id),
  key idx_reward_withdrawal_allocations_policy_status (fee_policy_version_id, status, id),
  constraint fk_reward_withdrawal_allocations_withdrawal
    foreign key (withdrawal_id) references reward_withdrawals(id),
  constraint fk_reward_withdrawal_allocations_reward
    foreign key (reward_id) references account_rewards(id),
  constraint fk_reward_withdrawal_allocations_fee_policy
    foreign key (fee_policy_version_id) references policy_versions(id),
  constraint chk_reward_withdrawal_allocations_amount
    check (allocated_amount_base > 0),
  constraint chk_reward_withdrawal_allocations_fee_schedule_days
    check (fee_schedule_days_snapshot > 0),
  constraint chk_reward_withdrawal_allocations_fee_rate
    check (fee_rate_snapshot between 0 and 10000),
  constraint chk_reward_withdrawal_allocations_fee_mode_snapshot
    check (fee_mode_snapshot = 'DEDUCT_FROM_WITHDRAWAL'),
  constraint chk_reward_withdrawal_allocations_holding_days
    check (holding_days_snapshot >= 0),
  constraint chk_reward_withdrawal_allocations_fee_amount
    check (fee_amount_base >= 0),
  constraint chk_reward_withdrawal_allocations_net_amount
    check (net_amount_base >= 0),
  constraint chk_reward_withdrawal_allocations_amount_sum
    check (allocated_amount_base = fee_amount_base + net_amount_base),
  constraint chk_reward_withdrawal_allocations_status_timestamps
    check (
      (status = 'RESERVED'
        and consumed_at is null
        and released_at is null)
      or
      (status = 'CONSUMED'
        and consumed_at is not null
        and released_at is null)
      or
      (status = 'RELEASED'
        and consumed_at is null
        and released_at is not null)
    ),
  constraint chk_reward_withdrawal_allocations_timestamp_order
    check (
      reserved_at is not null
      and (consumed_at is null or consumed_at >= reserved_at)
      and (released_at is null or released_at >= reserved_at)
    )
) engine=InnoDB default charset=utf8mb4;

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
    'STAKING_MATURED',
    'WITHDRAWAL_REQUESTED',
    'WITHDRAWAL_RESERVED',
    'WITHDRAWAL_APPROVED',
    'WITHDRAWAL_PROCESSING',
    'WITHDRAWAL_COMPLETED',
    'WITHDRAWAL_REJECTED',
    'WITHDRAWAL_FAILED',
    'WITHDRAWAL_CANCELLED',
    'WITHDRAWAL_FEE_CHARGED'
  ) not null;
