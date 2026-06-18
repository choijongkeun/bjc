import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, CheckCircle2, LockKeyhole, UserRound, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, getErrorMessage, type BinaryPosition } from "@/lib/api";
import { isPasswordConfirmationValid, syncReferralResolutionOnCodeChange, type ReferralResolved } from "@/lib/register";
import { useSessionStore } from "@/store/sessionStore";
import { Button, Card, SectionTitle, SelectField, TextField } from "@/components/ui";
import { FeedbackState } from "@/components/FeedbackState";

export default function RegisterPage() {
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const setSession = useSessionStore((state) => state.setSession);
  const [loginId, setLoginId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [preferredBinaryPosition, setPreferredBinaryPosition] = useState<"" | BinaryPosition>("");
  const [resolvedReferral, setResolvedReferral] = useState<ReferralResolved | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const passwordValid = useMemo(
    () => isPasswordConfirmationValid(password, passwordConfirm),
    [password, passwordConfirm]
  );

  useEffect(() => {
    if (accessToken) {
      navigate("/dashboard", { replace: true });
    }
  }, [accessToken, navigate]);

  function handleReferralCodeChange(value: string) {
    setReferralCode(value);
    setResolvedReferral((current) => syncReferralResolutionOnCodeChange(current, value));
    setVerifyMessage(null);
    setError(null);
  }

  async function handleVerifyReferral() {
    if (!referralCode.trim()) {
      setVerifyMessage("추천인 코드를 입력해 주세요.");
      setResolvedReferral(null);
      return;
    }

    try {
      setVerifyLoading(true);
      const result = await api.resolveReferral(referralCode.trim());
      setResolvedReferral({
        referral_code: referralCode.trim(),
        sponsor_account_id: result.sponsor_account_id,
        sponsor_login_id: result.sponsor_login_id,
        sponsor_display_name: result.sponsor_display_name,
      });
      setVerifyMessage(null);
    } catch (verifyError) {
      setResolvedReferral(null);
      setVerifyMessage(getErrorMessage(verifyError));
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!loginId.trim() || !displayName.trim()) {
      setError("로그인 ID와 표시 이름을 모두 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!passwordValid) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!referralCode.trim()) {
      setError("추천인 코드를 입력해 주세요.");
      return;
    }
    if (!resolvedReferral) {
      setError("추천인 코드를 먼저 확인해 주세요.");
      return;
    }

    try {
      setSubmitLoading(true);
      const result = await api.register({
        login_id: loginId.trim(),
        display_name: displayName.trim(),
        password,
        referral_code: referralCode.trim(),
        preferred_binary_position: preferredBinaryPosition || undefined,
      });
      setSession(result.access_token, result.account);
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-6 py-16">
      <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr,0.95fr]">
        <Card className="hidden p-8 lg:block">
          <div className="text-xs uppercase tracking-[0.22em] text-emerald-300">BJC Onboarding</div>
          <h1 className="mt-5 max-w-xl text-5xl font-extrabold tracking-tight text-slate-50">추천인 검증 후 바로 가입되는 회원 등록 흐름</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">
            `template/signup.html`의 sponsor verification 블록과 단계형 onboarding 레이아웃을 기준으로, 실제 `register` API와 연결되는 가입 화면으로 재구성했습니다.
          </p>
          <div className="mt-10 space-y-4">
            {[
              "추천인 코드가 바뀌면 기존 확인 상태를 자동으로 초기화합니다.",
              "가입 성공 시 access_token과 account를 즉시 저장하고 대시보드로 이동합니다.",
              "preferred_binary_position은 LEFT / RIGHT / 미선택으로만 제한합니다.",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-[24px] border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mx-auto w-full max-w-xl overflow-hidden p-0">
          <div className="border-b border-slate-800 bg-slate-950/50 px-8 py-7">
            <SectionTitle eyebrow="Create Account" title="회원가입" description="추천인 코드를 확인한 뒤 회원가입을 진행합니다." />
          </div>
          <form className="space-y-5 px-8 py-8" onSubmit={handleSubmit}>
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Login ID</span>
                <div className="relative">
                  <UserRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <TextField className="pl-11" value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="회원 로그인 ID" />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Display Name</span>
                <div className="relative">
                  <BadgeCheck className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <TextField className="pl-11" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="표시 이름" />
                </div>
              </label>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <TextField
                    className="pl-11"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="8자 이상"
                  />
                </div>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password Confirm</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <TextField
                    className="pl-11"
                    type="password"
                    autoComplete="new-password"
                    value={passwordConfirm}
                    onChange={(event) => setPasswordConfirm(event.target.value)}
                    placeholder="비밀번호 확인"
                  />
                </div>
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preferred Binary Position</span>
              <SelectField value={preferredBinaryPosition} onChange={(event) => setPreferredBinaryPosition(event.target.value as "" | BinaryPosition)}>
                <option value="">미선택</option>
                <option value="LEFT">LEFT</option>
                <option value="RIGHT">RIGHT</option>
              </SelectField>
            </label>

            <div className="rounded-[28px] border border-slate-800 bg-slate-950/45 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Referral Verification</div>
                  <div className="mt-2 text-sm text-slate-400">추천인 코드 확인이 완료되어야 가입 버튼이 활성화됩니다.</div>
                </div>
                {resolvedReferral ? <FeedbackState title="추천인 확인 완료" description={`${resolvedReferral.sponsor_login_id} / ${resolvedReferral.sponsor_display_name}`} tone="success" /> : null}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[1fr,auto]">
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <TextField
                    className="pl-11"
                    value={referralCode}
                    onChange={(event) => handleReferralCodeChange(event.target.value)}
                    placeholder="추천인 코드"
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void handleVerifyReferral()} disabled={!referralCode.trim() || verifyLoading}>
                  {verifyLoading ? "확인 중..." : "추천인 확인"}
                </Button>
              </div>

              {verifyMessage ? <div className="mt-3"><FeedbackState title="추천인 확인" description={verifyMessage} tone="error" /></div> : null}

              {resolvedReferral ? (
                <div className="mt-4 rounded-[24px] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  <div className="font-semibold">sponsor_login_id: {resolvedReferral.sponsor_login_id}</div>
                  <div className="mt-1">sponsor_display_name: {resolvedReferral.sponsor_display_name}</div>
                </div>
              ) : null}
            </div>

            {!passwordValid && passwordConfirm ? (
              <FeedbackState title="비밀번호 확인 필요" description="비밀번호와 비밀번호 확인 값이 일치해야 합니다." tone="error" />
            ) : null}
            {error ? <FeedbackState title="회원가입 실패" description={error} tone="error" /> : null}

            <Button
              className="w-full"
              type="submit"
              disabled={
                submitLoading ||
                !loginId.trim() ||
                !displayName.trim() ||
                !referralCode.trim() ||
                !resolvedReferral ||
                !passwordValid
              }
            >
              {submitLoading ? "가입 중..." : "가입 후 대시보드로 이동"}
              {!submitLoading ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
            </Button>

            <div className="rounded-[24px] border border-slate-800 bg-slate-950/45 p-4 text-sm text-slate-400">
              이미 계정이 있나요?{" "}
              <Link className="font-semibold text-blue-300 hover:text-blue-200" to="/login">
                로그인으로 이동
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
