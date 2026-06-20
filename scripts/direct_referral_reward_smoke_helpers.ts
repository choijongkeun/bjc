export type FixtureRewardExpectation = {
  rewardId: string;
  accountId: string;
  calcRunId: string;
  sourceReference: string;
};

export type RewardListLike = {
  id: string;
  source_reference: string;
  account?: {
    id: string;
  };
  calc_run?: {
    id: string;
  } | null;
};

export function findFixtureRewards(items: RewardListLike[], expectation: FixtureRewardExpectation): RewardListLike[] {
  return items.filter(
    (item) =>
      item.id === expectation.rewardId &&
      item.source_reference === expectation.sourceReference &&
      item.account?.id === expectation.accountId &&
      item.calc_run?.id === expectation.calcRunId
  );
}

export function fixtureCleanupSucceeded(remaining: Record<string, number>): boolean {
  return Object.values(remaining).every((value) => value === 0);
}
