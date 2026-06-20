import type { DbConn } from "../db/pool.js";

export type DirectReferralRewardRuleRow = {
  id: string;
  policy_version_id: string;
  depth: number;
  bonus_bps: string;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
};

const DIRECT_REFERRAL_DEPTH = 1;

export async function getActiveDirectReferralRule(
  conn: DbConn,
  policyVersionId: string
): Promise<DirectReferralRewardRuleRow | null> {
  const [rows] = await conn.query(
    `select id, policy_version_id, depth, bonus_bps, is_active, created_at, updated_at
       from referral_bonus_rules
      where policy_version_id = ?
        and depth = ?
        and is_active = 1
      limit 1`,
    [policyVersionId, DIRECT_REFERRAL_DEPTH]
  );
  const arr = rows as DirectReferralRewardRuleRow[];
  return arr[0] ?? null;
}

export async function getDirectReferralRuleForUpdate(
  conn: DbConn,
  policyVersionId: string
): Promise<DirectReferralRewardRuleRow | null> {
  const [rows] = await conn.query(
    `select id, policy_version_id, depth, bonus_bps, is_active, created_at, updated_at
       from referral_bonus_rules
      where policy_version_id = ?
        and depth = ?
        and is_active = 1
      limit 1
      for update`,
    [policyVersionId, DIRECT_REFERRAL_DEPTH]
  );
  const arr = rows as DirectReferralRewardRuleRow[];
  return arr[0] ?? null;
}
