import "dotenv/config";

import { pool } from "../../src/db/pool.js";
import { withTx } from "../../src/db/tx.js";
import type { BjcFixture, BjcFixtureCleanupReport } from "./bjcFixtureTypes.js";

function toCount(rows: unknown): number {
  const total = (rows as Array<{ total?: number | string }>)[0]?.total ?? 0;
  return typeof total === "number" ? total : Number(total);
}

export async function cleanupBjcFixture(fixture: BjcFixture): Promise<BjcFixtureCleanupReport> {
  return withTx(pool, async (conn) => {
    const [dynamicAccountRows] = await conn.query(
      `select id from accounts where login_id like ? or referral_code like ?`,
      [`e2e\\_%\\_${fixture.suffix}`, `%${fixture.suffix.toUpperCase()}`]
    );
    const dynamicAccountIds = (dynamicAccountRows as Array<{ id: string }>).map((row) => row.id);
    const staticAccountIds = Object.values(fixture.accounts).map((account) => account.id);
    const accountIds = Array.from(new Set([...staticAccountIds, ...dynamicAccountIds]));

    if (accountIds.length > 0) {
      const accountPlaceholders = accountIds.map(() => "?").join(", ");

      const [calcRows] = await conn.query(
        `select id from calc_runs where policy_version_id = ? or created_by in (${accountPlaceholders})`,
        [fixture.ids.policy_id, ...accountIds]
      );
      const calcRunIds = (calcRows as Array<{ id: string }>).map((row) => row.id);

      const [withdrawalRows] = await conn.query(
        `select id from reward_withdrawals where account_id in (${accountPlaceholders})`,
        accountIds
      );
      const withdrawalIds = (withdrawalRows as Array<{ id: string }>).map((row) => row.id);

      const [rewardRows] = await conn.query(
        `select id from account_rewards where account_id in (${accountPlaceholders}) or policy_version_id = ?`,
        [...accountIds, fixture.ids.policy_id]
      );
      const rewardIds = (rewardRows as Array<{ id: string }>).map((row) => row.id);

      if (withdrawalIds.length > 0) {
        const placeholders = withdrawalIds.map(() => "?").join(", ");
        await conn.query(`delete from reward_withdrawal_allocations where withdrawal_id in (${placeholders})`, withdrawalIds);
      }

      if (rewardIds.length > 0) {
        const placeholders = rewardIds.map(() => "?").join(", ");
        await conn.query(`delete from reward_withdrawal_allocations where reward_id in (${placeholders})`, rewardIds);
      }

      if (calcRunIds.length > 0) {
        const placeholders = calcRunIds.map(() => "?").join(", ");
        await conn.query(`delete from settlement_items where calc_run_id in (${placeholders})`, calcRunIds);
        await conn.query(`delete from contribution_rewards where calc_run_id in (${placeholders})`, calcRunIds);
        await conn.query(`delete from account_rank_history where calc_run_id in (${placeholders})`, calcRunIds);
        await conn.query(
          `delete from admin_audit_log where target_table = 'calc_runs' and target_id in (${placeholders})`,
          calcRunIds
        );
      }

      await conn.query(
        `delete from admin_audit_log where actor_account_id in (${accountPlaceholders})`,
        accountIds
      );
      await conn.query(`delete from auth_sessions where account_id in (${accountPlaceholders})`, accountIds);
      await conn.query(`delete from reward_withdrawals where account_id in (${accountPlaceholders})`, accountIds);
      await conn.query(
        `delete from account_rank_history where account_id in (${accountPlaceholders})`,
        accountIds
      );
      await conn.query(
        `delete from account_rank_status where account_id in (${accountPlaceholders}) or policy_version_id = ?`,
        [...accountIds, fixture.ids.policy_id]
      );
      await conn.query(
        `delete from account_rank_qualification_results where account_id in (${accountPlaceholders})`,
        accountIds
      );
      await conn.query(`delete from account_rewards where account_id in (${accountPlaceholders}) or policy_version_id = ?`, [
        ...accountIds,
        fixture.ids.policy_id,
      ]);
      await conn.query(`delete from contribution_daily_pools where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from account_stakings where account_id in (${accountPlaceholders})`, accountIds);
      await conn.query(`delete from ledger_events where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from calc_runs where policy_version_id = ? or created_by in (${accountPlaceholders})`, [
        fixture.ids.policy_id,
        ...accountIds,
      ]);
      await conn.query(`delete from sidecar_events where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from contribution_weight_rules where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from withdrawal_fee_rules where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from rank_rules where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from referral_bonus_rules where policy_version_id = ?`, [fixture.ids.policy_id]);
      await conn.query(
        `delete from binary_edges where ancestor_account_id in (${accountPlaceholders}) or descendant_account_id in (${accountPlaceholders})`,
        [...accountIds, ...accountIds]
      );
      await conn.query(`delete from binary_nodes where account_id in (${accountPlaceholders})`, accountIds);
      await conn.query(
        `delete from referral_edges where parent_account_id in (${accountPlaceholders}) or child_account_id in (${accountPlaceholders})`,
        [...accountIds, ...accountIds]
      );
      await conn.query(
        `update accounts
            set sponsor_account_id = null,
                binary_parent_account_id = null
          where id in (${accountPlaceholders})`,
        accountIds
      );
      await conn.query(
        `delete from staking_products where id in (?, ?)`,
        [fixture.ids.product_id, fixture.ids.inactive_product_id]
      );
      await conn.query(`delete from policy_versions where id = ?`, [fixture.ids.policy_id]);
      await conn.query(`delete from accounts where id in (${accountPlaceholders})`, accountIds);
    }

    const [accountsRows] = await conn.query(
      `select count(*) as total from accounts where login_id like ? or referral_code like ?`,
      [`e2e\\_%\\_${fixture.suffix}`, `%${fixture.suffix.toUpperCase()}`]
    );
    const [policiesRows] = await conn.query(`select count(*) as total from policy_versions where id = ?`, [fixture.ids.policy_id]);
    const [productsRows] = await conn.query(
      `select count(*) as total from staking_products where id in (?, ?)`,
      [fixture.ids.product_id, fixture.ids.inactive_product_id]
    );
    const [stakingsRows] = await conn.query(
      `select count(*) as total from account_stakings where policy_version_id = ?`,
      [fixture.ids.policy_id]
    );
    const [rewardsRows] = await conn.query(
      `select count(*) as total from account_rewards where policy_version_id = ?`,
      [fixture.ids.policy_id]
    );
    const [withdrawalsRows] = await conn.query(
      `select count(*) as total from reward_withdrawals where fee_policy_version_id = ?`,
      [fixture.ids.policy_id]
    );
    const [calcRunsRows] = await conn.query(
      `select count(*) as total from calc_runs where policy_version_id = ?`,
      [fixture.ids.policy_id]
    );
    const [ledgerRows] = await conn.query(
      `select count(*) as total from ledger_events where policy_version_id = ?`,
      [fixture.ids.policy_id]
    );
    const [sessionsRows] = await conn.query(
      `select count(*) as total from auth_sessions where account_id in (?, ?, ?, ?, ?, ?, ?)`,
      Object.values(fixture.accounts).map((account) => account.id)
    );

    return {
      fixture_accounts: toCount(accountsRows),
      fixture_policies: toCount(policiesRows),
      fixture_products: toCount(productsRows),
      fixture_stakings: toCount(stakingsRows),
      fixture_rewards: toCount(rewardsRows),
      fixture_withdrawals: toCount(withdrawalsRows),
      fixture_calc_runs: toCount(calcRunsRows),
      fixture_ledger_events: toCount(ledgerRows),
      fixture_sessions: toCount(sessionsRows),
    };
  });
}
