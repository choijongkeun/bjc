import type { WithdrawalStatus, SessionAccount } from "@/lib/api";
import type { AccountStakingStatus } from "@/lib/staking";

type RewardLikeStatus = "PENDING" | "CONFIRMED" | "REVERSED";
type BinaryPosition = SessionAccount["binary_position"];
type AllocationStatus = "RESERVED" | "RELEASED" | "CONSUMED";

const accountStatusLabelMap: Record<NonNullable<SessionAccount["status"]>, string> = {
  ACTIVE: "활성",
  BLOCKED: "차단",
  WITHDRAWN: "탈퇴",
};

const binaryPositionLabelMap: Record<NonNullable<BinaryPosition>, string> = {
  LEFT: "좌측",
  RIGHT: "우측",
};

const stakingStatusLabelMap: Record<AccountStakingStatus, string> = {
  PENDING: "대기",
  ACTIVE: "활성",
  CANCEL_REQUESTED: "취소 요청",
  CANCELLED: "취소",
  MATURED: "만기",
  CLOSED: "종료",
};

const rewardStatusLabelMap: Record<RewardLikeStatus, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  REVERSED: "취소 반영",
};

const withdrawalStatusLabelMap: Record<WithdrawalStatus, string> = {
  REQUESTED: "신청",
  APPROVED: "승인",
  PROCESSING: "처리 중",
  COMPLETED: "완료",
  FAILED: "실패",
  REJECTED: "거절",
  CANCELLED: "취소",
};

const allocationStatusLabelMap: Record<AllocationStatus, string> = {
  RESERVED: "출금 예약",
  RELEASED: "예약 해제",
  CONSUMED: "출금 완료",
};

const rankChangeTypeLabelMap: Record<string, string> = {
  INITIAL: "최초 산정",
  PROMOTED: "승급",
  MAINTAINED: "유지",
  DEMOTION_CANDIDATE: "하락 검토",
};

export function getAccountStatusLabel(status: SessionAccount["status"] | null | undefined): string {
  if (!status) {
    return "-";
  }
  return accountStatusLabelMap[status] ?? status;
}

export function getBinaryPositionLabel(position: BinaryPosition | null | undefined): string {
  if (!position) {
    return "-";
  }
  return binaryPositionLabelMap[position] ?? position;
}

export function getStakingStatusLabel(status: AccountStakingStatus): string {
  return stakingStatusLabelMap[status] ?? status;
}

export function getRewardStatusDisplayLabel(status: RewardLikeStatus): string {
  return rewardStatusLabelMap[status] ?? status;
}

export function getWithdrawalStatusDisplayLabel(status: WithdrawalStatus): string {
  return withdrawalStatusLabelMap[status] ?? status;
}

export function getAllocationStatusLabel(status: AllocationStatus): string {
  return allocationStatusLabelMap[status] ?? status;
}

export function getRankChangeTypeLabel(value: string): string {
  return rankChangeTypeLabelMap[value] ?? value;
}
