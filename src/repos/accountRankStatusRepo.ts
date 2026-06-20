import type { DbConn } from "../db/pool.js";

export type AccountRankStatusRow = {
  account_id: string;
  policy_version_id: string;
  current_rank_level: number | null;
  qualified_at: string | null;
  maintained_until: string | null;
  last_qualification_calc_run_id: string | null;
  last_bonus_calc_run_id: string | null;
  last_change_type: "INITIAL" | "PROMOTED" | "MAINTAINED" | "DEMOTED" | null;
  created_at: string;
  updated_at: string;
};

export async function getAccountRankStatusByAccountId(
  conn: DbConn,
  accountId: string
): Promise<AccountRankStatusRow | null> {
  const [rows] = await conn.query(
    `select
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
       from account_rank_status
      where account_id = ?
      limit 1`,
    [accountId]
  );
  const arr = rows as AccountRankStatusRow[];
  return arr[0] ?? null;
}

export async function getAccountRankStatusByAccountIdForUpdate(
  conn: DbConn,
  accountId: string
): Promise<AccountRankStatusRow | null> {
  const [rows] = await conn.query(
    `select
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
       from account_rank_status
      where account_id = ?
      limit 1
      for update`,
    [accountId]
  );
  const arr = rows as AccountRankStatusRow[];
  return arr[0] ?? null;
}

export async function upsertAccountRankStatus(
  conn: DbConn,
  input: {
    account_id: string;
    policy_version_id: string;
    current_rank_level: number | null;
    qualified_at: string | null;
    maintained_until?: string | null;
    last_qualification_calc_run_id: string;
    last_change_type: "INITIAL" | "PROMOTED" | "MAINTAINED";
  }
): Promise<void> {
  await conn.query(
    `insert into account_rank_status (
        account_id,
        policy_version_id,
        current_rank_level,
        qualified_at,
        maintained_until,
        last_qualification_calc_run_id,
        last_change_type
      ) values (?, ?, ?, ?, ?, ?, ?)
      on duplicate key update
        policy_version_id = values(policy_version_id),
        current_rank_level = values(current_rank_level),
        qualified_at = values(qualified_at),
        maintained_until = values(maintained_until),
        last_qualification_calc_run_id = values(last_qualification_calc_run_id),
        last_change_type = values(last_change_type)`,
    [
      input.account_id,
      input.policy_version_id,
      input.current_rank_level,
      input.qualified_at,
      input.maintained_until ?? null,
      input.last_qualification_calc_run_id,
      input.last_change_type
    ]
  );
}
