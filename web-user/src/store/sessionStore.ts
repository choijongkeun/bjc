import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionAccount } from "@/lib/api";

export const USER_SESSION_STORAGE_KEY = "bjc-user-session";

type SessionState = {
  accessToken: string | null;
  account: SessionAccount | null;
  setSession: (accessToken: string, account: SessionAccount) => void;
  setAccount: (account: SessionAccount | null) => void;
  clearSession: () => void;
  isAuthenticated: () => boolean;
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
    }),
    {
      name: USER_SESSION_STORAGE_KEY,
      partialize: (state) => ({
        accessToken: state.accessToken,
        account: state.account,
      }),
    }
  )
);
