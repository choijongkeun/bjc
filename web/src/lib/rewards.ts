import type { AdminRewardDetail, AdminRewardListItem, DailyRewardRunResponse, RewardMetadata, RewardSort, RewardStatus, RewardType } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";

export type AdminRewardFilters = {
  q?: string;
  account_id?: string;
  staking_id?: string;
  reward_type?: RewardType | "";
  status?: RewardStatus | "";
  calc_run_id?: string;
  reward_date_from?: string;
  reward_date_to?: string;
  page?: number;
  limit?: number;
  sort?: RewardSort;
};

export const REWARD_TYPE_OPTIONS: Array<{ value: RewardType; label: string }> = [
  { value: "DAILY_REWARD", label: "일일 보상" },
  { value: "DIRECT_REFERRAL", label: "직추천 보상" },
  { value: "RANK_BONUS", label: "직급 보상" },
  { value: "CONTRIBUTION", label: "기여 보상" },
  { value: "WITHDRAWAL_FEE", label: "출금 수수료" },
  { value: "SIDECAR", label: "사이드카" },
  { value: "ADJUSTMENT", label: "조정" },
  { value: "REVERSAL", label: "역분개" },
];

export const REWARD_STATUS_OPTIONS: Array<{ value: RewardStatus; label: string }> = [
  { value: "PENDING", label: "대기" },
  { value: "CONFIRMED", label: "확정" },
  { value: "REVERSED", label: "역분개 완료" },
];

export const REWARD_SORT_OPTIONS: Array<{ value: RewardSort; label: string }> = [
  { value: "reward_date_desc", label: "보상일 최신순" },
  { value: "reward_date_asc", label: "보상일 오래된순" },
  { value: "created_at_desc", label: "생성일 최신순" },
  { value: "created_at_asc", label: "생성일 오래된순" },
  { value: "available_at_desc", label: "출금 가능일 최신순" },
  { value: "available_at_asc", label: "출금 가능일 오래된순" },
];

const rewardTypeLabelMap: Record<RewardType, string> = {
  DAILY_REWARD: "일일 보상",
  DIRECT_REFERRAL: "직추천 보상",
  RANK_BONUS: "직급 보상",
  CONTRIBUTION: "기여 보상",
  WITHDRAWAL_FEE: "출금 수수료",
  SIDECAR: "사이드카",
  ADJUSTMENT: "조정",
  REVERSAL: "역분개",
};

const rewardStatusLabelMap: Record<RewardStatus, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  REVERSED: "역분개 완료",
};

export function getRewardTypeLabel(type: RewardType): string {
  return rewardTypeLabelMap[type];
}

export function getRewardStatusLabel(status: RewardStatus): string {
  return rewardStatusLabelMap[status];
}

export function getRewardTypeTone(type: RewardType): "blue" | "emerald" | "rose" | "slate" {
  switch (type) {
    case "DAILY_REWARD":
    case "DIRECT_REFERRAL":
    case "RANK_BONUS":
    case "CONTRIBUTION":
      return "blue";
    case "REVERSAL":
    case "WITHDRAWAL_FEE":
      return "rose";
    case "ADJUSTMENT":
      return "slate";
    case "SIDECAR":
    default:
      return "emerald";
  }
}

export function getRewardStatusTone(status: RewardStatus): "blue" | "emerald" | "rose" | "slate" {
  switch (status) {
    case "PENDING":
      return "blue";
    case "CONFIRMED":
      return "emerald";
    case "REVERSED":
      return "rose";
    default:
      return "slate";
  }
}

export function buildAdminRewardListQuery(filters: AdminRewardFilters) {
  return {
    q: filters.q || undefined,
    account_id: filters.account_id || undefined,
    staking_id: filters.staking_id || undefined,
    reward_type: filters.reward_type || undefined,
    status: filters.status || undefined,
    calc_run_id: filters.calc_run_id || undefined,
    reward_date_from: filters.reward_date_from || undefined,
    reward_date_to: filters.reward_date_to || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    sort: filters.sort ?? "reward_date_desc",
  };
}

export function formatRewardAmountBase(amountBase: string): string {
  return formatBaseAmount(amountBase, 0);
}

export function isNegativeRewardAmount(amountBase: string): boolean {
  return /^-/.test(amountBase);
}

export function formatRewardDate(value: string | null): string {
  return value || "-";
}

export function formatRewardDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export function getVisibleRewardMetadataEntries(metadata?: RewardMetadata | null): Array<{ label: string; value: string }> {
  if (!metadata) return [];

  const items: Array<{ label: string; value: string | number | undefined }> = [
    { label: "원금 snapshot", value: metadata.principal_amount_base },
    { label: "bps snapshot", value: metadata.daily_interest_bps_snapshot },
    { label: "기간 snapshot", value: metadata.duration_days_snapshot === undefined ? undefined : `${metadata.duration_days_snapshot}일` },
    { label: "denominator", value: metadata.denominator },
    { label: "원본 보상 ID", value: metadata.original_reward_id },
    { label: "원본 source", value: metadata.original_source_reference },
    { label: "사유", value: metadata.reason },
    { label: "metadata reward_type", value: metadata.reward_type },
  ];

  return items
    .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
    .map((item) => ({ label: item.label, value: String(item.value) }));
}

export function canReverseReward(reward: Pick<AdminRewardDetail | AdminRewardListItem, "status" | "reward_type" | "reversal_reward_id"> & { reversal?: { id: string } | null }) {
  return reward.status === "CONFIRMED" && reward.reward_type !== "REVERSAL" && !reward.reversal_reward_id && !reward.reversal;
}

export function shouldUseCalcRunRewardsApi(filters: AdminRewardFilters): boolean {
  return Boolean(
    filters.calc_run_id &&
      !filters.q &&
      !filters.account_id &&
      !filters.staking_id &&
      !filters.reward_date_from &&
      !filters.reward_date_to
  );
}

export function getDefaultKstRewardDate(baseDate = new Date()): string {
  const seoul = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);
  const year = Number(seoul.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(seoul.find((part) => part.type === "month")?.value ?? "01");
  const day = Number(seoul.find((part) => part.type === "day")?.value ?? "01");
  const previousUtc = new Date(Date.UTC(year, month - 1, day - 1));
  return previousUtc.toISOString().slice(0, 10);
}

export function getDailyRewardRunResultItems(result: DailyRewardRunResponse): Array<{ label: string; value: string }> {
  return [
    { label: "calc_run_id", value: result.calc_run.id },
    { label: "target_count", value: String(result.target_count) },
    { label: "created_count", value: String(result.created_count) },
    { label: "zero_reward_skip_count", value: String(result.zero_reward_skip_count) },
    { label: "duplicate_skip_count", value: String(result.duplicate_skip_count) },
    { label: "failed_count", value: String(result.failed_count) },
    { label: "total_reward_amount_base", value: formatRewardAmountBase(result.total_reward_amount_base) },
    { label: "status", value: result.calc_run.status },
  ];
}
