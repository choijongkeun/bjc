import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import AdminPage from "@/pages/AdminPage";
import LedgerDetailPage from "@/pages/LedgerDetailPage";
import { useSessionStore } from "@/store/sessionStore";

function RootRedirect() {
  const actorId = useSessionStore((state) => state.actorId);
  const role = useSessionStore((state) => state.role);
  return actorId && role ? <Navigate to="/admin?tab=policies" replace /> : <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const actorId = useSessionStore((state) => state.actorId);
  const role = useSessionStore((state) => state.role);

  if (!actorId || !role || role === "USER") {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
        <Route path="/admin/ledger/:accountId" element={<ProtectedRoute><LedgerDetailPage /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
