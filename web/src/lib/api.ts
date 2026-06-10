export type SessionRole = "ADMIN" | "READER" | "USER";

export type PolicyVersion = {
  id: string;
  status: "DRAFT" | "ACTIVE" | "RETIRED";
  note: string | null;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string | null;
  created_at: string;
  activated_at: string | null;
  retired_at: string | null;
};

export type StakingProduct = {
  id: string;
  policy_version_id: string;
  name: string;
  symbol: string;
  decimals: number;
  min_stake_amount_base: string;
  max_stake_amount_base: string;
  staking_days: number;
  daily_interest_bps: string;
  is_active: boolean | number;
  created_at: string;
};

export type LedgerEvent = {
  id: string;
  account_id: string;
  product_id: string;
  policy_version_id: string;
  calc_run_id: string | null;
  event_time: string;
  event_type: string;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string;
  related_account_id: string | null;
  meta: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
};

export type CalcRun = {
  id: string;
  policy_version_id: string;
  run_type: string;
  run_date: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "FINALIZED";
  finalized_at: string | null;
  created_at: string;
  error_message: string | null;
};

export type SettlementItem = {
  id: string;
  calc_run_id: string;
  settlement_type: string;
  account_id: string;
  ledger_event_id: string | null;
  amount_base: string;
  decimals: number;
  symbol: string;
  reference_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_account_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type ReportSummary = {
  total_stake_amount_base: string;
  total_reward_amount_base: string;
  total_fee_amount_base: string;
  total_accounts: string;
  total_ledger_events: string;
  total_calc_runs: string;
  finalized_calc_runs: string;
};

export type PagedResponse<T, K extends string> = Record<K, T[]> & {
  page: number;
  limit: number;
  total: number;
};

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details ?? null;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init: RequestInit & { actorId?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (init.actorId) {
    headers.set("x-actor-account-id", init.actorId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorPayload = typeof payload === "object" && payload && "error" in payload ? (payload as any).error : null;
    throw new ApiError(response.status, errorPayload?.message ?? response.statusText, errorPayload?.details);
  }

  return payload as T;
}

function params(query: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export async function resolveActorRole(actorId: string): Promise<"ADMIN" | "READER"> {
  await request<PagedResponse<PolicyVersion, "policy_versions">>(`/api/policies${params({ page: 1, limit: 1 })}`, {
    method: "GET",
    actorId,
  });
  try {
    await request<PagedResponse<AuditLog, "audit_logs">>(`/api/audit-logs${params({ page: 1, limit: 1 })}`, {
      method: "GET",
      actorId,
    });
    return "ADMIN";
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return "READER";
    }
    throw error;
  }
}

export const api = {
  listPolicies: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<PolicyVersion, "policy_versions">>(`/api/policies${params(query as any)}`, { method: "GET", actorId }),
  createPolicy: (actorId: string, body: { note?: string | null; effective_from?: string | null; effective_to?: string | null }) =>
    request<{ policy_id: string; status: string }>(`/api/policies`, { method: "POST", actorId, body: JSON.stringify(body) }),
  activatePolicy: (actorId: string, policyId: string) =>
    request<{ ok: true }>(`/api/policies/${policyId}/activate`, { method: "POST", actorId, body: JSON.stringify({}) }),
  listStakingProducts: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<StakingProduct, "staking_products">>(`/api/staking-products${params(query as any)}`, { method: "GET", actorId }),
  createStakingProducts: (actorId: string, body: { policy_id: string; products: Array<Record<string, unknown>> }) =>
    request<{ upserted: number; ids: string[] }>(`/api/staking-products`, { method: "POST", actorId, body: JSON.stringify(body) }),
  listLedgerEvents: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<LedgerEvent, "ledger_events">>(`/api/ledger-events${params(query as any)}`, { method: "GET", actorId }),
  createLedgerEvent: (actorId: string, body: { event: Record<string, unknown> }) =>
    request<{ ledger_event_id: string }>(`/api/ledger-events`, { method: "POST", actorId, body: JSON.stringify(body) }),
  importLedgerCsv: (actorId: string, file: File) => {
    const form = new FormData();
    form.set("file", file);
    return request<{ inserted_count: number; rejected_count: number; errors: string[] }>(`/api/ledger-events/import-csv`, {
      method: "POST",
      actorId,
      body: form,
      headers: {},
    });
  },
  listCalcRuns: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<CalcRun, "calc_runs">>(`/api/calc-runs${params(query as any)}`, { method: "GET", actorId }),
  createCalcRun: (actorId: string, body: { policy_id: string; run_type: string; run_date: string }) =>
    request<{ calc_run_id: string; status: string }>(`/api/calc-runs`, { method: "POST", actorId, body: JSON.stringify(body) }),
  transitionCalcRun: (actorId: string, calcRunId: string, action: "start" | "succeed" | "fail" | "finalize", body?: Record<string, unknown>) =>
    request<{ ok: true; from: string; to: string }>(`/api/calc-runs/${calcRunId}/${action}`, { method: "POST", actorId, body: JSON.stringify(body ?? {}) }),
  listSettlementItems: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<SettlementItem, "settlement_items">>(`/api/settlement-items${params(query as any)}`, { method: "GET", actorId }),
  getReportSummary: (actorId: string, query: Record<string, unknown>) =>
    request<ReportSummary>(`/api/reports/summary${params(query as any)}`, { method: "GET", actorId }),
  listAuditLogs: (actorId: string, query: Record<string, unknown>) =>
    request<PagedResponse<AuditLog, "audit_logs">>(`/api/audit-logs${params(query as any)}`, { method: "GET", actorId }),
};
