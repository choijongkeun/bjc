import type {
  AdminRewardDetail,
  AdminRewardListItem,
  AdminStakingDetail,
  DailyRewardRunResponse,
  DirectReferralRunResponse,
  RewardMetadata,
  RewardSort,
  RewardStatus,
  RewardType,
  SessionRole,
} from "@/lib/api";
import { formatBaseAmount } from "@/lib/amount";

export type AdminRewardFilters = {
  q?: string;
  account_id?: string;
  staking_id?: string;
  reward_type?: RewardType | "";
  status?: RewardStatus | "";
  calc_run_id?: string;
  reward_date_from?: string;
  reward_date_to?: string;
  page?: number;
  limit?: number;
  sort?: RewardSort;
};

export const REWARD_TYPE_OPTIONS: Array<{ value: RewardType; label: string }> = [
  { value: "DAILY_REWARD", label: "일일 보상" },
  { value: "DIRECT_REFERRAL", label: "직추천 보상" },
  { value: "RANK_BONUS", label: "직급 보상" },
  { value: "CONTRIBUTION", label: "기여 보상" },
  { value: "WITHDRAWAL_FEE", label: "출금 수수료" },
  { value: "SIDECAR", label: "사이드카 정산" },
  { value: "ADJUSTMENT", label: "조정" },
  { value: "REVERSAL", label: "보상 취소" },
];

export const REWARD_STATUS_OPTIONS: Array<{ value: RewardStatus; label: string }> = [
  { value: "PENDING", label: "대기" },
  { value: "CONFIRMED", label: "확정" },
  { value: "REVERSED", label: "취소 반영" },
];

export const REWARD_SORT_OPTIONS: Array<{ value: RewardSort; label: string }> = [
  { value: "reward_date_desc", label: "보상일 최신순" },
  { value: "reward_date_asc", label: "보상일 오래된순" },
  { value: "created_at_desc", label: "생성일 최신순" },
  { value: "created_at_asc", label: "생성일 오래된순" },
  { value: "available_at_desc", label: "출금 가능일 최신순" },
  { value: "available_at_asc", label: "출금 가능일 오래된순" },
];

const rewardTypeLabelMap: Record<RewardType, string> = {
  DAILY_REWARD: "일일 보상",
  DIRECT_REFERRAL: "직추천 보상",
  RANK_BONUS: "직급 보상",
  CONTRIBUTION: "기여 보상",
  WITHDRAWAL_FEE: "출금 수수료",
  SIDECAR: "사이드카 정산",
  ADJUSTMENT: "조정",
  REVERSAL: "보상 취소",
};

const rewardStatusLabelMap: Record<RewardStatus, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  REVERSED: "취소 반영",
};

export function getRewardTypeLabel(type: RewardType): string {
  return rewardTypeLabelMap[type];
}

export function getRewardStatusLabel(status: RewardStatus): string {
  return rewardStatusLabelMap[status];
}

export function getRewardTypeTone(type: RewardType): "blue" | "emerald" | "rose" | "slate" {
  switch (type) {
    case "DAILY_REWARD":
    case "DIRECT_REFERRAL":
    case "RANK_BONUS":
    case "CONTRIBUTION":
      return "blue";
    case "REVERSAL":
    case "WITHDRAWAL_FEE":
      return "rose";
    case "ADJUSTMENT":
      return "slate";
    case "SIDECAR":
    default:
      return "emerald";
  }
}

export function getRewardStatusTone(status: RewardStatus): "blue" | "emerald" | "rose" | "slate" {
  switch (status) {
    case "PENDING":
      return "blue";
    case "CONFIRMED":
      return "emerald";
    case "REVERSED":
      return "rose";
    default:
      return "slate";
  }
}

export function buildAdminRewardListQuery(filters: AdminRewardFilters) {
  return {
    q: filters.q || undefined,
    account_id: filters.account_id || undefined,
    staking_id: filters.staking_id || undefined,
    reward_type: filters.reward_type || undefined,
    status: filters.status || undefined,
    calc_run_id: filters.calc_run_id || undefined,
    reward_date_from: filters.reward_date_from || undefined,
    reward_date_to: filters.reward_date_to || undefined,
    page: filters.page ?? 1,
    limit: filters.limit ?? 20,
    sort: filters.sort ?? "reward_date_desc",
  };
}

