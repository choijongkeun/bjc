import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, GitBranch, RefreshCcw, Search, Users } from "lucide-react";
import {
  api,
  type AdminAccountDetail,
  type BinaryLegsResponse,
  type BinaryTreeNode,
  type BinaryTreeResponse,
  type DownlineItem,
  type ReferralTreeNode,
  type ReferralTreeResponse,
  type SessionRole
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { getDisplayLabel } from "@/lib/display";
import { Button, Card, FeedbackState, Pagination, StatusBadge, TableShell, cn } from "@/components/ui";

function formatDateTime(value: string | null | undefined) {
  return value ?? "-";
}

function formatBaseMetric(value: string) {
  return formatBaseAmount(value, 0);
}

function formatAccountLabel(loginId: string | null, displayName: string | null) {
  if (loginId && displayName) return `${loginId} / ${displayName}`;
  return loginId ?? displayName ?? "이름 없음";
}

function ReferralNodeTree({
  nodes,
  level = 0,
}: {
  nodes: ReferralTreeNode[];
  level?: number;
}) {
  if (nodes.length === 0) return <div className="text-sm text-slate-500">하위 추천 조직이 없습니다.</div>;

  return (
    <div className="space-y-3">
      {nodes.map((node) => (
        <div key={node.account_id} className="space-y-3" style={{ marginLeft: level * 20 }}>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.26)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs tracking-[0.18em] text-slate-500">추천 회원</div>
                <div className="mt-2 text-sm font-semibold text-slate-100">{formatAccountLabel(node.login_id, node.display_name)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full bg-slate-800 px-2.5 py-1">{node.depth}단계</span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1">추천인 ID {node.sponsor_account_id?.slice(0, 8) ?? "-"}</span>
                </div>
              </div>
              <div className="grid gap-2 text-right">
                <div className="text-xs tracking-[0.18em] text-slate-500">누적 보상</div>
                <div className="tabular text-sm font-semibold text-slate-100">{formatBaseMetric(node.total_reward_amount_base)}</div>
              </div>
            </div>
          </div>
          {node.children.length > 0 ? <ReferralNodeTree nodes={node.children} level={level + 1} /> : null}
        </div>
      ))}
    </div>
  );
}

function BinaryNodeTree({
  node,
  level = 0,
}: {
  node: BinaryTreeNode;
  level?: number;
}) {
  return (
    <div className="space-y-3" style={{ marginLeft: level * 20 }}>
      <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4 shadow-[0_18px_40px_rgba(2,6,23,0.26)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs tracking-[0.18em] text-slate-500">바이너리 회원</div>
            <div className="mt-2 text-sm font-semibold text-slate-100">{formatAccountLabel(node.login_id, node.display_name)}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-slate-800 px-2.5 py-1">{node.depth}단계</span>
              <span className={cn("rounded-full px-2.5 py-1", node.binary_position === "LEFT" ? "bg-blue-500/15 text-blue-200" : node.binary_position === "RIGHT" ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-800 text-slate-300")}>
                {node.binary_position ? getDisplayLabel(node.binary_position) : "최상위"}
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1">기준 레그 {node.root_leg ? getDisplayLabel(node.root_leg) : "-"}</span>
            </div>
          </div>
          <div className="grid gap-2 text-right">
            <div className="text-xs tracking-[0.18em] text-slate-500">누적 매출</div>
            <div className="tabular text-sm font-semibold text-slate-100">{formatBaseMetric(node.total_sales_amount_base)}</div>
          </div>
        </div>
      </div>
      {node.children.length > 0 ? (
        <div className="space-y-3">
          {node.children.map((child) => (
            <BinaryNodeTree key={child.account_id} node={child} level={level + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildReferralRootTree(tree: ReferralTreeResponse | null) {
  if (!tree) return null;
  return {
    account_id: tree.root.account_id,
    login_id: tree.root.login_id,
    display_name: tree.root.display_name,
    referral_code: tree.root.referral_code,
    sponsor_account_id: tree.root.sponsor_account_id,
    depth: tree.root.depth,
    rank_level: tree.root.rank_level,
    total_stake_amount_base: tree.root.total_stake_amount_base,
    total_reward_amount_base: tree.root.total_reward_amount_base,
    children: tree.children,
  };
}

export function NetworkTab({
  actorId,
  role,
  selectedAccountId,
  onSelectAccountId,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  onSelectAccountId: (accountId: string) => void;
}) {
  const [accountInput, setAccountInput] = useState(selectedAccountId ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; login_id: string | null; display_name: string | null }>>([]);
  const [selectedAccount, setSelectedAccount] = useState<AdminAccountDetail | null>(null);
  const [referralTree, setReferralTree] = useState<ReferralTreeResponse | null>(null);
  const [binaryTree, setBinaryTree] = useState<BinaryTreeResponse | null>(null);
  const [legs, setLegs] = useState<BinaryLegsResponse | null>(null);
  const [downlines, setDownlines] = useState<DownlineItem[]>([]);
  const [downlineTotal, setDownlineTotal] = useState(0);
  const [depth, setDepth] = useState(3);
  const [downlineType, setDownlineType] = useState<"referral" | "binary">("referral");
  const [downlinePage, setDownlinePage] = useState(1);
  const [downlineLimit, setDownlineLimit] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const referralRoot = useMemo(() => buildReferralRootTree(referralTree), [referralTree]);

  useEffect(() => {
    setAccountInput(selectedAccountId ?? "");
  }, [selectedAccountId]);

  useEffect(() => {
    if (!selectedAccountId) {
      setSelectedAccount(null);
      setReferralTree(null);
      setBinaryTree(null);
      setLegs(null);
      setDownlines([]);
      setDownlineTotal(0);
      return;
    }

    async function load() {
      try {
        const [accountResult, referralResult, binaryResult, legsResult, downlineResult] = await Promise.all([
          api.getAdminAccount(actorId, selectedAccountId),
          api.getAdminAccountReferralTree(actorId, selectedAccountId, { depth }),
          api.getAdminAccountBinaryTree(actorId, selectedAccountId, { depth }),
          api.getAdminAccountBinaryLegs(actorId, selectedAccountId),
          api.getAdminAccountDownlines(actorId, selectedAccountId, {
            type: downlineType,
            depth,
            page: downlinePage,
            limit: downlineLimit,
          }),
        ]);
        setSelectedAccount(accountResult.account);
        setReferralTree(referralResult);
        setBinaryTree(binaryResult);
        setLegs(legsResult);
        setDownlines(downlineResult.items);
        setDownlineTotal(downlineResult.total);
        setError(null);
      } catch (loadError: any) {
        setError(loadError.message ?? "조직도 데이터를 불러오지 못했습니다.");
      }
    }

    void load();
  }, [actorId, selectedAccountId, depth, downlineType, downlinePage, downlineLimit]);

  useEffect(() => {
    setDownlinePage(1);
  }, [selectedAccountId, downlineType, depth, downlineLimit]);

  async function searchAccounts() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    try {
      const result = await api.listAdminAccounts(actorId, {
        q: searchQuery.trim(),
        page: 1,
        limit: 8,
        sort: "login_id_asc",
      });
      setSearchResults(result.items.map((item) => ({
        id: item.id,
        login_id: item.login_id,
        display_name: item.display_name,
      })));
      setSearchError(null);
    } catch (loadError: any) {
      setSearchError(loadError.message ?? "회원 검색에 실패했습니다.");
    }
  }

  function selectAccount(accountId: string) {
    onSelectAccountId(accountId);
    setAccountInput(accountId);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">회원 조직 / 레그 조회</h2>
            <p className="text-sm text-slate-400">선택 회원 기준으로 추천 조직도, 바이너리 조직도, 레그 요약과 하위 회원 목록을 조회합니다.</p>
          </div>
          <Button variant="secondary" onClick={() => selectedAccountId && onSelectAccountId(selectedAccountId)}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            다시 조회
          </Button>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs tracking-[0.18em] text-slate-500">회원 선택</div>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[260px] flex-1 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono text-sm"
                placeholder="회원 ID 입력"
                value={accountInput}
                onChange={(e) => setAccountInput(e.target.value)}
              />
              <Button onClick={() => accountInput.trim() && selectAccount(accountInput.trim())}>
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                회원 불러오기
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[260px] flex-1 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm"
                placeholder="아이디 / 이름 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button variant="secondary" onClick={() => void searchAccounts()}>
                <Search className="mr-2 h-4 w-4" />
                검색
              </Button>
            </div>
            {searchError ? <FeedbackState title="검색 오류" description={searchError} tone="error" /> : null}
            {searchResults.length > 0 ? (
              <div className="grid gap-2">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-left transition hover:border-blue-400/30 hover:bg-slate-900"
                    onClick={() => selectAccount(item.id)}
                  >
                    <div className="text-sm font-semibold text-slate-100">{formatAccountLabel(item.login_id, item.display_name)}</div>
                    <div className="mt-1 font-mono text-xs text-slate-500">{item.id}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">아이디 또는 이름으로 회원을 검색하거나 회원 ID를 직접 입력해 주세요.</div>
            )}
          </div>
          <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs tracking-[0.18em] text-slate-500">조회 설정</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm text-slate-400">
                <span>조회 단계</span>
                <select className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-400">
                <span>조직 구분</span>
                <select className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={downlineType} onChange={(e) => setDownlineType(e.target.value as "referral" | "binary")}>
                  <option value="referral">추천 조직</option>
                  <option value="binary">바이너리 조직</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-400">
                <span>페이지 크기</span>
                <select className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={downlineLimit} onChange={(e) => setDownlineLimit(Number(e.target.value))}>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
            <FeedbackState title={role === "ADMIN" ? "조회 화면" : "조회 전용"} description="조직도와 하위 회원 현황을 확인할 수 있습니다." />
          </div>
        </div>
      </Card>

      {error ? <FeedbackState title="네트워크 조회 오류" description={error} tone="error" /> : null}

      {!selectedAccount ? (
        <Card>
          <FeedbackState title="선택된 회원 없음" description="회원 관리에서 회원을 선택하거나 위에서 회원을 검색해 주세요." />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs tracking-[0.18em] text-slate-500">선택한 회원</div>
                <h3 className="mt-2 text-xl font-bold text-slate-50">{formatAccountLabel(selectedAccount.login_id, selectedAccount.display_name)}</h3>
                <div className="mt-2 break-all font-mono text-xs text-slate-500">{selectedAccount.id}</div>
              </div>
              <div className="grid gap-2 text-sm text-slate-300 md:text-right">
                <div>추천인: {selectedAccount.sponsor_login_id ?? "-"} / {selectedAccount.sponsor_display_name ?? "-"}</div>
                <div>바이너리 상위: {selectedAccount.binary_parent_login_id ?? "-"} / {selectedAccount.binary_parent_display_name ?? "-"}</div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <StatusBadge value={selectedAccount.role} />
                  <StatusBadge value={selectedAccount.status} />
                  <StatusBadge value={selectedAccount.binary_position ?? "최상위"} />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="xl:col-span-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-500/15 p-3 text-blue-200"><GitBranch className="h-5 w-5" /></div>
                <div>
                  <div className="text-xs tracking-[0.16em] text-slate-500">좌측 레그</div>
                  <div className="mt-1 tabular text-2xl font-bold text-slate-50">{legs?.left.member_count ?? 0}명</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                <div>스테이킹 금액: <span className="tabular text-slate-200">{formatBaseMetric(legs?.left.total_stake_amount_base ?? "0")}</span></div>
                <div>누적 매출: <span className="tabular text-slate-200">{formatBaseMetric(legs?.left.total_sales_amount_base ?? "0")}</span></div>
                <div>누적 보상: <span className="tabular text-slate-200">{formatBaseMetric(legs?.left.total_reward_amount_base ?? "0")}</span></div>
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-200"><Users className="h-5 w-5" /></div>
                <div>
                  <div className="text-xs tracking-[0.16em] text-slate-500">우측 레그</div>
                  <div className="mt-1 tabular text-2xl font-bold text-slate-50">{legs?.right.member_count ?? 0}명</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                <div>스테이킹 금액: <span className="tabular text-slate-200">{formatBaseMetric(legs?.right.total_stake_amount_base ?? "0")}</span></div>
                <div>누적 매출: <span className="tabular text-slate-200">{formatBaseMetric(legs?.right.total_sales_amount_base ?? "0")}</span></div>
                <div>누적 보상: <span className="tabular text-slate-200">{formatBaseMetric(legs?.right.total_reward_amount_base ?? "0")}</span></div>
              </div>
            </Card>
            <Card>
              <div className="text-xs tracking-[0.16em] text-slate-500">약한 레그</div>
              <div className="mt-2"><StatusBadge value={legs?.weak_leg ?? "LEFT"} /></div>
              <div className="mt-4 text-sm text-slate-400">약한 레그 매출</div>
              <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseMetric(legs?.weak_leg_volume_base ?? "0")}</div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-50">추천 조직도</h3>
                <p className="text-sm text-slate-400">선택한 회원 기준의 추천 조직도를 표시합니다.</p>
              </div>
              {referralRoot ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                    <div className="text-xs tracking-[0.18em] text-blue-200/80">추천 조직 시작점</div>
                    <div className="mt-2 text-base font-semibold text-slate-50">{formatAccountLabel(referralRoot.login_id, referralRoot.display_name)}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full bg-slate-950/60 px-2.5 py-1">{referralRoot.depth}단계</span>
                      <span className="rounded-full bg-slate-950/60 px-2.5 py-1">추천 코드 {referralRoot.referral_code ?? "-"}</span>
                    </div>
                  </div>
                  <ReferralNodeTree nodes={referralRoot.children} />
                </div>
              ) : (
                <FeedbackState title="추천 조직 없음" description="현재 depth 기준으로 조회된 추천 하위 조직이 없습니다." />
              )}
            </Card>

            <Card>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-50">바이너리 조직도</h3>
                <p className="text-sm text-slate-400">선택한 회원 기준의 바이너리 조직도를 표시합니다.</p>
              </div>
              {binaryTree?.root ? <BinaryNodeTree node={binaryTree.root} /> : <FeedbackState title="바이너리 조직 없음" description="현재 depth 기준으로 조회된 바이너리 하위 조직이 없습니다." />}
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-50">하위 회원 목록</h3>
                <p className="text-sm text-slate-400">{downlineType === "referral" ? "추천 조직" : "바이너리 조직"} / {depth}단계 기준</p>
              </div>
              <div className="text-sm text-slate-400">
                총 <span className="tabular text-slate-100">{downlineTotal}</span>건
              </div>
            </div>
            <TableShell height="max-h-[480px]">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>아이디</th>
                    <th>이름</th>
                    <th>단계</th>
                    <th>추천인</th>
                    <th>바이너리 상위</th>
                    <th>위치</th>
                    <th>기준 레그</th>
                    <th>누적 보상</th>
                    <th>직급</th>
                    <th>가입일</th>
                  </tr>
                </thead>
                <tbody>
                  {downlines.map((item) => (
                    <tr key={item.account_id}>
                      <td className="font-semibold text-slate-100">{item.login_id ?? "-"}</td>
                      <td>{item.display_name ?? "-"}</td>
                      <td className="tabular text-right">{item.depth}</td>
                      <td className="font-mono text-xs text-slate-500">{item.sponsor_account_id?.slice(0, 8) ?? "-"}</td>
                      <td className="font-mono text-xs text-slate-500">{item.binary_parent_account_id?.slice(0, 8) ?? "-"}</td>
                      <td>{item.binary_position ?? "-"}</td>
                      <td>{item.root_leg ?? "-"}</td>
                      <td className="tabular text-right">{formatBaseMetric(item.total_reward_amount_base)}</td>
                      <td className="tabular text-right">{item.rank_level}</td>
                      <td>{formatDateTime(item.joined_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
            <div className="mt-4">
              <Pagination page={downlinePage} limit={downlineLimit} total={downlineTotal} onChange={setDownlinePage} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
