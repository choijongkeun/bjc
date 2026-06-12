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
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Referral Node</div>
                <div className="mt-2 text-sm font-semibold text-slate-100">{formatAccountLabel(node.login_id, node.display_name)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span className="rounded-full bg-slate-800 px-2.5 py-1">depth {node.depth}</span>
                  <span className="rounded-full bg-slate-800 px-2.5 py-1">sponsor {node.sponsor_account_id?.slice(0, 8) ?? "-"}</span>
                </div>
              </div>
              <div className="grid gap-2 text-right">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Reward(base)</div>
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
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Binary Node</div>
            <div className="mt-2 text-sm font-semibold text-slate-100">{formatAccountLabel(node.login_id, node.display_name)}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full bg-slate-800 px-2.5 py-1">depth {node.depth}</span>
              <span className={cn("rounded-full px-2.5 py-1", node.binary_position === "LEFT" ? "bg-blue-500/15 text-blue-200" : node.binary_position === "RIGHT" ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-800 text-slate-300")}>
                {node.binary_position ?? "ROOT"}
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1">root_leg {node.root_leg ?? "-"}</span>
            </div>
          </div>
          <div className="grid gap-2 text-right">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Sales(base)</div>
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
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Account Selector</div>
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-[260px] flex-1 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono text-sm"
                placeholder="accountId 입력"
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
                placeholder="login_id / display_name 검색"
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
              <div className="text-sm text-slate-500">login_id 또는 display_name으로 회원을 검색하거나 accountId를 직접 입력해 주세요.</div>
            )}
          </div>
          <div className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">View Controls</div>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-2 text-sm text-slate-400">
                <span>depth</span>
                <select className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 10].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-400">
                <span>downlines type</span>
                <select className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={downlineType} onChange={(e) => setDownlineType(e.target.value as "referral" | "binary")}>
                  <option value="referral">referral</option>
                  <option value="binary">binary</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-400">
                <span>limit</span>
                <select className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" value={downlineLimit} onChange={(e) => setDownlineLimit(Number(e.target.value))}>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>
            <FeedbackState title={role === "ADMIN" ? "조회 전용 화면" : "READER 조회 화면"} description="이번 범위에는 상태 변경, 바이너리 수동 배치, write 버튼을 포함하지 않았습니다." />
          </div>
        </div>
      </Card>

      {error ? <FeedbackState title="네트워크 조회 오류" description={error} tone="error" /> : null}

      {!selectedAccount ? (
        <Card>
          <FeedbackState title="선택된 회원 없음" description="Accounts 탭에서 회원을 선택하거나 위의 accountId 입력/검색으로 조회 대상을 지정해 주세요." />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Selected Account</div>
                <h3 className="mt-2 text-xl font-bold text-slate-50">{formatAccountLabel(selectedAccount.login_id, selectedAccount.display_name)}</h3>
                <div className="mt-2 break-all font-mono text-xs text-slate-500">{selectedAccount.id}</div>
              </div>
              <div className="grid gap-2 text-sm text-slate-300 md:text-right">
                <div>sponsor: {selectedAccount.sponsor_login_id ?? "-"} / {selectedAccount.sponsor_display_name ?? "-"}</div>
                <div>binary parent: {selectedAccount.binary_parent_login_id ?? "-"} / {selectedAccount.binary_parent_display_name ?? "-"}</div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <StatusBadge value={selectedAccount.role} />
                  <StatusBadge value={selectedAccount.status} />
                  <StatusBadge value={selectedAccount.binary_position ?? "ROOT"} />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card className="xl:col-span-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-500/15 p-3 text-blue-200"><GitBranch className="h-5 w-5" /></div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Left Leg</div>
                  <div className="mt-1 tabular text-2xl font-bold text-slate-50">{legs?.left.member_count ?? 0}명</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                <div>stake(base): <span className="tabular text-slate-200">{formatBaseMetric(legs?.left.total_stake_amount_base ?? "0")}</span></div>
                <div>sales(base): <span className="tabular text-slate-200">{formatBaseMetric(legs?.left.total_sales_amount_base ?? "0")}</span></div>
                <div>reward(base): <span className="tabular text-slate-200">{formatBaseMetric(legs?.left.total_reward_amount_base ?? "0")}</span></div>
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-emerald-500/15 p-3 text-emerald-200"><Users className="h-5 w-5" /></div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Right Leg</div>
                  <div className="mt-1 tabular text-2xl font-bold text-slate-50">{legs?.right.member_count ?? 0}명</div>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-slate-400">
                <div>stake(base): <span className="tabular text-slate-200">{formatBaseMetric(legs?.right.total_stake_amount_base ?? "0")}</span></div>
                <div>sales(base): <span className="tabular text-slate-200">{formatBaseMetric(legs?.right.total_sales_amount_base ?? "0")}</span></div>
                <div>reward(base): <span className="tabular text-slate-200">{formatBaseMetric(legs?.right.total_reward_amount_base ?? "0")}</span></div>
              </div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Weak Leg</div>
              <div className="mt-2"><StatusBadge value={legs?.weak_leg ?? "LEFT"} /></div>
              <div className="mt-4 text-sm text-slate-400">weak_leg_volume_base</div>
              <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseMetric(legs?.weak_leg_volume_base ?? "0")}</div>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-50">추천 조직도</h3>
                <p className="text-sm text-slate-400">`template/binary_network.html`의 glass panel 톤을 참고해 nested card로 단순 표현했습니다.</p>
              </div>
              {referralRoot ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-blue-200/80">Referral Root</div>
                    <div className="mt-2 text-base font-semibold text-slate-50">{formatAccountLabel(referralRoot.login_id, referralRoot.display_name)}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
                      <span className="rounded-full bg-slate-950/60 px-2.5 py-1">depth {referralRoot.depth}</span>
                      <span className="rounded-full bg-slate-950/60 px-2.5 py-1">referral {referralRoot.referral_code ?? "-"}</span>
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
                <p className="text-sm text-slate-400">LEFT/RIGHT badge와 root_leg를 표시하는 단순 nested tree입니다.</p>
              </div>
              {binaryTree?.root ? <BinaryNodeTree node={binaryTree.root} /> : <FeedbackState title="바이너리 조직 없음" description="현재 depth 기준으로 조회된 바이너리 하위 조직이 없습니다." />}
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-50">하위 회원 목록</h3>
                <p className="text-sm text-slate-400">type={downlineType}, depth={depth} 기준으로 pagination을 적용합니다.</p>
              </div>
              <div className="text-sm text-slate-400">
                총 <span className="tabular text-slate-100">{downlineTotal}</span>건
              </div>
            </div>
            <TableShell height="max-h-[480px]">
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
