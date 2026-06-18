import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, getErrorMessage } from "@/lib/api";
import { useSessionStore } from "@/store/sessionStore";
import { Button, Card, SectionTitle, TextField } from "@/components/ui";
import { FeedbackState } from "@/components/FeedbackState";

export default function LoginPage() {
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const setSession = useSessionStore((state) => state.setSession);
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accessToken) {
      navigate("/dashboard", { replace: true });
    }
  }, [accessToken, navigate]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      const result = await api.login({
        login_id: loginId.trim(),
        password,
      });
      setSession(result.access_token, result.account);
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
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
            <div className="text-xs uppercase tracking-[0.22em] text-blue-300">BJC Member Access</div>
            <h1 className="mt-5 max-w-xl text-5xl font-extrabold tracking-tight text-slate-50">추천인과 네트워크가 바로 보이는 회원용 포털</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
              `template/login.html`의 중앙 auth card와 검증 블록 구성을 바탕으로, 실제 BJC 회원 로그인과 네트워크 조회 흐름에 맞게 React 페이지로 재구성했습니다.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                { title: "추천 코드 검증", value: "실제 API 연결" },
                { title: "세션 인증", value: "Bearer Token" },
                { title: "조직도 조회", value: "Referral / Binary" },
                { title: "대시보드", value: "내 계정 기준" },
              ].map((item) => (
                <div key={item.title} className="rounded-[24px] border border-slate-800 bg-slate-950/55 p-5">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.title}</div>
                  <div className="mt-3 tabular text-2xl font-bold text-slate-50">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="mx-auto w-full max-w-xl overflow-hidden p-0">
          <div className="border-b border-slate-800 bg-slate-950/50 px-8 py-7">
            <SectionTitle eyebrow="Welcome Back" title="회원 로그인" description="로그인 후 대시보드와 네트워크 화면을 바로 사용할 수 있습니다." />
          </div>
          <form className="space-y-5 px-8 py-8" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Login ID</span>
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
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password</span>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <TextField
                  className="pl-11"
                  type="password"
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
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
