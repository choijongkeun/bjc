import { describe, expect, it } from "vitest";

import { findFixtureRewards, fixtureCleanupSucceeded } from "./direct_referral_reward_smoke_helpers.js";

describe("direct_referral_reward_smoke_helpers", () => {
  it("finds only the fixture reward from a mixed admin reward response", () => {
    const items = [
      {
        id: "existing-1",
        source_reference: "direct_referral:old-staking:old-sponsor",
        account: { id: "other-account" },
        calc_run: { id: "other-run" }
      },
      {
        id: "fixture-reward",
        source_reference: "direct_referral:fixture-staking:fixture-sponsor",
        account: { id: "fixture-sponsor" },
        calc_run: { id: "fixture-run" }
      },
      {
        id: "existing-2",
        source_reference: "direct_referral:fixture-staking:fixture-sponsor",
        account: { id: "fixture-sponsor" },
        calc_run: { id: "another-run" }
      }
    ];

    expect(
      findFixtureRewards(items, {
        rewardId: "fixture-reward",
        accountId: "fixture-sponsor",
        calcRunId: "fixture-run",
        sourceReference: "direct_referral:fixture-staking:fixture-sponsor"
      })
    ).toEqual([items[1]]);
  });

  it("fails cleanup when any fixture-scoped row remains", () => {
    expect(
      fixtureCleanupSucceeded({
        fixture_rewards: 0,
        fixture_ledger_events: 0,
        fixture_calc_runs: 1
      })
    ).toBe(false);
  });
});
