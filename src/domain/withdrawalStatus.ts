import { conflictError } from "./errors.js";

export type RewardWithdrawalStatus =
  | "REQUESTED"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export type RewardWithdrawalAllocationStatus = "RESERVED" | "CONSUMED" | "RELEASED";

export function assertCanUserCancelWithdrawal(status: RewardWithdrawalStatus): void {
  if (status !== "REQUESTED") {
    throw conflictError("only REQUESTED withdrawal can be cancelled by user", { status });
  }
}

export function assertCanApproveWithdrawal(status: RewardWithdrawalStatus): void {
  if (status !== "REQUESTED") {
    throw conflictError("only REQUESTED withdrawal can be approved", { status });
  }
}

export function assertCanRejectWithdrawal(status: RewardWithdrawalStatus): void {
  if (status !== "REQUESTED") {
    throw conflictError("only REQUESTED withdrawal can be rejected", { status });
  }
}

export function assertCanMarkProcessingWithdrawal(status: RewardWithdrawalStatus): void {
  if (status !== "APPROVED") {
    throw conflictError("only APPROVED withdrawal can move to PROCESSING", { status });
  }
}

export function assertCanCompleteWithdrawal(status: RewardWithdrawalStatus): void {
  if (status !== "PROCESSING") {
    throw conflictError("only PROCESSING withdrawal can be completed", { status });
  }
}

export function assertCanFailWithdrawal(status: RewardWithdrawalStatus): void {
  if (status !== "PROCESSING") {
    throw conflictError("only PROCESSING withdrawal can fail", { status });
  }
}
