import type { WithdrawalBalance, WithdrawalListItem, WithdrawalSort, WithdrawalStatus, WithdrawalType } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";

export type WithdrawalFilters = {
  withdrawal_type?: WithdrawalType | "";
  status?: WithdrawalStatus | "";
  requested_from?: string;
  requested_to?: string;
  page?: number;
  limit?: number;
  sort?: WithdrawalSort;
};

export const WITHDRAWAL_TYPE_OPTIONS: Array<{ value: WithdrawalType; label: string }> = [
  { value: "DAILY_REWARD", label: "일일 보상" },
  { value: "BONUS", label: "보너스" },
];

export const WITHDRAWAL_STATUS_OPTIONS: Array<{ value: WithdrawalStatus; label: string }> = [
  { value: "REQUESTED", label: "신청" },
  { value: "APPROVED", label: "승인" },
  { value: "PROCESSING", label: "처리중" },
  { value: "COMPLETED", label: "완료" },
  { value: "REJECTED", label: "거절" },
  { value: "FAILED", label: "실패" },
  { value: "CANCELLED", label: "취소" },
];

export const WITHDRAWAL_SORT_OPTIONS: Array<{ value: WithdrawalSort; label: string }> = [
  { value: "requested_at_desc", label: "신청일 최신순" },
  { value: "requested_at_asc", label: "신청일 오래된순" },
  { value: "created_at_desc", label: "생성일 최신순" },
  { value: "created_at_asc", label: "생성일 오래된순" },
  { value: "completed_at_desc", label: "완료일 최신순" },
  { value: "completed_at_asc", label: "완료일 오래된순" },
];

const withdrawalTypeLabelMap: Record<WithdrawalType, string> = {
  DAILY_REWARD: "일일 보상",
  BONUS: "보너스",
};

const withdrawalStatusLabelMap: Record<WithdrawalStatus, string> = {
  REQUESTED: "신청",
  APPROVED: "승인",
  PROCESSING: "처리중",
  COMPLETED: "완료",
  REJECTED: "거절",
  FAILED: "실패",
  CANCELLED: "취소",
};

export function getWithdrawalTypeLabel(type: WithdrawalType): string {
  return withdrawalTypeLabelMap[type];
}

export function getWithdrawalStatusLabel(status: WithdrawalStatus): string {
  return withdrawalStatusLabelMap[status];
}

export function getWithdrawalTypeTone(type: WithdrawalType): "blue" | "emerald" {
  return type === "DAILY_REWARD" ? "blue" : "emerald";
}

export function getWithdrawalStatusTone(status: WithdrawalStatus): "blue" | "emerald" | "rose" | "slate" {
  switch (status) {
    case "COMPLETED":
      return "emerald";
    case "REJECTED":
    case "FAILED":
    case "CANCELLED":
      return "rose";
    case "PROCESSING":
      return "slate";
    case "REQUESTED":
    case "APPROVED":
    default:
      return "blue";
  }
}

export function buildWithdrawalListQuery(filters: WithdrawalFilters) {
  return {
    withdrawal_type: filters.withdrawal_type || undefined,
    status: filters.status || undefined,
    requested_from: filters.requested_from || undefined,
    requested_to: filters.requested_to || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    sort: filters.sort ?? "requested_at_desc",
  };
}

export function formatWithdrawalAmountBase(amountBase: string): string {
  return formatBaseAmount(amountBase, 0);
}

export function formatWithdrawalDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export function isPositiveIntegerString(value: string): boolean {
  return /^\d+$/.test(value) && BigInt(value) > 0n;
}

export function canCancelMyWithdrawal(status: WithdrawalStatus): boolean {
  return status === "REQUESTED";
}

export function getAvailableAmountForType(balance: WithdrawalBalance | null, type: WithdrawalType): string {
  if (!balance) return "0";
  return type === "DAILY_REWARD" ? balance.daily_reward.available_amount_base : balance.bonus.available_amount_base;
}

export function exceedsAvailableAmount(value: string, availableAmountBase: string): boolean {
  if (!/^\d+$/.test(value) || !/^-?\d+$/.test(availableAmountBase)) {
    return false;
  }
  return BigInt(value) > BigInt(availableAmountBase);
}

export function maskWalletAddress(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function shortenTxHash(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function buildWithdrawalIdempotencyKey(): string {
  const uuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "withdrawal-key";
  return `withdrawal-${uuid}`;
}

export function sumWithdrawalAvailableBalance(balance: WithdrawalBalance | null): string {
  if (!balance) return "0";
  return (BigInt(balance.daily_reward.available_amount_base) + BigInt(balance.bonus.available_amount_base)).toString();
}

export function getWithdrawalPreviewCount(items: Array<unknown> | undefined): number {
  return items?.length ?? 0;
}

export function isRequestedWithdrawal(item: Pick<WithdrawalListItem, "status">): boolean {
  return item.status === "REQUESTED";
}
