import type { DbConn } from "../db/pool.js";

export type SidecarEventRuleRow = {
  id: string;
  policy_version_id: string;
  status: "NORMAL" | "SIDECAR_ACTIVE" | "RELEASED";
  trigger_reason: string | null;
  freeze_bps: string;
  release_bps: string;
  triggered_at: string | null;
  released_at: string | null;
  created_by: string | null;
  created_at: string;
};

export async function getLatestSidecarEventRule(
  conn: DbConn,
  policy_version_id: string
): Promise<SidecarEventRuleRow | null> {
  const [rows] = await conn.query(
    `select
        id,
        policy_version_id,
        status,
        trigger_reason,
        cast(freeze_bps as char) as freeze_bps,
        cast(release_bps as char) as release_bps,
        triggered_at,
        released_at,
        created_by,
        created_at
       from sidecar_events
      where policy_version_id = ?
      order by created_at desc, id desc
      limit 1`,
    [policy_version_id]
  );
  const arr = rows as SidecarEventRuleRow[];
  return arr[0] ?? null;
}
