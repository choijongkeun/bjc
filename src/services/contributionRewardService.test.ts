import { describe, expect, it } from "vitest";

import {
  buildContributionSourceReference,
  calculateContributionPoolAmountBase,
  classifyExistingContributionReward,
  computeContributionReward
} from "../domain/contributionReward.js";
import { AppError } from "../domain/errors.js";
import { type AdminAuditLogRow } from "../repos/auditLogRepo.js";
import { assertCanRunContribution, extractContributionSummaryFromAuditLogs } from "./contributionRewardService.js";

describe("contributionRewardService helpers", () => {
  it("calculates contribution pool with bigint-safe floor division", () => {
    expect(calculateContributionPoolAmountBase("1000")).toBe("200");
    expect(calculateContributionPoolAmountBase("999")).toBe("199");
  });

  it("computes weighted contribution score and pooled reward with floor division", () => {
    const result = computeContributionReward({
      depth_breakdown: [
        { depth: 1, weight_bps: "5000", volume_base: "1000" },
        { depth: 2, weight_bps: "2500", volume_base: "500" }
      ],
      pool_amount_base: "1000",
      total_score: "625"
    });

    expect(result).toEqual({
      base_amount_base: "1500",
      account_score: "625",
      reward_amount_base: "1000",
      depth_breakdown: [
        { depth: 1, weight_bps: "5000", volume_base: "1000", score_base: "500" },
        { depth: 2, weight_bps: "2500", volume_base: "500", score_base: "125" }
      ]
    });
  });

  it("returns zero reward when total score is zero", () => {
    expect(
      computeContributionReward({
        depth_breakdown: [{ depth: 1, weight_bps: "100", volume_base: "999" }],
        pool_amount_base: "1000",
        total_score: "0"
      }).reward_amount_base
    ).toBe("0");
  });

  it("builds deterministic source references", () => {
    expect(
      buildContributionSourceReference({
        calculation_date: "2026-06-30",
        account_id: "account-1"
      })
    ).toBe("calc:CONTRIBUTION:2026-06-30:acct:account-1");
  });

  it("classifies identical snapshots as duplicate and mismatched snapshots as conflict", () => {
    const existing = {
      account_id: "account-1",
      policy_version_id: "policy-1",
      amount_base: "120",
      metadata_json: {
        pool_amount_base: "1000",
        account_score: "1200",
        total_score: "10000",
        calculation_date: "2026-06-30"
      }
    };

    expect(
      classifyExistingContributionReward(existing, {
        account_id: "account-1",
        policy_version_id: "policy-1",
        amount_base: "120",
        pool_amount_base: "1000",
        account_score: "1200",
        total_score: "10000",
        calculation_date: "2026-06-30"
      })
    ).toBe("duplicate");

    expect(
      classifyExistingContributionReward(existing, {
        account_id: "account-1",
        policy_version_id: "policy-1",
        amount_base: "121",
        pool_amount_base: "1000",
        account_score: "1200",
        total_score: "10000",
        calculation_date: "2026-06-30"
      })
    ).toBe("conflict");
  });

  it("extracts calc_run summary from admin audit logs", () => {
    const auditLogs: AdminAuditLogRow[] = [
      {
        id: "audit-1",
        actor_account_id: "admin-1",
        action: "ADMIN_CONTRIBUTION_RUN",
        target_table: "calc_runs",
        target_id: "calc-1",
        meta: {
          target_count: 3,
          created_count: 1,
          zero_base_skip_count: 1,
          zero_reward_skip_count: 0,
          ineligible_skip_count: 0,
          duplicate_skip_count: 1,
          conflict_count: 0,
          failed_count: 0,
          total_base_amount_base: "1200",
          total_reward_amount_base: "80",
          pool_amount_base: "400",
          total_score: "5000",
          status: "SUCCEEDED"
        },
        created_at: "2026-06-30T00:00:00.000Z"
      }
    ];

    expect(extractContributionSummaryFromAuditLogs(auditLogs, "calc-1")).toEqual({
      calc_run_id: "calc-1",
      target_count: 3,
      created_count: 1,
      zero_base_skip_count: 1,
      zero_reward_skip_count: 0,
      ineligible_skip_count: 0,
      duplicate_skip_count: 1,
      conflict_count: 0,
      failed_count: 0,
      total_base_amount_base: "1200",
      total_reward_amount_base: "80",
      pool_amount_base: "400",
      total_score: "5000",
      status: "SUCCEEDED"
    });
  });

  it("allows only ADMIN actors to run contribution rewards", () => {
    expect(() => assertCanRunContribution("ADMIN")).not.toThrow();

    expect(() => assertCanRunContribution("READER")).toThrowError(AppError);
    expect(() => assertCanRunContribution("USER")).toThrowError(AppError);
  });
});
