import { describe, expect, it } from "vitest";

import { AppError } from "../domain/errors.js";
import {
  buildRankBonusSourceReference,
  calculateRankBonusAmountBase,
  classifyExistingRankBonusReward,
  computeRankBonus,
} from "../domain/rankBonus.js";
import type { RewardViewRow } from "../repos/accountRewardsRepo.js";
import { assertCanRunRankBonus } from "./rankBonusService.js";

const baseReward: RewardViewRow = {
  id: "reward-1",
  account_id: "account-1",
  account_staking_id: null,
  source_account_id: null,
  source_account_staking_id: null,
  policy_version_id: "policy-1",
  calc_run_id: "calc-1",
  reward_type: "RANK_BONUS",
  reward_date: "2026-06-30",
  amount_base: "50000",
  status: "CONFIRMED",
  source_reference: "rank_bonus:2026-06-30:account-1:3",
  source_ledger_event_id: "ledger-1",
  reversal_reward_id: null,
  available_at: "2026-06-30 00:00:00.000",
  confirmed_at: "2026-06-30 00:00:00.000",
  reversed_at: null,
  metadata_json: {
    rank_level: 3,
    effective_bonus_bps: "500",
    base_daily_reward_amount_base: "1000000",
    qualification_result_id: "qual-1",
  },
  created_at: "2026-06-30 00:00:00.000",
  updated_at: "2026-06-30 00:00:00.000",
  account_login_id: "rank-user",
  account_display_name: "Rank User",
  source_account_login_id: null,
  source_account_display_name: null,
  staking_principal_amount_base: null,
  staking_daily_interest_bps_snapshot: null,
  staking_duration_days_snapshot: null,
  staking_status: null,
  source_staking_principal_amount_base: null,
  source_staking_daily_interest_bps_snapshot: null,
  source_staking_duration_days_snapshot: null,
  source_staking_status: null,
  product_id: null,
  product_name: null,
  product_symbol: null,
  product_decimals: null,
  calc_run_status: "SUCCEEDED",
  calc_run_run_type: "RANK_BONUS",
  calc_run_run_date: "2026-06-30",
};

describe("rankBonusService helpers", () => {
  it("builds deterministic source_reference", () => {
    expect(
      buildRankBonusSourceReference({
        calculation_date: "2026-06-30",
        account_id: "account-1",
        rank_level: 3,
      })
    ).toBe("rank_bonus:2026-06-30:account-1:3");
  });

  it("computes BigInt floor amount without Number conversion", () => {
    expect(
      calculateRankBonusAmountBase({
        base_daily_reward_amount_base: "1000001",
        effective_bonus_bps: "555",
      })
    ).toBe("55500");
  });

  it("returns zero for zero base and preserves string amounts", () => {
    expect(
      computeRankBonus({
        base_daily_reward_amount_base: "0",
        effective_bonus_bps: "500",
      })
    ).toEqual({
      base_daily_reward_amount_base: "0",
      effective_bonus_bps: "500",
      rank_bonus_amount_base: "0",
    });
  });

  it("classifies identical existing reward as duplicate", () => {
    expect(
      classifyExistingRankBonusReward(baseReward, {
        account_id: "account-1",
        policy_version_id: "policy-1",
        calculation_date: "2026-06-30",
        rank_level: 3,
        effective_bonus_bps: "500",
        base_daily_reward_amount_base: "1000000",
        rank_bonus_amount_base: "50000",
        qualification_result_id: "qual-1",
      })
    ).toBe("duplicate");
  });

  it("parses serialized metadata_json when classifying duplicates", () => {
    expect(
      classifyExistingRankBonusReward(
        {
          ...baseReward,
          metadata_json: JSON.stringify(baseReward.metadata_json),
        },
        {
          account_id: "account-1",
          policy_version_id: "policy-1",
          calculation_date: "2026-06-30",
          rank_level: 3,
          effective_bonus_bps: "500",
          base_daily_reward_amount_base: "1000000",
          rank_bonus_amount_base: "50000",
          qualification_result_id: "qual-1",
        }
      )
    ).toBe("duplicate");
  });

  it("normalizes Date reward_date when classifying duplicates", () => {
    expect(
      classifyExistingRankBonusReward(
        {
          ...baseReward,
          reward_date: new Date("2026-06-29T15:00:00.000Z") as unknown as string,
        },
        {
          account_id: "account-1",
          policy_version_id: "policy-1",
          calculation_date: "2026-06-30",
          rank_level: 3,
          effective_bonus_bps: "500",
          base_daily_reward_amount_base: "1000000",
          rank_bonus_amount_base: "50000",
          qualification_result_id: "qual-1",
        }
      )
    ).toBe("duplicate");
  });

  it("classifies changed qualification payload as conflict", () => {
    expect(
      classifyExistingRankBonusReward(baseReward, {
        account_id: "account-1",
        policy_version_id: "policy-1",
        calculation_date: "2026-06-30",
        rank_level: 3,
        effective_bonus_bps: "500",
        base_daily_reward_amount_base: "900000",
        rank_bonus_amount_base: "45000",
        qualification_result_id: "qual-2",
      })
    ).toBe("conflict");
  });

  it("allows only ADMIN actors to run rank bonus", () => {
    expect(() => assertCanRunRankBonus("ADMIN")).not.toThrow();

    try {
      assertCanRunRankBonus("READER");
      throw new Error("expected READER to be rejected");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(403);
    }
  });
});
