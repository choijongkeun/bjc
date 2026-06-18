import { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { api, getErrorMessage, type BinaryLegsResponse, type BinaryTreeResponse, type DownlineItem, type ReferralTreeResponse } from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { useSessionStore } from "@/store/sessionStore";
import { BinaryLegsCard } from "@/components/BinaryLegsCard";
import { FeedbackState } from "@/components/FeedbackState";
import { NetworkTree, binaryTreeToDisplay, flattenNetworkTree, referralTreeToDisplay } from "@/components/NetworkTree";
import { Pagination } from "@/components/Pagination";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle, SelectField, TableShell } from "@/components/ui";

export default function NetworkPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const account = useSessionStore((state) => state.account);
  const setAccount = useSessionStore((state) => state.setAccount);
  const [depth, setDepth] = useState(3);
  const [type, setType] = useState<"referral" | "binary">("referral");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [referralTree, setReferralTree] = useState<ReferralTreeResponse | null>(null);
  const [binaryTree, setBinaryTree] = useState<BinaryTreeResponse | null>(null);
  const [legs, setLegs] = useState<BinaryLegsResponse | null>(null);
  const [downlines, setDownlines] = useState<DownlineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [depth, type, limit]);

  async function load() {
    try {
      setLoading(true);
      const [meResult, referralResult, binaryResult, legsResult, downlineResult] = await Promise.all([
        api.me(accessToken),
        api.getMyReferralTree({ depth }, accessToken),
        api.getMyBinaryTree({ depth }, accessToken),
        api.getMyBinaryLegs(accessToken),
        api.getMyDownlines({ type, depth, page, limit }, accessToken),
      ]);
      setAccount(meResult.account);
      setReferralTree(referralResult);
      setBinaryTree(binaryResult);
      setLegs(legsResult);
      setDownlines(downlineResult.items);
      setTotal(downlineResult.total);
      setError(null);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [accessToken, depth, type, page, limit]);

  const referralDisplay = useMemo(
    () => (referralTree ? referralTreeToDisplay(referralTree) : null),
    [referralTree]
  );
  const binaryDisplay = useMemo(
    () => (binaryTree ? binaryTreeToDisplay(binaryTree) : null),
    [binaryTree]
  );

  const referralNodeCount = referralDisplay ? flattenNetworkTree(referralDisplay).length : 0;
  const binaryNodeCount = binaryDisplay ? flattenNetworkTree(binaryDisplay).length : 0;

  return (
    <UserShell
      title="Network"
      subtitle="추천 조직도, 바이너리 조직도, 레그 요약과 하위 회원 목록을 현재 세션 기준으로 조회합니다."
      actions={
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCcw className="mr-2 h-4 w-4" />
          새로고침
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <SectionTitle
              eyebrow="Network Control"
              title={`${account?.display_name ?? account?.login_id ?? "회원"} 기준 네트워크`}
              description="depth 기본값은 3이고 최대 10까지 확장됩니다. downlines는 referral / binary 타입 전환과 pagination을 지원합니다."
            />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm text-slate-400">
                <span>depth</span>
                <SelectField value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </SelectField>
              </label>
              <label className="space-y-2 text-sm text-slate-400">
                <span>type</span>
                <SelectField value={type} onChange={(event) => setType(event.target.value as "referral" | "binary")}>
                  <option value="referral">referral</option>
                  <option value="binary">binary</option>
                </SelectField>
              </label>
              <label className="space-y-2 text-sm text-slate-400">
                <span>limit</span>
                <SelectField value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </SelectField>
              </label>
            </div>
          </div>
        </Card>

        {error ? <FeedbackState title="네트워크 조회 오류" description={error} tone="error" /> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">display_name</div>
            <div className="mt-3 text-xl font-bold text-slate-50">{account?.display_name ?? "-"}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">login_id</div>
            <div className="mt-3 text-xl font-bold text-slate-50">{account?.login_id ?? "-"}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">추천 조직 노드 수</div>
            <div className="mt-3 tabular text-xl font-bold text-slate-50">{referralNodeCount}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">바이너리 조직 노드 수</div>
            <div className="mt-3 tabular text-xl font-bold text-slate-50">{binaryNodeCount}</div>
          </Card>
        </div>

        <BinaryLegsCard legs={legs} />

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <SectionTitle eyebrow="Referral Tree" title="추천 조직도" description="depth indentation 기반 nested card 구조로 표시합니다." />
            <div className="mt-5">
              <NetworkTree node={referralDisplay} title="Referral Root" variant="referral" />
            </div>
          </Card>

          <Card>
            <SectionTitle eyebrow="Binary Tree" title="바이너리 조직도" description="LEFT / RIGHT와 root_leg badge를 함께 표시합니다." />
            <div className="mt-5">
              <NetworkTree node={binaryDisplay} title="Binary Root" variant="binary" />
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle eyebrow="Downlines" title="하위 회원 목록" description={`type=${type}, depth=${depth}, page=${page} 기준 결과입니다.`} />
            <Badge tone="slate">총 {total}건</Badge>
          </div>
          <div className="mt-5">
            <TableShell className="max-h-[480px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>login_id</th>
                    <th>display_name</th>
                    <th>depth</th>
                    <th>sponsor</th>
                    <th>binary parent</th>
                    <th>position</th>
                    <th>root_leg</th>
                    <th>reward(base)</th>
                    <th>rank</th>
                    <th>joined_at</th>
                  </tr>
                </thead>
                <tbody>
                  {downlines.length > 0 ? (
                    downlines.map((item) => (
                      <tr key={item.account_id}>
                        <td className="font-semibold text-slate-100">{item.login_id ?? "-"}</td>
                        <td>{item.display_name ?? "-"}</td>
                        <td className="tabular text-right">{item.depth}</td>
                        <td className="font-mono text-xs text-slate-500">{item.sponsor_account_id?.slice(0, 8) ?? "-"}</td>
                        <td className="font-mono text-xs text-slate-500">{item.binary_parent_account_id?.slice(0, 8) ?? "-"}</td>
                        <td>{item.binary_position ?? "-"}</td>
                        <td>{item.root_leg ?? "-"}</td>
                        <td className="tabular text-right">{formatBaseAmount(item.total_reward_amount_base, 0)}</td>
                        <td className="tabular text-right">{item.rank_level}</td>
                        <td>{item.joined_at ?? "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10}>
                        <div className="py-6 text-center text-slate-500">현재 조건에서 조회된 하위 회원이 없습니다.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableShell>
            <div className="mt-4">
              <Pagination page={page} limit={limit} total={total} onChange={setPage} />
            </div>
          </div>
        </Card>

        {loading ? <FeedbackState title="네트워크 로딩 중" description="referral-tree, binary-tree, binary-legs, downlines를 불러오고 있습니다." /> : null}
      </div>
    </UserShell>
  );
}