export function formatRewardAmountBase(amountBase: string): string {
  return formatBaseAmount(amountBase, 0);
}

export function isNegativeRewardAmount(amountBase: string): boolean {
  return /^-/.test(amountBase);
}

export function formatRewardDate(value: string | null): string {
  return value || "-";
}

export function formatRewardDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

export function getVisibleRewardMetadataEntries(metadata?: RewardMetadata | null): Array<{ label: string; value: string }> {
  if (!metadata) return [];

  const items: Array<{ label: string; value: string | number | undefined }> = [
    { label: "스테이킹 원금", value: metadata.principal_amount_base },
    { label: "일일 적용 비율", value: metadata.daily_interest_bps_snapshot ? `${metadata.daily_interest_bps_snapshot} bps` : undefined },
    { label: "적용 기간", value: metadata.duration_days_snapshot === undefined ? undefined : `${metadata.duration_days_snapshot}일` },
    { label: "분모 기준", value: metadata.denominator },
    { label: "계산 기준", value: metadata.formula_version },
    { label: "조직 범위", value: metadata.organization_scope },
    { label: "기준 원금", value: metadata.source_principal_amount_base },
    { label: "직추천 적용 비율", value: metadata.direct_referral_rate_bps ? `${metadata.direct_referral_rate_bps} bps` : undefined },
    { label: "추천 단계", value: metadata.referral_depth },
    { label: "직급 단계", value: metadata.rank_level },
    { label: "추가 비율", value: metadata.effective_bonus_bps },
    { label: "기준 일일 보상", value: metadata.base_daily_reward_amount_base },
    { label: "직급 산정 실행 ID", value: metadata.qualification_calc_run_id },
    { label: "직급 산정 결과 ID", value: metadata.qualification_result_id },
    { label: "규칙 ID", value: metadata.rule_id },
    { label: "적용 비율", value: metadata.rate_bps },
    { label: "가중치 비율", value: metadata.weight_bps },
    { label: "기준 금액", value: metadata.base_amount_base },
    { label: "풀 금액", value: metadata.pool_amount_base },
    { label: "총 점수", value: metadata.total_score },
    { label: "점수 반영 금액", value: metadata.score_amount_base },
    { label: "점수 비율", value: metadata.score_ratio_bps ? `${metadata.score_ratio_bps} bps` : undefined },
    { label: "직급 산정 기준", value: metadata.qualification_source },
    { label: "신청 금액", value: metadata.requested_amount_base },
    { label: "지급 금액", value: metadata.release_amount_base },
    { label: "동결 금액", value: metadata.freeze_amount_base },
    { label: "지급 비율", value: metadata.release_bps ? `${metadata.release_bps} bps` : undefined },
    { label: "동결 비율", value: metadata.freeze_bps ? `${metadata.freeze_bps} bps` : undefined },
    { label: "사이드카 상태", value: metadata.sidecar_status },
    { label: "원본 보상 ID", value: metadata.original_reward_id },
    { label: "원본 source", value: metadata.original_source_reference },
    { label: "사유", value: metadata.reason },
    { label: "메타데이터 보상 구분", value: metadata.reward_type },
  ];

  return items
    .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
    .map((item) => ({ label: item.label, value: String(item.value) }));
}

export function canReverseReward(reward: Pick<AdminRewardDetail | AdminRewardListItem, "status" | "reward_type" | "reversal_reward_id"> & { reversal?: { id: string } | null }) {
  return reward.status === "CONFIRMED" && reward.reward_type !== "REVERSAL" && !reward.reversal_reward_id && !reward.reversal;
}

export function shouldUseCalcRunRewardsApi(filters: AdminRewardFilters): boolean {
  return Boolean(
    filters.calc_run_id &&
      !filters.q &&
      !filters.account_id &&
      !filters.staking_id &&
      !filters.reward_date_from &&
      !filters.reward_date_to
  );
}

