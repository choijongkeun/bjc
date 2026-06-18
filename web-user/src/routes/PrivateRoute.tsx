import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
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
  const accessToken = useSessionStore((state) => state.accessToken);
  const setAccount = useSessionStore((state) => state.setAccount);
  const clearSession = useSessionStore((state) => state.clearSession);
  const [status, setStatus] = useState<"checking" | "verified" | "rejected">(
    accessToken ? "checking" : "rejected"
  );

  useEffect(() => {
    let cancelled = false;

    if (!accessToken) {
      setStatus("rejected");
      return;
    }

    setStatus("checking");

    api
      .me(accessToken)
      .then((result) => {
        if (cancelled) return;
        setAccount(result.account);
        setStatus("verified");
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearSession();
          setStatus("rejected");
          return;
        }
        setStatus("rejected");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession, setAccount]);

  const decision = resolvePrivateRouteState({
    accessToken,
    isChecking: status === "checking",
    isVerified: status === "verified",
    isRejected: status === "rejected",
  });

  if (decision === "redirect") {
    return <Navigate to="/login" replace />;
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
