import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, RefreshCcw, RotateCcw, Search, Sparkles, Wallet } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  getErrorMessage,
  type WithdrawalBalance,
  type WithdrawalListResponse,
  type WithdrawalPreview,
  type WithdrawalSort,
  type WithdrawalStatus,
  type WithdrawalType,
} from "@/lib/api";
import {
  buildWithdrawalIdempotencyKey,
  buildWithdrawalListQuery,
  canCancelMyWithdrawal,
  exceedsAvailableAmount,
  formatWithdrawalAmountBase,
  formatWithdrawalDateTime,
  getAvailableAmountForType,
  getWithdrawalPreviewCount,
  sumWithdrawalAvailableBalance,
  WITHDRAWAL_SORT_OPTIONS,
  WITHDRAWAL_STATUS_OPTIONS,
  WITHDRAWAL_TYPE_OPTIONS,
  type WithdrawalFilters,
} from "@/lib/withdrawals";
import { useSessionStore } from "@/store/sessionStore";
import { FeedbackState } from "@/components/FeedbackState";
import { Pagination } from "@/components/Pagination";
import { UserShell } from "@/components/UserShell";
import { WithdrawalStatusBadge } from "@/components/WithdrawalStatusBadge";
import { WithdrawalTypeBadge } from "@/components/WithdrawalTypeBadge";
import { Badge, Button, Card, SectionTitle, SelectField, TableShell, TextField } from "@/components/ui";

const DEFAULT_FILTERS: WithdrawalFilters = {
  withdrawal_type: "",
  status: "",
  requested_from: "",
  requested_to: "",
  page: 1,
  limit: 20,
  sort: "requested_at_desc",
};

type WithdrawalFormState = {
  withdrawal_type: WithdrawalType;
  requested_amount_base: string;
  wallet_address: string;
  network: string;
  idempotency_key: string;
};

function createDefaultFormState(): WithdrawalFormState {
  return {
    withdrawal_type: "DAILY_REWARD",
    requested_amount_base: "",
    wallet_address: "",
    network: "BASE",
    idempotency_key: buildWithdrawalIdempotencyKey(),
  };
}

