import { describe, expect, it } from "vitest";

import { assertCalcRunStatusTransitionAllowed } from "./calcRunStatus.js";

describe("calc_runs status transitions", () => {
  it("allows PENDING -> RUNNING", () => {
    expect(() =>
      assertCalcRunStatusTransitionAllowed({ from: "PENDING", to: "RUNNING", allowFailedRetry: false })
    ).not.toThrow();
  });

  it("rejects PENDING -> SUCCEEDED", () => {
    expect(() =>
      assertCalcRunStatusTransitionAllowed({ from: "PENDING", to: "SUCCEEDED", allowFailedRetry: false })
    ).toThrow();
  });

  it("allows FAILED -> RUNNING only when retry enabled", () => {
    expect(() =>
      assertCalcRunStatusTransitionAllowed({ from: "FAILED", to: "RUNNING", allowFailedRetry: false })
    ).toThrow();

    expect(() =>
      assertCalcRunStatusTransitionAllowed({ from: "FAILED", to: "RUNNING", allowFailedRetry: true })
    ).not.toThrow();
  });

  it("rejects any transition from FINALIZED", () => {
    expect(() =>
      assertCalcRunStatusTransitionAllowed({ from: "FINALIZED", to: "RUNNING", allowFailedRetry: true })
    ).toThrow();
  });
});

