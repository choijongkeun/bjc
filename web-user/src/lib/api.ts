import { useSessionStore } from "@/store/sessionStore";

export type AccountStatus = "ACTIVE" | "BLOCKED" | "WITHDRAWN";
export type BinaryPosition = "LEFT" | "RIGHT";
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
export type SessionRole = "ADMIN" | "READER" | "USER";

export type SessionAccount = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  role: SessionRole;
  status: AccountStatus;
  referral_code: string | null;
  sponsor_account_id: string | null;
  binary_parent_account_id: string | null;
  binary_position: BinaryPosition | null;
  joined_at: string | null;
  last_login_at: string | null;
};

export type ReferralResolveResponse = {
  referral_code_valid: true;
  sponsor_account_id: string;
  sponsor_login_id: string;
  sponsor_display_name: string;
};

export type AuthResponse = {
  access_token: string;
  account: SessionAccount;
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

export type ReferralTreeNode = ReferralTreeRoot & {
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

export type DownlineResponse = {
  items: DownlineItem[];
  page: number;
  limit: number;
  total: number;
};

export type StakingProduct = {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  min_stake_amount_base: string;
  max_stake_amount_base: string;
  staking_days: number;
  daily_interest_bps: string;
  is_active: boolean;
};

export type AccountStakingProduct = StakingProduct;

export type AccountStaking = {
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
  product: AccountStakingProduct;
};

export type StakingProductsResponse = {
  staking_products: StakingProduct[];
  page: number;
  limit: number;
  total: number;
};

export type AccountStakingListResponse = {
  items: AccountStaking[];
  page: number;
  limit: number;
  total: number;
};

export type CreateStakingRequest = {
  staking_product_id: string;
  principal_amount_base: string;
  idempotency_key: string;
};

export type CancelStakingRequest = {
  reason?: string;
  idempotency_key: string;
};

export type RewardMetadata = Partial<{
  principal_amount_base: string;
  daily_interest_bps_snapshot: string;
  duration_days_snapshot: number;
  denominator: string;
  formula_version: string;
  organization_scope: string;
  rank_level: number;
  effective_bonus_bps: string;
  base_daily_reward_amount_base: string;
  qualification_calc_run_id: string;
  qualification_result_id: string;
  rule_id: string;
  rate_bps: string;
  weight_bps: string;
  base_amount_base: string;
  pool_amount_base: string;
  total_score: string;
  score_amount_base: string;
  score_ratio_bps: string;
  qualification_source: string;
  requested_amount_base: string;
  release_amount_base: string;
  freeze_amount_base: string;
  release_bps: string;
  freeze_bps: string;
  sidecar_status: string;
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

export type RewardProductSummary = {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
};

export type RewardCalcRunSummary = {
  id: string;
  status: string;
  run_type: string;
  run_date: string | null;
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

export type AccountReward = {
  id: string;
  account_id: string;
  reward_type: RewardType;
  reward_date: string | null;
  amount_base: string;
  status: RewardStatus;
  account_staking_id: string | null;
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
  calc_run?: RewardCalcRunSummary | null;
  metadata?: RewardMetadata;
};

export type AccountRewardDetail = AccountReward & {
  reversal: RewardRelation | null;
  original_reward?: OriginalRewardRelation | null;
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

export type RankProgressItem = {
  metric: "direct_active_referral_count" | "weak_leg_volume_base";
  current: number | string;
  required: number | string;
  met: boolean;
};

export type RankStatusSummary = {
  account_id: string;
  policy_version_id: string;
  current_rank_level: number | null;
  qualified_at: string | null;
  maintained_until: string | null;
  last_qualification_calc_run_id: string | null;
  last_bonus_calc_run_id: string | null;
  last_change_type: "INITIAL" | "PROMOTED" | "MAINTAINED" | "DEMOTED" | null;
  created_at: string | null;
  updated_at: string | null;
};

export type RankQualificationResult = {
  id: string;
  calc_run_id: string;
  account_id: string;
  policy_version_id: string;
  calculation_date: string;
  period_from: string;
  period_to: string;
  previous_rank_level: number | null;
  qualified_rank_level: number | null;
  applied_rank_level: number | null;
  result_status: "QUALIFIED" | "UNQUALIFIED" | "DEMOTION_CANDIDATE" | "NO_CHANGE";
  personal_active_stake_amount_base: string;
  personal_cumulative_stake_amount_base: string;
  direct_referral_count: number;
  direct_active_referral_count: number;
  left_leg_volume_base: string;
  right_leg_volume_base: string;
  weak_leg_volume_base: string;
  strong_leg_volume_base: string;
  downline_daily_reward_amount_base: string;
  qualification_snapshot?: Record<string, unknown>;
  created_at: string | null;
};

export type RankHistoryItem = {
  id: string;
  account_id: string;
  policy_version_id: string;
  calc_run_id: string;
  qualification_result_id: string | null;
  effective_date: string;
  previous_rank_level: number | null;
  calculated_rank_level: number | null;
  final_rank_level: number | null;
  change_type: "INITIAL" | "PROMOTED" | "MAINTAINED" | "DEMOTED";
  personal_active_stake_amount_base: string;
  personal_cumulative_stake_amount_base: string;
  direct_referral_count: number;
  direct_active_referral_count: number;
  left_leg_volume_base: string;
  right_leg_volume_base: string;
  weak_leg_volume_base: string;
  strong_leg_volume_base: string;
  downline_daily_reward_amount_base: string;
  qualification_snapshot?: Record<string, unknown>;
  created_at: string | null;
};

export type MyRankResponse = {
  account: {
    id: string;
    login_id: string | null;
    display_name: string | null;
    role: SessionRole;
    status: AccountStatus;
  };
  rank_status: RankStatusSummary | null;
  latest_qualification_result: RankQualificationResult | null;
  next_rank: { rank_level: number } | null;
  next_rank_progress: RankProgressItem[];
};

export type WithdrawalBalanceBucket = {
  confirmed_amount_base: string;
  reserved_amount_base: string;
  completed_amount_base: string;
  available_amount_base: string;
};

export type WithdrawalBalance = {
  daily_reward: WithdrawalBalanceBucket;
  bonus: WithdrawalBalanceBucket;
  total: {
    reserved_amount_base: string;
    completed_amount_base: string;
  };
};

export type WithdrawalPreviewAllocation = {
  reward_id: string;
  allocated_amount_base: string;
  holding_days: number;
  fee_schedule_days: number;
  fee_rate_bps: string;
  fee_amount_base: string;
  net_amount_base: string;
};

export type WithdrawalPreview = {
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  fee_amount_base: string;
  net_amount_base: string;
  available_amount_base: string;
  allocations: WithdrawalPreviewAllocation[];
  preview_only: true;
};

export type WithdrawalAccount = {
  id: string;
  login_id: string | null;
  display_name: string | null;
  status: AccountStatus;
};

export type WithdrawalReward = {
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

export type WithdrawalAllocation = {
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
  reward: WithdrawalReward;
};

export type WithdrawalAllocationSummary = {
  allocation_count: number;
  reserved_amount_base: string;
  consumed_amount_base: string;
  released_amount_base: string;
};

export type WithdrawalListItem = {
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
  account?: WithdrawalAccount;
};

export type WithdrawalDetail = WithdrawalListItem & {
  allocation_summary: WithdrawalAllocationSummary;
  allocations: WithdrawalAllocation[];
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

export type WithdrawalListResponse = {
  items: WithdrawalListItem[];
  page: number;
  limit: number;
  total: number;
};

export type StakingSummary = {
  pending_count: number;
  active_count: number;
  cancel_requested_count: number;
  cancelled_count: number;
  matured_count: number;
  closed_count: number;
  pending_principal_amount_base: string;
  active_principal_amount_base: string;
};

export type RewardListResponse = {
  items: AccountReward[];
  page: number;
  limit: number;
  total: number;
};

export type CreateWithdrawalRequest = {
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  idempotency_key: string;
  wallet_address: string;
  network: string;
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const AUTH_MESSAGE_STORAGE_KEY = "bjc-user-auth-message";
let redirectingForAuthFailure = false;

type RequestOptions = RequestInit & {
  accessToken?: string | null;
  skipAuthRedirect?: boolean;
};

function redirectToLogin(message: string) {
  if (typeof window === "undefined" || redirectingForAuthFailure) {
    return;
  }

  redirectingForAuthFailure = true;
  useSessionStore.getState().clearSession();
  window.sessionStorage.setItem(AUTH_MESSAGE_STORAGE_KEY, message);
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

export function persistAuthMessage(message: string) {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(AUTH_MESSAGE_STORAGE_KEY, message);
}

export function consumeAuthMessage() {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.sessionStorage.getItem(AUTH_MESSAGE_STORAGE_KEY);
  if (!value) {
    return null;
  }
  window.sessionStorage.removeItem(AUTH_MESSAGE_STORAGE_KEY);
  return value;
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

function toFriendlyMessage(status: number, message: string) {
  if (status === 401) {
    if (message.includes("Authorization")) return "로그인이 필요합니다.";
    if (message.includes("invalid login or password")) return "아이디 또는 비밀번호가 올바르지 않습니다.";
    return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (status === 403) {
    if (message.includes("account is not active")) return "사용할 수 없는 계정입니다.";
    return "이 요청을 수행할 권한이 없습니다.";
  }
  if (status === 404) {
    if (message.includes("referral code")) return "추천인 코드를 찾을 수 없습니다.";
    return "요청한 정보를 찾을 수 없습니다.";
  }
  if (status === 409) {
    if (message.includes("login_id")) return "이미 사용 중인 로그인 ID입니다.";
    if (message.includes("idempotency_key")) return "이미 처리된 요청이거나 현재 상태와 충돌합니다.";
    if (message.includes("reversed")) return "이미 역분개 처리된 보상입니다.";
    if (message.includes("withdrawal")) return "현재 출금 상태로는 이 요청을 처리할 수 없습니다.";
    return "현재 상태로는 요청을 처리할 수 없습니다.";
  }
  if (status === 422) {
    if (message.includes("referral sponsor is not active")) return "추천인 계정이 활성 상태가 아닙니다.";
    if (message.includes("principal_amount_base")) return "스테이킹 금액을 다시 확인해 주세요.";
    if (message.includes("staking_product")) return "현재 신청할 수 없는 스테이킹 상품입니다.";
    if (message.includes("reason")) return "필수 입력값을 다시 확인해 주세요.";
    if (message.includes("requested_amount_base")) return "출금 신청 금액을 다시 확인해 주세요.";
    if (message.includes("wallet_address")) return "지갑 주소를 다시 확인해 주세요.";
    if (message.includes("network")) return "네트워크 값을 다시 확인해 주세요.";
    if (message.includes("fee")) return "출금 수수료 계산 조건을 다시 확인해 주세요.";
    return "입력값을 다시 확인해 주세요.";
  }
  return message || "요청 처리 중 오류가 발생했습니다.";
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const currentAccessToken = init.accessToken ?? useSessionStore.getState().accessToken;
  if (currentAccessToken) {
    headers.set("Authorization", `Bearer ${currentAccessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload && "error" in payload ? (payload as { error?: { message?: string; details?: unknown } }).error : null;
    const backendMessage = errorPayload?.message ?? response.statusText;
    const friendlyMessage = toFriendlyMessage(response.status, backendMessage);
    if (response.status === 401 && currentAccessToken && !init.skipAuthRedirect) {
      redirectToLogin(friendlyMessage);
    }
    throw new ApiError(response.status, friendlyMessage, errorPayload?.details);
  }

  return payload as T;
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

export const api = {
  resolveReferral(referralCode: string) {
    return request<ReferralResolveResponse>(`/api/referrals/resolve${params({ referral_code: referralCode.trim() })}`, {
      method: "GET",
    });
  },
  register(body: {
    login_id: string;
    display_name: string;
    password: string;
    referral_code: string;
    preferred_binary_position?: BinaryPosition;
  }) {
    return request<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      skipAuthRedirect: true,
    });
  },
  login(body: { login_id: string; password: string }) {
    return request<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
      skipAuthRedirect: true,
    });
  },
  me(accessToken?: string | null) {
    return request<{ account: SessionAccount }>("/api/auth/me", {
      method: "GET",
      accessToken,
      skipAuthRedirect: true,
    });
  },
  logout(accessToken?: string | null) {
    return request<{ ok: true }>("/api/auth/logout", {
      method: "POST",
      accessToken,
      skipAuthRedirect: true,
      body: JSON.stringify({}),
    });
  },
  getMyReferralTree(query: { depth?: number }, accessToken?: string | null) {
    return request<ReferralTreeResponse>(`/api/me/referral-tree${params(query as Record<string, number | undefined>)}`, {
      method: "GET",
      accessToken,
    });
  },
  getMyBinaryTree(query: { depth?: number }, accessToken?: string | null) {
    return request<BinaryTreeResponse>(`/api/me/binary-tree${params(query as Record<string, number | undefined>)}`, {
      method: "GET",
      accessToken,
    });
  },
  getMyBinaryLegs(accessToken?: string | null) {
    return request<BinaryLegsResponse>("/api/me/binary-legs", {
      method: "GET",
      accessToken,
    });
  },
  getMyDownlines(
    query: { type: "referral" | "binary"; depth?: number; page?: number; limit?: number },
    accessToken?: string | null
  ) {
    return request<DownlineResponse>(`/api/me/downlines${params(query as Record<string, string | number | undefined>)}`, {
      method: "GET",
      accessToken,
    });
  },
  getStakingProducts(query: { symbol?: string; page?: number; limit?: number } = {}) {
    return request<StakingProductsResponse>(`/api/staking-products${params(query as Record<string, string | number | undefined>)}`, {
      method: "GET",
    });
  },
  createMyStaking(body: CreateStakingRequest, accessToken?: string | null) {
    return request<{ staking: AccountStaking }>("/api/me/stakings", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    });
  },
  getMyStakings(
    query: { status?: AccountStakingStatus; product_id?: string; page?: number; limit?: number; sort?: AccountStakingSort } = {},
    accessToken?: string | null
  ) {
    return request<AccountStakingListResponse>(`/api/me/stakings${params(query as Record<string, string | number | undefined>)}`, {
      method: "GET",
      accessToken,
    });
  },
  getMyStaking(stakingId: string, accessToken?: string | null) {
    return request<{ staking: AccountStaking }>(`/api/me/stakings/${stakingId}`, {
      method: "GET",
      accessToken,
    });
  },
  cancelMyStaking(stakingId: string, body: CancelStakingRequest, accessToken?: string | null) {
    return request<{ staking: AccountStaking }>(`/api/me/stakings/${stakingId}/cancel`, {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    });
  },
  getMyRewards(
    query: {
      reward_type?: RewardType;
      status?: RewardStatus;
      reward_date_from?: string;
      reward_date_to?: string;
      staking_id?: string;
      page?: number;
      limit?: number;
      sort?: RewardSort;
    } = {},
    accessToken?: string | null
  ) {
    return request<RewardListResponse>(`/api/me/rewards${params(query as Record<string, string | number | undefined>)}`, {
      method: "GET",
      accessToken,
    });
  },
  getMyRewardsSummary(accessToken?: string | null) {
    return request<RewardSummary>("/api/me/rewards/summary", {
      method: "GET",
      accessToken,
    });
  },
  getMyRank(accessToken?: string | null) {
    return request<MyRankResponse>("/api/me/rank", {
      method: "GET",
      accessToken,
    });
  },
  getMyRankHistory(query: { page?: number; limit?: number } = {}, accessToken?: string | null) {
    return request<{ items: RankHistoryItem[]; page: number; limit: number; total: number }>(
      `/api/me/rank-history${params(query as Record<string, string | number | undefined>)}`,
      {
        method: "GET",
        accessToken,
      }
    );
  },
  getMyRankBonusRewards(query: { page?: number; limit?: number; sort?: RewardSort } = {}, accessToken?: string | null) {
    return request<RewardListResponse>(
      `/api/me/rewards${params({
        reward_type: "RANK_BONUS",
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        sort: query.sort ?? "reward_date_desc",
      })}`,
      {
        method: "GET",
        accessToken,
      }
    );
  },
  getMyWithdrawalBalance(accessToken?: string | null) {
    return request<WithdrawalBalance>("/api/me/withdrawal-balance", {
      method: "GET",
      accessToken,
    });
  },
  previewMyWithdrawal(body: { withdrawal_type: WithdrawalType; requested_amount_base: string }, accessToken?: string | null) {
    return request<WithdrawalPreview>("/api/me/withdrawal-preview", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    });
  },
  createMyWithdrawal(body: CreateWithdrawalRequest, accessToken?: string | null) {
    return request<{ withdrawal: WithdrawalDetail }>("/api/me/withdrawals", {
      method: "POST",
      accessToken,
      body: JSON.stringify(body),
    });
  },
  listMyWithdrawals(
    query: {
      withdrawal_type?: WithdrawalType;
      status?: WithdrawalStatus;
      requested_from?: string;
      requested_to?: string;
      page?: number;
      limit?: number;
      sort?: WithdrawalSort;
    } = {},
    accessToken?: string | null
  ) {
    return request<WithdrawalListResponse>(`/api/me/withdrawals${params(query as Record<string, string | number | undefined>)}`, {
      method: "GET",
      accessToken,
    });
  },
  getMyWithdrawal(withdrawalId: string, accessToken?: string | null) {
    return request<{ withdrawal: WithdrawalDetail }>(`/api/me/withdrawals/${withdrawalId}`, {
      method: "GET",
      accessToken,
    });
  },
  cancelMyWithdrawal(withdrawalId: string, accessToken?: string | null) {
    return request<{ withdrawal: WithdrawalDetail }>(`/api/me/withdrawals/${withdrawalId}/cancel`, {
      method: "POST",
      accessToken,
      body: JSON.stringify({}),
    });
  },
  getMyReward(rewardId: string, accessToken?: string | null) {
    return request<{ reward: AccountRewardDetail }>(`/api/me/rewards/${rewardId}`, {
      method: "GET",
      accessToken,
    });
  },
  getMyStakingRewards(
    stakingId: string,
    query: {
      status?: RewardStatus;
      reward_date_from?: string;
      reward_date_to?: string;
      page?: number;
      limit?: number;
      sort?: RewardSort;
    } = {},
    accessToken?: string | null
  ) {
    return request<RewardListResponse>(
      `/api/me/stakings/${stakingId}/rewards${params(query as Record<string, string | number | undefined>)}`,
      {
        method: "GET",
        accessToken,
      }
    );
  },
  getMyStakingSummary(accessToken?: string | null) {
    return request<StakingSummary>("/api/me/stakings/summary", {
      method: "GET",
      accessToken,
    });
  },
};
