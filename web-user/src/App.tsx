import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RouteLoadBoundary } from "@/components/RouteLoadBoundary";
import { PrivateRoute } from "@/routes/PrivateRoute";
import { useSessionStore } from "@/store/sessionStore";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const NetworkPage = lazy(() => import("@/pages/NetworkPage"));
const StakingPage = lazy(() => import("@/pages/StakingPage"));
const StakingDetailPage = lazy(() => import("@/pages/StakingDetailPage"));
const RankPage = lazy(() => import("@/pages/RankPage"));
const RewardsPage = lazy(() => import("@/pages/RewardsPage"));
const RewardDetailPage = lazy(() => import("@/pages/RewardDetailPage"));
const WithdrawalsPage = lazy(() => import("@/pages/WithdrawalsPage"));
const WithdrawalDetailPage = lazy(() => import("@/pages/WithdrawalDetailPage"));

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

export default function App() {
  const accessToken = useSessionStore((state) => state.accessToken);

  return (
    <BrowserRouter future={routerFuture}>
      <RouteLoadBoundary>
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
            path="/rank"
            element={
              <PrivateRoute>
                <RankPage />
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
          <Route
            path="/withdrawals"
            element={
              <PrivateRoute>
                <WithdrawalsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/withdrawals/:withdrawalId"
            element={
              <PrivateRoute>
                <WithdrawalDetailPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteLoadBoundary>
    </BrowserRouter>
  );
}
