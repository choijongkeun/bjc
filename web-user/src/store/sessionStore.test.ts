import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "@/store/sessionStore";

describe("sessionStore", () => {
  beforeEach(() => {
    useSessionStore.getState().clearSession();
    useSessionStore.persist.clearStorage();
    localStorage.clear();
  });

  it("stores and clears session safely", () => {
    useSessionStore.getState().setSession("token-1", {
      id: "account-1",
      login_id: "user01",
      display_name: "User 01",
      role: "USER",
      status: "ACTIVE",
      referral_code: "REF001",
      sponsor_account_id: "sponsor-1",
      binary_parent_account_id: "binary-1",
      binary_position: "LEFT",
      joined_at: null,
      last_login_at: null,
    });

    expect(useSessionStore.getState().isAuthenticated()).toBe(true);
    expect(useSessionStore.getState().accessToken).toBe("token-1");

    useSessionStore.getState().clearSession();

    expect(useSessionStore.getState().isAuthenticated()).toBe(false);
    expect(useSessionStore.getState().account).toBeNull();
  });
});
