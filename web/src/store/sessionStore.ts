import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionAccount, SessionRole } from "@/lib/api";

type SessionState = {
  accessToken: string | null;
  account: SessionAccount | null;
  setSession: (accessToken: string, account: SessionAccount) => void;
  setAccount: (account: SessionAccount | null) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
  role: () => SessionRole | null;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      account: null,
      setSession(accessToken, account) {
        set({ accessToken, account });
      },
      setAccount(account) {
        set({ account });
      },
      clearSession() {
        set({ accessToken: null, account: null });
      },
      isAuthenticated() {
        return Boolean(get().accessToken);
      },
      role() {
        return get().account?.role ?? null;
      },
    }),
    {
      name: "bjc-admin-session",
      partialize: (state) => ({ accessToken: state.accessToken, account: state.account }),
    }
  )
);
