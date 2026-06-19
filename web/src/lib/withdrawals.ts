import type {
  AdminWithdrawalDetail,
  AdminWithdrawalListItem,
  AdminWithdrawalSummary,
  SessionRole,
  WithdrawalSort,
  WithdrawalStatus,
  WithdrawalType,
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";

export type AdminWithdrawalFilters = {
  q?: string;
  account_id?: string;
  withdrawal_type?: WithdrawalType | "";
  status?: WithdrawalStatus | "";
  network?: string;
  requested_from?: string;
  requested_to?: string;
  completed_from?: string;
  completed_to?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
  sort?: WithdrawalSort;
};

export type WithdrawalActionMode = "approve" | "reject" | "processing" | "complete" | "fail";

export const WITHDRAWAL_TYPE_OPTIONS: Array<{ value: WithdrawalType; label: string }> = [
  { value: "DAILY_REWARD", label: "일일 보상" },
  { value: "BONUS", label: "보너스" },
];

export const WITHDRAWAL_STATUS_OPTIONS: Array<{ value: WithdrawalStatus; label: string }> = [
  { value: "REQUESTED", label: "요청됨" },
  { value: "APPROVED", label: "승인됨" },
  { value: "PROCESSING", label: "처리 중" },
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
  REQUESTED: "요청됨",
  APPROVED: "승인됨",
  PROCESSING: "처리 중",
  COMPLETED: "완료",
  REJECTED: "거절",
  FAILED: "실패",
  CANCELLED: "취소",
};

const summaryCardDefinitions: Array<{ key: keyof AdminWithdrawalSummary; label: string }> = [
  { key: "requested_amount_base", label: "신청 금액" },
  { key: "approved_amount_base", label: "승인 금액" },
  { key: "processing_amount_base", label: "처리중 금액" },
  { key: "completed_amount_base", label: "완료 금액" },
  { key: "rejected_amount_base", label: "거절 금액" },
  { key: "failed_amount_base", label: "실패 금액" },
  { key: "cancelled_amount_base", label: "취소 금액" },
  { key: "fee_amount_base", label: "수수료" },
  { key: "net_completed_amount_base", label: "완료 실수령액" },
  { key: "requested_count", label: "신청 건수" },
  { key: "completed_count", label: "완료 건수" },
];

export function getWithdrawalTypeLabel(type: WithdrawalType): string {
  return withdrawalTypeLabelMap[type];
}

export function getWithdrawalStatusLabel(status: WithdrawalStatus): string {
  return withdrawalStatusLabelMap[status];
}

export function getWithdrawalTypeTone(type: WithdrawalType): "blue" | "emerald" | "slate" {
  return type === "DAILY_REWARD" ? "blue" : "emerald";
}

export function getWithdrawalStatusTone(status: WithdrawalStatus): "blue" | "emerald" | "rose" | "slate" {
  switch (status) {
    case "REQUESTED":
    case "APPROVED":
      return "blue";
    case "PROCESSING":
      return "slate";
    case "COMPLETED":
      return "emerald";
    case "REJECTED":
    case "FAILED":
    case "CANCELLED":
    default:
      return "rose";
  }
}

export function buildAdminWithdrawalListQuery(filters: AdminWithdrawalFilters) {
  return {
    q: filters.q || undefined,
    account_id: filters.account_id || undefined,
    withdrawal_type: filters.withdrawal_type || undefined,
    status: filters.status || undefined,
    network: filters.network || undefined,
    requested_from: filters.requested_from || undefined,
    requested_to: filters.requested_to || undefined,
    completed_from: filters.completed_from || undefined,
    completed_to: filters.completed_to || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    sort: filters.sort ?? "requested_at_desc",
  };
}

export function buildAdminWithdrawalSummaryQuery(filters: AdminWithdrawalFilters) {
  return {
    date_from: filters.date_from || undefined,
    date_to: filters.date_to || undefined,
    withdrawal_type: filters.withdrawal_type || undefined,
    network: filters.network || undefined,
  };
}

export function formatWithdrawalAmountBase(amountBase: string): string {
  return formatBaseAmount(amountBase, 0);
}

export function formatWithdrawalDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export function maskWalletAddress(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

export function shortenTxHash(value: string | null | undefined): string {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function getAdminWithdrawalActionState(
  status: WithdrawalStatus
): {
  canApprove: boolean;
  canReject: boolean;
  canProcessing: boolean;
  canComplete: boolean;
  canFail: boolean;
} {
  return {
    canApprove: status === "REQUESTED",
    canReject: status === "REQUESTED",
    canProcessing: status === "APPROVED",
    canComplete: status === "PROCESSING",
    canFail: status === "PROCESSING",
  };
}

export function getAvailableWithdrawalActions(
  withdrawal: Pick<AdminWithdrawalListItem | AdminWithdrawalDetail, "status">
): WithdrawalActionMode[] {
  const state = getAdminWithdrawalActionState(withdrawal.status);
  return [
    state.canApprove ? "approve" : null,
    state.canReject ? "reject" : null,
    state.canProcessing ? "processing" : null,
    state.canComplete ? "complete" : null,
    state.canFail ? "fail" : null,
  ].filter((value): value is WithdrawalActionMode => value !== null);
}

export function canManageWithdrawal(role: SessionRole): boolean {
  return role === "ADMIN";
}

export function validateWithdrawalActionInput(
  mode: WithdrawalActionMode,
  payload: { reason?: string; network?: string; tx_hash?: string }
): string | null {
  if ((mode === "reject" || mode === "fail") && !payload.reason?.trim()) {
    return mode === "reject" ? "거절 사유를 입력해 주세요." : "실패 사유를 입력해 주세요.";
  }
  if ((mode === "processing" || mode === "complete") && !payload.network?.trim()) {
    return "네트워크를 입력해 주세요.";
  }
  if (mode === "complete" && !payload.tx_hash?.trim()) {
    return "tx_hash를 입력해 주세요.";
  }
  return null;
}

export function getWithdrawalSummaryCardItems(summary: AdminWithdrawalSummary): Array<{ label: string; value: string }> {
  return summaryCardDefinitions.map((item) => ({
    label: item.label,
    value:
      item.key === "requested_count" || item.key === "completed_count"
        ? `${summary[item.key].toLocaleString("ko-KR")}건`
        : formatWithdrawalAmountBase(summary[item.key] as string),
  }));
}
