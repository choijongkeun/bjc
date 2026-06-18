import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Copy, FolderClock, GitBranch, Sparkles, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { api, getErrorMessage, type BinaryLegsResponse } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { useSessionStore } from "@/store/sessionStore";
import { BinaryLegsCard } from "@/components/BinaryLegsCard";
import { FeedbackState } from "@/components/FeedbackState";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";

export default function DashboardPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const account = useSessionStore((state) => state.account);
  const setAccount = useSessionStore((state) => state.setAccount);
  const [legs, setLegs] = useState<BinaryLegsResponse | null>(null);
  const [stakingSummary, setStakingSummary] = useState({
    activeCount: 0,
    pendingCount: 0,
    cancelRequestedCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [meResult, legsResult, activeStakings, pendingStakings, cancelRequestedStakings] = await Promise.all([
          api.me(accessToken),
          api.getMyBinaryLegs(accessToken),
          api.getMyStakings({ status: "ACTIVE", page: 1, limit: 1 }, accessToken),
          api.getMyStakings({ status: "PENDING", page: 1, limit: 1 }, accessToken),
          api.getMyStakings({ status: "CANCEL_REQUESTED", page: 1, limit: 1 }, accessToken),
        ]);
        if (cancelled) return;
        setAccount(meResult.account);
        setLegs(legsResult);
        setStakingSummary({
          activeCount: activeStakings.total,
          pendingCount: pendingStakings.total,
          cancelRequestedCount: cancelRequestedStakings.total,
        });
        setError(null);
      } catch (loadError) {
        if (cancelled) return;
        setError(getErrorMessage(loadError));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken, setAccount]);

  async function copyReferralCode() {
    if (!account?.referral_code) return;
    try {
      await navigator.clipboard.writeText(account.referral_code);
      setCopyMessage("추천 코드가 복사되었습니다.");
      window.setTimeout(() => setCopyMessage(null), 1600);
    } catch {
      setCopyMessage("브라우저 복사에 실패했습니다.");
      window.setTimeout(() => setCopyMessage(null), 1600);
    }
  }

  return (
    <UserShell
      title="Dashboard"
      subtitle="내 계정, 추천 코드, 바이너리 레그 요약을 한 화면에서 확인합니다."
      actions={<Badge tone="blue">{account?.status ?? "ACTIVE"}</Badge>}
    >
      <div className="space-y-6">
        {error ? <FeedbackState title="대시보드 로드 오류" description={error} tone="error" /> : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <Card className="relative overflow-hidden p-6">
            <div className="soft-grid absolute inset-0 opacity-40" />
            <div className="relative">
              <SectionTitle
                eyebrow="Member Dashboard"
                title={`${account?.display_name ?? account?.login_id ?? "회원"} 님, 네트워크 현황입니다.`}
                description="`template/user_dashboard.html`의 hero와 KPI 카드를 기준으로 현재 계정/레그/추천코드 흐름만 먼저 연결했습니다."
              />
              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "활성 스테이킹 건수", value: String(stakingSummary.activeCount), accent: "text-blue-200" },
                  { label: "대기 중 건수", value: String(stakingSummary.pendingCount), accent: "text-cyan-200" },
                  { label: "취소 요청 건수", value: String(stakingSummary.cancelRequestedCount), accent: "text-amber-200" },
                  { label: "총 보상 금액", value: "0", accent: "text-emerald-200" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[24px] border border-slate-800 bg-slate-950/55 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{item.label}</div>
                    <div className={`mt-3 tabular text-3xl font-bold ${item.accent}`}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle eyebrow="Account Snapshot" title="내 계정 요약" description="회원가입과 로그인으로 만들어진 현재 세션 정보를 표시합니다." />
            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <InfoRow label="display_name" value={account?.display_name ?? "-"} />
              <InfoRow label="login_id" value={account?.login_id ?? "-"} />
              <InfoRow label="referral_code" value={account?.referral_code ?? "-"} />
              <InfoRow label="sponsor_account_id" value={account?.sponsor_account_id ?? "-"} mono />
              <InfoRow label="binary_parent_account_id" value={account?.binary_parent_account_id ?? "-"} mono />
              <InfoRow label="binary_position" value={account?.binary_position ?? "ROOT"} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => void copyReferralCode()} disabled={!account?.referral_code}>
                <Copy className="mr-2 h-4 w-4" />
                추천 코드 복사
              </Button>
              <Link to="/network">
                <Button variant="secondary">
                  <GitBranch className="mr-2 h-4 w-4" />
                  내 네트워크 보기
                </Button>
              </Link>
            </div>
            {copyMessage ? <div className="mt-4"><FeedbackState title="복사 상태" description={copyMessage} tone={copyMessage.includes("실패") ? "error" : "success"} /></div> : null}
          </Card>
        </div>

        <BinaryLegsCard legs={legs} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ActionCard
            title="내 네트워크 보기"
            description="추천 조직도, 바이너리 조직도, 하위 회원 목록으로 이동합니다."
            icon={<GitBranch className="h-5 w-5" />}
            href="/network"
          />
          <ActionCard
            title="스테이킹 보기"
            description="상품 목록, 내 스테이킹 목록, 상세 상태 확인 화면으로 이동합니다."
            icon={<FolderClock className="h-5 w-5" />}
            href="/staking"
          />
          <ActionCard title="보상 준비 중" description="정산/보상 내역은 추후 API 연결 후 활성화됩니다." icon={<Sparkles className="h-5 w-5" />} disabled />
          <ActionCard title="출금 준비 중" description="출금 신청과 이력은 현재 범위에 포함하지 않았습니다." icon={<Wallet className="h-5 w-5" />} disabled />
        </div>

        {loading ? <FeedbackState title="데이터 로딩 중" description="auth/me와 binary-legs 응답을 불러오고 있습니다." /> : null}
      </div>
    </UserShell>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[22px] border border-slate-800 bg-slate-950/45 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className={mono ? "break-all font-mono text-slate-100" : "text-slate-100"}>{value}</div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  icon,
  href,
  disabled,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  href?: string;
  disabled?: boolean;
}) {
  const body = (
    <Card className="h-full p-5">
      <div className="flex items-center gap-3 text-blue-200">{icon}</div>
      <div className="mt-4 text-lg font-semibold text-slate-50">{title}</div>
      <div className="mt-2 text-sm text-slate-400">{description}</div>
      <div className="mt-4">
        {disabled ? <Badge tone="slate">Coming Soon</Badge> : <Badge tone="blue">Open</Badge>}
      </div>
    </Card>
  );

  if (disabled || !href) {
    return body;
  }

  return <Link to={href}>{body}</Link>;
}
