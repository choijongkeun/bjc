import type { DbConn } from "../db/pool.js";

export type ContributionWeightRuleRow = {
  id: string;
  policy_version_id: string;
  depth: number;
  weight_bps: string;
  created_at: string;
};

export async function listContributionWeightRules(
  conn: DbConn,
  policy_version_id: string
): Promise<ContributionWeightRuleRow[]> {
  const [rows] = await conn.query(
    `select id, policy_version_id, depth, cast(weight_bps as char) as weight_bps, created_at
       from contribution_weight_rules
      where policy_version_id = ?
      order by depth asc, id asc`,
    [policy_version_id]
  );
  return rows as ContributionWeightRuleRow[];
}
