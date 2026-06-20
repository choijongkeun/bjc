import type { DbConn } from "../db/pool.js";

export type SidecarWithdrawalRequestRow = {
  ledger_event_id: string;
  account_id: string;
  product_id: string | null;
  policy_version_id: string;
  calc_run_id: string | null;
  requested_at: string;
  requested_amount_base: string;
  decimals: number;
  symbol: string;
  source_reference: string;
  related_account_id: string | null;
};

export async function listSidecarWithdrawalRequests(
  conn: DbConn,
  input: {
    policy_version_id: string;
    start_sql: string;
    end_exclusive_sql: string;
    account_id?: string;
  }
): Promise<SidecarWithdrawalRequestRow[]> {
  const params: unknown[] = [input.policy_version_id, input.start_sql, input.end_exclusive_sql];
  const accountSql = input.account_id ? " and account_id = ?" : "";
  if (input.account_id) {
    params.push(input.account_id);
  }

  const [rows] = await conn.query(
    `select
        id as ledger_event_id,
        account_id,
        product_id,
        policy_version_id,
        calc_run_id,
        event_time as requested_at,
        cast(amount_base as char) as requested_amount_base,
        decimals,
        symbol,
        reference_id as source_reference,
        related_account_id
       from ledger_events
      where policy_version_id = ?
        and event_type = 'WITHDRAWAL_REQUEST'
        and event_time >= ?
        and event_time < ?
        ${accountSql}
      order by event_time asc, id asc`,
    params
  );
  return rows as SidecarWithdrawalRequestRow[];
}
