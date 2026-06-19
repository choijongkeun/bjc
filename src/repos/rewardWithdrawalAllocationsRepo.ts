import type { DbConn } from "../db/pool.js";

import type { WithdrawalFeeMode } from "../../shared/bjc-types.js";
import type { WithdrawalType } from "../domain/rewardBucket.js";
import type { RewardWithdrawalAllocationStatus } from "../domain/withdrawalStatus.js";

export type EligibleRewardWithdrawalRow = {
  id: string;
  account_id: string;
  account_staking_id: string | null;
  policy_version_id: string;
  reward_type: string;
  reward_date: string | Date;
  amount_base: string;
  status: string;
  available_at: string | Date | null;
  confirmed_at: string | Date | null;
  staking_product_id: string | null;
  product_symbol: string | null;
  product_decimals: number | null;
};

export type RewardAllocationTotalsRow = {
  reward_id: string;
  reserved_amount_base: string;
  consumed_amount_base: string;
  released_amount_base: string;
  active_amount_base: string;
};

export type RewardWithdrawalAllocationRow = {
  id: number;
  withdrawal_id: string;
  reward_id: string;
  allocated_amount_base: string;
  fee_policy_version_id: string;
  fee_schedule_days_snapshot: number;
  fee_rate_snapshot: string;
  fee_mode_snapshot: WithdrawalFeeMode;
  holding_days_snapshot: number;
  fee_amount_base: string;
  net_amount_base: string;
  status: RewardWithdrawalAllocationStatus;
  reserved_at: string;
  consumed_at: string | null;
  released_at: string | null;
  created_at: string;
};

export type RewardWithdrawalAllocationViewRow = RewardWithdrawalAllocationRow & {
  reward_account_id: string;
  reward_account_staking_id: string | null;
  reward_policy_version_id: string;
  reward_type: string;
  reward_date: string;
  reward_amount_base: string;
  reward_status: string;
  reward_source_reference: string;
  reward_available_at: string | null;
  reward_confirmed_at: string | null;
  reward_reversed_at: string | null;
  staking_product_id: string | null;
  product_symbol: string | null;
  product_decimals: number | null;
};

export type AccountWithdrawalBalanceAggregateRow = {
  daily_confirmed_amount_base: string;
  daily_reserved_amount_base: string;
  daily_completed_amount_base: string;
  bonus_confirmed_amount_base: string;
  bonus_reserved_amount_base: string;
  bonus_completed_amount_base: string;
  total_reserved_amount_base: string;
  total_completed_amount_base: string;
};

export type WithdrawalFeeRuleRow = {
  id: string;
  policy_version_id: string;
  withdrawal_source_type: WithdrawalType;
  schedule_days: number;
  fee_bps: string;
  fee_mode: WithdrawalFeeMode;
  is_active: number;
};

function normalizeDateTimeInput(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 23).replace("T", " ").replace("Z", "");
  }
  return value;
}

function eligibleRewardTypeCondition(withdrawalType: WithdrawalType): string {
  return withdrawalType === "DAILY_REWARD"
    ? "r.reward_type = 'DAILY_REWARD'"
    : "r.reward_type in ('DIRECT_REFERRAL', 'RANK_BONUS', 'CONTRIBUTION', 'SIDECAR')";
}

async function listEligibleRewardsInternal(
  conn: DbConn,
  input: { account_id: string; withdrawal_type: WithdrawalType; now: string },
  forUpdate: boolean
): Promise<EligibleRewardWithdrawalRow[]> {
  const [rows] = await conn.query(
    `select
        r.id,
        r.account_id,
        r.account_staking_id,
        r.policy_version_id,
        r.reward_type,
        r.reward_date,
        r.amount_base,
        r.status,
        r.available_at,
        r.confirmed_at,
        s.staking_product_id,
        p.symbol as product_symbol,
        p.decimals as product_decimals
       from account_rewards r
       left join account_stakings s
         on s.id = r.account_staking_id
       left join staking_products p
         on p.id = s.staking_product_id
      where r.account_id = ?
        and r.status = 'CONFIRMED'
        and (r.available_at is null or r.available_at <= ?)
        and ${eligibleRewardTypeCondition(input.withdrawal_type)}
      order by r.confirmed_at asc, r.reward_date asc, r.id asc
      ${forUpdate ? "for update" : ""}`,
    [input.account_id, input.now]
  );
  return rows as EligibleRewardWithdrawalRow[];
}

