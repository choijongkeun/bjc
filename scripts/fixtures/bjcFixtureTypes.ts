export type BjcFixtureCredentials = {
  login_id: string;
  password: string;
};

export type BjcFixtureAccount = {
  id: string;
  login_id: string;
  display_name: string;
  referral_code: string;
  role: "ADMIN" | "READER" | "USER";
};

export type BjcFixtureStaking = {
  id: string;
  account_id: string;
  principal_amount_base: string;
  status: "ACTIVE";
};

export type BjcFixtureLedger = {
  id: string;
  account_id: string;
  reference_id: string;
  amount_base: string;
  event_type: "WITHDRAWAL_REQUEST";
};

export type BjcFixtureRuleIds = {
  referral_bonus_rule_id: string;
  rank_rule_level_1_id: string;
  rank_rule_level_2_id: string;
  contribution_rule_depth_1_id: string;
  contribution_rule_depth_2_id: string;
  sidecar_event_id: string;
};

export type BjcFixture = {
  suffix: string;
  calculation_date: string;
  ids: {
    policy_id: string;
    product_id: string;
    inactive_product_id: string;
    left_referral_edge_id: string;
    right_referral_edge_id: string;
  } & BjcFixtureRuleIds;
  accounts: {
    admin: BjcFixtureAccount;
    reader: BjcFixtureAccount;
    root_user: BjcFixtureAccount;
    left_user: BjcFixtureAccount;
    right_user: BjcFixtureAccount;
    other_user: BjcFixtureAccount;
    blocked_user: BjcFixtureAccount;
  };
  credentials: {
    admin: BjcFixtureCredentials;
    reader: BjcFixtureCredentials;
    root_user: BjcFixtureCredentials;
    other_user: BjcFixtureCredentials;
    blocked_user: BjcFixtureCredentials;
    register_password: string;
  };
  stakings: {
    root_active: BjcFixtureStaking;
    left_active: BjcFixtureStaking;
    right_active: BjcFixtureStaking;
  };
  ledgers: {
    root_withdrawal_request: BjcFixtureLedger;
    left_withdrawal_request: BjcFixtureLedger;
    right_withdrawal_request: BjcFixtureLedger;
  };
};

export type BjcFixtureCleanupReport = {
  fixture_accounts: number;
  fixture_policies: number;
  fixture_products: number;
  fixture_stakings: number;
  fixture_rewards: number;
  fixture_withdrawals: number;
  fixture_calc_runs: number;
  fixture_ledger_events: number;
  fixture_sessions: number;
};
