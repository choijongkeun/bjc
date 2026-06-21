import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRightCircle, Check, ChevronDown, ChevronUp, Copy, RefreshCcw, Search } from "lucide-react";
import {
  api,
  type AdminAccountDetail,
  type AdminAccountListItem,
  type AdminRewardListItem,
  type AdminStakingListItem,
  type AdminWithdrawalListItem,
  type AdminAccountSort,
  type BinaryPosition,
  getErrorMessage,
  type SessionRole
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { getDisplayLabel } from "@/lib/display";
import { formatRewardAmountBase, formatRewardDate } from "@/lib/rewards";
import { formatWithdrawalAmountBase, formatWithdrawalDateTime, shortenTxHash } from "@/lib/withdrawals";
import { Button, Card, FeedbackState, FormField, Pagination, SelectField, StatusBadge, TableShell, TextField, cn } from "@/components/ui";
import { RewardStatusBadge } from "@/components/RewardStatusBadge";
import { RewardTypeBadge } from "@/components/RewardTypeBadge";
import { StakingStatusBadge } from "@/components/StakingStatusBadge";
import { WithdrawalStatusBadge } from "@/components/WithdrawalStatusBadge";
import { WithdrawalTypeBadge } from "@/components/WithdrawalTypeBadge";

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

const nextStatusOptions: Record<AdminAccountDetail["status"], Array<AdminAccountDetail["status"]>> = {
  ACTIVE: ["BLOCKED", "WITHDRAWN"],
  BLOCKED: ["ACTIVE", "WITHDRAWN"],
  WITHDRAWN: []
};

function formatDateTime(value: string | null | undefined) {
  return value ?? "-";
}

function formatBaseMetric(value: string) {
  return formatBaseAmount(value, 0);
}

function formatCompactDate(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "-";
}

function DetailItem({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-200">{value}</dd>
    </div>
  );
}

function CopyableValue({
  label,
  value,
  className,
  textClassName,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
  textClassName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const safeValue = value?.trim() ? value : null;

  async function handleCopy(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!safeValue || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(safeValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        className={cn("min-w-0 flex-1 truncate", textClassName)}
        title={safeValue ?? "-"}
      >
        {safeValue ?? "-"}
      </span>
      {safeValue ? (
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:border-slate-700 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/30"
          aria-label={`${label} 복사`}
          title={copied ? `${label} 복사됨` : `${label} 복사`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      ) : null}
    </div>
  );
}

export function AccountsTab({
  actorId,
  role,
  selectedAccountId,
  onSelectAccount,
  onOpenNetwork,
  onOpenStakings,
  onOpenRewards,
  onOpenWithdrawals,
  onOpenRanks,
}: {
  actorId: string;
  role: SessionRole;
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  onOpenNetwork: (accountId: string) => void;
  onOpenStakings: (accountId: string) => void;
  onOpenRewards: (accountId: string) => void;
  onOpenWithdrawals: (accountId: string) => void;
  onOpenRanks: (accountId: string) => void;
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
  const [statusDraft, setStatusDraft] = useState<AdminAccountDetail["status"] | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSuccess, setStatusSuccess] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [recentStakings, setRecentStakings] = useState<AdminStakingListItem[]>([]);
  const [recentRewards, setRecentRewards] = useState<AdminRewardListItem[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<AdminWithdrawalListItem[]>([]);
  const [stakingError, setStakingError] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [withdrawalError, setWithdrawalError] = useState<string | null>(null);
  const [singleRunPolicyVersionId, setSingleRunPolicyVersionId] = useState("");
  const [singleRunCalculationDate, setSingleRunCalculationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [singleRunSubmitting, setSingleRunSubmitting] = useState<"" | "CONTRIBUTION" | "SIDECAR">("");
  const [singleRunNotice, setSingleRunNotice] = useState<string | null>(null);
  const [singleRunError, setSingleRunError] = useState<string | null>(null);
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(null);

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
      const [result, stakingResult, rewardResult, withdrawalResult] = await Promise.all([
        api.getAdminAccount(actorId, accountId),
        api.listAdminAccountStakings(actorId, accountId, { page: 1, limit: 5, sort: "created_at_desc" }),
        api.listAdminAccountRewards(actorId, accountId, { page: 1, limit: 5, sort: "reward_date_desc" }),
        api.listAdminAccountWithdrawals(actorId, accountId, { page: 1, limit: 5, sort: "requested_at_desc" }),
      ]);
      setSelected(result.account);
      setRecentStakings(stakingResult.items);
      setRecentRewards(rewardResult.items);
      setRecentWithdrawals(withdrawalResult.items);
      setStakingError(null);
      setRewardError(null);
      setWithdrawalError(null);
      setDetailError(null);
    } catch (loadError: any) {
      setSelected(null);
      setRecentStakings([]);
      setRecentRewards([]);
      setRecentWithdrawals([]);
      setStakingError(loadError.message ?? "회원 스테이킹 내역을 불러오지 못했습니다.");
      setRewardError(loadError.message ?? "회원 보상 내역을 불러오지 못했습니다.");
      setWithdrawalError(loadError.message ?? "회원 출금 내역을 불러오지 못했습니다.");
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

  useEffect(() => {
    if (!selected) {
      setStatusDraft("");
      setStatusReason("");
      setStatusError(null);
      setStatusSuccess(null);
      setSingleRunPolicyVersionId("");
      setSingleRunCalculationDate(new Date().toISOString().slice(0, 10));
      setSingleRunSubmitting("");
      setSingleRunNotice(null);
      setSingleRunError(null);
      return;
    }

    const candidates = nextStatusOptions[selected.status];
    setStatusDraft(candidates[0] ?? "");
    setStatusReason("");
    setStatusError(null);
    setStatusSuccess(null);
    setSingleRunPolicyVersionId("");
    setSingleRunCalculationDate(new Date().toISOString().slice(0, 10));
    setSingleRunSubmitting("");
    setSingleRunNotice(null);
    setSingleRunError(null);
  }, [selected?.id, selected?.status]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  function toggleExpandedAccount(accountId: string) {
    setExpandedAccountId((current) => (current === accountId ? null : accountId));
  }

  async function handleStatusUpdate() {
    if (!selected || !statusDraft) {
      return;
    }

    try {
      setStatusBusy(true);
      const result = await api.updateAdminAccountStatus(actorId, selected.id, {
        status: statusDraft,
        reason: statusReason.trim() || undefined,
      });
      setSelected(result.account);
      setStatusError(null);
      setStatusSuccess(
        `상태가 ${getDisplayLabel(result.previous_status)}에서 ${getDisplayLabel(result.account.status)}(으)로 변경되었습니다. 세션 ${result.revoked_session_count}건이 종료되었습니다.`
      );
      await loadAccounts(page, limit, appliedFilters, sort);
    } catch (updateError: any) {
      setStatusSuccess(null);
      setStatusError(updateError.message ?? "회원 상태를 변경하지 못했습니다.");
    } finally {
      setStatusBusy(false);
    }
  }

  async function handleSingleRun(kind: "CONTRIBUTION" | "SIDECAR") {
    if (!selected) {
      return;
    }
    if (!singleRunPolicyVersionId.trim() || !singleRunCalculationDate.trim()) {
      setSingleRunNotice(null);
      setSingleRunError("정책 버전과 계산 기준일을 모두 입력해 주세요.");
      return;
    }

    try {
      setSingleRunSubmitting(kind);
      setSingleRunError(null);
      const result =
        kind === "CONTRIBUTION"
          ? await api.runContributionForAccount(actorId, selected.id, {
              policy_version_id: singleRunPolicyVersionId.trim(),
              calculation_date: singleRunCalculationDate.trim(),
            })
          : await api.runSidecarForAccount(actorId, selected.id, {
              policy_version_id: singleRunPolicyVersionId.trim(),
              calculation_date: singleRunCalculationDate.trim(),
            });
      setSingleRunNotice(
        `${kind === "CONTRIBUTION" ? "기여 보상" : "사이드카 정산"} 단건 실행이 완료되었습니다. 계산 실행 ID ${result.calc_run_id}, 결과 ${getDisplayLabel(result.status)}`
      );
      await loadAccountDetail(selected.id);
    } catch (runError: unknown) {
      setSingleRunNotice(null);
      setSingleRunError(getErrorMessage(runError) || `${kind} 단건 실행에 실패했습니다.`);
    } finally {
      setSingleRunSubmitting("");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-50">회원 목록</h2>
          </div>
          <Button variant="secondary" onClick={() => void loadAccounts()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
        {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <FormField label="검색" className="sm:col-span-2 xl:col-span-2">
            <TextField
              placeholder="아이디 / 이름 / 추천 코드를 입력하세요"
              value={draftFilters.q}
              onChange={(e) => setDraftFilters((current) => ({ ...current, q: e.target.value }))}
            />
          </FormField>
          <FormField label="권한">
            <SelectField
              value={draftFilters.role}
              onChange={(e) => setDraftFilters((current) => ({ ...current, role: e.target.value as AccountFilters["role"] }))}
            >
              <option value="">전체 권한</option>
              <option value="ADMIN">관리자</option>
              <option value="READER">조회 관리자</option>
              <option value="USER">일반 회원</option>
            </SelectField>
          </FormField>
          <FormField label="상태">
            <SelectField
              value={draftFilters.status}
              onChange={(e) => setDraftFilters((current) => ({ ...current, status: e.target.value as AccountFilters["status"] }))}
            >
              <option value="">전체 상태</option>
              <option value="ACTIVE">활성</option>
              <option value="BLOCKED">차단</option>
              <option value="WITHDRAWN">탈퇴</option>
            </SelectField>
          </FormField>
          <FormField label="바이너리 위치">
            <SelectField
              value={draftFilters.binary_position}
              onChange={(e) => setDraftFilters((current) => ({ ...current, binary_position: e.target.value as AccountFilters["binary_position"] }))}
            >
              <option value="">전체 위치</option>
              <option value="LEFT">좌측</option>
              <option value="RIGHT">우측</option>
            </SelectField>
          </FormField>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-slate-200">필터 적용</div>
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
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            총 <span className="tabular text-slate-200">{total}</span>명
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
            <FormField label="정렬" className="sm:min-w-[220px]">
              <SelectField
                value={sort}
                onChange={(e) => setSort(e.target.value as AdminAccountSort)}
              >
                <option value="joined_at_desc">가입일 최신순</option>
                <option value="joined_at_asc">가입일 오래된순</option>
                <option value="login_id_asc">아이디 오름차순</option>
                <option value="total_stake_desc">스테이킹 금액 높은순</option>
              </SelectField>
            </FormField>
            <FormField label="페이지 크기" className="sm:min-w-[140px]">
              <SelectField
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={20}>20개</option>
                <option value={50}>50개</option>
                <option value={100}>100개</option>
              </SelectField>
            </FormField>
          </div>
        </div>
        {items.length === 0 && !error ? (
          <FeedbackState title="조회된 회원 없음" description="조건에 맞는 회원이 없습니다. 검색 조건을 조정해 주세요." />
        ) : null}
        {items.length > 0 ? (
          <>
            <div className="hidden xl:block">
              <TableShell height="max-h-[720px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>아이디</th>
                      <th>이름</th>
                      <th>권한</th>
                      <th>상태</th>
                      <th>추천 코드</th>
                      <th>추천인</th>
                      <th>바이너리 상위</th>
                      <th>위치</th>
                      <th>총 스테이킹</th>
                      <th>총 보상</th>
                      <th>직급</th>
                      <th>가입일</th>
                      <th>최근 로그인</th>
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
                          <td className="max-w-[220px] font-semibold text-slate-100">
                            <CopyableValue
                              label="아이디"
                              value={item.login_id}
                              textClassName="font-semibold text-slate-100"
                            />
                          </td>
                          <td className="max-w-[180px] truncate" title={item.display_name ?? "-"}>
                            {item.display_name ?? "-"}
                          </td>
                          <td><StatusBadge value={item.role} /></td>
                          <td><StatusBadge value={item.status} /></td>
                          <td className="max-w-[210px]">
                            <CopyableValue
                              label="추천 코드"
                              value={item.referral_code}
                              textClassName="font-mono text-xs text-slate-400"
                            />
                          </td>
                          <td className="max-w-[200px]">
                            <CopyableValue label="추천인 아이디" value={item.sponsor_login_id} textClassName="text-slate-300" />
                          </td>
                          <td className="max-w-[200px]">
                            <CopyableValue label="바이너리 상위 아이디" value={item.binary_parent_login_id} textClassName="text-slate-300" />
                          </td>
                          <td>{item.binary_position ? getDisplayLabel(item.binary_position) : "-"}</td>
                          <td className="tabular text-right">{formatBaseMetric(item.total_stake_amount_base)}</td>
                          <td className="tabular text-right">{formatBaseMetric(item.total_reward_amount_base)}</td>
                          <td className="tabular text-right">{item.rank_level}</td>
                          <td className="max-w-[148px] truncate text-slate-400" title={formatDateTime(item.joined_at)}>
                            {formatDateTime(item.joined_at)}
                          </td>
                          <td className="max-w-[148px] truncate text-slate-400" title={formatDateTime(item.last_login_at)}>
                            {formatDateTime(item.last_login_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            </div>

            <div className="hidden md:block xl:hidden">
              <TableShell height="max-h-[720px]">
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>회원</th>
                      <th>권한</th>
                      <th>상태</th>
                      <th>합계</th>
                      <th>가입일</th>
                      <th className="w-[120px]">상세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const active = activeAccountId === item.id;
                      const expanded = expandedAccountId === item.id;
                      return (
                        <Fragment key={item.id}>
                          <tr
                            className={cn(active ? "bg-blue-500/10" : "cursor-pointer hover:bg-slate-800/60", expanded && "border-b-0")}
                            onClick={() => onSelectAccount(item.id)}
                          >
                            <td className="max-w-[280px]">
                              <div className="space-y-1">
                                <CopyableValue
                                  label="아이디"
                                  value={item.login_id}
                                  textClassName="font-semibold text-slate-100"
                                />
                                <div className="truncate text-sm text-slate-400" title={item.display_name ?? "-"}>
                                  {item.display_name ?? "-"}
                                </div>
                              </div>
                            </td>
                            <td><StatusBadge value={item.role} /></td>
                            <td><StatusBadge value={item.status} /></td>
                            <td className="min-w-[160px]">
                              <div className="space-y-1 text-right">
                                <div className="tabular text-sm text-slate-100">{formatBaseMetric(item.total_stake_amount_base)}</div>
                                <div className="tabular text-xs text-slate-400">보상 {formatBaseMetric(item.total_reward_amount_base)}</div>
                              </div>
                            </td>
                            <td className="text-slate-400">{formatCompactDate(item.joined_at)}</td>
                            <td>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  className="px-3 py-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onSelectAccount(item.id);
                                  }}
                                >
                                  선택
                                </Button>
                                <Button
                                  variant="secondary"
                                  className="px-3 py-2 text-xs"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleExpandedAccount(item.id);
                                  }}
                                >
                                  {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                                  {expanded ? "접기" : "열기"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded ? (
                            <tr className="bg-slate-950/70">
                              <td colSpan={6} className="px-4 py-4">
                                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  <DetailItem
                                    label="회원 ID"
                                    value={<CopyableValue label="회원 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem
                                    label="추천 코드"
                                    value={<CopyableValue label="추천 코드" value={item.referral_code} textClassName="font-mono text-xs text-slate-400" />}
                                  />
                                  <DetailItem
                                    label="추천인"
                                    value={<CopyableValue label="추천인 아이디" value={item.sponsor_login_id} />}
                                  />
                                  <DetailItem
                                    label="바이너리 상위"
                                    value={<CopyableValue label="바이너리 상위 아이디" value={item.binary_parent_login_id} />}
                                  />
                                  <DetailItem
                                    label="위치"
                                    value={item.binary_position ? getDisplayLabel(item.binary_position) : "-"}
                                  />
                                  <DetailItem
                                    label="직급 단계"
                                    value={<span className="tabular">{item.rank_level}</span>}
                                  />
                                  <DetailItem label="최근 로그인" value={formatDateTime(item.last_login_at)} className="sm:col-span-2 lg:col-span-3" />
                                </dl>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((item) => {
                const active = activeAccountId === item.id;
                const expanded = expandedAccountId === item.id;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-[24px] border border-slate-800 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                      active && "border-blue-500/40 bg-blue-500/10"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <CopyableValue
                          label="아이디"
                          value={item.login_id}
                          textClassName="font-semibold text-slate-100"
                        />
                        <div className="mt-1 truncate text-sm text-slate-400" title={item.display_name ?? "-"}>
                          {item.display_name ?? "-"}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge value={item.status} />
                      </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      <DetailItem label="권한" value={<StatusBadge value={item.role} />} />
                      <DetailItem label="위치" value={item.binary_position ? getDisplayLabel(item.binary_position) : "-"} />
                      <DetailItem label="총 스테이킹" value={<span className="tabular">{formatBaseMetric(item.total_stake_amount_base)}</span>} />
                      <DetailItem label="총 보상" value={<span className="tabular">{formatBaseMetric(item.total_reward_amount_base)}</span>} />
                      <DetailItem label="직급 단계" value={<span className="tabular">{item.rank_level}</span>} />
                      <DetailItem label="가입일" value={formatCompactDate(item.joined_at)} />
                    </dl>
                    {expanded ? (
                      <dl className="mt-4 grid gap-3 border-t border-slate-800 pt-4">
                        <DetailItem
                          label="회원 ID"
                          value={<CopyableValue label="회원 ID" value={item.id} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem
                          label="추천 코드"
                          value={<CopyableValue label="추천 코드" value={item.referral_code} textClassName="font-mono text-xs text-slate-400" />}
                        />
                        <DetailItem label="추천인" value={<CopyableValue label="추천인 아이디" value={item.sponsor_login_id} />} />
                        <DetailItem label="바이너리 상위" value={<CopyableValue label="바이너리 상위 아이디" value={item.binary_parent_login_id} />} />
                        <DetailItem label="최근 로그인" value={formatDateTime(item.last_login_at)} />
                      </dl>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={active ? "primary" : "secondary"}
                        className="flex-1"
                        onClick={() => onSelectAccount(item.id)}
                      >
                        {active ? "선택됨" : "상세 보기"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="px-4"
                        onClick={() => toggleExpandedAccount(item.id)}
                      >
                        {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                        {expanded ? "추가 정보 접기" : "추가 정보"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
        <div className="mt-4">
          <Pagination page={page} limit={limit} total={total} onChange={setPage} />
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-50">회원 상세</h3>
            </div>
            {selected ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => onOpenStakings(selected.id)}>
                  스테이킹 내역 보기
                </Button>
                <Button variant="secondary" onClick={() => onOpenRewards(selected.id)}>
                  보상 내역 보기
                </Button>
                <Button variant="secondary" onClick={() => onOpenRanks(selected.id)}>
                  직급 보기
                </Button>
                <Button variant="secondary" onClick={() => onOpenWithdrawals(selected.id)}>
                  출금 내역 보기
                </Button>
                <Button variant="secondary" onClick={() => onOpenNetwork(selected.id)}>
                  추천 조직 보기
                  <ArrowRightCircle className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
          <div id="account-detail-panel" className="mt-4">
            {detailError ? (
              <FeedbackState title="상세 조회 실패" description={detailError} tone="error" />
            ) : selected ? (
              <div className="space-y-4 text-sm text-slate-300">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">회원 ID</div>
                  <div className="mt-2 break-all font-mono text-xs text-slate-300">{selected.id}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">기본 정보</div>
                    <dl className="mt-3 space-y-2">
                      <div><dt className="text-slate-500">아이디</dt><dd>{selected.login_id ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">이름</dt><dd>{selected.display_name ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">권한</dt><dd className="mt-1"><StatusBadge value={selected.role} /></dd></div>
                      <div><dt className="text-slate-500">상태</dt><dd className="mt-1"><StatusBadge value={selected.status} /></dd></div>
                      <div><dt className="text-slate-500">추천 코드</dt><dd className="font-mono text-xs">{selected.referral_code ?? "-"}</dd></div>
                    </dl>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">관계 정보</div>
                    <dl className="mt-3 space-y-2">
                      <div><dt className="text-slate-500">추천인</dt><dd>{selected.sponsor_login_id ?? "-"} / {selected.sponsor_display_name ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">바이너리 상위</dt><dd>{selected.binary_parent_login_id ?? "-"} / {selected.binary_parent_display_name ?? "-"}</dd></div>
                      <div><dt className="text-slate-500">바이너리 위치</dt><dd>{selected.binary_position ? getDisplayLabel(selected.binary_position) : "-"}</dd></div>
                      <div><dt className="text-slate-500">가입일</dt><dd>{formatDateTime(selected.joined_at)}</dd></div>
                      <div><dt className="text-slate-500">최근 로그인</dt><dd>{formatDateTime(selected.last_login_at)}</dd></div>
                    </dl>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">총 스테이킹</div>
                    <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseMetric(selected.total_stake_amount_base)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">총 보상</div>
                    <div className="mt-2 tabular text-xl font-bold text-slate-50">{formatBaseMetric(selected.total_reward_amount_base)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">직급 단계</div>
                    <div className="mt-2 tabular text-xl font-bold text-slate-50">{selected.rank_level}</div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">회원 상태 변경</div>
                    </div>
                    <StatusBadge value={selected.status} />
                  </div>
                  <div className="mt-4">
                    {role !== "ADMIN" ? (
                      <FeedbackState title="조회 전용" description="READER는 상태 변경을 수행할 수 없습니다." />
                    ) : selected.role !== "USER" ? (
                      <FeedbackState
                        title="변경 제한"
                        description="일반 회원만 상태를 변경할 수 있습니다."
                      />
                    ) : nextStatusOptions[selected.status].length === 0 ? (
                      <FeedbackState
                        title="변경 불가"
                        description="현재 상태에서는 변경할 수 없습니다."
                      />
                    ) : (
                      <div className="space-y-3">
                        {statusError ? <FeedbackState title="상태 변경 실패" description={statusError} tone="error" /> : null}
                        {statusSuccess ? <FeedbackState title="상태 변경 완료" description={statusSuccess} /> : null}
                        <div className="grid gap-3 md:grid-cols-[220px,1fr]">
                          <FormField label="변경 상태">
                            <SelectField
                              value={statusDraft}
                              onChange={(e) => setStatusDraft(e.target.value as AdminAccountDetail["status"])}
                              disabled={statusBusy}
                            >
                              {nextStatusOptions[selected.status].map((nextStatus) => (
                                <option key={nextStatus} value={nextStatus}>
                                  {getDisplayLabel(nextStatus)}
                                </option>
                              ))}
                            </SelectField>
                          </FormField>
                          <FormField label="변경 사유">
                            <TextField
                              placeholder="변경 사유를 남길 수 있습니다."
                              value={statusReason}
                              onChange={(e) => setStatusReason(e.target.value)}
                              disabled={statusBusy}
                              maxLength={500}
                            />
                          </FormField>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                          <span>차단 또는 탈퇴로 변경하면 현재 로그인 세션이 종료됩니다.</span>
                          <Button onClick={() => void handleStatusUpdate()} disabled={statusBusy || !statusDraft}>
                            {statusBusy ? "처리 중..." : "상태 변경"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">보너스 단건 실행</div>
                    </div>
                    <StatusBadge value={selected.role} />
                  </div>
                  <div className="mt-4">
                    {role !== "ADMIN" ? (
                      <FeedbackState title="조회 전용" description="READER는 단건 보너스 실행을 수행할 수 없습니다." />
                    ) : selected.role !== "USER" ? (
                      <FeedbackState
                        title="실행 제한"
                        description="일반 회원만 단건 실행할 수 있습니다."
                      />
                    ) : (
                      <div className="space-y-3">
                        {singleRunError ? <FeedbackState title="단건 실행 실패" description={singleRunError} tone="error" /> : null}
                        {singleRunNotice ? <FeedbackState title="단건 실행 완료" description={singleRunNotice} /> : null}
                        <div className="grid gap-3 md:grid-cols-[1fr,220px]">
                          <FormField label="정책 버전">
                            <TextField
                              placeholder="정책 버전 ID를 입력하세요"
                              value={singleRunPolicyVersionId}
                              onChange={(e) => setSingleRunPolicyVersionId(e.target.value)}
                              disabled={singleRunSubmitting !== ""}
                            />
                          </FormField>
                          <FormField label="계산 기준일">
                            <TextField
                              type="date"
                              value={singleRunCalculationDate}
                              onChange={(e) => setSingleRunCalculationDate(e.target.value)}
                              disabled={singleRunSubmitting !== ""}
                            />
                          </FormField>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                          <span>같은 기준으로 다시 실행하면 중복으로 처리될 수 있습니다.</span>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" onClick={() => onOpenRewards(selected.id)}>
                              최근 보상 보기
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => void handleSingleRun("CONTRIBUTION")}
                              disabled={singleRunSubmitting !== ""}
                            >
                              {singleRunSubmitting === "CONTRIBUTION" ? "기여 보상 실행 중..." : "기여 보상 단건 실행"}
                            </Button>
                            <Button onClick={() => void handleSingleRun("SIDECAR")} disabled={singleRunSubmitting !== ""}>
                              {singleRunSubmitting === "SIDECAR" ? "사이드카 정산 실행 중..." : "사이드카 단건 실행"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">최근 출금 내역</div>
                    </div>
                    <Button variant="secondary" onClick={() => onOpenWithdrawals(selected.id)}>
                      전체 출금 보기
                    </Button>
                  </div>
                  <div className="mt-4">
                    {withdrawalError ? <FeedbackState title="출금 조회 실패" description={withdrawalError} tone="error" /> : null}
                    {!withdrawalError && recentWithdrawals.length === 0 ? (
                      <FeedbackState title="출금 내역 없음" description="해당 회원의 최근 출금 내역이 없습니다." />
                    ) : null}
                    {recentWithdrawals.length > 0 ? (
                      <>
                        <div className="hidden md:block overflow-auto rounded-2xl border border-slate-800">
                          <table className="data-table min-w-full">
                            <thead>
                              <tr>
                                <th>신청일</th>
                                <th>출금 구분</th>
                                <th>신청 금액</th>
                                <th>상태</th>
                                <th>네트워크</th>
                                <th>거래 해시</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentWithdrawals.map((withdrawal) => (
                                <tr key={withdrawal.id}>
                                  <td className="text-slate-400">{formatWithdrawalDateTime(withdrawal.requested_at ?? withdrawal.created_at)}</td>
                                  <td><WithdrawalTypeBadge type={withdrawal.withdrawal_type} /></td>
                                  <td className="tabular text-right">{formatWithdrawalAmountBase(withdrawal.requested_amount_base)}</td>
                                  <td><WithdrawalStatusBadge status={withdrawal.status} /></td>
                                  <td>{withdrawal.network ?? "-"}</td>
                                  <td className="font-mono text-xs text-slate-400">{shortenTxHash(withdrawal.tx_hash)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-3 md:hidden">
                          {recentWithdrawals.map((withdrawal) => (
                            <div key={withdrawal.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm text-slate-400">
                                  {formatWithdrawalDateTime(withdrawal.requested_at ?? withdrawal.created_at)}
                                </div>
                                <WithdrawalStatusBadge status={withdrawal.status} />
                              </div>
                              <dl className="mt-3 grid grid-cols-2 gap-3">
                                <DetailItem label="출금 구분" value={<WithdrawalTypeBadge type={withdrawal.withdrawal_type} />} />
                                <DetailItem label="신청 금액" value={<span className="tabular">{formatWithdrawalAmountBase(withdrawal.requested_amount_base)}</span>} />
                                <DetailItem label="네트워크" value={withdrawal.network ?? "-"} />
                                <DetailItem
                                  label="거래 해시"
                                  value={<CopyableValue label="거래 해시" value={withdrawal.tx_hash} textClassName="font-mono text-xs text-slate-400" />}
                                  className="col-span-2"
                                />
                              </dl>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">최근 스테이킹</div>
                    </div>
                    <Button variant="secondary" onClick={() => onOpenStakings(selected.id)}>
                      전체 스테이킹 보기
                    </Button>
                  </div>
                  <div className="mt-4">
                    {stakingError ? <FeedbackState title="스테이킹 조회 실패" description={stakingError} tone="error" /> : null}
                    {!stakingError && recentStakings.length === 0 ? (
                      <FeedbackState title="스테이킹 내역 없음" description="해당 회원의 최근 스테이킹 내역이 없습니다." />
                    ) : null}
                    {recentStakings.length > 0 ? (
                      <>
                        <div className="hidden md:block overflow-auto rounded-2xl border border-slate-800">
                          <table className="data-table min-w-full">
                            <thead>
                              <tr>
                                <th>상품명</th>
                                <th>원금</th>
                                <th>상태</th>
                                <th>신청일</th>
                                <th>만기 예정일</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentStakings.map((staking) => (
                                <tr key={staking.id}>
                                  <td>{staking.product.name}</td>
                                  <td className="tabular text-right">{formatBaseAmount(staking.principal_amount_base, staking.product.decimals)}</td>
                                  <td><StakingStatusBadge status={staking.status} /></td>
                                  <td className="text-slate-400">{formatDateTime(staking.created_at)}</td>
                                  <td className="text-slate-400">{formatDateTime(staking.matures_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-3 md:hidden">
                          {recentStakings.map((staking) => (
                            <div key={staking.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 truncate text-sm font-semibold text-slate-100" title={staking.product.name}>
                                  {staking.product.name}
                                </div>
                                <StakingStatusBadge status={staking.status} />
                              </div>
                              <dl className="mt-3 grid grid-cols-2 gap-3">
                                <DetailItem label="원금" value={<span className="tabular">{formatBaseAmount(staking.principal_amount_base, staking.product.decimals)}</span>} />
                                <DetailItem label="신청일" value={formatCompactDate(staking.created_at)} />
                                <DetailItem label="만기 예정일" value={formatCompactDate(staking.matures_at)} className="col-span-2" />
                              </dl>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">최근 보상 내역</div>
                    </div>
                    <Button variant="secondary" onClick={() => onOpenRewards(selected.id)}>
                      전체 보상 보기
                    </Button>
                  </div>
                  <div className="mt-4">
                    {rewardError ? <FeedbackState title="보상 조회 실패" description={rewardError} tone="error" /> : null}
                    {!rewardError && recentRewards.length === 0 ? (
                      <FeedbackState title="보상 내역 없음" description="해당 회원의 최근 보상 내역이 없습니다." />
                    ) : null}
                    {recentRewards.length > 0 ? (
                      <>
                        <div className="hidden md:block overflow-auto rounded-2xl border border-slate-800">
                          <table className="data-table min-w-full">
                            <thead>
                              <tr>
                                <th>보상 기준일</th>
                                <th>보상 구분</th>
                                <th>보상 금액</th>
                                <th>상태</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentRewards.map((reward) => (
                                <tr key={reward.id}>
                                  <td className="text-slate-400">{formatRewardDate(reward.reward_date)}</td>
                                  <td><RewardTypeBadge type={reward.reward_type} /></td>
                                  <td className="tabular text-right">{formatRewardAmountBase(reward.amount_base)}</td>
                                  <td><RewardStatusBadge status={reward.status} /></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-3 md:hidden">
                          {recentRewards.map((reward) => (
                            <div key={reward.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="text-sm text-slate-400">{formatRewardDate(reward.reward_date)}</div>
                                <RewardStatusBadge status={reward.status} />
                              </div>
                              <dl className="mt-3 grid grid-cols-2 gap-3">
                                <DetailItem label="보상 구분" value={<RewardTypeBadge type={reward.reward_type} />} />
                                <DetailItem label="보상 금액" value={<span className="tabular">{formatRewardAmountBase(reward.amount_base)}</span>} />
                              </dl>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
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
