import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import NetworkPage from "@/pages/NetworkPage";
import { PrivateRoute } from "@/routes/PrivateRoute";
import { useSessionStore } from "@/store/sessionStore";

export default function App() {
  const accessToken = useSessionStore((state) => state.accessToken);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={accessToken ? "/dashboard" : "/login"} replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/network"
          element={
            <PrivateRoute>
              <NetworkPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
