import type { DbConn } from "../db/pool.js";
import type { AccountRole } from "../repos/accountsRepo.js";

import { forbidden, unauthorized } from "../domain/errors.js";
import { getAccountById } from "../repos/accountsRepo.js";

export type Actor = {
  id: string;
  role: AccountRole;
};

export async function requireActor(conn: DbConn, actorId: string): Promise<Actor> {
  const account = await getAccountById(conn, actorId);
  if (!account) throw unauthorized("invalid actor", { actorId });
  return { id: account.id, role: account.role };
}

export function assertRoleAtLeast(actor: Actor, min: "READER" | "ADMIN"): void {
  if (min === "READER") {
    if (actor.role === "READER" || actor.role === "ADMIN") return;
    throw forbidden("reader permission required", { actorRole: actor.role });
  }

  if (actor.role !== "ADMIN") {
    throw forbidden("admin permission required", { actorRole: actor.role });
  }
}
