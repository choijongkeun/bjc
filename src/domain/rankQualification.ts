import { validationError } from "./errors.js";

export type RankRule = {
  id: string;
  policy_version_id: string;
  rank_level: number;
  required_lines: number;
  required_weak_volume_base: string;
  rank_share_bps: string;
  effective_bonus_bps: string;
};

export type RankQualificationMetrics = {
  personal_active_stake_amount_base: string;
  personal_cumulative_stake_amount_base: string;
  direct_referral_count: number;
  direct_active_referral_count: number;
  left_leg_volume_base: string;
  right_leg_volume_base: string;
  weak_leg_volume_base: string;
  strong_leg_volume_base: string;
  downline_daily_reward_amount_base: string;
};

export type EvaluatedRankRule = {
  rule_id: string;
  rank_level: number;
  qualified: boolean;
  unmet_conditions: string[];
};

export type RankQualificationDecision = {
  previous_rank_level: number | null;
  qualified_rank_level: number | null;
  applied_rank_level: number | null;
  result_status: "QUALIFIED" | "UNQUALIFIED" | "DEMOTION_CANDIDATE" | "NO_CHANGE";
  change_type: "INITIAL" | "PROMOTED" | "MAINTAINED";
  demotion_deferred: boolean;
  evaluated_rules: EvaluatedRankRule[];
};

export type NextRankProgressItem =
  | {
      metric: "direct_active_referral_count";
      current: number;
      required: number;
      met: boolean;
    }
  | {
      metric: "weak_leg_volume_base";
      current: string;
      required: string;
      met: boolean;
    };

export function compareAmountBase(a: string, b: string): number {
  const left = BigInt(a);
  const right = BigInt(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function minAmountBase(a: string, b: string): string {
  return compareAmountBase(a, b) <= 0 ? a : b;
}

export function maxAmountBase(a: string, b: string): string {
  return compareAmountBase(a, b) >= 0 ? a : b;
}

export function isRankRuleQualified(metrics: RankQualificationMetrics, rule: RankRule): {
  qualified: boolean;
  unmet_conditions: string[];
} {
  const unmet_conditions: string[] = [];

  if (metrics.direct_active_referral_count < rule.required_lines) {
    unmet_conditions.push("required_lines");
  }
  if (compareAmountBase(metrics.weak_leg_volume_base, rule.required_weak_volume_base) < 0) {
    unmet_conditions.push("required_weak_volume_base");
  }

  return {
    qualified: unmet_conditions.length === 0,
    unmet_conditions
  };
}

export function selectHighestQualifiedRank(metrics: RankQualificationMetrics, rules: RankRule[]): {
  qualified_rank_level: number | null;
  evaluated_rules: EvaluatedRankRule[];
} {
  const evaluated_rules = rules.map((rule) => {
    const evaluation = isRankRuleQualified(metrics, rule);
    return {
      rule_id: rule.id,
      rank_level: rule.rank_level,
      qualified: evaluation.qualified,
      unmet_conditions: evaluation.unmet_conditions
    };
  });

  const highest = evaluated_rules
    .filter((row) => row.qualified)
    .reduce<number | null>((acc, row) => (acc === null || row.rank_level > acc ? row.rank_level : acc), null);

  return {
    qualified_rank_level: highest,
    evaluated_rules
  };
}

export function decideRankQualification(input: {
  previous_rank_level: number | null;
  qualified_rank_level: number | null;
  evaluated_rules: EvaluatedRankRule[];
}): RankQualificationDecision {
  const previous = input.previous_rank_level;
  const qualified = input.qualified_rank_level;

  if (previous === null) {
    return {
      previous_rank_level: null,
      qualified_rank_level: qualified,
      applied_rank_level: qualified,
      result_status: qualified === null ? "UNQUALIFIED" : "QUALIFIED",
      change_type: "INITIAL",
      demotion_deferred: false,
      evaluated_rules: input.evaluated_rules
    };
  }

  if (qualified === null) {
    return {
      previous_rank_level: previous,
      qualified_rank_level: null,
      applied_rank_level: previous,
      result_status: "DEMOTION_CANDIDATE",
      change_type: "MAINTAINED",
      demotion_deferred: true,
      evaluated_rules: input.evaluated_rules
    };
  }

  if (qualified > previous) {
    return {
      previous_rank_level: previous,
      qualified_rank_level: qualified,
      applied_rank_level: qualified,
      result_status: "QUALIFIED",
      change_type: "PROMOTED",
      demotion_deferred: false,
      evaluated_rules: input.evaluated_rules
    };
  }

  if (qualified === previous) {
    return {
      previous_rank_level: previous,
      qualified_rank_level: qualified,
      applied_rank_level: previous,
      result_status: "NO_CHANGE",
      change_type: "MAINTAINED",
      demotion_deferred: false,
      evaluated_rules: input.evaluated_rules
    };
  }

  return {
    previous_rank_level: previous,
    qualified_rank_level: qualified,
    applied_rank_level: previous,
    result_status: "DEMOTION_CANDIDATE",
    change_type: "MAINTAINED",
    demotion_deferred: true,
    evaluated_rules: input.evaluated_rules
  };
}

export function buildNextRankProgress(input: {
  current_rank_level: number | null;
  rules: RankRule[];
  metrics: RankQualificationMetrics;
}): {
  next_rank_level: number | null;
  progress_items: NextRankProgressItem[];
} {
  const nextRule = input.rules.find((rule) => rule.rank_level > (input.current_rank_level ?? 0)) ?? null;
  if (!nextRule) {
    return {
      next_rank_level: null,
      progress_items: []
    };
  }

  return {
    next_rank_level: nextRule.rank_level,
    progress_items: [
      {
        metric: "direct_active_referral_count",
        current: input.metrics.direct_active_referral_count,
        required: nextRule.required_lines,
        met: input.metrics.direct_active_referral_count >= nextRule.required_lines
      },
      {
        metric: "weak_leg_volume_base",
        current: input.metrics.weak_leg_volume_base,
        required: nextRule.required_weak_volume_base,
        met: compareAmountBase(input.metrics.weak_leg_volume_base, nextRule.required_weak_volume_base) >= 0
      }
    ]
  };
}

export function assertHasActiveRankRules(rules: RankRule[], policy_version_id: string): void {
  if (rules.length === 0) {
    throw validationError("active rank rules not found", {
      policy_version_id,
      reason: "ACTIVE_RANK_RULES_NOT_FOUND"
    });
  }
}
