import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ApiError, resolveActorRole, type SessionRole } from "@/lib/api";

type SessionState = {
  actorId: string | null;
  role: SessionRole | null;
  status: "idle" | "loading" | "ready";
  error: string | null;
  login: (actorId: string) => Promise<SessionRole>;
  logout: () => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      actorId: null,
      role: null,
      status: "idle",
      error: null,
      async login(actorId: string) {
        set({ status: "loading", error: null });
        try {
          const role = await resolveActorRole(actorId);
          set({ actorId, role, status: "ready", error: null });
          return role;
        } catch (error) {
          const message =
            error instanceof ApiError
              ? error.status === 401
                ? "유효한 actor 계정을 찾지 못했습니다."
                : error.status === 403
                  ? "관리자 콘솔 접근 권한이 없습니다."
                  : error.message
              : "로그인 중 오류가 발생했습니다.";
          set({ actorId: null, role: null, status: "idle", error: message });
          throw error;
        }
      },
      logout() {
        set({ actorId: null, role: null, status: "idle", error: null });
      },
    }),
    {
      name: "bjc-admin-session",
      partialize: (state) => ({ actorId: state.actorId, role: state.role }),
    }
  )
);