export async function listEligibleRewards(
  conn: DbConn,
  input: { account_id: string; withdrawal_type: WithdrawalType; now: string }
): Promise<EligibleRewardWithdrawalRow[]> {
  return listEligibleRewardsInternal(conn, input, false);
}

export async function listEligibleRewardsForUpdate(
  conn: DbConn,
  input: { account_id: string; withdrawal_type: WithdrawalType; now: string }
): Promise<EligibleRewardWithdrawalRow[]> {
  return listEligibleRewardsInternal(conn, input, true);
}

export async function getAllocatedTotalsByRewardIds(
  conn: DbConn,
  rewardIds: string[]
): Promise<RewardAllocationTotalsRow[]> {
  if (!rewardIds.length) {
    return [];
  }
  const placeholders = rewardIds.map(() => "?").join(", ");
  const [rows] = await conn.query(
    `select
        reward_id,
        cast(coalesce(sum(case when status = 'RESERVED' then allocated_amount_base else 0 end), 0) as char) as reserved_amount_base,
        cast(coalesce(sum(case when status = 'CONSUMED' then allocated_amount_base else 0 end), 0) as char) as consumed_amount_base,
        cast(coalesce(sum(case when status = 'RELEASED' then allocated_amount_base else 0 end), 0) as char) as released_amount_base,
        cast(coalesce(sum(case when status in ('RESERVED', 'CONSUMED') then allocated_amount_base else 0 end), 0) as char) as active_amount_base
       from reward_withdrawal_allocations
      where reward_id in (${placeholders})
      group by reward_id`,
    rewardIds
  );
  return rows as RewardAllocationTotalsRow[];
}

export async function listActiveAllocationRowsByRewardIdsForUpdate(
  conn: DbConn,
  rewardIds: string[]
): Promise<Array<{ id: number; reward_id: string; allocated_amount_base: string; status: RewardWithdrawalAllocationStatus }>> {
  if (!rewardIds.length) {
    return [];
  }
  const placeholders = rewardIds.map(() => "?").join(", ");
  const [rows] = await conn.query(
    `select id, reward_id, allocated_amount_base, status
       from reward_withdrawal_allocations
      where reward_id in (${placeholders})
        and status in ('RESERVED', 'CONSUMED')
      for update`,
    rewardIds
  );
  return rows as Array<{ id: number; reward_id: string; allocated_amount_base: string; status: RewardWithdrawalAllocationStatus }>;
}

