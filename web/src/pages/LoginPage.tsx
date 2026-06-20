import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { useSessionStore } from "@/store/sessionStore";
import { Button, Card, FeedbackState } from "@/components/ui";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useSessionStore((state) => state.login);
  const status = useSessionStore((state) => state.status);
  const storedError = useSessionStore((state) => state.error);
  const [actorId, setActorId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const role = await login(actorId.trim());
      if (role === "ADMIN" || role === "READER") {
        navigate("/admin?tab=policies", { replace: true });
      }
    } catch (submitError: any) {
      setError(submitError.message ?? "로그인에 실패했습니다.");
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
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">BJC Staking Admin</div>
                <h1 className="mt-1 text-2xl font-extrabold text-slate-50">헤더 기반 로그인</h1>
              </div>
            </div>
          </div>
          <form className="space-y-5 px-8 py-8" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-300" htmlFor="actor-account-id">
                Actor Account ID
              </label>
              <input
                id="actor-account-id"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 font-mono text-sm text-slate-100"
                placeholder="UUID"
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
              />
              <p className="mt-2 text-xs text-slate-500">백엔드가 `x-actor-account-id` 헤더로 권한을 판정합니다. 로그인 시 ADMIN/READER를 자동 추론합니다.</p>
            </div>
            {error || storedError ? <FeedbackState title="로그인 오류" description={error ?? storedError ?? ""} tone="error" /> : null}
            <Button className="w-full" type="submit" disabled={!actorId.trim() || status === "loading"}>
              {status === "loading" ? "검증 중..." : "로그인"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
