import type { NextFunction, Request, Response } from "express";

import { pool } from "../db/pool.js";
import { getAccountById, type AccountRow } from "../repos/accountsRepo.js";

declare module "express-serve-static-core" {
  interface Request {
    actor?: AccountRow;
  }
}

export async function actorMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const actorId = req.header("x-actor-account-id");
    if (!actorId) {
      return next();
    }

    const conn = await pool.getConnection();
    try {
      const actor = await getAccountById(conn, actorId);
      if (actor) req.actor = actor;
    } finally {
      conn.release();
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