export function getDefaultKstRewardDate(baseDate = new Date()): string {
  const seoul = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(baseDate);
  const year = Number(seoul.find((part) => part.type === "year")?.value ?? "1970");
  const month = Number(seoul.find((part) => part.type === "month")?.value ?? "01");
  const day = Number(seoul.find((part) => part.type === "day")?.value ?? "01");
  const previousUtc = new Date(Date.UTC(year, month - 1, day - 1));
  return previousUtc.toISOString().slice(0, 10);
}

export function getDailyRewardRunResultItems(result: DailyRewardRunResponse): Array<{ label: string; value: string }> {
  return [
    { label: "계산 실행 ID", value: result.calc_run.id },
    { label: "대상 건수", value: String(result.target_count) },
    { label: "생성 건수", value: String(result.created_count) },
    { label: "0원 제외 건수", value: String(result.zero_reward_skip_count) },
    { label: "중복 건수", value: String(result.duplicate_skip_count) },
    { label: "실패 건수", value: String(result.failed_count) },
    { label: "총 보상 금액", value: formatRewardAmountBase(result.total_reward_amount_base) },
    { label: "상태", value: result.calc_run.status },
  ];
}

export function canManageDirectReferral(role: SessionRole): boolean {
  return role === "ADMIN";
}

export function validateDirectReferralRunInput(input: {
  policy_version_id: string;
  activated_from: string;
  activated_to: string;
}): string | null {
  if (!input.policy_version_id.trim()) {
    return "정책 버전을 입력해 주세요.";
  }
  if (!input.activated_from.trim() || !input.activated_to.trim()) {
    return "활성화 날짜 범위를 모두 입력해 주세요.";
  }
  if (input.activated_from > input.activated_to) {
    return "시작일은 종료일보다 늦을 수 없습니다.";
  }
  return null;
}

export function getDirectReferralRunStatusLabel(status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return "성공";
    case "FAILED":
      return "실패";
    case "RUNNING":
      return "실행 중";
    case "PENDING":
      return "대기";
    case "FINALIZED":
      return "확정 완료";
    default:
      return status;
  }
}

export function getDirectReferralSingleResultLabel(resultType: string): string {
  switch (resultType) {
    case "created":
      return "보상 생성";
    case "duplicate":
      return "중복으로 건너뜀";
    case "no_sponsor":
      return "추천인 없음";
    case "inactive_sponsor":
      return "비활성 추천인";
    case "zero_reward":
      return "0원으로 건너뜀";
    case "conflict":
      return "충돌";
    default:
      return resultType;
  }
}

export function getDirectReferralResultTone(input: {
  status?: string | null;
  result_type?: string | null;
  conflict_count?: number;
  failed_count?: number;
}): "default" | "success" | "error" {
  if ((input.failed_count ?? 0) > 0 || input.status === "FAILED" || input.result_type === "conflict") {
    return "error";
  }
  if ((input.conflict_count ?? 0) > 0) {
    return "error";
  }
  if (input.result_type === "created" || input.result_type === "duplicate" || input.status === "SUCCEEDED") {
    return "success";
  }
  return "default";
}

export function formatDirectReferralRunSummary(result: DirectReferralRunResponse): Array<{ label: string; value: string }> {
  return [
    { label: "계산 실행 ID", value: result.calc_run_id },
    { label: "대상 건수", value: String(result.target_count) },
    { label: "생성 건수", value: String(result.created_count) },
    { label: "추천인 없음", value: String(result.no_sponsor_skip_count) },
    { label: "비활성 추천인", value: String(result.inactive_sponsor_skip_count) },
    { label: "0원 제외", value: String(result.zero_reward_skip_count) },
    { label: "중복 건수", value: String(result.duplicate_skip_count) },
    { label: "충돌 건수", value: String(result.conflict_count) },
    { label: "실패 건수", value: String(result.failed_count) },
    { label: "총 보상 금액", value: formatRewardAmountBase(result.total_reward_amount_base) },
    { label: "상태", value: getDirectReferralRunStatusLabel(result.status) },
  ];
}

export function canRunDirectReferralForStaking(staking: Pick<AdminStakingDetail, "status" | "activated_at" | "cancel_requested_at"> | null | undefined): boolean {
  return Boolean(
    staking &&
      staking.status === "ACTIVE" &&
      staking.activated_at &&
      !staking.cancel_requested_at
  );
}