export async function insertAllocations(
  conn: DbConn,
  inputs: Array<{
    withdrawal_id: string;
    reward_id: string;
    allocated_amount_base: string;
    fee_policy_version_id: string;
    fee_schedule_days_snapshot: number;
    fee_rate_snapshot: string;
    fee_mode_snapshot: WithdrawalFeeMode;
    holding_days_snapshot: number;
    fee_amount_base: string;
    net_amount_base: string;
    status: RewardWithdrawalAllocationStatus;
    reserved_at: Date | string;
    consumed_at?: Date | string | null;
    released_at?: Date | string | null;
    created_at: Date | string;
  }>
): Promise<void> {
  for (const input of inputs) {
    await conn.query(
      `insert into reward_withdrawal_allocations (
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
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.withdrawal_id,
        input.reward_id,
        input.allocated_amount_base,
        input.fee_policy_version_id,
        input.fee_schedule_days_snapshot,
        input.fee_rate_snapshot,
        input.fee_mode_snapshot,
        input.holding_days_snapshot,
        input.fee_amount_base,
        input.net_amount_base,
        input.status,
        normalizeDateTimeInput(input.reserved_at),
        normalizeDateTimeInput(input.consumed_at),
        normalizeDateTimeInput(input.released_at),
        normalizeDateTimeInput(input.created_at)
      ]
    );
  }
}

export async function listAllocationsByWithdrawalId(
  conn: DbConn,
  withdrawal_id: string
): Promise<RewardWithdrawalAllocationViewRow[]> {
  const [rows] = await conn.query(
    `select
        a.id,
        a.withdrawal_id,
        a.reward_id,
        a.allocated_amount_base,
        a.fee_policy_version_id,
        a.fee_schedule_days_snapshot,
        a.fee_rate_snapshot,
        a.fee_mode_snapshot,
        a.holding_days_snapshot,
        a.fee_amount_base,
        a.net_amount_base,
        a.status,
        a.reserved_at,
        a.consumed_at,
        a.released_at,
        a.created_at,
        r.account_id as reward_account_id,
        r.account_staking_id as reward_account_staking_id,
        r.policy_version_id as reward_policy_version_id,
        r.reward_type,
        r.reward_date,
        r.amount_base as reward_amount_base,
        r.status as reward_status,
        r.source_reference as reward_source_reference,
        r.available_at as reward_available_at,
        r.confirmed_at as reward_confirmed_at,
        r.reversed_at as reward_reversed_at,
        s.staking_product_id,
        p.symbol as product_symbol,
        p.decimals as product_decimals
       from reward_withdrawal_allocations a
       inner join account_rewards r
         on r.id = a.reward_id
       left join account_stakings s
         on s.id = r.account_staking_id
       left join staking_products p
         on p.id = s.staking_product_id
      where a.withdrawal_id = ?
      order by a.id asc`,
    [withdrawal_id]
  );
  return rows as RewardWithdrawalAllocationViewRow[];
}

export async function listAllocationsByWithdrawalIdForUpdate(
  conn: DbConn,
  withdrawal_id: string
): Promise<RewardWithdrawalAllocationRow[]> {
  const [rows] = await conn.query(
    `select
        id,
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
       from reward_withdrawal_allocations
      where withdrawal_id = ?
      order by id asc
      for update`,
    [withdrawal_id]
  );
  return rows as RewardWithdrawalAllocationRow[];
}

export async function updateAllocationStatus(
  conn: DbConn,
  input: {
    withdrawal_id: string;
    next_status: RewardWithdrawalAllocationStatus;
    changed_at: Date | string;
  }
): Promise<void> {
  const changedAt = normalizeDateTimeInput(input.changed_at);
  await conn.query(
    `update reward_withdrawal_allocations
        set status = ?,
            consumed_at = case when ? = 'CONSUMED' then ? else null end,
            released_at = case when ? = 'RELEASED' then ? else null end
      where withdrawal_id = ?
        and status = 'RESERVED'`,
    [input.next_status, input.next_status, changedAt, input.next_status, changedAt, input.withdrawal_id]
  );
}

export async function aggregateAccountWithdrawalBalances(
  conn: DbConn,
  input: { account_id: string; now: string }
): Promise<AccountWithdrawalBalanceAggregateRow> {
  const [rows] = await conn.query(
    `select
        cast(coalesce((
          select sum(
            case
              when r.status = 'CONFIRMED'
                and (r.available_at is null or r.available_at <= ?)
                and r.reward_type = 'DAILY_REWARD'
                then r.amount_base
              when r.status = 'CONFIRMED'
                and (r.available_at is null or r.available_at <= ?)
                and r.reward_type = 'REVERSAL'
                and original.reward_type = 'DAILY_REWARD'
                then r.amount_base
              else 0
            end
          )
          from account_rewards r
          left join account_rewards original
            on original.id = r.reversal_reward_id
          where r.account_id = ?
        ), 0) as char) as daily_confirmed_amount_base,
        cast(coalesce((
          select sum(case when a.status = 'RESERVED' then a.allocated_amount_base else 0 end)
          from reward_withdrawal_allocations a
          inner join reward_withdrawals w on w.id = a.withdrawal_id
          where w.account_id = ?
            and w.withdrawal_type = 'DAILY_REWARD'
        ), 0) as char) as daily_reserved_amount_base,
        cast(coalesce((
          select sum(case when a.status = 'CONSUMED' then a.allocated_amount_base else 0 end)
          from reward_withdrawal_allocations a
          inner join reward_withdrawals w on w.id = a.withdrawal_id
          where w.account_id = ?
            and w.withdrawal_type = 'DAILY_REWARD'
        ), 0) as char) as daily_completed_amount_base,
        cast(coalesce((
          select sum(
            case
              when r.status = 'CONFIRMED'
                and (r.available_at is null or r.available_at <= ?)
                and r.reward_type in ('DIRECT_REFERRAL', 'RANK_BONUS', 'CONTRIBUTION', 'SIDECAR')
                then r.amount_base
              when r.status = 'CONFIRMED'
                and (r.available_at is null or r.available_at <= ?)
                and r.reward_type = 'REVERSAL'
                and original.reward_type in ('DIRECT_REFERRAL', 'RANK_BONUS', 'CONTRIBUTION', 'SIDECAR')
                then r.amount_base
              else 0
            end
          )
          from account_rewards r
          left join account_rewards original
            on original.id = r.reversal_reward_id
          where r.account_id = ?
        ), 0) as char) as bonus_confirmed_amount_base,
        cast(coalesce((
          select sum(case when a.status = 'RESERVED' then a.allocated_amount_base else 0 end)
          from reward_withdrawal_allocations a
          inner join reward_withdrawals w on w.id = a.withdrawal_id
          where w.account_id = ?
            and w.withdrawal_type = 'BONUS'
        ), 0) as char) as bonus_reserved_amount_base,
        cast(coalesce((
          select sum(case when a.status = 'CONSUMED' then a.allocated_amount_base else 0 end)
          from reward_withdrawal_allocations a
          inner join reward_withdrawals w on w.id = a.withdrawal_id
          where w.account_id = ?
            and w.withdrawal_type = 'BONUS'
        ), 0) as char) as bonus_completed_amount_base,
        cast(coalesce((
          select sum(case when a.status = 'RESERVED' then a.allocated_amount_base else 0 end)
          from reward_withdrawal_allocations a
          inner join reward_withdrawals w on w.id = a.withdrawal_id
          where w.account_id = ?
        ), 0) as char) as total_reserved_amount_base,
        cast(coalesce((
          select sum(case when a.status = 'CONSUMED' then a.allocated_amount_base else 0 end)
          from reward_withdrawal_allocations a
          inner join reward_withdrawals w on w.id = a.withdrawal_id
          where w.account_id = ?
        ), 0) as char) as total_completed_amount_base`,
    [
      input.now,
      input.now,
      input.account_id,
      input.account_id,
      input.account_id,
      input.now,
      input.now,
      input.account_id,
      input.account_id,
      input.account_id,
      input.account_id,
      input.account_id
    ]
  );
  const row = (rows as AccountWithdrawalBalanceAggregateRow[])[0];
  return {
    daily_confirmed_amount_base: row?.daily_confirmed_amount_base ?? "0",
    daily_reserved_amount_base: row?.daily_reserved_amount_base ?? "0",
    daily_completed_amount_base: row?.daily_completed_amount_base ?? "0",
    bonus_confirmed_amount_base: row?.bonus_confirmed_amount_base ?? "0",
    bonus_reserved_amount_base: row?.bonus_reserved_amount_base ?? "0",
    bonus_completed_amount_base: row?.bonus_completed_amount_base ?? "0",
    total_reserved_amount_base: row?.total_reserved_amount_base ?? "0",
    total_completed_amount_base: row?.total_completed_amount_base ?? "0"
  };
}

export async function listActiveWithdrawalFeeRules(
  conn: DbConn,
  input: { policy_version_id: string; withdrawal_type: WithdrawalType }
): Promise<WithdrawalFeeRuleRow[]> {
  const [rows] = await conn.query(
    `select
        id,
        policy_version_id,
        withdrawal_source_type,
        schedule_days,
        fee_bps,
        fee_mode,
        is_active
       from withdrawal_fee_rules
      where policy_version_id = ?
        and withdrawal_source_type = ?
        and is_active = 1
      order by schedule_days asc, id asc`,
    [input.policy_version_id, input.withdrawal_type]
  );
  return rows as WithdrawalFeeRuleRow[];
}
