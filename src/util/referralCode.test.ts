import { describe, expect, it } from "vitest";

import { generateReferralCode } from "./referralCode.js";

describe("generateReferralCode", () => {
  it("creates a 12-character uppercase hex code", () => {
    const code = generateReferralCode();

    expect(code).toMatch(/^[A-F0-9]{12}$/);
  });
});
