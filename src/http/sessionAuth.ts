import type { NextFunction, Request, Response } from "express";

import { unauthorized } from "../domain/errors.js";
import type { AccountAuthRow } from "../repos/accountsRepo.js";
import { AuthService } from "../services/authService.js";
import { hashSessionToken } from "../util/sessionToken.js";

declare module "express-serve-static-core" {
  interface Request {
    sessionAccount?: AccountAuthRow;
    sessionTokenHash?: string;
  }
}

export function extractBearerToken(authorizationHeader?: string | null): string {
  if (!authorizationHeader) {
    throw unauthorized("Missing Authorization header");
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/);
  if (!match || !match[1]) {
    throw unauthorized("Invalid Authorization header");
  }

  const token = match[1].trim();
  if (!token) {
    throw unauthorized("Invalid Authorization header");
  }

  return token;
}

export function requireSessionAccount(req: Request): AccountAuthRow {
  if (!req.sessionAccount) {
    throw unauthorized("Missing authenticated session");
  }
  return req.sessionAccount;
}

export function sessionAuthMiddleware(authService: AuthService) {
  return async function sessionAuth(req: Request, _res: Response, next: NextFunction) {
    try {
      const accessToken = extractBearerToken(req.header("authorization"));
      req.sessionTokenHash = hashSessionToken(accessToken);
      req.sessionAccount = await authService.authenticateAccessToken(accessToken);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
