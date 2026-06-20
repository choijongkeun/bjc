import { useEffect, useState } from "react";
import { ArrowUpRight, Clock3, FolderClock, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  api,
  getErrorMessage,
  type AccountStaking,
  type AccountStakingListResponse,
  type StakingProduct,
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";
import { getStakingStatusLabel, type UserStakingFilter } from "@/lib/staking";
import { useSessionStore } from "@/store/sessionStore";
import { FeedbackState } from "@/components/FeedbackState";
import { Pagination } from "@/components/Pagination";
import { StakingApplyModal } from "@/components/StakingApplyModal";
import { StakingProductCard } from "@/components/StakingProductCard";
import { StakingStatusBadge } from "@/components/StakingStatusBadge";
import { UserShell } from "@/components/UserShell";
import { Badge, Button, Card, SectionTitle, TableShell } from "@/components/ui";

const FILTERS: Array<{ key: UserStakingFilter; label: string }> = [
  { key: "ALL", label: "전체" },
  { key: "PENDING", label: "대기" },
  { key: "ACTIVE", label: "활성" },
  { key: "CANCEL_REQUESTED", label: "취소 요청" },
  { key: "CANCELLED", label: "취소" },
  { key: "MATURED", label: "만기" },
  { key: "CLOSED", label: "종료" },
];

export default function StakingPage() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const [products, setProducts] = useState<StakingProduct[]>([]);
  const [productLoading, setProductLoading] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [listState, setListState] = useState<AccountStakingListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ active: 0, pending: 0, cancelRequested: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [filter, setFilter] = useState<UserStakingFilter>("ALL");
  const [selectedProduct, setSelectedProduct] = useState<StakingProduct | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<AccountStaking | null>(null);

  async function loadProducts() {
    try {
      setProductLoading(true);
      const result = await api.getStakingProducts({ page: 1, limit: 20 });
      setProducts(result.staking_products);
      setProductError(null);
    } catch (error) {
      setProductError(getErrorMessage(error));
    } finally {
      setProductLoading(false);
    }
  }

  async function loadMyStakings(targetPage = page, targetFilter = filter) {
    if (!accessToken) return;
    try {
      setListLoading(true);
      const result = await api.getMyStakings(
        {
          page: targetPage,
          limit,
          sort: "created_at_desc",
          status: targetFilter === "ALL" ? undefined : targetFilter,
        },
        accessToken
      );
      setListState(result);
      setListError(null);
    } catch (error) {
      setListError(getErrorMessage(error));
    } finally {
      setListLoading(false);
    }
  }

  async function loadSummary() {
    if (!accessToken) return;
    try {
      setSummaryLoading(true);
      const [active, pending, cancelRequested] = await Promise.all([
        api.getMyStakings({ status: "ACTIVE", page: 1, limit: 1 }, accessToken),
        api.getMyStakings({ status: "PENDING", page: 1, limit: 1 }, accessToken),
        api.getMyStakings({ status: "CANCEL_REQUESTED", page: 1, limit: 1 }, accessToken),
      ]);
      setSummary({
        active: active.total,
        pending: pending.total,
        cancelRequested: cancelRequested.total,
      });
    } finally {
      setSummaryLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  useEffect(() => {
    void loadMyStakings();
  }, [accessToken, page, filter]);

  useEffect(() => {
    void loadSummary();
  }, [accessToken]);

  async function handleApply(payload: { staking_product_id: string; principal_amount_base: string; idempotency_key: string }) {
    if (!accessToken) return;
    try {
      setApplyBusy(true);
      setApplyError(null);
      const result = await api.createMyStaking(payload, accessToken);
      setLastCreated(result.staking);
      setSelectedProduct(null);
      await Promise.all([loadMyStakings(1, filter), loadSummary()]);
      setPage(1);
    } catch (error) {
      setApplyError(getErrorMessage(error));
    } finally {
      setApplyBusy(false);
    }
  }

  function changeFilter(nextFilter: UserStakingFilter) {
    setFilter(nextFilter);
    setPage(1);
  }

  return (
    <UserShell
      title="내 스테이킹"
      subtitle="상품을 확인하고 스테이킹을 신청한 뒤, 내 스테이킹 상태를 추적합니다."
      actions={<Badge tone="blue">신청 후 관리자 활성화</Badge>}
    >
      <div className="space-y-6">
        <Card className="p-6">
          <SectionTitle
            eyebrow="스테이킹 현황"
            title="신청 가능한 스테이킹 상품"
            description="신청 후 관리자 승인 전까지는 대기 상태로 표시됩니다."
          />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <SummaryTile icon={<Layers3 className="h-5 w-5" />} label="활성 스테이킹 건수" value={summaryLoading ? "..." : String(summary.active)} />
            <SummaryTile icon={<FolderClock className="h-5 w-5" />} label="대기 중 건수" value={summaryLoading ? "..." : String(summary.pending)} />
            <SummaryTile icon={<Clock3 className="h-5 w-5" />} label="취소 요청 건수" value={summaryLoading ? "..." : String(summary.cancelRequested)} />
          </div>
        </Card>

        {lastCreated ? (
          <FeedbackState
            title="스테이킹 신청 완료"
            description={`상태가 ${getStakingStatusLabel(lastCreated.status)}로 생성되었습니다. 상세 화면에서 진행 상태를 확인할 수 있습니다.`}
            tone="success"
          />
        ) : null}

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-50">상품 목록</h2>
              <p className="text-sm text-slate-400">현재 신청 가능한 상품입니다.</p>
            </div>
            <Button variant="secondary" onClick={() => void loadProducts()}>
              상품 새로고침
            </Button>
          </div>
          <div className="mt-5">
            {productError ? <FeedbackState title="상품 목록 오류" description={productError} tone="error" /> : null}
            {productLoading ? <FeedbackState title="상품 목록 로딩 중" description="스테이킹 상품 목록을 불러오고 있습니다." /> : null}
            {!productLoading && !productError && products.length === 0 ? (
              <FeedbackState title="상품 없음" description="현재 신청 가능한 스테이킹 상품이 없습니다." />
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <StakingProductCard key={product.id} product={product} onApply={setSelectedProduct} />
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-50">내 스테이킹 목록</h2>
              <p className="text-sm text-slate-400">상태별 필터와 상세 보기로 현재 신청 내역을 확인합니다.</p>
            </div>
            <div className="text-sm text-slate-400">
              전체 건수 <span className="tabular text-slate-100">{listState?.total ?? 0}</span>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => changeFilter(item.key)}
                className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                  filter === item.key ? "bg-blue-500 text-white" : "bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            {listError ? <FeedbackState title="목록 조회 오류" description={listError} tone="error" /> : null}
            {listLoading ? <FeedbackState title="목록 로딩 중" description="내 스테이킹 목록을 조회하고 있습니다." /> : null}
            {!listLoading && !listError && (listState?.items.length ?? 0) === 0 ? (
              <FeedbackState title="스테이킹 내역 없음" description="현재 필터 조건에 맞는 스테이킹이 없습니다." />
            ) : null}
            {listState?.items.length ? (
              <>
                <TableShell>
                  <table className="min-w-full text-left text-sm text-slate-300">
                    <thead className="sticky top-0 bg-slate-950/95 text-xs uppercase tracking-[0.16em] text-slate-500">
                      <tr>
                        <th className="px-4 py-3">상품명</th>
                        <th className="px-4 py-3">원금</th>
                        <th className="px-4 py-3">이율</th>
                        <th className="px-4 py-3">기간</th>
                        <th className="px-4 py-3">상태</th>
                        <th className="px-4 py-3">신청일</th>
                        <th className="px-4 py-3">시작일</th>
                        <th className="px-4 py-3">만기 예정일</th>
                        <th className="px-4 py-3 text-right">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listState.items.map((staking) => (
                        <tr key={staking.id} className="border-t border-slate-800/80">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-100">{staking.product.name}</div>
                            <div className="text-xs text-slate-500">{staking.product.symbol}</div>
                          </td>
                          <td className="tabular px-4 py-3">{formatBaseAmount(staking.principal_amount_base, staking.product.decimals)}</td>
                          <td className="px-4 py-3">{staking.daily_interest_bps_snapshot} bps</td>
                          <td className="px-4 py-3">{staking.duration_days_snapshot}일</td>
                          <td className="px-4 py-3"><StakingStatusBadge status={staking.status} /></td>
                          <td className="px-4 py-3 text-slate-400">{formatDateTime(staking.created_at)}</td>
                          <td className="px-4 py-3 text-slate-400">{formatDateTime(staking.started_at)}</td>
                          <td className="px-4 py-3 text-slate-400">{formatDateTime(staking.matures_at)}</td>
                          <td className="px-4 py-3 text-right">
                            <Link to={`/staking/${staking.id}`}>
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
                  <Pagination page={listState.page} limit={listState.limit} total={listState.total} onChange={setPage} />
                </div>
              </>
            ) : null}
          </div>
        </Card>
      </div>

      <StakingApplyModal
        product={selectedProduct}
        open={Boolean(selectedProduct)}
        submitting={applyBusy}
        error={applyError}
        onClose={() => {
          setSelectedProduct(null);
          setApplyError(null);
        }}
        onSubmit={handleApply}
      />
    </UserShell>
  );
}

function SummaryTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-slate-800 bg-slate-950/55 p-4">
      <div className="flex items-center gap-2 text-blue-200">{icon}</div>
      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 tabular text-3xl font-bold text-slate-50">{value}</div>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}
