import type { RewardMetadata, RewardSort, RewardStatus, RewardType } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";

export type RewardFilters = {
  reward_type?: RewardType | "";
  status?: RewardStatus | "";
  reward_date_from?: string;
  reward_date_to?: string;
  staking_id?: string;
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
  { value: "SIDECAR", label: "사이드카 정산" },
  { value: "ADJUSTMENT", label: "조정" },
  { value: "REVERSAL", label: "보상 취소" },
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
  SIDECAR: "사이드카 정산",
  ADJUSTMENT: "조정",
  REVERSAL: "보상 취소",
};

const rewardStatusLabelMap: Record<RewardStatus, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  REVERSED: "취소 반영",
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

export function buildRewardListQuery(filters: RewardFilters) {
  return {
    reward_type: filters.reward_type || undefined,
    status: filters.status || undefined,
    reward_date_from: filters.reward_date_from || undefined,
    reward_date_to: filters.reward_date_to || undefined,
    staking_id: filters.staking_id || undefined,
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

export function getVisibleRewardMetadataEntries(metadata?: RewardMetadata | null): Array<{ label: string; value: string }> {
  if (!metadata) {
    return [];
  }

  const items: Array<{ label: string; value: string | number | undefined }> = [
    { label: "스테이킹 원금", value: metadata.principal_amount_base },
    { label: "일일 적용 비율", value: metadata.daily_interest_bps_snapshot ? `${metadata.daily_interest_bps_snapshot} bps` : undefined },
    { label: "적용 기간", value: metadata.duration_days_snapshot === undefined ? undefined : `${metadata.duration_days_snapshot}일` },
    { label: "직급 단계", value: metadata.rank_level },
    { label: "추가 비율", value: metadata.effective_bonus_bps ? `${metadata.effective_bonus_bps} bps` : undefined },
    { label: "기준 일일 보상", value: metadata.base_daily_reward_amount_base },
    { label: "보상 적용 비율", value: metadata.rate_bps ? `${metadata.rate_bps} bps` : undefined },
    { label: "가중치 비율", value: metadata.weight_bps ? `${metadata.weight_bps} bps` : undefined },
    { label: "기준 금액", value: metadata.base_amount_base },
    { label: "풀 금액", value: metadata.pool_amount_base },
    { label: "총 점수", value: metadata.total_score },
    { label: "점수 반영 금액", value: metadata.score_amount_base },
    { label: "점수 비율", value: metadata.score_ratio_bps ? `${metadata.score_ratio_bps} bps` : undefined },
    { label: "신청 금액", value: metadata.requested_amount_base },
    { label: "지급 금액", value: metadata.release_amount_base },
    { label: "동결 금액", value: metadata.freeze_amount_base },
    { label: "지급 비율", value: metadata.release_bps ? `${metadata.release_bps} bps` : undefined },
    { label: "동결 비율", value: metadata.freeze_bps ? `${metadata.freeze_bps} bps` : undefined },
  ];

  return items
    .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
    .map((item) => ({ label: item.label, value: String(item.value) }));
}

export function formatRewardDate(value: string | null): string {
  return value || "-";
}

export function formatRewardDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}
