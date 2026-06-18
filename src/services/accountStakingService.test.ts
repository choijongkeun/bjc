import { describe, expect, it } from "vitest";

import {
  assertAmountWithinRange,
  assertCanReadAdminStakings,
  assertCanWriteAdminStakings,
  calculateMaturesAt,
  evaluateCreateIdempotency,
  isOwnedByAccount,
  isPositiveIntegerString,
  resolveAdminActivateTransition,
  resolveAdminCancelTransition,
  resolveAdminRejectTransition,
  resolveUserCancelTransition,
} from "./accountStakingService.js";

describe("accountStakingService helpers", () => {
  it("validates positive integer amount strings", () => {
    expect(isPositiveIntegerString("1")).toBe(true);
    expect(isPositiveIntegerString("1000000")).toBe(true);
    expect(isPositiveIntegerString("0")).toBe(false);
    expect(isPositiveIntegerString("-1")).toBe(false);
    expect(isPositiveIntegerString("1.5")).toBe(false);
    expect(isPositiveIntegerString("abc")).toBe(false);
  });

  it("checks min and max range with bigint-safe comparison", () => {
    expect(() => assertAmountWithinRange("1000", "100", "10000")).not.toThrow();
    expect(() => assertAmountWithinRange("99", "100", "10000")).toThrow();
    expect(() => assertAmountWithinRange("10001", "100", "10000")).toThrow();
  });

  it("detects idempotency match and conflict", () => {
    const existing = {
      account_id: "account-1",
      staking_product_id: "product-1",
      principal_amount_base: "1000",
    };

    expect(
      evaluateCreateIdempotency(existing, {
        account_id: "account-1",
        staking_product_id: "product-1",
        principal_amount_base: "1000",
        idempotency_key: "same-key",
      })
    ).toBe("match");

    expect(
      evaluateCreateIdempotency(existing, {
        account_id: "account-1",
        staking_product_id: "product-1",
        principal_amount_base: "2000",
        idempotency_key: "same-key",
      })
    ).toBe("conflict");
  });

  it("calculates maturity date by duration days", () => {
    const startedAt = new Date("2026-06-18T00:00:00.000Z");
    expect(calculateMaturesAt(startedAt, 30).toISOString()).toBe("2026-07-18T00:00:00.000Z");
  });

  it("checks user ownership", () => {
    expect(isOwnedByAccount("account-1", "account-1")).toBe(true);
    expect(isOwnedByAccount("account-1", "account-2")).toBe(false);
  });

  it("allows and rejects user cancel transitions correctly", () => {
    expect(resolveUserCancelTransition("PENDING")).toBe("CANCELLED");
    expect(resolveUserCancelTransition("ACTIVE")).toBe("CANCEL_REQUESTED");
    expect(resolveUserCancelTransition("CANCEL_REQUESTED")).toBe("ALREADY_REQUESTED");
    expect(() => resolveUserCancelTransition("CANCELLED")).toThrow();
  });

  it("allows and rejects admin transitions correctly", () => {
    expect(resolveAdminActivateTransition("PENDING")).toBe("ACTIVE");
    expect(resolveAdminRejectTransition("PENDING")).toBe("CANCELLED");
    expect(resolveAdminCancelTransition("ACTIVE")).toBe("CANCELLED");
    expect(resolveAdminCancelTransition("CANCEL_REQUESTED")).toBe("CANCELLED");
    expect(() => resolveAdminActivateTransition("ACTIVE")).toThrow();
    expect(() => resolveAdminRejectTransition("ACTIVE")).toThrow();
    expect(() => resolveAdminCancelTransition("PENDING")).toThrow();
  });

  it("enforces ADMIN and READER authorization helpers", () => {
    expect(() => assertCanReadAdminStakings("READER")).not.toThrow();
    expect(() => assertCanReadAdminStakings("ADMIN")).not.toThrow();
    expect(() => assertCanReadAdminStakings("USER")).toThrow();

    expect(() => assertCanWriteAdminStakings("ADMIN")).not.toThrow();
    expect(() => assertCanWriteAdminStakings("READER")).toThrow();
    expect(() => assertCanWriteAdminStakings("USER")).toThrow();
  });
});
