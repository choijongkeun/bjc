export type SessionRole = "ADMIN" | "READER" | "USER";
export type AccountStakingStatus = "PENDING" | "ACTIVE" | "CANCEL_REQUESTED" | "CANCELLED" | "MATURED" | "CLOSED";
export type AccountStakingSort = "created_at_desc" | "created_at_asc" | "matures_at_asc" | "matures_at_desc";
export type RewardType =
  | "DAILY_REWARD"
  | "DIRECT_REFERRAL"
  | "RANK_BONUS"
  | "CONTRIBUTION"
  | "WITHDRAWAL_FEE"
  | "SIDECAR"
  | "ADJUSTMENT"
  | "REVERSAL";
export type RewardStatus = "PENDING" | "CONFIRMED" | "REVERSED";
export type RewardSort =
  | "reward_date_desc"
  | "reward_date_asc"
  | "created_at_desc"
  | "created_at_asc"
  | "available_at_desc"
  | "available_at_asc";
export type WithdrawalType = "DAILY_REWARD" | "BONUS";
export type WithdrawalStatus = "REQUESTED" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED" | "FAILED" | "CANCELLED";
export type WithdrawalSort =
  | "requested_at_desc"
  | "requested_at_asc"
  | "created_at_desc"
  | "created_at_asc"
  | "completed_at_desc"
  | "completed_at_asc";

export type PolicyVersion = {
  id: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  note: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  retired_at: string | null;
};

export type StakingProduct = {
  id: string;
  policy_version_id?: string;
  name: string;
  symbol: string;
  decimals: number;
  min_stake_amount_base: string;
  max_stake_amount_base: string;
  staking_days: number;
  daily_interest_bps: string;
  is_active: boolean;
  created_at?: string;
};

export type AdminStakingAccount = {
  id: string;
  login_id: string | null;
  display_name: string | null;
};

export type AdminStakingListItem = {
  id: string;
  account_id: string;
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  status: AccountStakingStatus;
  started_at: string | null;
  matures_at: string | null;
  activated_at: string | null;
  cancel_requested_at: string | null;
  cancelled_at: string | null;
  matured_at: string | null;
  closed_at: string | null;
  source_ledger_event_id: string | null;
  cancellation_ledger_event_id: string | null;
  created_at: string;
  updated_at: string;
  product: StakingProduct;
  account: AdminStakingAccount;
};

export type AdminStakingDetail = AdminStakingListItem;

export type AdminStakingListResponse = {
  items: AdminStakingListItem[];
  page: number;
  limit: number;
  total: number;
};