export default function WithdrawalsPage() {
  const navigate = useNavigate();
  const accessToken = useSessionStore((state) => state.accessToken);
  const [balance, setBalance] = useState<WithdrawalBalance | null>(null);
  const [listState, setListState] = useState<WithdrawalListResponse | null>(null);
  const [preview, setPreview] = useState<WithdrawalPreview | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [draftFilters, setDraftFilters] = useState<WithdrawalFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<WithdrawalFilters>(DEFAULT_FILTERS);
  const [form, setForm] = useState<WithdrawalFormState>(createDefaultFormState);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const appliedQuery = useMemo(() => buildWithdrawalListQuery(appliedFilters), [appliedFilters]);
  const availableAmountBase = getAvailableAmountForType(balance, form.withdrawal_type);
  const totalAvailableAmountBase = sumWithdrawalAvailableBalance(balance);

  useEffect(() => {
    let cancelled = false;

    async function loadBalance() {
      if (!accessToken) return;
      try {
        setBalanceLoading(true);
        const result = await api.getMyWithdrawalBalance(accessToken);
        if (cancelled) return;
        setBalance(result);
        setBalanceError(null);
      } catch (error) {
        if (cancelled) return;
        setBalanceError(getErrorMessage(error));
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    }

    void loadBalance();

    return () => {
      cancelled = true;
    };
  }, [accessToken, refreshNonce]);

  useEffect(() => {
    let cancelled = false;

    async function loadWithdrawals() {
      if (!accessToken) return;
      try {
        setListLoading(true);
        const result = await api.listMyWithdrawals(appliedQuery, accessToken);
        if (cancelled) return;
        setListState(result);
        setListError(null);
      } catch (error) {
        if (cancelled) return;
        setListError(getErrorMessage(error));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    void loadWithdrawals();

    return () => {
      cancelled = true;
    };
  }, [accessToken, appliedQuery, refreshNonce]);

  function updateDraft<K extends keyof WithdrawalFilters>(key: K, value: WithdrawalFilters[K]) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function updateForm<K extends keyof WithdrawalFormState>(key: K, value: WithdrawalFormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "withdrawal_type" || key === "requested_amount_base") {
        setPreview(null);
        setPreviewError(null);
      }
      return next;
    });
  }

  function applyFilters() {
    setAppliedFilters({ ...draftFilters, page: 1 });
  }

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  }

  function changePage(page: number) {
    setAppliedFilters((current) => ({ ...current, page }));
  }

  function changeLimit(limit: number) {
    const next = { ...draftFilters, limit, page: 1 };
    setDraftFilters(next);
    setAppliedFilters(next);
  }

  function validateBeforePreview(): string | null {
    if (!/^\d+$/.test(form.requested_amount_base) || BigInt(form.requested_amount_base) <= 0n) {
      return "출금 신청 금액은 0보다 큰 정수 문자열이어야 합니다.";
    }
    if (exceedsAvailableAmount(form.requested_amount_base, availableAmountBase)) {
      return "현재 출금 가능 금액을 초과했습니다.";
    }
    if (!form.wallet_address.trim()) {
      return "지갑 주소를 입력해 주세요.";
    }
    if (!form.network.trim()) {
      return "네트워크를 입력해 주세요.";
    }
    return null;
  }

  async function handlePreview() {
    if (!accessToken) return;
    const validationMessage = validateBeforePreview();
    if (validationMessage) {
      setPreview(null);
      setPreviewError(validationMessage);
      return;
    }

    try {
      setPreviewing(true);
      setPreviewError(null);
      const result = await api.previewMyWithdrawal(
        {
          withdrawal_type: form.withdrawal_type,
          requested_amount_base: form.requested_amount_base.trim(),
        },
        accessToken
      );
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setPreviewError(getErrorMessage(error));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate() {
    if (!accessToken) return;
    const validationMessage = validateBeforePreview();
    if (validationMessage) {
      setCreateError(validationMessage);
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      setCreateSuccess(null);
      const result = await api.createMyWithdrawal(
        {
          withdrawal_type: form.withdrawal_type,
          requested_amount_base: form.requested_amount_base.trim(),
          idempotency_key: form.idempotency_key,
          wallet_address: form.wallet_address.trim(),
          network: form.network.trim(),
        },
        accessToken
      );
      setCreateSuccess("출금 신청이 접수되었습니다. 상세 화면으로 이동합니다.");
      setForm(createDefaultFormState());
      setPreview(null);
      setRefreshNonce((current) => current + 1);
      navigate(`/withdrawals/${result.withdrawal.id}`);
    } catch (error) {
      setCreateError(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <UserShell
      title="Withdrawals"
      subtitle="출금 가능 잔액 확인, 수수료 미리보기, 출금 신청과 내 출금 이력을 관리합니다."
      actions={
        <div className="flex items-center gap-2">
          <Badge tone="blue">Withdrawal API 연결</Badge>
          <Button variant="secondary" onClick={() => setRefreshNonce((current) => current + 1)} disabled={balanceLoading || listLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {balanceError ? <FeedbackState title="출금 가능 잔액 조회 오류" description={balanceError} tone="error" /> : null}
        {listError ? <FeedbackState title="출금 목록 조회 오류" description={listError} tone="error" /> : null}

        <Card className="p-6">
          <SectionTitle
            eyebrow="Withdrawal Balance"
            title="출금 가능 잔액"
            description="DAILY_REWARD와 BONUS 출금 가능 금액, 예약 금액, 완료 금액을 실시간 집계 기준으로 표시합니다."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="DAILY_REWARD 출금 가능" value={balance ? formatWithdrawalAmountBase(balance.daily_reward.available_amount_base) : "..."} note="일일 보상 bucket" />
            <MetricCard label="BONUS 출금 가능" value={balance ? formatWithdrawalAmountBase(balance.bonus.available_amount_base) : "..."} note="보너스 bucket" />
            <MetricCard label="예약 금액" value={balance ? formatWithdrawalAmountBase(balance.total.reserved_amount_base) : "..."} note="현재 RESERVED allocation 합계" />
            <MetricCard label="완료 출금액" value={balance ? formatWithdrawalAmountBase(balance.total.completed_amount_base) : "..."} note="현재 CONSUMED allocation 합계" />
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-400">
            <span>총 출금 가능: <span className="tabular text-slate-100">{formatWithdrawalAmountBase(totalAvailableAmountBase)}</span></span>
            <Link to="/rewards" className="font-semibold text-blue-200 hover:text-blue-100">
              Rewards 화면으로 돌아가기
            </Link>
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle
            eyebrow="Withdrawal Request"
            title="출금 신청"
            description="미리보기는 안내용이며, 실제 신청 시 동일 조건을 서버 transaction에서 다시 계산합니다."
          />

          {previewError ? <div className="mt-4"><FeedbackState title="미리보기 오류" description={previewError} tone="error" /></div> : null}
          {createError ? <div className="mt-4"><FeedbackState title="출금 신청 오류" description={createError} tone="error" /></div> : null}
          {createSuccess ? <div className="mt-4"><FeedbackState title="출금 신청 완료" description={createSuccess} tone="success" /></div> : null}

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <FilterField label="출금 타입">
              <SelectField value={form.withdrawal_type} onChange={(event) => updateForm("withdrawal_type", event.target.value as WithdrawalType)}>
                {WITHDRAWAL_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="신청 금액">
              <TextField
                placeholder="예: 1000000"
                value={form.requested_amount_base}
                onChange={(event) => updateForm("requested_amount_base", event.target.value.replace(/[^\d]/g, ""))}
              />
            </FilterField>

            <FilterField label="wallet_address">
              <TextField value={form.wallet_address} onChange={(event) => updateForm("wallet_address", event.target.value)} placeholder="출금 지갑 주소" />
            </FilterField>

            <FilterField label="network">
              <TextField value={form.network} onChange={(event) => updateForm("network", event.target.value)} placeholder="BASE" />
            </FilterField>

            <FilterField label="idempotency_key">
              <TextField value={form.idempotency_key} onChange={(event) => updateForm("idempotency_key", event.target.value)} />
            </FilterField>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="선택 타입 출금 가능" value={formatWithdrawalAmountBase(availableAmountBase)} note={`${form.withdrawal_type} bucket 기준`} />
            <MetricCard label="예상 신청 금액" value={form.requested_amount_base ? formatWithdrawalAmountBase(form.requested_amount_base) : "-"} note="입력값 기준" />
            <MetricCard label="예상 수수료" value={preview ? formatWithdrawalAmountBase(preview.fee_amount_base) : "-"} note="미리보기 결과" />
            <MetricCard label="예상 수령액" value={preview ? formatWithdrawalAmountBase(preview.net_amount_base) : "-"} note="미리보기 결과" />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => void handlePreview()} disabled={previewing || creating}>
              <Sparkles className="mr-2 h-4 w-4" />
              {previewing ? "미리보기 계산 중..." : "수수료 미리보기"}
            </Button>
            <Button variant="secondary" onClick={() => void handleCreate()} disabled={creating || previewing}>
              <Wallet className="mr-2 h-4 w-4" />
              {creating ? "출금 신청 중..." : "출금 신청"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setForm(createDefaultFormState());
                setPreview(null);
                setPreviewError(null);
                setCreateError(null);
              }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              폼 초기화
            </Button>
          </div>

          <div className="mt-4">
            <FeedbackState
              title="미리보기 안내"
              description="미리보기 결과는 참고용이며, 실제 신청 시 후보 reward와 수수료가 다시 계산됩니다. DAILY_REWARD와 BONUS는 한 요청에 혼합할 수 없습니다."
            />
          </div>

          {preview ? (
            <div className="mt-5 rounded-[24px] border border-slate-800 bg-slate-950/40 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Preview Result</div>
                  <div className="mt-2 text-lg font-bold text-slate-50">적용 reward 수 {getWithdrawalPreviewCount(preview.allocations)}건</div>
                </div>
                <WithdrawalTypeBadge type={preview.withdrawal_type} />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="신청 금액" value={formatWithdrawalAmountBase(preview.requested_amount_base)} />
                <MetricCard label="예상 수수료" value={formatWithdrawalAmountBase(preview.fee_amount_base)} />
                <MetricCard label="예상 수령액" value={formatWithdrawalAmountBase(preview.net_amount_base)} />
                <MetricCard label="현재 available" value={formatWithdrawalAmountBase(preview.available_amount_base)} />
              </div>

              <details className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-100">reward별 holding days / fee rate 상세</summary>
                <div className="mt-4 space-y-3">
                  {preview.allocations.map((allocation) => (
                    <div key={allocation.reward_id} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="font-mono text-xs text-slate-400">{allocation.reward_id}</div>
                        <div className="text-sm text-slate-300">
                          {allocation.holding_days}일 보유 / {allocation.fee_rate_bps} bps
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-4">
                        <InfoTile label="allocated" value={formatWithdrawalAmountBase(allocation.allocated_amount_base)} />
                        <InfoTile label="fee" value={formatWithdrawalAmountBase(allocation.fee_amount_base)} />
                        <InfoTile label="net" value={formatWithdrawalAmountBase(allocation.net_amount_base)} />
                        <InfoTile label="schedule days" value={String(allocation.fee_schedule_days)} />
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle eyebrow="Withdrawal History" title="내 출금 목록" description="타입, 상태, 신청일 범위로 내 출금 내역을 조회합니다." />
            <div className="text-sm text-slate-400">
              전체 건수 <span className="tabular text-slate-100">{listState?.total ?? 0}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="출금 타입">
              <SelectField value={draftFilters.withdrawal_type ?? ""} onChange={(event) => updateDraft("withdrawal_type", event.target.value as WithdrawalType | "")}>
                <option value="">전체</option>
                {WITHDRAWAL_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="상태">
              <SelectField value={draftFilters.status ?? ""} onChange={(event) => updateDraft("status", event.target.value as WithdrawalStatus | "")}>
                <option value="">전체</option>
                {WITHDRAWAL_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="신청 시작일">
              <TextField type="date" value={draftFilters.requested_from ?? ""} onChange={(event) => updateDraft("requested_from", event.target.value)} />
            </FilterField>

            <FilterField label="신청 종료일">
              <TextField type="date" value={draftFilters.requested_to ?? ""} onChange={(event) => updateDraft("requested_to", event.target.value)} />
            </FilterField>

            <FilterField label="정렬">
              <SelectField value={draftFilters.sort ?? "requested_at_desc"} onChange={(event) => updateDraft("sort", event.target.value as WithdrawalSort)}>
                {WITHDRAWAL_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </FilterField>

            <FilterField label="페이지 크기">
              <SelectField value={String(draftFilters.limit ?? 20)} onChange={(event) => changeLimit(Number(event.target.value))}>
                {[10, 20, 50].map((value) => (
                  <option key={value} value={value}>
                    {value}개
                  </option>
                ))}
              </SelectField>
            </FilterField>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={applyFilters}>
              <Search className="mr-2 h-4 w-4" />
              필터 적용
            </Button>
            <Button variant="ghost" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              초기화
            </Button>
          </div>

          <div className="mt-5">
            {listLoading ? <FeedbackState title="출금 목록 로딩 중" description="내 출금 이력을 불러오고 있습니다." /> : null}
            {!listLoading && !listError && (listState?.items.length ?? 0) === 0 ? (
              <FeedbackState title="출금 내역 없음" description="현재 필터 조건에 맞는 출금 신청이 없습니다." />
            ) : null}

            {listState?.items.length ? (
              <>
                <TableShell>
                  <table className="min-w-full text-left text-sm text-slate-300">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">신청일</th>
                        <th className="px-4 py-3">타입</th>
                        <th className="px-4 py-3">신청 금액</th>
                        <th className="px-4 py-3">수수료</th>
                        <th className="px-4 py-3">실수령액</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">network</th>
                        <th className="px-4 py-3">tx_hash</th>
                        <th className="px-4 py-3">취소 가능</th>
                        <th className="px-4 py-3 text-right">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listState.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-800/80">
                          <td className="px-4 py-3 text-slate-200">{formatWithdrawalDateTime(item.requested_at)}</td>
                          <td className="px-4 py-3"><WithdrawalTypeBadge type={item.withdrawal_type} /></td>
                          <td className="tabular px-4 py-3 font-semibold text-slate-100">{formatWithdrawalAmountBase(item.requested_amount_base)}</td>
                          <td className="tabular px-4 py-3 text-slate-200">{formatWithdrawalAmountBase(item.fee_amount_base)}</td>
                          <td className="tabular px-4 py-3 text-slate-200">{formatWithdrawalAmountBase(item.net_amount_base)}</td>
                          <td className="px-4 py-3"><WithdrawalStatusBadge status={item.status} /></td>
                          <td className="px-4 py-3 text-slate-400">{item.network ?? "-"}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.tx_hash ?? "-"}</td>
                          <td className="px-4 py-3">
                            {canCancelMyWithdrawal(item.status) ? <Badge tone="blue">REQUESTED 취소 가능</Badge> : <Badge tone="slate">-</Badge>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link to={`/withdrawals/${item.id}`}>
                              <Button variant="secondary">
                                상세 보기
                                <ArrowUpRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableShell>
                <div className="mt-4">
                  <Pagination page={listState.page} limit={listState.limit} total={listState.total} onChange={changePage} />
                </div>
              </>
            ) : null}
          </div>
        </Card>
      </div>
    </UserShell>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[24px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-3 tabular text-2xl font-bold text-slate-50">{value}</div>
      {note ? <div className="mt-2 text-sm text-slate-400">{note}</div> : null}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-slate-800 bg-slate-950/50 p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
