import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CheckCircle2, Copy, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import { api, type PolicyVersion, type SessionRole, type StakingProduct } from "@/lib/api";
import { Button, Card, FeedbackState, FormField, Pagination, StatusBadge, TableShell, TextField, cn } from "@/components/ui";

const emptyPolicyForm = {
  name: "",
  version: "",
  note: "",
  effective_from: "",
  effective_to: "",
};

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

export function getProductQueueKey(product: typeof emptyProduct) {
  return [
    product.name.trim().toLowerCase(),
    product.symbol.trim().toLowerCase(),
    product.decimals,
    product.min_stake_amount_base.trim(),
    product.max_stake_amount_base.trim(),
    product.staking_days,
    product.daily_interest_bps.trim(),
  ].join("::");
}

export function getProductQueueSummary(product: typeof emptyProduct) {
  return `${product.symbol} · ${product.min_stake_amount_base || "-"}~${product.max_stake_amount_base || "-"} · ${product.staking_days}일 · ${product.daily_interest_bps}bps`;
}

function formatProductBatchError(error: any) {
  const baseMessage = error?.message ?? "상품 등록에 실패했습니다.";
  const details = error?.details;
  if (!details || typeof details !== "object") {
    return baseMessage;
  }

  const index = typeof (details as { index?: unknown }).index === "number" ? (details as { index: number }).index : null;
  const name = typeof (details as { name?: unknown }).name === "string" ? (details as { name: string }).name : null;
  if (index === null && !name) {
    return baseMessage;
  }

  return `${baseMessage}${index !== null ? ` (${index + 1}번째 상품` : " ("}${name ? `: ${name}` : ""})`;
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

export function PolicyCreateModal({
  open,
  submitting,
  error,
  form,
  onChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  form: typeof emptyPolicyForm;
  onChange: (next: typeof emptyPolicyForm) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:py-6">
      <div className="modal-panel my-auto max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto sm:max-h-[calc(100vh-3rem)]">
        <div className="sticky top-0 z-10 -mx-6 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-6 pb-4 pt-1 backdrop-blur">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Policy Management</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">정책 생성</h3>
            <p className="mt-2 text-sm text-slate-400">새 정책 버전을 생성한 뒤 목록에서 활성화 여부를 결정합니다.</p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100"
            onClick={onClose}
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          <div className="font-semibold">생성 규칙</div>
          <ul className="mt-2 space-y-1 text-blue-100/85">
            <li>새 정책은 항상 `DRAFT` 상태로 생성됩니다.</li>
            <li>정책명과 버전은 필수이며, 같은 조합은 중복 생성할 수 없습니다.</li>
            <li>운영 반영은 생성 이후 목록에서 별도로 활성화해야 합니다.</li>
            <li>메모와 유효기간은 설명 및 운영 이력 확인용으로 사용됩니다.</li>
          </ul>
        </div>

        {error ? <div className="mt-4"><FeedbackState title="생성 실패" description={error} tone="error" /></div> : null}

        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="정책명">
              <TextField
                placeholder="예: BJC 기본 스테이킹 정책"
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                disabled={submitting}
              />
            </FormField>
            <FormField label="버전">
              <TextField
                placeholder="예: V1"
                value={form.version}
                onChange={(e) => onChange({ ...form, version: e.target.value })}
                disabled={submitting}
              />
            </FormField>
          </div>
          <FormField label="메모">
            <TextField
              placeholder="정책 설명 또는 운영 메모를 입력하세요"
              value={form.note}
              onChange={(e) => onChange({ ...form, note: e.target.value })}
              disabled={submitting}
            />
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="적용 시작일">
              <TextField
                type="date"
                value={form.effective_from}
                onChange={(e) => onChange({ ...form, effective_from: e.target.value })}
                disabled={submitting}
              />
            </FormField>
            <FormField label="적용 종료일">
              <TextField
                type="date"
                value={form.effective_to}
                onChange={(e) => onChange({ ...form, effective_to: e.target.value })}
                disabled={submitting}
              />
            </FormField>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex justify-end gap-3 border-t border-slate-800 bg-slate-900/95 px-6 pb-1 pt-4 backdrop-blur">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
          <Button onClick={() => void onSubmit()} disabled={submitting}>
            <Plus className="mr-2 h-4 w-4" />
            {submitting ? "생성 중..." : "정책 생성"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductBatchModal({
  open,
  submitting,
  error,
  selectedPolicy,
  productDraft,
  productQueue,
  onChangeDraft,
  onAddQueue,
  onRemoveQueue,
  onClearQueue,
  onClose,
  onSubmit,
}: {
  open: boolean;
  submitting: boolean;
  error: string | null;
  selectedPolicy: PolicyVersion | null;
  productDraft: typeof emptyProduct;
  productQueue: Array<typeof emptyProduct>;
  onChangeDraft: (next: typeof emptyProduct) => void;
  onAddQueue: () => void;
  onRemoveQueue: (index: number) => void;
  onClearQueue: () => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:py-6">
      <div className="modal-panel my-auto max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto sm:max-h-[calc(100vh-3rem)]">
        <div className="sticky top-0 z-10 -mx-6 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-6 pb-4 pt-1 backdrop-blur">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Product Batch</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">상품 배치 생성</h3>
            <p className="mt-2 text-sm text-slate-400">선택된 정책 버전에 연결할 상품을 여러 건 준비한 뒤 한 번에 등록합니다.</p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100"
            onClick={onClose}
            disabled={submitting}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
          <div className="font-semibold">등록 대상 정책</div>
          <div className="mt-2 text-sm font-medium text-blue-50">
            {selectedPolicy ? `${selectedPolicy.name} ${selectedPolicy.version}` : "선택된 정책 없음"}
          </div>
          <div className="mt-2 break-all font-mono text-xs text-blue-100/85">{selectedPolicy?.id ?? "-"}</div>
          <ul className="mt-3 space-y-1 text-blue-100/85">
            <li>상품은 현재 선택된 정책 버전에만 연결됩니다.</li>
            <li>여러 상품을 큐에 담은 뒤 배치 등록할 수 있습니다.</li>
            <li>최소 금액은 최대 금액보다 클 수 없습니다.</li>
          </ul>
        </div>

        {error ? <div className="mt-4"><FeedbackState title="등록 실패" description={error} tone="error" /></div> : null}

        <div className="mt-4 space-y-3">
          <FormField label="상품명">
            <TextField
              placeholder="상품명을 입력하세요"
              value={productDraft.name}
              onChange={(e) => onChangeDraft({ ...productDraft, name: e.target.value })}
              disabled={submitting}
            />
          </FormField>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="심볼">
              <TextField
                placeholder="예: USDC"
                value={productDraft.symbol}
                onChange={(e) => onChangeDraft({ ...productDraft, symbol: e.target.value })}
                disabled={submitting}
              />
            </FormField>
            <FormField label="소수 자릿수">
              <TextField
                type="number"
                inputMode="numeric"
                placeholder="소수 자릿수를 입력하세요"
                value={productDraft.decimals}
                onChange={(e) => onChangeDraft({ ...productDraft, decimals: Number(e.target.value) })}
                disabled={submitting}
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
                onChange={(e) => onChangeDraft({ ...productDraft, min_stake_amount_base: e.target.value })}
                disabled={submitting}
              />
            </FormField>
            <FormField label="최대 스테이킹 금액">
              <TextField
                className="font-mono"
                inputMode="numeric"
                placeholder="최대 금액을 입력하세요"
                value={productDraft.max_stake_amount_base}
                onChange={(e) => onChangeDraft({ ...productDraft, max_stake_amount_base: e.target.value })}
                disabled={submitting}
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
                onChange={(e) => onChangeDraft({ ...productDraft, staking_days: Number(e.target.value) })}
                disabled={submitting}
              />
            </FormField>
            <FormField label="일일 이자율(bp)">
              <TextField
                className="font-mono"
                inputMode="numeric"
                placeholder="일일 이자율을 입력하세요"
                value={productDraft.daily_interest_bps}
                onChange={(e) => onChangeDraft({ ...productDraft, daily_interest_bps: e.target.value })}
                disabled={submitting}
              />
            </FormField>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onAddQueue} disabled={submitting}>
              큐에 추가
            </Button>
            <Button disabled={!selectedPolicy || productQueue.length === 0 || submitting} onClick={() => void onSubmit()}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {submitting ? "등록 중..." : "배치 등록"}
            </Button>
            <Button variant="ghost" onClick={onClearQueue} disabled={productQueue.length === 0 || submitting}>
              큐 전체 비우기
            </Button>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
            <div className="mb-2 font-semibold">등록 대기 큐 ({productQueue.length})</div>
            {productQueue.length === 0 ? (
              <div className="text-slate-500">아직 추가된 상품이 없습니다.</div>
            ) : (
              productQueue.map((item, index) => (
                <div key={`${getProductQueueKey(item)}-${index}`} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-3 py-3 text-slate-400">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-100">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-400">{getProductQueueSummary(item)}</div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => onRemoveQueue(index)}
                    disabled={submitting}
                    className="shrink-0"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    삭제
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex justify-end gap-3 border-t border-slate-800 bg-slate-900/95 px-6 pb-1 pt-4 backdrop-blur">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            닫기
          </Button>
        </div>
      </div>
    </div>
  );
}

function PolicyDetailModal({
  open,
  policy,
  products,
  onClose,
}: {
  open: boolean;
  policy: PolicyVersion | null;
  products: StakingProduct[];
  onClose: () => void;
}) {
  if (!open || !policy) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 px-4 py-4 backdrop-blur-sm sm:flex sm:items-center sm:justify-center sm:py-6">
      <div className="modal-panel my-auto max-h-[calc(100vh-2rem)] max-w-3xl overflow-y-auto sm:max-h-[calc(100vh-3rem)]">
        <div className="sticky top-0 z-10 -mx-6 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-6 pb-4 pt-1 backdrop-blur">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Policy Detail</div>
            <h3 className="mt-2 text-xl font-bold text-slate-50">{policy.name}</h3>
            <p className="mt-2 text-sm text-slate-400">{policy.version} · {policy.status}</p>
          </div>
          <button type="button" className="rounded-2xl border border-slate-800 p-2 text-slate-400 hover:text-slate-100" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>


        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">기본 정보</div>
            <dl className="mt-4 grid gap-4">
              <DetailItem label="정책명" value={policy.name} />
              <DetailItem label="버전" value={policy.version} />
              <DetailItem label="정책 ID" value={<CopyableValue label="정책 ID" value={policy.id} textClassName="font-mono text-xs text-slate-300" />} />
              <DetailItem label="상태" value={<StatusBadge value={policy.status} />} />
              <DetailItem label="메모" value={policy.note ?? "메모 없음"} />
              <DetailItem label="유효기간" value={`${policy.effective_from ?? "-"} ~ ${policy.effective_to ?? "-"}`} />
            </dl>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">운영 이력</div>
            <dl className="mt-4 grid gap-4">
              <DetailItem label="생성일시" value={policy.created_at} />
              <DetailItem label="활성화 일시" value={policy.activated_at ?? "-"} />
              <DetailItem label="종료 일시" value={policy.retired_at ?? "-"} />
              <DetailItem label="연결 상품 수" value={<span className="tabular">{products.length}건</span>} />
            </dl>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">연결 상품</div>
              <div className="mt-1 text-sm text-slate-400">현재 선택된 정책에 매핑된 상품 목록입니다.</div>
            </div>
            <div className="text-sm text-slate-400">{products.length}건</div>
          </div>
          <div className="mt-4 space-y-3">
            {products.length === 0 ? (
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 text-sm text-slate-500">연결된 상품이 없습니다.</div>
            ) : (
              products.map((product) => (
                <div key={product.id} className="rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-100">{product.name}</div>
                      <div className="mt-1 text-xs text-slate-400">{product.symbol} / 소수 {product.decimals}</div>
                    </div>
                    <div className="text-xs text-slate-400">{product.staking_days}일 / {product.daily_interest_bps}bp</div>
                  </div>
                  <div className="mt-2 font-mono text-xs text-slate-500">{product.min_stake_amount_base} ~ {product.max_stake_amount_base}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 -mx-6 mt-6 flex justify-end border-t border-slate-800 bg-slate-900/95 px-6 pb-1 pt-4 backdrop-blur">
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
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
  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [productDraft, setProductDraft] = useState(emptyProduct);
  const [productQueue, setProductQueue] = useState<Array<typeof emptyProduct>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isCreatePolicyModalOpen, setIsCreatePolicyModalOpen] = useState(false);
  const [isCreatingPolicy, setIsCreatingPolicy] = useState(false);
  const [createPolicyError, setCreatePolicyError] = useState<string | null>(null);
  const [isProductBatchModalOpen, setIsProductBatchModalOpen] = useState(false);
  const [isSubmittingProducts, setIsSubmittingProducts] = useState(false);
  const [productSubmitError, setProductSubmitError] = useState<string | null>(null);
  const [isPolicyDetailModalOpen, setIsPolicyDetailModalOpen] = useState(false);

  const selectedPolicy = useMemo(() => policies.find((item) => item.id === selectedPolicyId) ?? policies[0] ?? null, [policies, selectedPolicyId]);

  function closeCreatePolicyModal() {
    if (isCreatingPolicy) return;
    setIsCreatePolicyModalOpen(false);
    setCreatePolicyError(null);
  }

  function closeProductBatchModal() {
    if (isSubmittingProducts) return;
    setIsProductBatchModalOpen(false);
    setProductSubmitError(null);
  }

  function addProductToQueue() {
    const normalizedDraft = {
      ...productDraft,
      name: productDraft.name.trim(),
      symbol: productDraft.symbol.trim(),
      min_stake_amount_base: productDraft.min_stake_amount_base.trim(),
      max_stake_amount_base: productDraft.max_stake_amount_base.trim(),
      daily_interest_bps: productDraft.daily_interest_bps.trim(),
    };

    if (!normalizedDraft.name) {
      setProductSubmitError("상품명을 입력해 주세요.");
      return;
    }
    if (!normalizedDraft.symbol) {
      setProductSubmitError("심볼을 입력해 주세요.");
      return;
    }
    if (!normalizedDraft.min_stake_amount_base) {
      setProductSubmitError("최소 스테이킹 금액을 입력해 주세요.");
      return;
    }
    if (!normalizedDraft.max_stake_amount_base) {
      setProductSubmitError("최대 스테이킹 금액을 입력해 주세요.");
      return;
    }
    if (!normalizedDraft.daily_interest_bps) {
      setProductSubmitError("일일 이자율을 입력해 주세요.");
      return;
    }
    if (productQueue.some((item) => getProductQueueKey(item) === getProductQueueKey(normalizedDraft))) {
      setProductSubmitError("이미 큐에 추가된 상품입니다.");
      return;
    }

    setProductQueue((current) => [...current, normalizedDraft]);
    setProductDraft(emptyProduct);
    setProductSubmitError(null);
  }

  function openPolicyDetail(policyId: string) {
    setSelectedPolicyId(policyId);
    setIsPolicyDetailModalOpen(true);
  }

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
      setIsCreatingPolicy(true);
      setCreatePolicyError(null);
      const response = await api.createPolicy(actorId, {
        name: policyForm.name,
        version: policyForm.version,
        note: policyForm.note || null,
        effective_from: policyForm.effective_from || null,
        effective_to: policyForm.effective_to || null,
      });
      setNotice(`정책 생성 완료: ${response.name} ${response.version}`);
      setPolicyForm(emptyPolicyForm);
      setIsCreatePolicyModalOpen(false);
      await load();
    } catch (actionError: any) {
      setCreatePolicyError(actionError.message ?? "정책 생성에 실패했습니다.");
    } finally {
      setIsCreatingPolicy(false);
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
      setIsSubmittingProducts(true);
      setProductSubmitError(null);
      // #region debug-point A:submit-products
      fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "product-batch-fail",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "PoliciesTab.tsx:submitProducts",
          msg: "[DEBUG] submit product batch request",
          data: {
            policy_id: selectedPolicy.id,
            queue_size: productQueue.length,
            products: productQueue.map((product, index) => ({
              index,
              name: product.name,
              symbol: product.symbol,
              decimals: product.decimals,
              min_stake_amount_base: product.min_stake_amount_base,
              max_stake_amount_base: product.max_stake_amount_base,
              staking_days: product.staking_days,
              daily_interest_bps: product.daily_interest_bps,
              is_active: product.is_active,
            })),
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const response = await api.createStakingProducts(actorId, { policy_id: selectedPolicy.id, products: productQueue });
      setNotice(`상품 ${response.upserted}건을 등록했습니다.`);
      setProductQueue([]);
      setIsProductBatchModalOpen(false);
      await load();
    } catch (actionError: any) {
      // #region debug-point B:submit-products-error
      fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "product-batch-fail",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "PoliciesTab.tsx:submitProducts:catch",
          msg: "[DEBUG] submit product batch failed",
          data: {
            message: actionError?.message ?? null,
            details: actionError?.details ?? null,
            queue_size: productQueue.length,
            policy_id: selectedPolicy.id,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setProductSubmitError(formatProductBatchError(actionError));
    } finally {
      setIsSubmittingProducts(false);
    }
  }

  return (
    <>
      <div className="w-full">
        <div className="space-y-6">
          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-50">정책 버전</h2>
                <p className="text-sm text-slate-400">정책 생성과 활성 전환을 관리합니다.</p>
              </div>
              <div className="flex items-center gap-2">
                {role === "ADMIN" ? (
                  <Button
                    onClick={() => {
                      setCreatePolicyError(null);
                      setIsCreatePolicyModalOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    정책 생성
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => void load()}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  새로고침
                </Button>
              </div>
            </div>
            {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
            {notice ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
            <div className="hidden md:block">
              <TableShell>
                <table className="data-table min-w-full">
                  <thead>
                    <tr>
                      <th>정책명</th>
                      <th>버전</th>
                      <th>상태</th>
                      <th>적용 시작일</th>
                      <th>적용 종료일</th>
                      <th>생성일</th>
                      <th>처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                          등록된 정책이 없습니다. 새 정책을 등록해 주세요.
                        </td>
                      </tr>
                    ) : (
                      policies.map((policy) => (
                        <tr key={policy.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelectedPolicyId(policy.id)}>
                          <td className="max-w-[280px]">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-100" title={policy.name}>{policy.name}</div>
                              <div className="mt-1">
                                <CopyableValue label="정책 ID" value={policy.id} textClassName="font-mono text-xs text-slate-400" />
                              </div>
                            </div>
                          </td>
                          <td className="font-medium text-slate-200">{policy.version}</td>
                          <td><StatusBadge value={policy.status} /></td>
                          <td className="text-slate-400">{policy.effective_from ?? "-"}</td>
                          <td className="text-slate-400">{policy.effective_to ?? "-"}</td>
                          <td className="text-slate-400">{policy.created_at.slice(0, 10)}</td>
                          <td>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="secondary" onClick={(event) => { event.stopPropagation(); openPolicyDetail(policy.id); }}>상세 보기</Button>
                              {role === "ADMIN" && policy.status !== "ACTIVE" ? (
                                <Button variant="primary" onClick={(event) => { event.stopPropagation(); void handleActivate(policy.id); }}>활성화</Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </TableShell>
            </div>
            <div className="space-y-3 md:hidden">
              {policies.length === 0 ? (
                <div className="rounded-[24px] border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">
                  등록된 정책이 없습니다. 새 정책을 등록해 주세요.
                </div>
              ) : policies.map((policy) => {
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
                        <div className="truncate text-sm font-semibold text-slate-100">{policy.name}</div>
                        <div className="mt-1 text-xs text-slate-400">{policy.version}</div>
                        <div className="mt-2">
                          <CopyableValue label="정책 ID" value={policy.id} textClassName="font-mono text-xs text-slate-400" />
                        </div>
                      </div>
                      <StatusBadge value={policy.status} />
                    </div>
                    <dl className="mt-4 grid gap-3">
                      <DetailItem label="적용 시작일" value={policy.effective_from ?? "-"} />
                      <DetailItem label="적용 종료일" value={policy.effective_to ?? "-"} />
                      <DetailItem label="생성일" value={policy.created_at.slice(0, 10)} />
                      <DetailItem label="메모" value={policy.note ?? "메모 없음"} />
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        variant={active ? "primary" : "secondary"}
                        className="flex-1"
                        onClick={() => setSelectedPolicyId(policy.id)}
                      >
                        {active ? "선택됨" : "상품 보기"}
                      </Button>
                      <Button variant="secondary" className="flex-1" onClick={() => openPolicyDetail(policy.id)}>
                        상세 보기
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
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-50">선택된 정책 요약</h3>
                <p className="mt-1 text-sm text-slate-400">정책을 선택하면 아래 상품 목록이 해당 정책 기준으로 변경됩니다.</p>
              </div>
              {selectedPolicy ? (
                <Button variant="secondary" onClick={() => setIsPolicyDetailModalOpen(true)}>
                  상세 보기
                </Button>
              ) : null}
            </div>
            {selectedPolicy ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">정책명</div>
                  <div className="mt-3 text-sm font-semibold text-slate-100">{selectedPolicy.name}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">버전</div>
                  <div className="mt-3 text-sm font-semibold text-slate-100">{selectedPolicy.version}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">정책 상태</div>
                  <div className="mt-3"><StatusBadge value={selectedPolicy.status} /></div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">유효기간</div>
                  <div className="mt-3 text-sm text-slate-200">{selectedPolicy.effective_from ?? "-"} ~ {selectedPolicy.effective_to ?? "-"}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">연결 상품 수</div>
                  <div className="mt-3 text-lg font-semibold tabular text-slate-100">{products.length}건</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">메모</div>
                  <div className="mt-3 text-sm text-slate-200">{selectedPolicy.note ?? "메모 없음"}</div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-500">정책을 선택하면 요약 정보와 연결 상품이 표시됩니다.</div>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-50">상품 목록</h3>
                <div className="mt-1 text-sm text-slate-400">
                  선택된 정책: <span className="text-slate-200">{selectedPolicy ? `${selectedPolicy.name} ${selectedPolicy.version}` : "없음"}</span>
                </div>
              </div>
              {role === "ADMIN" ? (
                <Button
                  onClick={() => {
                    setProductSubmitError(null);
                    setIsProductBatchModalOpen(true);
                  }}
                  disabled={!selectedPolicy}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  상품 배치 생성
                </Button>
              ) : null}
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
      </div>
      <PolicyCreateModal
        open={isCreatePolicyModalOpen}
        submitting={isCreatingPolicy}
        error={createPolicyError}
        form={policyForm}
        onChange={setPolicyForm}
        onClose={closeCreatePolicyModal}
        onSubmit={handleCreatePolicy}
      />
      <ProductBatchModal
        open={isProductBatchModalOpen}
        submitting={isSubmittingProducts}
        error={productSubmitError}
        selectedPolicy={selectedPolicy}
        productDraft={productDraft}
        productQueue={productQueue}
        onChangeDraft={setProductDraft}
        onAddQueue={addProductToQueue}
        onRemoveQueue={(index) => {
          setProductQueue((current) => current.filter((_, currentIndex) => currentIndex !== index));
        }}
        onClearQueue={() => {
          setProductQueue([]);
        }}
        onClose={closeProductBatchModal}
        onSubmit={submitProducts}
      />
      <PolicyDetailModal
        open={isPolicyDetailModalOpen}
        policy={selectedPolicy}
        products={products}
        onClose={() => setIsPolicyDetailModalOpen(false)}
      />
    </>
  );
}
