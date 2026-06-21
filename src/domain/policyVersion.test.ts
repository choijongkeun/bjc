import { describe, expect, it } from "vitest";

import { AppError } from "./errors.js";
import { normalizePolicyVersionCreateInput, policyVersionCreateRequestSchema } from "./policyVersion.js";
import { toCreatePolicyVersionError } from "../services/policyEngine.js";

describe("policyVersion create payload", () => {
  it("trims and normalizes request fields", () => {
    const parsed = policyVersionCreateRequestSchema.parse({
      name: "  BJC 기본 스테이킹 정책  ",
      version: "  V1  ",
      note: "  BJC DeFi Staking 기본 플랜  ",
      effective_from: "2026-06-21",
      effective_to: "2026-06-30"
    });

    expect(parsed).toEqual({
      name: "BJC 기본 스테이킹 정책",
      version: "V1",
      note: "BJC DeFi Staking 기본 플랜",
      effective_from: "2026-06-21",
      effective_to: "2026-06-30"
    });
  });

  it("rejects missing required name and version", () => {
    expect(() =>
      normalizePolicyVersionCreateInput({
        name: "   ",
        version: " ",
        note: null,
        effective_from: null,
        effective_to: null
      })
    ).toThrow(AppError);
  });

  it("rejects reversed effective date ranges", () => {
    expect(() =>
      normalizePolicyVersionCreateInput({
        name: "BJC 기본 스테이킹 정책",
        version: "V1",
        note: null,
        effective_from: "2026-07-01",
        effective_to: "2026-06-30"
      })
    ).toThrow("effective_to must be greater than or equal to effective_from");
  });

  it("maps duplicate name and version inserts to a conflict error", () => {
    const err = toCreatePolicyVersionError(
      { code: "ER_DUP_ENTRY" },
      { name: "BJC 기본 스테이킹 정책", version: "V1" }
    );

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(409);
    expect(err.message).toBe("policy_version name and version already exist");
  });
});
