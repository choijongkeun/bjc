import "dotenv/config";

import { randomUUID } from "node:crypto";

import { pool } from "../../src/db/pool.js";
import { withTx } from "../../src/db/tx.js";
import { hashPassword } from "../../src/util/passwordHash.js";
import type { BjcFixture } from "./bjcFixtureTypes.js";

type FixtureTimestampSet = {
  created_at: Date;
  activated_at_sql: string;
  reward_date: string;
  calculation_date: string;
};

function makeAccount(input: {
  id: string;
  suffix: string;
  code_prefix: string;
  display_prefix: string;
  login_prefix: string;
  role: "ADMIN" | "READER" | "USER";
}): {
  id: string;
  login_id: string;
  display_name: string;
  referral_code: string;
  role: "ADMIN" | "READER" | "USER";
} {
  return {
    id: input.id,
    login_id: `${input.login_prefix}_${input.suffix}`,
    display_name: `${input.display_prefix} ${input.suffix}`,
    referral_code: `${input.code_prefix}${input.suffix.toUpperCase()}`,
    role: input.role,
  };
}

async function hasActivePolicy(): Promise<boolean> {
  const [rows] = await pool.query(`select cast(count(*) as char) as total from policy_versions where status = 'ACTIVE'`);
  const total = (rows as Array<{ total: string }>)[0]?.total ?? "0";
  return total !== "0";
}

