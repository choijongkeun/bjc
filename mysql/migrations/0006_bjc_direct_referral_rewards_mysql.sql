set sql_safe_updates = 0;

-- BJC direct referral reward additive migration
-- Assumes 0001_bjc_offchain_core_mysql.sql through 0005_bjc_reward_withdrawals_mysql.sql
-- are already applied.
--
-- Design decisions in this migration:
-- - Reuse `referral_bonus_rules` as the direct referral policy table.
-- - Do not add a new calc_run enum or ledger event enum because `DIRECT_REFERRAL`
--   and `DIRECT_REFERRAL_BONUS` already exist.
-- - Add explicit reward source tracking columns to `account_rewards` so
--   `DIRECT_REFERRAL` can point to the referred member and source staking without
--   overloading `account_staking_id`.
-- - Keep duplicate prevention additive by combining:
--   - existing `(reward_type, source_reference)` uniqueness
--   - new generated unique key for `(source_account_staking_id, sponsor_account_id)`

alter table referral_bonus_rules
  add column updated_at datetime(6) not null
    default current_timestamp(6)
    on update current_timestamp(6)
    after created_at,
  add constraint chk_referral_bonus_rules_bonus_bps_max
    check (bonus_bps <= 10000);

alter table account_rewards
  add column source_account_id char(36) null after account_staking_id,
  add column source_account_staking_id char(36) null after source_account_id,
  add column direct_referral_dedupe_key varchar(255)
    generated always as (
      case
        when reward_type = 'DIRECT_REFERRAL' and source_account_staking_id is not null
          then concat(source_account_staking_id, ':', account_id)
        else null
      end
    ) stored after daily_reward_dedupe_key,
  add unique key uniq_account_rewards_direct_referral_dedupe (direct_referral_dedupe_key),
  add key idx_account_rewards_source_account_reward_date (source_account_id, reward_date),
  add key idx_account_rewards_source_staking_reward_date (source_account_staking_id, reward_date),
  add constraint fk_account_rewards_source_account
    foreign key (source_account_id) references accounts(id),
  add constraint fk_account_rewards_source_account_staking
    foreign key (source_account_staking_id) references account_stakings(id),
  add constraint chk_account_rewards_source_pair
    check (
      source_account_staking_id is null
      or
      source_account_id is not null
    ),
  add constraint chk_account_rewards_direct_referral_source
    check (
      (
        reward_type = 'DIRECT_REFERRAL'
        and account_staking_id is null
        and source_account_id is not null
        and source_account_staking_id is not null
        and account_id <> source_account_id
      )
      or
      (
        reward_type <> 'DIRECT_REFERRAL'
        and source_account_id is null
        and source_account_staking_id is null
      )
    );
