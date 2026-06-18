import { describe, expect, it } from "vitest";
import { isPasswordConfirmationValid, syncReferralResolutionOnCodeChange } from "@/lib/register";

describe("register helpers", () => {
  it("validates password confirmation with minimum length", () => {
    expect(isPasswordConfirmationValid("12345678", "12345678")).toBe(true);
    expect(isPasswordConfirmationValid("1234", "1234")).toBe(false);
    expect(isPasswordConfirmationValid("12345678", "12345679")).toBe(false);
  });

  it("resets resolved referral when code changes", () => {
    const resolved = {
      referral_code: "ABC123",
      sponsor_account_id: "account-1",
      sponsor_login_id: "sponsor",
      sponsor_display_name: "추천인",
    };

    expect(syncReferralResolutionOnCodeChange(resolved, "ABC123")).toEqual(resolved);
    expect(syncReferralResolutionOnCodeChange(resolved, "DEF456")).toBeNull();
  });
});