export type LedgerEvent = {
  id: string;
  account_id: string;
  product_id: string;
  policy_version_id: string;
  calc_run_id: string | null;
  event_time: string;
  event_type: string;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string;
  related_account_id: string | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type CalcRun = {
  id: string;
  policy_version_id: string;
  run_type: string;
  run_date: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "FINALIZED";
  finalized_at: string | null;
  created_at: string;
  error_message: string | null;
};

export type SettlementItem = {
  id: string;
  calc_run_id: string;
  settlement_type: string;
  account_id: string;
  ledger_event_id: string | null;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_account_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ReportSummary = {
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  total_fee_amount_base: string;
  total_accounts: string;
  total_ledger_events: string;
  total_calc_runs: string;
  finalized_calc_runs: string;
};

export type RewardSummary = {
  pending_reward_amount_base: string;
  confirmed_reward_amount_base: string;
  withdrawable_reward_amount_base: string;
  withdrawn_reward_amount_base: string;
  daily_reward_amount_base: string;
  bonus_reward_amount_base?: string;
  reward_count: number;
};

export type WithdrawalAccountSummary = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  status: AccountStatus;
};

export type WithdrawalRewardSummary = {
  id: string;
  account_id: string;
  account_staking_id: string | null;
  policy_version_id: string;
  reward_type: RewardType;
  reward_date: string | null;
  amount_base: string;
  status: RewardStatus;
  source_reference: string;
  available_at: string | null;
  confirmed_at: string | null;
  reversed_at: string | null;
};

export type AdminWithdrawalAllocation = {
  id: number;
  withdrawal_id: string;
  reward_id: string;
  allocated_amount_base: string;
  fee_policy_version_id: string;
  fee_schedule_days_snapshot: number;
  fee_rate_snapshot: string;
  fee_mode_snapshot: "DEDUCT_FROM_WITHDRAWAL";
  holding_days_snapshot: number;
  fee_amount_base: string;
  net_amount_base: string;
  status: "RESERVED" | "CONSUMED" | "RELEASED";
  reserved_at: string | null;
  consumed_at: string | null;
  released_at: string | null;
  created_at: string | null;
  reward: WithdrawalRewardSummary;
};

export type WithdrawalAllocationSummary = {
  allocation_count: number;
  reserved_amount_base: string;
  consumed_amount_base: string;
  released_amount_base: string;
};

export type AdminWithdrawalListItem = {
  id: string;
  account_id: string;
  fee_policy_version_id: string;
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  fee_amount_base: string;
  net_amount_base: string;
  fee_mode_snapshot: "DEDUCT_FROM_WITHDRAWAL";
  status: WithdrawalStatus;
  idempotency_key: string;
  wallet_address: string | null;
  network: string | null;
  tx_hash: string | null;
  requested_kst_date: string | null;
  requested_at: string | null;
  approved_at: string | null;
  processing_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  reject_reason: string | null;
  failure_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  account?: WithdrawalAccountSummary;
};

export type AdminWithdrawalDetail = AdminWithdrawalListItem & {
  allocation_summary: WithdrawalAllocationSummary;
  allocations: AdminWithdrawalAllocation[];
  ledger_events?: Array<{
    id: string;
    event_type: string;
    amount_base: string;
    reference_id: string;
    event_time: string | null;
    created_at: string | null;
  }>;
  audit_logs?: Array<{
    id: string;
    actor_account_id: string | null;
    action: string;
    target_table: string | null;
    target_id: string | null;
    created_at: string | null;
  }>;
};

export type AdminWithdrawalSummary = {
  requested_amount_base: string;
  approved_amount_base: string;
  processing_amount_base: string;
  completed_amount_base: string;
  rejected_amount_base: string;
  failed_amount_base: string;
  cancelled_amount_base: string;
  fee_amount_base: string;
  net_completed_amount_base: string;
  requested_count: number;
  completed_count: number;
};

export type RewardMetadata = Partial<{
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  denominator: string;
  formula_version: string;
  source_principal_amount_base: string;
  direct_referral_rate_bps: string;
  referral_depth: number;
  original_reward_id: string;
  original_source_reference: string;
  reason: string;
  reward_type: RewardType;
}>;

export type RewardStakingSummary = {
  id: string;
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  status: AccountStakingStatus;
};

export type RewardSourceStakingSummary = {
  id: string;
  principal_amount_base: string | null;
  status: AccountStakingStatus | null;
};

export type RewardProductSummary = {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
};

export type RewardAccountSummary = {
  id: string;
  login_id: string | null;
  display_name: string | null;
};

export type RewardSourceSummary = {
  account_id?: string | null;
  login_id?: string | null;
  display_name: string | null;
  direct_referral_rate_bps: string | null;
  staking: RewardSourceStakingSummary | null;
};

export type RewardCalcRunSummary = {
  id: string;
  policy_version_id?: string;
  run_type: string;
  run_date: string | null;
  status: string;
  started_at?: string | null;
  finished_at?: string | null;
  finalized_at?: string | null;
  error_message?: string | null;
  created_at?: string | null;
};

export type RewardRelation = {
  id: string;
  amount_base: string;
};

export type OriginalRewardRelation = {
  id: string;
  reward_type: RewardType;
  amount_base: string;
};

export type AdminRewardListItem = {
  id: string;
  account_id: string;
  reward_type: RewardType;
  reward_date: string | null;
  amount_base: string;
  status: RewardStatus;
  account_staking_id: string | null;
  source_account_id?: string | null;
  source_account_staking_id?: string | null;
  policy_version_id: string;
  calc_run_id: string | null;
  source_reference: string;
  source_ledger_event_id: string | null;
  reversal_reward_id: string | null;
  available_at: string | null;
  confirmed_at: string | null;
  reversed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  staking: RewardStakingSummary | null;
  product: RewardProductSummary | null;
  account?: RewardAccountSummary;
  source?: RewardSourceSummary | null;
  calc_run?: RewardCalcRunSummary | null;
};

export type AdminRewardDetail = AdminRewardListItem & {
  metadata?: RewardMetadata;
  reversal: RewardRelation | null;
  original_reward?: OriginalRewardRelation | null;
};

export type AdminRewardListResponse = ItemsPageResponse<AdminRewardListItem>;

export type DailyRewardRunRequest = {
  policy_version_id: string;
  reward_date: string;
};

export type DailyRewardRunResponse = {
  calc_run: RewardCalcRunSummary;
  target_count: number;
  created_count: number;
  zero_reward_skip_count: number;
  duplicate_skip_count: number;
  failed_count: number;
  total_reward_amount_base: string;
};

export type DirectReferralRunRequest = {
  policy_version_id: string;
  activated_from: string;
  activated_to: string;
};

export type DirectReferralRunResponse = {
  calc_run_id: string;
  target_count: number;
  created_count: number;
  no_sponsor_skip_count: number;
  inactive_sponsor_skip_count: number;
  zero_reward_skip_count: number;
  duplicate_skip_count: number;
  conflict_count: number;
  failed_count: number;
  total_reward_amount_base: string;
  status: "SUCCEEDED" | "FAILED" | "RUNNING" | "PENDING" | "FINALIZED";
};

export type DirectReferralSingleRunRequest = {
  policy_version_id?: string;
};

export type DirectReferralSingleRunResponse = {
  calc_run_id: string | null;
  status: string;
  result_type: "created" | "duplicate" | "no_sponsor" | "inactive_sponsor" | "zero_reward" | "conflict";
  reward_id: string | null;
  existing_reward_id: string | null;
};

export type AccountStatus = "ACTIVE" | "BLOCKED" | "WITHDRAWN";
export type BinaryPosition = "LEFT" | "RIGHT";
export type AdminAccountSort = "joined_at_desc" | "joined_at_asc" | "login_id_asc" | "total_stake_desc";

export type AdminAccountListItem = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: SessionRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  sponsor_login_id: string | null;
  binary_parent_account_id: string | null;
  binary_parent_login_id: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  rank_level: number;
};

