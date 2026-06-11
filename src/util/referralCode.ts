import { randomBytes } from "node:crypto";

export function generateReferralCode(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}