export async function createBjcFixture(): Promise<BjcFixture> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const timestamps: FixtureTimestampSet = {
    created_at: new Date("2026-06-20T00:00:00.000Z"),
    activated_at_sql: "2026-06-19 00:00:00.000000",
    reward_date: "2026-06-20",
    calculation_date: "2026-06-30",
  };
  const policy_id = randomUUID();
  const product_id = randomUUID();
  const inactive_product_id = randomUUID();
  const left_referral_edge_id = randomUUID();
  const right_referral_edge_id = randomUUID();

  const accounts = {
    admin: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2EA",
      display_prefix: "E2E Admin",
      login_prefix: "e2e_admin",
      role: "ADMIN",
    }),
    reader: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2ER",
      display_prefix: "E2E Reader",
      login_prefix: "e2e_reader",
      role: "READER",
    }),
    root_user: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2EU",
      display_prefix: "E2E Root User",
      login_prefix: "e2e_user_root",
      role: "USER",
    }),
    left_user: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2EL",
      display_prefix: "E2E Left User",
      login_prefix: "e2e_user_left",
      role: "USER",
    }),
    right_user: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2EX",
      display_prefix: "E2E Right User",
      login_prefix: "e2e_user_right",
      role: "USER",
    }),
    other_user: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2EO",
      display_prefix: "E2E Other User",
      login_prefix: "e2e_user_other",
      role: "USER",
    }),
    blocked_user: makeAccount({
      id: randomUUID(),
      suffix,
      code_prefix: "E2EB",
      display_prefix: "E2E Blocked User",
      login_prefix: "e2e_user_blocked",
      role: "USER",
    }),
  };

  const credentials = {
    admin: { login_id: accounts.admin.login_id, password: "AdminE2E!123" },
    reader: { login_id: accounts.reader.login_id, password: "ReaderE2E!123" },
    root_user: { login_id: accounts.root_user.login_id, password: "UserE2E!123" },
    other_user: { login_id: accounts.other_user.login_id, password: "UserE2E!123" },
    blocked_user: { login_id: accounts.blocked_user.login_id, password: "BlockedE2E!123" },
    register_password: "RegisterE2E!123",
  };

  const fixture: BjcFixture = {
    suffix,
    calculation_date: timestamps.calculation_date,
    ids: {
      policy_id,
      product_id,
      inactive_product_id,
      left_referral_edge_id,
      right_referral_edge_id,
      referral_bonus_rule_id: randomUUID(),
      rank_rule_level_1_id: randomUUID(),
      rank_rule_level_2_id: randomUUID(),
      contribution_rule_depth_1_id: randomUUID(),
      contribution_rule_depth_2_id: randomUUID(),
      sidecar_event_id: randomUUID(),
    },
    accounts,
    credentials,
    stakings: {
      root_active: {
        id: randomUUID(),
        account_id: accounts.root_user.id,
        principal_amount_base: "1000000",
        status: "ACTIVE",
      },
      left_active: {
        id: randomUUID(),
        account_id: accounts.left_user.id,
        principal_amount_base: "1000000",
        status: "ACTIVE",
      },
      right_active: {
        id: randomUUID(),
        account_id: accounts.right_user.id,
        principal_amount_base: "100000",
        status: "ACTIVE",
      },
    },
    ledgers: {
      root_withdrawal_request: {
        id: randomUUID(),
        account_id: accounts.root_user.id,
        reference_id: `e2e:withdrawal:root:${suffix}`,
        amount_base: "1000",
        event_type: "WITHDRAWAL_REQUEST",
      },
      left_withdrawal_request: {
        id: randomUUID(),
        account_id: accounts.left_user.id,
        reference_id: `e2e:withdrawal:left:${suffix}`,
        amount_base: "600",
        event_type: "WITHDRAWAL_REQUEST",
      },
      right_withdrawal_request: {
        id: randomUUID(),
        account_id: accounts.right_user.id,
        reference_id: `e2e:withdrawal:right:${suffix}`,
        amount_base: "400",
        event_type: "WITHDRAWAL_REQUEST",
      },
    },
  };

  const [
    admin_password_hash,
    reader_password_hash,
    user_password_hash,
    blocked_password_hash,
  ] = await Promise.all([
    hashPassword(credentials.admin.password),
    hashPassword(credentials.reader.password),
    hashPassword(credentials.root_user.password),
    hashPassword(credentials.blocked_user.password),
  ]);

  const policy_status = (await hasActivePolicy()) ? "DRAFT" : "ACTIVE";

  await withTx(pool, async (conn) => {
    await conn.query(
      `insert into accounts (
          id,
          login_id,
          password_hash,
          display_name,
          role,
          status,
          referral_code,
          sponsor_account_id,
          joined_at,
          updated_at
        ) values
        (?, ?, ?, ?, 'ADMIN', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'READER', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, ?, ?, ?),
        (?, ?, ?, ?, 'USER', 'ACTIVE', ?, null, ?, ?),
        (?, ?, ?, ?, 'USER', 'BLOCKED', ?, null, ?, ?)`,
      [
        accounts.admin.id,
        accounts.admin.login_id,
        admin_password_hash,
        accounts.admin.display_name,
        accounts.admin.referral_code,
        timestamps.created_at,
        timestamps.created_at,
        accounts.reader.id,
        accounts.reader.login_id,
        reader_password_hash,
        accounts.reader.display_name,
        accounts.reader.referral_code,
        timestamps.created_at,
        timestamps.created_at,
        accounts.root_user.id,
        accounts.root_user.login_id,
        user_password_hash,
        accounts.root_user.display_name,
        accounts.root_user.referral_code,
        timestamps.created_at,
        timestamps.created_at,
        accounts.left_user.id,
        accounts.left_user.login_id,
        user_password_hash,
        accounts.left_user.display_name,
        accounts.left_user.referral_code,
        accounts.root_user.id,
        timestamps.created_at,
        timestamps.created_at,
        accounts.right_user.id,
        accounts.right_user.login_id,
        user_password_hash,
        accounts.right_user.display_name,
        accounts.right_user.referral_code,
        accounts.root_user.id,
        timestamps.created_at,
        timestamps.created_at,
        accounts.other_user.id,
        accounts.other_user.login_id,
        user_password_hash,
        accounts.other_user.display_name,
        accounts.other_user.referral_code,
        timestamps.created_at,
        timestamps.created_at,
        accounts.blocked_user.id,
        accounts.blocked_user.login_id,
        blocked_password_hash,
        accounts.blocked_user.display_name,
        accounts.blocked_user.referral_code,
        timestamps.created_at,
        timestamps.created_at,
      ]
    );

    await conn.query(
      `insert into referral_edges (id, parent_account_id, child_account_id, depth, path, created_at)
       values
       (?, ?, ?, 1, ?, ?),
       (?, ?, ?, 1, ?, ?)`,
      [
        fixture.ids.left_referral_edge_id,
        accounts.root_user.id,
        accounts.left_user.id,
        `${accounts.root_user.id}/${accounts.left_user.id}`,
        timestamps.created_at,
        fixture.ids.right_referral_edge_id,
        accounts.root_user.id,
        accounts.right_user.id,
        `${accounts.root_user.id}/${accounts.right_user.id}`,
        timestamps.created_at,
      ]
    );

    await conn.query(
      `insert into binary_nodes (account_id, parent_account_id, position, root_account_id, updated_at) values
       (?, null, null, ?, ?),
       (?, ?, 'LEFT', ?, ?),
       (?, ?, 'RIGHT', ?, ?),
       (?, null, null, ?, ?),
       (?, null, null, ?, ?)`,
      [
        accounts.root_user.id,
        accounts.root_user.id,
        timestamps.created_at,
        accounts.left_user.id,
        accounts.root_user.id,
        accounts.root_user.id,
        timestamps.created_at,
        accounts.right_user.id,
        accounts.root_user.id,
        accounts.root_user.id,
        timestamps.created_at,
        accounts.other_user.id,
        accounts.other_user.id,
        timestamps.created_at,
        accounts.blocked_user.id,
        accounts.blocked_user.id,
        timestamps.created_at,
      ]
    );

    await conn.query(
      `insert into binary_edges (ancestor_account_id, descendant_account_id, depth, root_leg, path) values
       (?, ?, 0, null, ?),
       (?, ?, 0, null, ?),
       (?, ?, 0, null, ?),
       (?, ?, 0, null, ?),
       (?, ?, 0, null, ?),
       (?, ?, 1, 'LEFT', ?),
       (?, ?, 1, 'RIGHT', ?)`,
      [
        accounts.root_user.id,
        accounts.root_user.id,
        `/${accounts.root_user.id}/`,
        accounts.left_user.id,
        accounts.left_user.id,
        `/${accounts.left_user.id}/`,
        accounts.right_user.id,
        accounts.right_user.id,
        `/${accounts.right_user.id}/`,
        accounts.other_user.id,
        accounts.other_user.id,
        `/${accounts.other_user.id}/`,
        accounts.blocked_user.id,
        accounts.blocked_user.id,
        `/${accounts.blocked_user.id}/`,
        accounts.root_user.id,
        accounts.left_user.id,
        `/${accounts.root_user.id}/${accounts.left_user.id}/`,
        accounts.root_user.id,
        accounts.right_user.id,
        `/${accounts.root_user.id}/${accounts.right_user.id}/`,
      ]
    );

    await conn.query(
      `insert into policy_versions (id, status, note, created_by, created_at, activated_at)
       values (?, ?, ?, ?, ?, ?)`,
      [
        policy_id,
        policy_status,
        `e2e fixture ${suffix}`,
        accounts.admin.id,
        timestamps.created_at,
        policy_status === "ACTIVE" ? timestamps.created_at : null,
      ]
    );

    await conn.query(
      `insert into referral_bonus_rules (id, policy_version_id, depth, bonus_bps, is_active, created_at, updated_at)
       values (?, ?, 1, '1500', 1, ?, ?)`,
      [fixture.ids.referral_bonus_rule_id, policy_id, timestamps.created_at, timestamps.created_at]
    );

    await conn.query(
      `insert into rank_rules (
          id,
          policy_version_id,
          rank_level,
          required_lines,
          required_weak_volume_base,
          rank_share_bps,
          effective_bonus_bps,
          is_active
        ) values
        (?, ?, 1, 1, '100000', '500', '500', 1),
        (?, ?, 2, 2, '500000', '1000', '1000', 1)`,
      [fixture.ids.rank_rule_level_1_id, policy_id, fixture.ids.rank_rule_level_2_id, policy_id]
    );

    await conn.query(
      `insert into staking_products (
          id,
          policy_version_id,
          name,
          symbol,
          decimals,
          min_stake_amount_base,
          max_stake_amount_base,
          staking_days,
          daily_interest_bps,
          is_active
        ) values
        (?, ?, ?, 'USDC', 6, '1', '999999999', 30, '50', 1),
        (?, ?, ?, 'USDC', 6, '1', '999999999', 90, '70', 0)`,
      [
        product_id,
        policy_id,
        `E2E Active Product ${suffix}`,
        inactive_product_id,
        policy_id,
        `E2E Inactive Product ${suffix}`,
      ]
    );

    await conn.query(
      `insert into withdrawal_fee_rules (
          id,
          policy_version_id,
          withdrawal_source_type,
          schedule_days,
          fee_bps,
          fee_mode,
          is_active
        ) values
        (?, ?, 'DAILY_REWARD', 1, '2000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'DAILY_REWARD', 7, '1000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'DAILY_REWARD', 15, '600', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'DAILY_REWARD', 30, '300', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS', 30, '3000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS', 60, '2000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS', 90, '1000', 'DEDUCT_FROM_WITHDRAWAL', 1),
        (?, ?, 'BONUS', 180, '0', 'DEDUCT_FROM_WITHDRAWAL', 1)`,
      [
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
        randomUUID(),
        policy_id,
      ]
    );

    await conn.query(
      `insert into contribution_weight_rules (id, policy_version_id, depth, weight_bps)
       values
       (?, ?, 1, 10000),
       (?, ?, 2, 5000)`,
      [fixture.ids.contribution_rule_depth_1_id, policy_id, fixture.ids.contribution_rule_depth_2_id, policy_id]
    );

    await conn.query(
      `insert into sidecar_events (
          id,
          policy_version_id,
          status,
          trigger_reason,
          freeze_bps,
          release_bps,
          triggered_at,
          released_at,
          created_by,
          created_at
        ) values (?, ?, 'SIDECAR_ACTIVE', 'e2e fixture', 3000, 7000, ?, null, ?, ?)`,
      [fixture.ids.sidecar_event_id, policy_id, timestamps.created_at, accounts.admin.id, timestamps.created_at]
    );

    await conn.query(
      `insert into account_stakings (
          id,
          account_id,
          staking_product_id,
          policy_version_id,
          principal_amount_base,
          daily_interest_bps_snapshot,
          duration_days_snapshot,
          status,
          idempotency_key,
          started_at,
          matures_at,
          activated_at,
          created_at,
          updated_at
        ) values
        (?, ?, ?, ?, ?, '50', 30, 'ACTIVE', ?, ?, '2026-07-19 00:00:00.000000', ?, ?, ?),
        (?, ?, ?, ?, ?, '50', 30, 'ACTIVE', ?, ?, '2026-07-19 01:00:00.000000', ?, ?, ?),
        (?, ?, ?, ?, ?, '50', 30, 'ACTIVE', ?, ?, '2026-07-19 02:00:00.000000', ?, ?, ?)`,
      [
        fixture.stakings.root_active.id,
        fixture.stakings.root_active.account_id,
        product_id,
        policy_id,
        fixture.stakings.root_active.principal_amount_base,
        `e2e-root-stake-${suffix}`,
        timestamps.activated_at_sql,
        timestamps.activated_at_sql,
        timestamps.created_at,
        timestamps.created_at,
        fixture.stakings.left_active.id,
        fixture.stakings.left_active.account_id,
        product_id,
        policy_id,
        fixture.stakings.left_active.principal_amount_base,
        `e2e-left-stake-${suffix}`,
        "2026-06-19 01:00:00.000000",
        "2026-06-19 01:00:00.000000",
        timestamps.created_at,
        timestamps.created_at,
        fixture.stakings.right_active.id,
        fixture.stakings.right_active.account_id,
        product_id,
        policy_id,
        fixture.stakings.right_active.principal_amount_base,
        `e2e-right-stake-${suffix}`,
        "2026-06-19 02:00:00.000000",
        "2026-06-19 02:00:00.000000",
        timestamps.created_at,
        timestamps.created_at,
      ]
    );

    await conn.query(
      `insert into account_rewards (
          id,
          account_id,
          account_staking_id,
          source_account_id,
          source_account_staking_id,
          policy_version_id,
          calc_run_id,
          reward_type,
          reward_date,
          amount_base,
          status,
          source_reference,
          source_ledger_event_id,
          reversal_reward_id,
          available_at,
          confirmed_at,
          reversed_at,
          metadata_json,
          created_at,
          updated_at
        ) values
        (?, ?, ?, null, null, ?, null, 'DAILY_REWARD', '2026-06-01', '500', 'CONFIRMED', ?, null, null, '2026-06-01 00:00:00', '2026-06-01 00:00:00', null, '{}', ?, ?),
        (?, ?, ?, null, null, ?, null, 'RANK_BONUS', '2026-06-02', '300', 'CONFIRMED', ?, null, null, '2026-06-02 00:00:00', '2026-06-02 00:00:00', null, '{\"rank_level\":1}', ?, ?)`,
      [
        randomUUID(),
        fixture.accounts.root_user.id,
        fixture.stakings.root_active.id,
        policy_id,
        `e2e:reward:daily:${suffix}`,
        timestamps.created_at,
        timestamps.created_at,
        randomUUID(),
        fixture.accounts.root_user.id,
        fixture.stakings.root_active.id,
        policy_id,
        `e2e:reward:rank-bonus:${suffix}`,
        timestamps.created_at,
        timestamps.created_at,
      ]
    );

    await conn.query(
      `insert into ledger_events (
          id,
          account_id,
          related_account_id,
          product_id,
          policy_version_id,
          calc_run_id,
          event_time,
          event_type,
          amount_base,
          decimals,
          symbol,
          reference_id,
          meta,
          created_by
        ) values
        (?, ?, null, null, ?, null, '2026-06-30 05:00:00', 'WITHDRAWAL_REQUEST', ?, 0, 'BJC', ?, '{}', ?),
        (?, ?, null, null, ?, null, '2026-06-30 05:01:00', 'WITHDRAWAL_REQUEST', ?, 0, 'BJC', ?, '{}', ?),
        (?, ?, null, null, ?, null, '2026-06-30 05:02:00', 'WITHDRAWAL_REQUEST', ?, 0, 'BJC', ?, '{}', ?)`,
      [
        fixture.ledgers.root_withdrawal_request.id,
        fixture.ledgers.root_withdrawal_request.account_id,
        policy_id,
        fixture.ledgers.root_withdrawal_request.amount_base,
        fixture.ledgers.root_withdrawal_request.reference_id,
        accounts.admin.id,
        fixture.ledgers.left_withdrawal_request.id,
        fixture.ledgers.left_withdrawal_request.account_id,
        policy_id,
        fixture.ledgers.left_withdrawal_request.amount_base,
        fixture.ledgers.left_withdrawal_request.reference_id,
        accounts.admin.id,
        fixture.ledgers.right_withdrawal_request.id,
        fixture.ledgers.right_withdrawal_request.account_id,
        policy_id,
        fixture.ledgers.right_withdrawal_request.amount_base,
        fixture.ledgers.right_withdrawal_request.reference_id,
        accounts.admin.id,
      ]
    );
  });

  return fixture;
}
