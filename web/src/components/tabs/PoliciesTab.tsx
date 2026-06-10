import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Plus, RefreshCcw } from "lucide-react";
import { api, type PolicyVersion, type SessionRole, type StakingProduct } from "@/lib/api";
import { Button, Card, FeedbackState, Pagination, StatusBadge, TableShell } from "@/components/ui";

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
      setNotice(`정책 ${policyId}를 ACTIVE로 전환했습니다.`);
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
              <p className="text-sm text-slate-400">정책 생성과 ACTIVE 전환을 관리합니다.</p>
            </div>
            <Button variant="secondary" onClick={() => void load()}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              새로고침
            </Button>
          </div>
          {error ? <FeedbackState title="오류" description={error} tone="error" /> : null}
          {notice ? <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
          <TableShell>
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>정책 ID</th>
                  <th>상태</th>
                  <th>메모</th>
                  <th>유효기간</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id} className="cursor-pointer hover:bg-slate-800/60" onClick={() => setSelectedPolicyId(policy.id)}>
                    <td className="font-mono text-xs text-slate-300">{policy.id}</td>
                    <td><StatusBadge value={policy.status} /></td>
                    <td>{policy.note ?? "-"}</td>
                    <td className="text-slate-400">{policy.effective_from ?? "-"} ~ {policy.effective_to ?? "-"}</td>
                    <td>
                      {role === "ADMIN" && policy.status !== "ACTIVE" ? (
                        <Button variant="primary" onClick={(event) => { event.stopPropagation(); void handleActivate(policy.id); }}>활성화</Button>
                      ) : (
                        <span className="text-xs text-slate-500">읽기 전용</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <div className="mt-4"><Pagination page={policyPage} limit={10} total={policyTotal} onChange={setPolicyPage} /></div>
        </Card>

        <Card>
          <h3 className="mb-4 text-lg font-bold text-slate-50">상품 목록</h3>
          <TableShell>
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>상품명</th>
                  <th>심볼</th>
                  <th>기간</th>
                  <th>일일 이자(bps)</th>
                  <th>금액 범위(base)</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.symbol}/{product.decimals}</td>
                    <td className="tabular">{product.staking_days}일</td>
                    <td className="tabular">{product.daily_interest_bps}</td>
                    <td className="font-mono text-xs text-slate-400">{product.min_stake_amount_base} ~ {product.max_stake_amount_base}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
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
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="메모" value={policyForm.note} onChange={(e) => setPolicyForm((v) => ({ ...v, note: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="effective_from" value={policyForm.effective_from} onChange={(e) => setPolicyForm((v) => ({ ...v, effective_from: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="effective_to" value={policyForm.effective_to} onChange={(e) => setPolicyForm((v) => ({ ...v, effective_to: e.target.value }))} />
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
              <input className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="상품명" value={productDraft.name} onChange={(e) => setProductDraft((v) => ({ ...v, name: e.target.value }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" placeholder="심볼" value={productDraft.symbol} onChange={(e) => setProductDraft((v) => ({ ...v, symbol: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" type="number" placeholder="decimals" value={productDraft.decimals} onChange={(e) => setProductDraft((v) => ({ ...v, decimals: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono" placeholder="min_stake_amount_base" value={productDraft.min_stake_amount_base} onChange={(e) => setProductDraft((v) => ({ ...v, min_stake_amount_base: e.target.value }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono" placeholder="max_stake_amount_base" value={productDraft.max_stake_amount_base} onChange={(e) => setProductDraft((v) => ({ ...v, max_stake_amount_base: e.target.value }))} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3" type="number" placeholder="staking_days" value={productDraft.staking_days} onChange={(e) => setProductDraft((v) => ({ ...v, staking_days: Number(e.target.value) }))} />
                <input className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 font-mono" placeholder="daily_interest_bps" value={productDraft.daily_interest_bps} onChange={(e) => setProductDraft((v) => ({ ...v, daily_interest_bps: e.target.value }))} />
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => { setProductQueue((current) => [...current, productDraft]); setProductDraft(emptyProduct); }}>큐에 추가</Button>
                <Button disabled={!selectedPolicy || productQueue.length === 0} onClick={() => void submitProducts()}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> 배치 등록
                </Button>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300">
                <div className="mb-2 font-semibold">등록 대기 큐 ({productQueue.length})</div>
                {productQueue.length === 0 ? <div className="text-slate-500">아직 추가된 상품이 없습니다.</div> : productQueue.map((item, index) => <div key={`${item.name}-${index}`} className="py-1 text-slate-400">{item.name} / {item.staking_days}일 / {item.daily_interest_bps}bps</div>)}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
