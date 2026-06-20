import type { DbConn } from "../db/pool.js";

export type RankRuleRow = {
  id: string;
  policy_version_id: string;
  rank_level: number;
  required_lines: number;
  required_weak_volume_base: string;
  rank_share_bps: string;
  effective_bonus_bps: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
};

export async function listActiveRankRules(conn: DbConn, policyVersionId: string): Promise<RankRuleRow[]> {
  const [rows] = await conn.query(
    `select
        id,
        policy_version_id,
        rank_level,
        required_lines,
        required_weak_volume_base,
        rank_share_bps,
        effective_bonus_bps,
        is_active,
        created_at,
        updated_at
       from rank_rules
      where policy_version_id = ?
        and is_active = 1
      order by rank_level asc, created_at asc, id asc`,
    [policyVersionId]
  );
  return rows as RankRuleRow[];
}

export async function getRankRuleByLevel(
  conn: DbConn,
  input: { policy_version_id: string; rank_level: number }
): Promise<RankRuleRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        policy_version_id,
        rank_level,
        required_lines,
        required_weak_volume_base,
        rank_share_bps,
        effective_bonus_bps,
        is_active,
        created_at,
        updated_at
       from rank_rules
      where policy_version_id = ?
        and rank_level = ?
        and is_active = 1
      limit 1`,
    [input.policy_version_id, input.rank_level]
  );
  const arr = rows as RankRuleRow[];
  return arr[0] ?? null;
}