export type AdminAccountDetail = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: SessionRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  sponsor_login_id: string | null;
  sponsor_display_name: string | null;
  binary_parent_account_id: string | null;
  binary_parent_login_id: string | null;
  binary_parent_display_name: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string | null;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  rank_level: number;
};

export type AdminAccountStatusUpdateResult = {
  account: AdminAccountDetail;
  previous_status: AccountStatus;
  revoked_session_count: number;
};

export type ReferralTreeRoot = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  referral_code: string | null;
  sponsor_account_id: string | null;
  depth: number;
  rank_level: number;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
};

export type ReferralTreeNode = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  referral_code: string | null;
  sponsor_account_id: string | null;
  depth: number;
  rank_level: number;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  children: ReferralTreeNode[];
};

export type ReferralTreeResponse = {
  root: ReferralTreeRoot;
  children: ReferralTreeNode[];
};

export type BinaryTreeNode = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  depth: number;
  root_leg: BinaryPosition | null;
  total_stake_amount_base: string;
  total_sales_amount_base: string;
  total_reward_amount_base: string;
  rank_level: number;
  children: BinaryTreeNode[];
};

export type BinaryTreeResponse = {
  root: BinaryTreeNode;
};

export type BinaryLegSummary = {
  member_count: number;
  total_stake_amount_base: string;
  total_sales_amount_base: string;
  total_reward_amount_base: string;
};

export type BinaryLegsResponse = {
  left: BinaryLegSummary;
  right: BinaryLegSummary;
  weak_leg: BinaryPosition;
  weak_leg_volume_base: string;
};

export type DownlineItem = {
  account_id: string;
  login_id: string | null;
  display_name: string | null;
  depth: number;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  root_leg: BinaryPosition | null;
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  rank_level: number;
  joined_at: string | null;
};

export type PagedResponse<T, K extends string> = Record<K, T[]> & {
  page: number;
  limit: number;
  total: number;
};

export type ItemsPageResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details ?? null;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init: RequestInit & { actorId?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init.actorId) {
    headers.set("x-actor-account-id", init.actorId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload && "error" in payload ? (payload as any).error : null;
    throw new ApiError(response.status, errorPayload?.message ?? response.statusText, errorPayload?.details);
  }

  return payload as T;
}

