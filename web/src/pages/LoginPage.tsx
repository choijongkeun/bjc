import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Shield } from "lucide-react";
import { api, consumeAuthMessage, getErrorMessage } from "@/lib/api";
import { useSessionStore } from "@/store/sessionStore";
import { Button, Card, FeedbackState, TextField } from "@/components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const accessToken = useSessionStore((state) => state.accessToken);
  const account = useSessionStore((state) => state.account);
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextPath = useMemo(() => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") ? next : "/admin?tab=policies";
  }, [searchParams]);

  useEffect(() => {
    const stateMessage = (location.state as { message?: string } | null)?.message ?? null;
    const storedMessage = consumeAuthMessage();
    if (stateMessage || storedMessage) {
      setError(stateMessage ?? storedMessage);
    }
  }, [location.state]);

  useEffect(() => {
    if (accessToken && (account?.role === "ADMIN" || account?.role === "READER")) {
      navigate(nextPath, { replace: true });
    }
  }, [accessToken, account, navigate, nextPath]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setSubmitting(true);
      const result = await api.login({
        login_id: loginId.trim(),
        password,
      });
      if (result.account.role !== "ADMIN" && result.account.role !== "READER") {
        await api.logout(result.access_token).catch(() => undefined);
        clearSession();
        setPassword("");
        setError("관리자 화면에 접근할 권한이 없습니다.");
        return;
      }
      setSession(result.access_token, result.account);
      navigate(nextPath, { replace: true });
    } catch (submitError) {
      setPassword("");
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-800 bg-slate-950/50 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-300">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <div className="text-xs tracking-[0.18em] text-slate-500">BJC 운영</div>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-50">운영 관리자 로그인</h1>
              </div>
            </div>
          </div>
          <form className="space-y-5 px-8 py-8" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300" htmlFor="login-id">
                아이디
              </label>
              <TextField
                id="login-id"
                placeholder="아이디"
                autoComplete="username"
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300" htmlFor="password">
                비밀번호
              </label>
              <div className="relative">
                <TextField
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-400 hover:bg-slate-900/70 hover:text-slate-200"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error ? <FeedbackState title="로그인 오류" description={error} tone="error" /> : null}
            <Button className="w-full" type="submit" disabled={!loginId.trim() || !password || submitting}>
              {submitting ? "로그인 중..." : "로그인"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
