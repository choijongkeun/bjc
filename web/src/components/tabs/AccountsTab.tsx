import { useEffect, useMemo, useState } from "react";
import { ArrowRightCircle, RefreshCcw, Search } from "lucide-react";
import {
  api,
  type AdminAccountDetail,
  type AdminAccountListItem,
  type AdminAccountSort,
  type BinaryPosition,
  type SessionRole
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { Button, Card, FeedbackState, Pagination, StatusBadge, TableShell } from "@/components/ui";

type AccountFilters = {
  q: string;
  role: "" | SessionRole;
  status: "" | "ACTIVE" | "BLOCKED" | "WITHDRAWN";
  binary_position: "" | BinaryPosition;
};

const defaultFilters: AccountFilters = {
  q: "",
  role: "",
  status: "",
  binary_position: ""
};

function formatDateTime(value: string | null | undefined) {
  return value ?? "-";
}

function formatBaseMetric(value: string) {
  return formatBaseAmount(value, 0);
}

export function AccountsTab({
  actorId,
  role,
  selectedAccountId,
  onSelectAccount,
  onOpenNetwork,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  onOpenNetwork: (accountId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<AdminAccountSort>("joined_at_desc");
  const [draftFilters, setDraftFilters] = useState<AccountFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<AccountFilters>(defaultFilters);
  const [items, setItems] = useState<AdminAccountListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AdminAccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const activeAccountId = useMemo(() => selectedAccountId ?? selected?.id ?? null, [selectedAccountId, selected?.id]);

  async function loadAccounts(targetPage = page, targetLimit = limit, filters = appliedFilters, targetSort = sort) {
    try {
      const result = await api.listAdminAccounts(actorId, {
        q: filters.q || undefined,
        role: filters.role || undefined,
        status: filters.status || undefined,
        binary_position: filters.binary_position || undefined,
        page: targetPage,
        limit: targetLimit,
        sort: targetSort,
      });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
      if (!selectedAccountId && result.items[0] && !selected) {
        onSelectAccount(result.items[0].id);
      }
    } catch (loadError: any) {
      setError(loadError.message ?? "회원 목록을 불러오지 못했습니다.");
    }
  }

  async function loadAccountDetail(accountId: string) {
    try {
      const result = await api.getAdminAccount(actorId, accountId);
      setSelected(result.account);
      setDetailError(null);
    } catch (loadError: any) {
      setSelected(null);
      setDetailError(loadError.message ?? "회원 상세를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, [actorId, page, limit, sort, appliedFilters]);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }
    void loadAccountDetail(selectedAccountId);
  }, [actorId, selectedAccountId]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">회원 목록</h2>
            <p className="text-sm text-slate-400">회원 검색, 역할/상태 필터, sponsor/binary 관계를 조회합니다.</p>
          </div>
          <Button variant="secondary" onClick={() => void loadAccounts()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
        {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">
            <input
              className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
              placeholder="login_id / display_name / referral_code"
              value={draftFilters.q}
              onChange={(e) => setDraftFilters((current) => ({ ...current, q: e.target.value }))}
            />
          </div>
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.role}
            onChange={(e) => setDraftFilters((current) => ({ ...current, role: e.target.value as AccountFilters["role"] }))}
          >
            <option value="">전체 role</option>
            <option value="ADMIN">ADMIN</option>
            <option value="READER">READER</option>
            <option value="USER">USER</option>
          </select>
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.status}
            onChange={(e) => setDraftFilters((current) => ({ ...current, status: e.target.value as AccountFilters["status"] }))}
          >
            <option value="">전체 status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="WITHDRAWN">WITHDRAWN</option>
          </select>
          <select
            className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3"
            value={draftFilters.binary_position}
            onChange={(e) => setDraftFilters((current) => ({ ...current, binary_position: e.target.value as AccountFilters["binary_position"] }))}
          >
            <option value="">전체 binary_position</option>
            <option value="LEFT">LEFT</option>
            <option value="RIGHT">RIGHT</option>
          </select>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              조회
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraftFilters(defaultFilters);
                setAppliedFilters(defaultFilters);
                setPage(1);
              }}
            >
              초기화
            </Button>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            총 <span className="tabular text-slate-200">{total}</span>명
          </div>
          <div className="flex gap-2">
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
              value={sort}
              onChange={(e) => setSort(e.target.value as AdminAccountSort)}
            >
              <option value="joined_at_desc">joined_at desc</option>
              <option value="joined_at_asc">joined_at asc</option>
              <option value="login_id_asc">login_id asc</option>
              <option value="total_stake_desc">total_stake desc</option>
            </select>
            <select
              className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={20}>20개</option>
              <option value={50}>50개</option>
              <option value={100}>100개</option>
            </select>
          </div>
        </div>
        <TableShell height="max-h-[720px]">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>login_id</th>
                <th>display_name</th>
                <th>role</th>
                <th>status</th>
                <th>referral_code</th>
                <th>sponsor</th>
                <th>binary parent</th>
                <th>pos</th>
                <th>stake(base)</th>
                <th>reward(base)</th>
                <th>rank</th>
                <th>joined_at</th>
                <th>last_login_at</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const active = activeAccountId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60"}
                    onClick={() => onSelectAccount(item.id)}
                  >
                    <td className="font-semibold text-slate-100">{item.login_id ?? "-"}</td>
                    <td>{item.display_name ?? "-"}</td>
                    <td><StatusBadge value={item.role} /></td>
                    <td><StatusBadge value={item.status} /></td>
                    <td className="font-mono text-xs text-slate-400">{item.referral_code ?? "-"}</td>
                    <td>{item.sponsor_login_id ?? "-"}</td>
                    <td>{item.binary_parent_login_id ?? "-"}</td>
                    <td>{item.binary_position ?? "-"}</td>
                    <td className="tabular text-right">{formatBaseMetric(item.total_stake_amount_base)}</td>
                    <td className="tabular text-right">{formatBaseMetric(item.total_reward_amount_base)}</td>
                    <td className="tabular text-right">{item.rank_level}</td>
                    <td className="text-slate-400">{formatDateTime(item.joined_at)}</td>
                    <td className="text-slate-400">{formatDateTime(item.last_login_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableShell>
        <div className="mt-4">
          <Pagination page={page} limit={limit} total={total} onChange={setPage} />
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-50">회원 상세</h3>
              <p className="text-sm text-slate-400">선택한 회원의 sponsor/binary 관계를 확인합니다.</p>
            </div>
            {selected ? (
              <Button variant="secondary" onClick={() => onOpenNetwork(selected.id)}>
                네트워크 보기
                <ArrowRightCircle className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <div className="mt-4">
            {detailError ? (
              <FeedbackState title="상세 조회 실패" description={detailError} tone="error" />
            ) : selected ? (
              <div className="space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Account ID</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-300">{selected.id}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">기본 정보</div>
                    <dl className="mt-3 space-y-2">
                      <div><dt className="text-slate-500">login_id</dt><dd>{selected.login_id ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">display_name</dt><dd>{selected.display_name ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">role</dt><dd className="mt-1"><StatusBadge value={selected.role} /></dd></div>
                      <div><dt className="text-slate-500">status</dt><dd className="mt-1"><StatusBadge value={selected.status} /></dd></div>
                      <div><dt className="text-slate-500">referral_code</dt><dd className="font-mono text-xs">{selected.referral_code ?? "-"}</dd></div>
                    </dl>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">관계 정보</div>
                    <dl className="mt-3 space-y-2">
                      <div><dt className="text-slate-500">sponsor</dt><dd>{selected.sponsor_login_id ?? "-"} / {selected.sponsor_display_name ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">binary parent</dt><dd>{selected.binary_parent_login_id ?? "-"} / {selected.binary_parent_display_name ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">binary_position</dt><dd>{selected.binary_position ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">joined_at</dt><dd>{formatDateTime(selected.joined_at)}</dd></div>
                      <div><dt className="text-slate-500">last_login_at</dt><dd>{formatDateTime(selected.last_login_at)}</dd></div>
                    </dl>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Stake(base)</div>
                    <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseMetric(selected.total_stake_amount_base)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Reward(base)</div>
                    <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseMetric(selected.total_reward_amount_base)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Rank Level</div>
                    <div className="mt-2 tabular text-xl font-bold text-slate-50">{selected.rank_level}</div>
                  </div>
                </div>
                <FeedbackState title="후속 작업 예정" description="회원 상태 변경, 바이너리 수동 배치, 보안 정보 조회는 이번 범위에 포함하지 않았습니다." />
              </div>
            ) : (
              <FeedbackState title="선택된 회원 없음" description="회원 목록에서 row를 선택하면 상세 정보가 표시됩니다." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
