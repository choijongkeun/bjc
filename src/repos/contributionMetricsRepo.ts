import type { DbConn } from "../db/pool.js";

export type ContributionCandidateAccountRow = {
  account_id: string;
};

export type ContributionDepthVolumeRow = {
  account_id: string;
  depth: number;
  volume_base: string;
};

export type ContributionDailyPoolRow = {
  id: string;
  calc_run_id: string;
  policy_version_id: string;
  pool_date: string;
  total_withdrawal_amount_base: string;
  pool_amount_base: string;
  decimals: number;
  symbol: string;
  created_at: string;
};

export type ContributionRewardRow = {
  id: string;
  calc_run_id: string;
  account_id: string;
  score: string;
  total_score: string;
  reward_amount_base: string;
  decimals: number;
  symbol: string;
  created_at: string;
};

export async function listContributionCandidateAccounts(
  conn: DbConn,
  policy_version_id: string
): Promise<ContributionCandidateAccountRow[]> {
  const [rows] = await conn.query(
    `select a.id as account_id
       from accounts a
      where a.role = 'USER'
        and a.status = 'ACTIVE'
        and exists (
          select 1
            from referral_edges e
           where e.parent_account_id = a.id
             and e.depth between 1 and 45
        )
        and exists (
          select 1
            from ledger_events le
           where le.policy_version_id = ?
             and le.event_type = 'WITHDRAWAL_REQUEST'
             and le.account_id in (
               select e2.child_account_id
                 from referral_edges e2
                where e2.parent_account_id = a.id
                  and e2.depth between 1 and 45
             )
        )
      order by a.id asc`,
    [policy_version_id]
  );
  return rows as ContributionCandidateAccountRow[];
}

export async function getContributionWithdrawalTotalByDate(
  conn: DbConn,
  input: {
    policy_version_id: string;
    start_sql: string;
    end_exclusive_sql: string;
  }
): Promise<string> {
  const [rows] = await conn.query(
    `select cast(coalesce(sum(amount_base), 0) as char) as total_amount_base
       from ledger_events
      where policy_version_id = ?
        and event_type = 'WITHDRAWAL_REQUEST'
        and event_time >= ?
        and event_time < ?`,
    [input.policy_version_id, input.start_sql, input.end_exclusive_sql]
  );
  return (rows as Array<{ total_amount_base: string }>)[0]?.total_amount_base ?? "0";
}

export async function listContributionDepthVolumes(
  conn: DbConn,
  input: {
    policy_version_id: string;
    start_sql: string;
    end_exclusive_sql: string;
    max_depth: number;
  }
): Promise<ContributionDepthVolumeRow[]> {
  const [rows] = await conn.query(
    `select
        e.parent_account_id as account_id,
        e.depth,
        cast(coalesce(sum(le.amount_base), 0) as char) as volume_base
       from referral_edges e
       inner join accounts parent_a
         on parent_a.id = e.parent_account_id
        and parent_a.role = 'USER'
        and parent_a.status = 'ACTIVE'
       inner join accounts child_a
         on child_a.id = e.child_account_id
        and child_a.role = 'USER'
       inner join ledger_events le
         on le.account_id = e.child_account_id
        and le.policy_version_id = ?
        and le.event_type = 'WITHDRAWAL_REQUEST'
        and le.event_time >= ?
        and le.event_time < ?
      where e.depth between 1 and ?
      group by e.parent_account_id, e.depth
      order by e.parent_account_id asc, e.depth asc`,
    [input.policy_version_id, input.start_sql, input.end_exclusive_sql, input.max_depth]
  );
  return rows as ContributionDepthVolumeRow[];
}

export async function getContributionDailyPoolByDate(
  conn: DbConn,
  input: { policy_version_id: string; pool_date: string }
): Promise<ContributionDailyPoolRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        calc_run_id,
        policy_version_id,
        pool_date,
        cast(total_withdrawal_amount_base as char) as total_withdrawal_amount_base,
        cast(pool_amount_base as char) as pool_amount_base,
        decimals,
        symbol,
        created_at
       from contribution_daily_pools
      where policy_version_id = ?
        and pool_date = ?
      limit 1`,
    [input.policy_version_id, input.pool_date]
  );
  const arr = rows as ContributionDailyPoolRow[];
  return arr[0] ?? null;
}

export async function insertContributionDailyPool(
  conn: DbConn,
  input: {
    id: string;
    calc_run_id: string;
    policy_version_id: string;
    pool_date: string;
    total_withdrawal_amount_base: string;
    pool_amount_base: string;
    decimals: number;
    symbol: string;
  }
): Promise<void> {
  await conn.query(
    `insert into contribution_daily_pools (
        id,
        calc_run_id,
        policy_version_id,
        pool_date,
        total_withdrawal_amount_base,
        pool_amount_base,
        decimals,
        symbol
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.calc_run_id,
      input.policy_version_id,
      input.pool_date,
      input.total_withdrawal_amount_base,
      input.pool_amount_base,
      input.decimals,
      input.symbol
    ]
  );
}

export async function getContributionRewardByCalcRunAccount(
  conn: DbConn,
  input: { calc_run_id: string; account_id: string }
): Promise<ContributionRewardRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        calc_run_id,
        account_id,
        cast(score as char) as score,
        cast(total_score as char) as total_score,
        cast(reward_amount_base as char) as reward_amount_base,
        decimals,
        symbol,
        created_at
       from contribution_rewards
      where calc_run_id = ?
        and account_id = ?
      limit 1`,
    [input.calc_run_id, input.account_id]
  );
  const arr = rows as ContributionRewardRow[];
  return arr[0] ?? null;
}

export async function insertContributionReward(
  conn: DbConn,
  input: {
    id: string;
    calc_run_id: string;
    account_id: string;
    score: string;
    total_score: string;
    reward_amount_base: string;
    decimals: number;
    symbol: string;
  }
): Promise<void> {
  await conn.query(
    `insert into contribution_rewards (
        id,
        calc_run_id,
        account_id,
        score,
        total_score,
        reward_amount_base,
        decimals,
        symbol
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.calc_run_id,
      input.account_id,
      input.score,
      input.total_score,
      input.reward_amount_base,
      input.decimals,
      input.symbol
    ]
  );
}
