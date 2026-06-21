import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, ApiError, persistAuthMessage } from "@/lib/api";
import { useSessionStore } from "@/store/sessionStore";

export function resolvePrivateRouteState(input: {
  accessToken: string | null;
  isChecking: boolean;
  isVerified: boolean;
  isRejected: boolean;
}) {
  if (!input.accessToken || input.isRejected) {
    return "redirect";
  }
  if (input.isChecking || !input.isVerified) {
    return "loading";
  }
  return "allow";
}

export function PrivateRoute({ children }: { children: JSX.Element }) {
  const location = useLocation();
  const accessToken = useSessionStore((state) => state.accessToken);
  const setAccount = useSessionStore((state) => state.setAccount);
  const clearSession = useSessionStore((state) => state.clearSession);
  const [status, setStatus] = useState<"UNKNOWN" | "AUTHENTICATED" | "UNAUTHENTICATED" | "FORBIDDEN">(
    accessToken ? "UNKNOWN" : "UNAUTHENTICATED"
  );

  useEffect(() => {
    let cancelled = false;

    if (!accessToken) {
      setStatus("UNAUTHENTICATED");
      return;
    }

    setStatus("UNKNOWN");

    api
      .me(accessToken)
      .then((result) => {
        if (cancelled) return;
        if (result.account.role !== "USER") {
          clearSession();
          setStatus("FORBIDDEN");
          return;
        }
        setAccount(result.account);
        setStatus("AUTHENTICATED");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearSession();
          persistAuthMessage(error.status === 403 ? "사용할 수 없는 계정입니다." : "로그인이 만료되었습니다. 다시 로그인해 주세요.");
          setStatus(error.status === 403 ? "FORBIDDEN" : "UNAUTHENTICATED");
          return;
        }
        clearSession();
        setStatus("UNAUTHENTICATED");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession, setAccount]);

  const decision = resolvePrivateRouteState({
    accessToken,
    isChecking: status === "UNKNOWN",
    isVerified: status === "AUTHENTICATED",
    isRejected: status === "UNAUTHENTICATED" || status === "FORBIDDEN",
  });

  if (status === "FORBIDDEN") {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
        replace
        state={{ message: "사용할 수 없는 계정입니다." }}
      />
    );
  }

  if (decision === "redirect") {
    return <Navigate to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  }

  if (decision === "loading") {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6">
        <div className="glass-card w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-pulse rounded-full bg-blue-500/20" />
          <div className="text-lg font-semibold text-slate-100">세션을 확인하고 있습니다.</div>
          <div className="mt-2 text-sm text-slate-400">잠시만 기다려 주세요.</div>
        </div>
      </div>
    );
  }

  return children;
}
