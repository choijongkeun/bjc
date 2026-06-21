import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, consumeAuthMessage, getErrorMessage } from "@/lib/api";
import { useSessionStore } from "@/store/sessionStore";
import { Button, Card, SectionTitle, TextField } from "@/components/ui";
import { FeedbackState } from "@/components/FeedbackState";

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
  const nextPath = (() => {
    const next = searchParams.get("next");
    return next && next.startsWith("/") ? next : "/dashboard";
  })();

  useEffect(() => {
    const stateMessage = (location.state as { message?: string } | null)?.message ?? null;
    const storedMessage = consumeAuthMessage();
    if (stateMessage || storedMessage) {
      setError(stateMessage ?? storedMessage);
    }
  }, [location.state]);

  useEffect(() => {
    if (accessToken && account?.role === "USER") {
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
      if (result.account.role !== "USER") {
        await api.logout(result.access_token).catch(() => undefined);
        clearSession();
        setPassword("");
        setError("사용할 수 없는 계정입니다.");
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
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.1fr,0.9fr]">
        <Card className="hidden overflow-hidden p-8 lg:block">
          <div className="soft-grid absolute inset-0 opacity-40" />
          <div className="relative">
            <div className="text-xs uppercase tracking-[0.22em] text-blue-300">BJC MEMBER</div>
            <h1 className="mt-5 max-w-xl text-5xl font-extrabold tracking-tight text-slate-50">회원 전용 서비스에 로그인하세요</h1>
          </div>
        </Card>

        <Card className="mx-auto w-full max-w-xl overflow-hidden p-0">
          <div className="border-b border-slate-800 bg-slate-950/50 px-8 py-7">
            <SectionTitle eyebrow="로그인" title="회원 로그인" description="로그인 후 주요 화면을 바로 사용할 수 있습니다." />
          </div>
          <form className="space-y-5 px-8 py-8" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold tracking-[0.18em] text-slate-500">아이디</span>
              <div className="relative">
                <UserRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <TextField
                  className="pl-11"
                  placeholder="회원 로그인 ID"
                  autoComplete="username"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold tracking-[0.18em] text-slate-500">비밀번호</span>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <TextField
                  className="pl-11"
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
            </label>

            {error ? <FeedbackState title="로그인 실패" description={error} tone="error" /> : null}

            <Button className="w-full" type="submit" disabled={!loginId.trim() || !password || submitting}>
              {submitting ? "로그인 중..." : "로그인"}
              {!submitting ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
            </Button>

            <div className="rounded-[24px] border border-slate-800 bg-slate-950/45 p-4 text-sm text-slate-400">
              아직 계정이 없나요?{" "}
              <Link className="font-semibold text-emerald-300 hover:text-emerald-200" to="/register">
                회원가입으로 이동
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
