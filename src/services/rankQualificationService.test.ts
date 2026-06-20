import { describe, expect, it } from "vitest";

import { AppError } from "../domain/errors.js";
import {
  buildNextRankProgress,
  decideRankQualification,
  isRankRuleQualified,
  selectHighestQualifiedRank,
  type RankQualificationMetrics,
  type RankRule
} from "../domain/rankQualification.js";
import { assertCanRunRankQualification } from "./rankQualificationService.js";

const baseMetrics: RankQualificationMetrics = {
  personal_active_stake_amount_base: "1000000",
  personal_cumulative_stake_amount_base: "3000000",
  direct_referral_count: 3,
  direct_active_referral_count: 3,
  left_leg_volume_base: "4000000",
  right_leg_volume_base: "2000000",
  weak_leg_volume_base: "2000000",
  strong_leg_volume_base: "4000000",
  downline_daily_reward_amount_base: "500000"
};

const rules: RankRule[] = [
  {
    id: "rule-1",
    policy_version_id: "policy-1",
    rank_level: 1,
    required_lines: 1,
    required_weak_volume_base: "500000",
    rank_share_bps: "1000",
    effective_bonus_bps: "500"
  },
  {
    id: "rule-2",
    policy_version_id: "policy-1",
    rank_level: 2,
    required_lines: 2,
    required_weak_volume_base: "1500000",
    rank_share_bps: "2000",
    effective_bonus_bps: "1000"
  },
  {
    id: "rule-3",
    policy_version_id: "policy-1",
    rank_level: 3,
    required_lines: 4,
    required_weak_volume_base: "2500000",
    rank_share_bps: "3000",
    effective_bonus_bps: "1500"
  }
];

describe("rankQualificationService helpers", () => {
  it("qualifies only when all active rule conditions are met", () => {
    expect(isRankRuleQualified(baseMetrics, rules[1]!)).toEqual({
      qualified: true,
      unmet_conditions: []
    });

    expect(
      isRankRuleQualified(
        {
          ...baseMetrics,
          direct_active_referral_count: 1
        },
        rules[1]!
      )
    ).toEqual({
      qualified: false,
      unmet_conditions: ["required_lines"]
    });
  });

  it("selects the highest qualified rank", () => {
    const result = selectHighestQualifiedRank(baseMetrics, rules);
    expect(result.qualified_rank_level).toBe(2);
    expect(result.evaluated_rules).toHaveLength(3);
  });

  it("returns null when no rule is qualified", () => {
    const result = selectHighestQualifiedRank(
      {
        ...baseMetrics,
        direct_active_referral_count: 0,
        weak_leg_volume_base: "0"
      },
      rules
    );
    expect(result.qualified_rank_level).toBeNull();
  });

  it("treats missing previous rank as INITIAL", () => {
    const result = decideRankQualification({
      previous_rank_level: null,
      qualified_rank_level: 2,
      evaluated_rules: []
    });
    expect(result.change_type).toBe("INITIAL");
    expect(result.applied_rank_level).toBe(2);
    expect(result.result_status).toBe("QUALIFIED");
  });

  it("promotes when a higher rule becomes qualified", () => {
    const result = decideRankQualification({
      previous_rank_level: 1,
      qualified_rank_level: 2,
      evaluated_rules: []
    });
    expect(result.change_type).toBe("PROMOTED");
    expect(result.applied_rank_level).toBe(2);
  });

  it("keeps rank and marks demotion deferred when qualification drops below current", () => {
    const result = decideRankQualification({
      previous_rank_level: 3,
      qualified_rank_level: 1,
      evaluated_rules: []
    });
    expect(result.change_type).toBe("MAINTAINED");
    expect(result.applied_rank_level).toBe(3);
    expect(result.result_status).toBe("DEMOTION_CANDIDATE");
    expect(result.demotion_deferred).toBe(true);
  });

  it("builds next-rank progress without converting amount strings to Number", () => {
    const progress = buildNextRankProgress({
      current_rank_level: 1,
      rules,
      metrics: baseMetrics
    });
    expect(progress.next_rank_level).toBe(2);
    expect(progress.progress_items).toEqual([
      {
        metric: "direct_active_referral_count",
        current: 3,
        required: 2,
        met: true
      },
      {
        metric: "weak_leg_volume_base",
        current: "2000000",
        required: "1500000",
        met: true
      }
    ]);
  });

  it("allows only ADMIN actors to run rank qualification", () => {
    expect(() => assertCanRunRankQualification("ADMIN")).not.toThrow();

    try {
      assertCanRunRankQualification("READER");
      throw new Error("expected READER to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(403);
    }
  });
});
