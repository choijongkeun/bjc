import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import NetworkPage from "@/pages/NetworkPage";
import StakingPage from "@/pages/StakingPage";
import StakingDetailPage from "@/pages/StakingDetailPage";
import RewardsPage from "@/pages/RewardsPage";
import RewardDetailPage from "@/pages/RewardDetailPage";
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
        <Route
          path="/staking"
          element={
            <PrivateRoute>
              <StakingPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/staking/:stakingId"
          element={
            <PrivateRoute>
              <StakingDetailPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/rewards"
          element={
            <PrivateRoute>
              <RewardsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/rewards/:rewardId"
          element={
            <PrivateRoute>
              <RewardDetailPage />
            </PrivateRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
