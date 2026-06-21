import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api, ApiError, persistAuthMessage } from "@/lib/api";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import LedgerDetailPage from "@/pages/LedgerDetailPage";
import { useSessionStore } from "@/store/sessionStore";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

function RootRedirect() {
  const accessToken = useSessionStore((state) => state.accessToken);
  return accessToken ? <Navigate to="/admin?tab=policies" replace /> : <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
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
      .then(async (result) => {
        if (cancelled) return;
        if (result.account.role !== "ADMIN" && result.account.role !== "READER") {
          await api.logout(accessToken).catch(() => undefined);
          if (cancelled) return;
          clearSession();
          setStatus("FORBIDDEN");
          return;
        }
        setAccount(result.account);
        setStatus("AUTHENTICATED");
      })
      .catch((error) => {
        if (cancelled) return;
        clearSession();
        if (error instanceof ApiError && error.status === 403) {
          persistAuthMessage("관리자 화면에 접근할 권한이 없습니다.");
          setStatus("FORBIDDEN");
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          persistAuthMessage("로그인이 만료되었습니다. 다시 로그인해 주세요.");
        }
        setStatus("UNAUTHENTICATED");
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearSession, setAccount]);

  if (status === "UNKNOWN") {
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

  if (status === "FORBIDDEN") {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`}
        replace
        state={{ message: "관리자 화면에 접근할 권한이 없습니다." }}
      />
    );
  }

  if (status === "UNAUTHENTICATED") {
    return <Navigate to={`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter future={routerFuture}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/admin/ledger/:accountId" element={<ProtectedRoute><LedgerDetailPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
