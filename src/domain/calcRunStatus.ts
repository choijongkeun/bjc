import { validationError } from "./errors.js";

export type CalcRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "FINALIZED";

export function assertCalcRunStatusTransitionAllowed(params: {
  from: CalcRunStatus;
  to: CalcRunStatus;
  allowFailedRetry: boolean;
}): void {
  const { from, to, allowFailedRetry } = params;

  if (from === to) {
    return;
  }

  if (from === "FINALIZED") {
    throw validationError("calc_runs is immutable after FINALIZED", { from, to });
  }

  const allowed: Array<[CalcRunStatus, CalcRunStatus]> = [
    ["PENDING", "RUNNING"],
    ["RUNNING", "SUCCEEDED"],
    ["RUNNING", "FAILED"],
    ["SUCCEEDED", "FINALIZED"]
  ];

  if (allowFailedRetry) {
    allowed.push(["FAILED", "RUNNING"]);
  }

  if (!allowed.some(([a, b]) => a === from && b === to)) {
    throw validationError(`invalid calc_runs status transition: ${from} -> ${to}`, { from, to });
  }
}

