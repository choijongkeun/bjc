import { describe, expect, it } from "vitest";
import { resolvePrivateRouteState } from "@/routes/PrivateRoute";

describe("PrivateRoute helpers", () => {
  it("redirects when token is missing", () => {
    expect(
      resolvePrivateRouteState({
        accessToken: null,
        isChecking: false,
        isVerified: false,
        isRejected: false,
      })
    ).toBe("redirect");
  });

  it("keeps loading while checking session", () => {
    expect(
      resolvePrivateRouteState({
        accessToken: "token",
        isChecking: true,
        isVerified: false,
        isRejected: false,
      })
    ).toBe("loading");
  });

  it("allows navigation after verification", () => {
    expect(
      resolvePrivateRouteState({
        accessToken: "token",
        isChecking: false,
        isVerified: true,
        isRejected: false,
      })
    ).toBe("allow");
  });
});
