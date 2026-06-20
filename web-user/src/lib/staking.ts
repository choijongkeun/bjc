export type AccountStakingStatus =
  | "PENDING"
  | "ACTIVE"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "MATURED"
  | "CLOSED";

export type UserStakingFilter = "ALL" | AccountStakingStatus;

export function formatDailyInterestBps(value: string): string {
  if (!/^\d+$/.test(value)) {
    return value;
  }

  const padded = value.padStart(5, "0");
  const integerPart = padded.slice(0, -4) || "0";
  const fractionPart = padded.slice(-4).replace(/0+$/, "");
  const integerText = BigInt(integerPart).toLocaleString("ko-KR");

  return `${integerText}${fractionPart ? `.${fractionPart}` : ""}%`;
}

export function getStakingStatusTone(status: AccountStakingStatus): "blue" | "emerald" | "rose" | "slate" {
  switch (status) {
    case "ACTIVE":
      return "emerald";
    case "PENDING":
    case "CANCEL_REQUESTED":
      return "blue";
    case "CANCELLED":
    case "CLOSED":
      return "rose";
    case "MATURED":
    default:
      return "slate";
  }
}

export function getStakingStatusLabel(status: AccountStakingStatus): string {
  switch (status) {
    case "PENDING":
      return "대기";
    case "ACTIVE":
      return "활성";
    case "CANCEL_REQUESTED":
      return "취소 요청";
    case "CANCELLED":
      return "취소";
    case "MATURED":
      return "만기";
    case "CLOSED":
      return "종료";
    default:
      return status;
  }
}

export function getAvailableUserStakingAction(status: AccountStakingStatus): "cancel" | "cancel_request" | "none" {
  if (status === "PENDING") {
    return "cancel";
  }
  if (status === "ACTIVE") {
    return "cancel_request";
  }
  return "none";
}

export function createClientIdempotencyKey(prefix: string): string {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return `${prefix}-${suffix}`;
}

export function sumBaseAmounts(values: string[]): string {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString();
}