function params(query: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function resolveActorRole(actorId: string): Promise<"ADMIN" | "READER"> {
  await request<PagedResponse<PolicyVersion, "policy_versions">>(`/api/policies${params({ page: 1, limit: 1 })}`, {
    method: "GET",
    actorId,
  });
  try {
    await request<PagedResponse<AuditLog, "audit_logs">>(`/api/audit-logs${params({ page: 1, limit: 1 })}`, {
      method: "GET",
      actorId,
    });
    return "ADMIN";
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return "READER";
    }
    throw error;
  }
}

export const api = {
  listPolicies: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<PolicyVersion, "policy_versions">>(`/api/policies${params(query as any)}`, { method: "GET", actorId }),
  createPolicy: (actorId: string, body: { note?: string | null; effective_from?: string | null; effective_to?: string | null }) =>
    request<{ policy_id: string; status: string }>(`/api/policies`, { method: "POST", actorId, body: JSON.stringify(body) }),
  activatePolicy: (actorId: string, policyId: string) =>
    request<{ ok: true }>(`/api/policies/${policyId}/activate`, { method: "POST", actorId, body: JSON.stringify({}) }),
  listStakingProducts: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<StakingProduct, "staking_products">>(`/api/staking-products${params(query as any)}`, { method: "GET", actorId }),
  createStakingProducts: (actorId: string, body: { policy_id: string; products: Array<Record<string, unknown>> }) =>
    request<{ upserted: number; ids: string[] }>(`/api/staking-products`, { method: "POST", actorId, body: JSON.stringify(body) }),
  listLedgerEvents: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<LedgerEvent, "ledger_events">>(`/api/ledger-events${params(query as any)}`, { method: "GET", actorId }),
  createLedgerEvent: (actorId: string, body: { event: Record<string, unknown> }) =>
    request<{ ledger_event_id: string }>(`/api/ledger-events`, { method: "POST", actorId, body: JSON.stringify(body) }),
  importLedgerCsv: (actorId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<{ inserted_count: number; rejected_count: number; errors: string[] }>(`/api/ledger-events/import-csv`, {
      method: "POST",
      actorId,
      body: form,
      headers: {},
    });
  },
  listCalcRuns: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<CalcRun, "calc_runs">>(`/api/calc-runs${params(query as any)}`, { method: "GET", actorId }),
  createCalcRun: (actorId: string, body: { policy_id: string; run_type: string; run_date: string }) =>
    request<{ calc_run_id: string; status: string }>(`/api/calc-runs`, { method: "POST", actorId, body: JSON.stringify(body) }),
  transitionCalcRun: (actorId: string, calcRunId: string, action: "start" | "succeed" | "fail" | "finalize", body?: Record<string, unknown>) =>
    request<{ ok: true; from: string; to: string }>(`/api/calc-runs/${calcRunId}/${action}`, { method: "POST", actorId, body: JSON.stringify(body ?? {}) }),
  listSettlementItems: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<SettlementItem, "settlement_items">>(`/api/settlement-items${params(query as any)}`, { method: "GET", actorId }),
  getReportSummary: (actorId: string, query: Record<string, unknown>) =>
    request<ReportSummary>(`/api/reports/summary${params(query as any)}`, { method: "GET", actorId }),
  listAuditLogs: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<AuditLog, "audit_logs">>(`/api/audit-logs${params(query as any)}`, { method: "GET", actorId }),
  listAdminAccounts: (
    actorId: string,
    query: {
      q?: string;
      role?: SessionRole;
      status?: AccountStatus;
      sponsor_account_id?: string;
      binary_parent_account_id?: string;
      binary_position?: BinaryPosition;
      page?: number;
      limit?: number;
      sort?: AdminAccountSort;
    }
  ) => request<ItemsPageResponse<AdminAccountListItem>>(`/api/admin/accounts${params(query as any)}`, { method: "GET", actorId }),
  getAdminAccount: (actorId: string, accountId: string) =>
    request<{ account: AdminAccountDetail }>(`/api/admin/accounts/${accountId}`, { method: "GET", actorId }),
  updateAdminAccountStatus: (
    actorId: string,
    accountId: string,
    body: { status: AccountStatus; reason?: string }
  ) =>
    request<AdminAccountStatusUpdateResult>(`/api/admin/accounts/${accountId}/status`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body),
    }),
  getAdminAccountReferralTree: (actorId: string, accountId: string, query: { depth?: number }) =>
    request<ReferralTreeResponse>(`/api/admin/accounts/${accountId}/referral-tree${params(query as any)}`, { method: "GET", actorId }),
  getAdminAccountBinaryTree: (actorId: string, accountId: string, query: { depth?: number }) =>
    request<BinaryTreeResponse>(`/api/admin/accounts/${accountId}/binary-tree${params(query as any)}`, { method: "GET", actorId }),
  getAdminAccountBinaryLegs: (actorId: string, accountId: string) =>
    request<BinaryLegsResponse>(`/api/admin/accounts/${accountId}/binary-legs`, { method: "GET", actorId }),
  getAdminAccountDownlines: (
    actorId: string,
    accountId: string,
    query: { type: "referral" | "binary"; depth?: number; page?: number; limit?: number }
  ) => request<ItemsPageResponse<DownlineItem>>(`/api/admin/accounts/${accountId}/downlines${params(query as any)}`, { method: "GET", actorId }),
  listAdminStakings: (
    actorId: string,
    query: {
      q?: string;
      account_id?: string;
      product_id?: string;
      status?: AccountStakingStatus;
      created_from?: string;
      created_to?: string;
      matures_from?: string;
      matures_to?: string;
      page?: number;
      limit?: number;
      sort?: AccountStakingSort;
    }
  ) => request<AdminStakingListResponse>(`/api/admin/stakings${params(query as any)}`, { method: "GET", actorId }),
  getAdminStaking: (actorId: string, stakingId: string) =>
    request<{ staking: AdminStakingDetail }>(`/api/admin/stakings/${stakingId}`, { method: "GET", actorId }),
  activateAdminStaking: (actorId: string, stakingId: string) =>
    request<{ staking: AdminStakingDetail }>(`/api/admin/stakings/${stakingId}/activate`, {
      method: "POST",
      actorId,
      body: JSON.stringify({}),
    }),
  rejectAdminStaking: (actorId: string, stakingId: string, body: { reason: string }) =>
    request<{ staking: AdminStakingDetail }>(`/api/admin/stakings/${stakingId}/reject`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body),
    }),
  cancelAdminStaking: (actorId: string, stakingId: string, body: { reason?: string }) =>
    request<{ staking: AdminStakingDetail }>(`/api/admin/stakings/${stakingId}/cancel`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body),
    }),
  listAdminAccountStakings: (
    actorId: string,
    accountId: string,
    query: { status?: AccountStakingStatus; product_id?: string; page?: number; limit?: number; sort?: AccountStakingSort }
  ) => request<AdminStakingListResponse>(`/api/admin/accounts/${accountId}/stakings${params(query as any)}`, { method: "GET", actorId }),
  listAdminWithdrawals: (
    actorId: string,
    query: {
      q?: string;
      account_id?: string;
      withdrawal_type?: WithdrawalType;
      status?: WithdrawalStatus;
      network?: string;
      requested_from?: string;
      requested_to?: string;
      completed_from?: string;
      completed_to?: string;
      page?: number;
      limit?: number;
      sort?: WithdrawalSort;
    }
  ) => request<ItemsPageResponse<AdminWithdrawalListItem>>(`/api/admin/withdrawals${params(query as any)}`, { method: "GET", actorId }),
  getAdminWithdrawal: (actorId: string, withdrawalId: string) =>
    request<{ withdrawal: AdminWithdrawalDetail }>(`/api/admin/withdrawals/${withdrawalId}`, { method: "GET", actorId }),
  approveAdminWithdrawal: (actorId: string, withdrawalId: string) =>
    request<{ withdrawal: AdminWithdrawalDetail }>(`/api/admin/withdrawals/${withdrawalId}/approve`, {
      method: "POST",
      actorId,
      body: JSON.stringify({}),
    }),
  rejectAdminWithdrawal: (actorId: string, withdrawalId: string, reason: string) =>
    request<{ withdrawal: AdminWithdrawalDetail }>(`/api/admin/withdrawals/${withdrawalId}/reject`, {
      method: "POST",
      actorId,
      body: JSON.stringify({ reason }),
    }),
  markAdminWithdrawalProcessing: (actorId: string, withdrawalId: string, network: string) =>
    request<{ withdrawal: AdminWithdrawalDetail }>(`/api/admin/withdrawals/${withdrawalId}/processing`, {
      method: "POST",
      actorId,
      body: JSON.stringify({ network }),
    }),
  completeAdminWithdrawal: (actorId: string, withdrawalId: string, body: { tx_hash: string; network: string }) =>
    request<{ withdrawal: AdminWithdrawalDetail }>(`/api/admin/withdrawals/${withdrawalId}/complete`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body),
    }),
  failAdminWithdrawal: (actorId: string, withdrawalId: string, reason: string) =>
    request<{ withdrawal: AdminWithdrawalDetail }>(`/api/admin/withdrawals/${withdrawalId}/fail`, {
      method: "POST",
      actorId,
      body: JSON.stringify({ reason }),
    }),
  listAdminAccountWithdrawals: (
    actorId: string,
    accountId: string,
    query: {
      withdrawal_type?: WithdrawalType;
      status?: WithdrawalStatus;
      network?: string;
      requested_from?: string;
      requested_to?: string;
      completed_from?: string;
      completed_to?: string;
      page?: number;
      limit?: number;
      sort?: WithdrawalSort;
    }
  ) =>
    request<{ account: WithdrawalAccountSummary; items: AdminWithdrawalListItem[]; page: number; limit: number; total: number }>(
      `/api/admin/accounts/${accountId}/withdrawals${params(query as any)}`,
      { method: "GET", actorId }
    ),
  getAdminWithdrawalSummary: (
    actorId: string,
    query: {
      date_from?: string;
      date_to?: string;
      withdrawal_type?: WithdrawalType;
      network?: string;
    }
  ) => request<AdminWithdrawalSummary>(`/api/admin/reports/withdrawal-summary${params(query as any)}`, { method: "GET", actorId }),
  listAdminRewards: (
    actorId: string,
    query: {
      q?: string;
      account_id?: string;
      staking_id?: string;
      reward_type?: RewardType;
      status?: RewardStatus;
      calc_run_id?: string;
      reward_date_from?: string;
      reward_date_to?: string;
      page?: number;
      limit?: number;
      sort?: RewardSort;
    }
  ) => request<AdminRewardListResponse>(`/api/admin/rewards${params(query as any)}`, { method: "GET", actorId }),
  getAdminReward: (actorId: string, rewardId: string) =>
    request<{ reward: AdminRewardDetail }>(`/api/admin/rewards/${rewardId}`, { method: "GET", actorId }),
  listAdminAccountRewards: (
    actorId: string,
    accountId: string,
    query: {
      staking_id?: string;
      reward_type?: RewardType;
      status?: RewardStatus;
      calc_run_id?: string;
      reward_date_from?: string;
      reward_date_to?: string;
      page?: number;
      limit?: number;
      sort?: RewardSort;
    }
  ) => request<AdminRewardListResponse>(`/api/admin/accounts/${accountId}/rewards${params(query as any)}`, { method: "GET", actorId }),
  listAdminCalcRunRewards: (
    actorId: string,
    calcRunId: string,
    query: {
      reward_type?: RewardType;
      status?: RewardStatus;
      page?: number;
      limit?: number;
      sort?: RewardSort;
    }
  ) =>
    request<{ calc_run: RewardCalcRunSummary; items: AdminRewardListItem[]; page: number; limit: number; total: number }>(
      `/api/admin/calc-runs/${calcRunId}/rewards${params(query as any)}`,
      { method: "GET", actorId }
    ),
  runDailyReward: (actorId: string, body: DailyRewardRunRequest) =>
    request<DailyRewardRunResponse>(`/api/admin/calc-runs/daily-reward`, { method: "POST", actorId, body: JSON.stringify(body) }),
  runDirectReferralReward: (actorId: string, body: DirectReferralRunRequest) =>
    request<DirectReferralRunResponse>(`/api/admin/rewards/direct-referral/run`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body),
    }),
  runDirectReferralForStaking: (actorId: string, stakingId: string, body?: DirectReferralSingleRunRequest) =>
    request<DirectReferralSingleRunResponse>(`/api/admin/stakings/${stakingId}/direct-referral-calculate`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body ?? {}),
    }),
  reverseAdminReward: (actorId: string, rewardId: string, body: { reason: string }) =>
    request<{ reward: AdminRewardDetail }>(`/api/admin/rewards/${rewardId}/reverse`, {
      method: "POST",
      actorId,
      body: JSON.stringify(body),
    }),
};
