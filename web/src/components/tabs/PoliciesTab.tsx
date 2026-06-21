import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Copy, Plus, RefreshCcw } from "lucide-react";
import { api, type PolicyVersion, type SessionRole, type StakingProduct } from "@/lib/api";
import { Button, Card, FeedbackState, FormField, Pagination, StatusBadge, TableShell, TextField, cn } from "@/components/ui";

const emptyProduct = {
  name: "",
  symbol: "USDC",
  decimals: 6,
  min_stake_amount_base: "",
  max_stake_amount_base: "",
  staking_days: 30,
  daily_interest_bps: "50",
  is_active: true,
};

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
      <span className={cn("min-w-0 flex-1 truncate", textClassName)} title={safeValue ?? "-"}>
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

export function PoliciesTab({ actorId, role }: { actorId: string; role: SessionRole }) {
  const [policyPage, setPolicyPage] = useState(1);
  const [productPage, setProductPage] = useState(1);
  const [policies, setPolicies] = useState<PolicyVersion[]>([]);
  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [policyTotal, setPolicyTotal] = useState(0);
  const [productTotal, setProductTotal] = useState(0);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [policyForm, setPolicyForm] = useState({ note: "", effective_from: "", effective_to: "" });
  const [productDraft, setProductDraft] = useState(emptyProduct);
  const [productQueue, setProductQueue] = useState<Array<typeof emptyProduct>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedPolicy = useMemo(() => policies.find((item) => item.id === selectedPolicyId) ?? policies[0] ?? null, [policies, selectedPolicyId]);

  async function load() {
    try {
      const [policyResult, productResult] = await Promise.all([
        api.listPolicies(actorId, { page: policyPage, limit: 10 }),
        api.listStakingProducts(actorId, { page: productPage, limit: 10, policy_id: selectedPolicyId || undefined }),
      ]);
      setPolicies(policyResult.policy_versions);
      setProducts(productResult.staking_products);
      setPolicyTotal(policyResult.total);
      setProductTotal(productResult.total);
      if (!selectedPolicyId && policyResult.policy_versions[0]) {
        setSelectedPolicyId(policyResult.policy_versions[0].id);
      }
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message ?? "정책/상품 데이터를 불러오지 못했습니다.");
    }
  }

  useEffect(() => {
    void load();
  }, [policyPage, productPage, selectedPolicyId]);

  async function handleCreatePolicy() {
    try {
      const response = await api.createPolicy(actorId, {
        note: policyForm.note || null,
        effective_from: policyForm.effective_from || null,
        effective_to: policyForm.effective_to || null,
      });
      setNotice(`정책 생성 완료: ${response.policy_id}`);
      setPolicyForm({ note: "", effective_from: "", effective_to: "" });
      await load();
    } catch (actionError: any) {
      setError(actionError.message ?? "정책 생성에 실패했습니다.");
    }
  }

  async function handleActivate(policyId: string) {
    try {
      await api.activatePolicy(actorId, policyId);
      setNotice(`정책 ${policyId}를 활성 상태로 변경했습니다.`);
      await load();
    } catch (actionError: any) {
      setError(actionError.message ?? "정책 활성화에 실패했습니다.");
    }
  }

  async function submitProducts() {
    if (!selectedPolicy || productQueue.length === 0) return;
    try {
      const response = await api.createStakingProducts(actorId, { policy_id: selectedPolicy.id, products: productQueue });
      setNotice(`상품 ${response.upserted}건을 등록했습니다.`);
      setProductQueue([]);
      await load();
    } catch (actionError: any) {
      setError(actionError.message ?? "상품 등록에 실패했습니다.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <div className="space-y-6">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-50">정책 버전</h2>
              <p className="text-sm text-slate-400">정책 생성과 활성 전환을 관리합니다.</p>
            </div>
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
          {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
          <div className="hidden md:block">
            <TableShell>
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>정책 ID</th>
                    <th>상태</th>
                    <th>메모</th>
                    <th>유효기간</th>
                    <th>처리</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelectedPolicyId(policy.id)}>
                      <td className="max-w-[240px]">
                        <CopyableValue label="정책 ID" value={policy.id} textClassName="font-mono text-xs text-slate-300" />
                      </td>
                      <td><StatusBadge value={policy.status} /></td>
                      <td className="max-w-[240px] truncate" title={policy.note ?? "-"}>
                        {policy.note ?? "-"}
                      </td>
                      <td className="text-slate-400">{policy.effective_from ?? "-"} ~ {policy.effective_to ?? "-"}</td>
                      <td>
                        {role === "ADMIN" && policy.status !== "ACTIVE" ? (
                          <Button variant="primary" onClick={(event) => { event.stopPropagation(); void handleActivate(policy.id); }}>활성화</Button>
                        ) : (
                          <span className="text-xs text-slate-500">조회 전용</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </div>
          <div className="space-y-3 md:hidden">
            {policies.map((policy) => {
              const active = (selectedPolicy?.id ?? "") === policy.id;
              return (
                <div
                  key={policy.id}
                  className={cn(
                    "rounded-[24px] border border-slate-800 bg-slate-950/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                    active && "border-blue-500/40 bg-blue-500/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CopyableValue label="정책 ID" value={policy.id} textClassName="font-mono text-xs text-slate-300" />
                      <div className="mt-2 text-sm text-slate-400">{policy.note ?? "메모 없음"}</div>
                    </div>
                    <StatusBadge value={policy.status} />
                  </div>
                  <dl className="mt-4 grid gap-3">
                    <DetailItem label="유효기간" value={`${policy.effective_from ?? "-"} ~ ${policy.effective_to ?? "-"}`} />
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant={active ? "primary" : "secondary"}
                      className="flex-1"
                      onClick={() => setSelectedPolicyId(policy.id)}
                    >
                      {active ? "선택됨" : "상품 보기"}
                    </Button>
                    {role === "ADMIN" && policy.status !== "ACTIVE" ? (
                      <Button variant="ghost" className="flex-1" onClick={() => void handleActivate(policy.id)}>
                        활성화
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4"><Pagination page={policyPage} limit={10} total={policyTotal} onChange={setPolicyPage} /></div>
        </Card>

        <Card>
          <h3 className="mb-4 text-lg font-bold text-slate-50">상품 목록</h3>
          <div className="mb-3 text-sm text-slate-400">
            선택된 정책: <span className="text-slate-200">{selectedPolicy ? "적용됨" : "없음"}</span>
          </div>
          <div className="hidden md:block">
            <TableShell>
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>상품명</th>
                    <th>심볼</th>
                    <th>기간</th>
                    <th>일일 이자율(bp)</th>
                    <th>금액 범위</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="max-w-[220px] truncate" title={product.name}>{product.name}</td>
                      <td>{product.symbol}/{product.decimals}</td>
                      <td className="tabular">{product.staking_days}일</td>
                      <td className="tabular">{product.daily_interest_bps}</td>
                      <td className="font-mono text-xs text-slate-400">{product.min_stake_amount_base} ~ {product.max_stake_amount_base}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </div>
          <div className="space-y-3 md:hidden">
            {products.map((product) => (
              <div key={product.id} className="rounded-[24px] border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-100" title={product.name}>{product.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{product.symbol} / 소수 {product.decimals}</div>
                  </div>
                  <div className="tabular text-sm text-slate-100">{product.staking_days}일</div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <DetailItem label="일일 이자율" value={<span className="tabular">{product.daily_interest_bps} bp</span>} />
                  <DetailItem
                    label="금액 범위"
                    value={<span className="font-mono text-xs text-slate-400">{product.min_stake_amount_base} ~ {product.max_stake_amount_base}</span>}
                    className="col-span-2"
                  />
                </dl>
              </div>
            ))}
          </div>
          <div className="mt-4"><Pagination page={productPage} limit={10} total={productTotal} onChange={setProductPage} /></div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <h3 className="text-lg font-bold text-slate-50">정책 생성</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER 권한에서는 생성/활성화 버튼이 숨겨집니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <FormField label="메모">
                <TextField
                  placeholder="정책 메모를 입력하세요"
                  value={policyForm.note}
                  onChange={(e) => setPolicyForm((v) => ({ ...v, note: e.target.value }))}
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="적용 시작일">
                  <TextField
                    type="date"
                    value={policyForm.effective_from}
                    onChange={(e) => setPolicyForm((v) => ({ ...v, effective_from: e.target.value }))}
                  />
                </FormField>
                <FormField label="적용 종료일">
                  <TextField
                    type="date"
                    value={policyForm.effective_to}
                    onChange={(e) => setPolicyForm((v) => ({ ...v, effective_to: e.target.value }))}
                  />
                </FormField>
              </div>
              <Button onClick={() => void handleCreatePolicy()}><Plus className="mr-2 h-4 w-4" />정책 생성</Button>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-slate-50">상품 배치 생성</h3>
          {role !== "ADMIN" ? (
            <FeedbackState title="조회 전용" description="READER는 상품 등록 버튼이 표시되지 않습니다." />
          ) : (
            <div className="mt-4 space-y-3">
              <FormField label="상품명">
                <TextField
                  placeholder="상품명을 입력하세요"
                  value={productDraft.name}
                  onChange={(e) => setProductDraft((v) => ({ ...v, name: e.target.value }))}
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="심볼">
                  <TextField
                    placeholder="예: USDC"
                    value={productDraft.symbol}
                    onChange={(e) => setProductDraft((v) => ({ ...v, symbol: e.target.value }))}
                  />
                </FormField>
                <FormField label="소수 자릿수">
                  <TextField
                    type="number"
                    inputMode="numeric"
                    placeholder="소수 자릿수를 입력하세요"
                    value={productDraft.decimals}
                    onChange={(e) => setProductDraft((v) => ({ ...v, decimals: Number(e.target.value) }))}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="최소 스테이킹 금액">
                  <TextField
                    className="font-mono"
                    inputMode="numeric"
                    placeholder="최소 금액을 입력하세요"
                    value={productDraft.min_stake_amount_base}
                    onChange={(e) => setProductDraft((v) => ({ ...v, min_stake_amount_base: e.target.value }))}
                  />
                </FormField>
                <FormField label="최대 스테이킹 금액">
                  <TextField
                    className="font-mono"
                    inputMode="numeric"
                    placeholder="최대 금액을 입력하세요"
                    value={productDraft.max_stake_amount_base}
                    onChange={(e) => setProductDraft((v) => ({ ...v, max_stake_amount_base: e.target.value }))}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="스테이킹 기간(일)">
                  <TextField
                    type="number"
                    inputMode="numeric"
                    placeholder="기간(일)을 입력하세요"
                    value={productDraft.staking_days}
                    onChange={(e) => setProductDraft((v) => ({ ...v, staking_days: Number(e.target.value) }))}
                  />
                </FormField>
                <FormField label="일일 이자율(bp)">
                  <TextField
                    className="font-mono"
                    inputMode="numeric"
                    placeholder="일일 이자율을 입력하세요"
                    value={productDraft.daily_interest_bps}
                    onChange={(e) => setProductDraft((v) => ({ ...v, daily_interest_bps: e.target.value }))}
                  />
                </FormField>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => { setProductQueue((current) => [...current, productDraft]); setProductDraft(emptyProduct); }}>큐에 추가</Button>
                <Button disabled={!selectedPolicy || productQueue.length === 0} onClick={() => void submitProducts()}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> 배치 등록
                </Button>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                <div className="mb-2 font-semibold">등록 대기 큐 ({productQueue.length})</div>
                {productQueue.length === 0 ? (
                  <div className="text-slate-500">아직 추가된 상품이 없습니다.</div>
                ) : (
                  productQueue.map((item, index) => (
                    <div key={`${item.name}-${index}`} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-2 text-slate-400">
                      {item.name} / {item.staking_days}일 / {item.daily_interest_bps}bps
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
