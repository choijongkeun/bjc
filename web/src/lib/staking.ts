export type AccountStakingStatus =
  | "PENDING"
  | "ACTIVE"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "MATURED"
  | "CLOSED";

export function formatDailyInterestBps(value: string): string {
  if (!/^\d+$/.test(value)) {
    return value;
  }

  const padded = value.padStart(5, "0");
  const integerPart = padded.slice(0, -4) || "0";
  const fractionPart = padded.slice(-4).replace(/0+$/, "");

  return `${BigInt(integerPart).toLocaleString("ko-KR")}${fractionPart ? `.${fractionPart}` : ""}%`;
}

export function getAdminStakingActionState(status: AccountStakingStatus): {
  canActivate: boolean;
  canReject: boolean;
  canCancel: boolean;
} {
  return {
    canActivate: status === "PENDING",
    canReject: status === "PENDING",
    canCancel: status === "ACTIVE" || status === "CANCEL_REQUESTED",
  };
}
