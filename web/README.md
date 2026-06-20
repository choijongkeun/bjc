# BJC Admin Console

React 18 + TypeScript + Vite + TailwindCSS 3 기반의 BJC 관리자 콘솔입니다.

## Environment

`src/lib/api.ts`는 `VITE_API_BASE_URL`을 우선 사용하고, 값이 없으면 상대 경로(`/api`)로 요청합니다.

- dev 편의 기능: `vite.config.ts`의 `server.proxy`가 `http://localhost:3000`으로 `/api`, `/health`를 프록시합니다.
- 최신 백엔드를 별도 포트로 띄운 경우 `VITE_API_BASE_URL=http://127.0.0.1:3001 npm run dev`처럼 명시적으로 연결할 수 있습니다.
- preview / production-like: Vite dev proxy가 없으므로 `VITE_API_BASE_URL`을 반드시 설정해야 합니다.
- 로컬 preview smoke를 위해 백엔드는 `localhost` / `127.0.0.1` 출처의 CORS preflight를 허용합니다.
- 운영 배포에서는 관리자 콘솔 도메인을 백엔드 CORS allowlist에 명시적으로 등록해야 합니다.
- 운영에서는 `Access-Control-Allow-Origin: *` 와일드카드 사용을 지양합니다.

기본 예시는 `web/.env.example`, `web/.env.local.example`에 있습니다.

```env
VITE_API_BASE_URL=http://localhost:3000
```

로컬에서 고정해서 쓰려면 `web/.env.local`을 생성하세요. `.env.local`은 저장소에 커밋하지 않습니다.

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Backend Run

백엔드는 저장소 루트에서 실행합니다.

- 루트에서 `npm install`
- 루트에서 `.env` 준비
- 루트에서 `npm run dev`
- 기본 포트는 `:3000`
- `.env`는 저장소에 포함하지 않습니다.

```bash
npm install
npm run dev
```

## Frontend Dev Run

```bash
cd web
npm install
npm run dev
```

- 기본 포트는 `:5173`
- dev에서는 `vite.config.ts`의 `server.proxy`로 `/api`, `/health`를 `http://localhost:3000`에 연결할 수 있습니다.

## Frontend Preview Run

preview / production-like 환경에서는 dev proxy가 적용되지 않으므로 빌드 시점에 `VITE_API_BASE_URL`을 주입해야 합니다.

```bash
cd web
npm install
VITE_API_BASE_URL=http://localhost:3000 npm run build
npm run preview -- --host 0.0.0.0 --port 4175
```

- preview 기본 검증 포트 예시는 `:4175`
- preview에서는 `server.proxy`가 아니라 `VITE_API_BASE_URL` 기준으로 API를 호출합니다.

## Actor Id Guide

실제 UUID는 문서에 고정하지 않고 아래 기준으로 사용합니다.

- `ADMIN actor id`: `accounts.role = 'ADMIN'` 인 계정 UUID
- `READER actor id`: `accounts.role = 'READER'` 인 계정 UUID
- `USER actor id`: `accounts.role = 'USER'` 인 계정 UUID
- `READER`: 조회 전용, staking mutate 버튼 비노출
- `ADMIN`: staking 조회 + 활성화/거절/관리자 취소 가능
- `READER`: rewards 조회 가능, `DAILY_REWARD` 실행/`Reward reversal` 버튼 비노출
- `ADMIN`: rewards 조회 + 수동 `DAILY_REWARD` 실행 + `DIRECT_REFERRAL` 실행 + `Reward reversal` 가능
- `READER`: withdrawals 조회 가능, 승인/거절/처리/완료/실패 버튼 비노출
- `ADMIN`: withdrawals 조회 + 승인/거절/처리 시작/완료/실패 가능

## Verify

프론트 테스트:

```bash
cd web
npm test
```

프론트 production-like 빌드:

```bash
cd web
VITE_API_BASE_URL=http://localhost:3000 npm run build
```

백엔드 빌드:

```bash
npm run build
```

## Smoke Checklist

상세 체크리스트는 [.trae/documents/BJC_Admin_Console_Smoke_Checklist.md](file:///Users/faster/Projects/bjc/.trae/documents/BJC_Admin_Console_Smoke_Checklist.md)에 정리되어 있습니다.

핵심 확인 항목:

- `/login` 렌더링
- `ADMIN` 로그인 성공
- `ADMIN /admin?tab=policies` 조회
- `ADMIN /admin?tab=stakings` 조회
- `ADMIN /admin?tab=audit` 접근
- `READER` 로그인 성공
- `READER` write 버튼 비노출
- `READER /admin?tab=stakings` 조회 가능
- `READER` audit 직접 접근 시 safe 우회
- `USER` 로그인 차단
- `/admin/ledger/:accountId` 상세 렌더링
- `npm test` 통과
- 프론트 `npm run build` 통과
- 루트 백엔드 `npm run build` 통과

## Pre-Deploy Checks

- `VITE_API_BASE_URL`을 운영 API 주소로 설정
- 백엔드 CORS allowlist에 운영 관리자 도메인 등록
- `.env`, `web/.env.local` 미커밋 확인
- MySQL 접속정보 미노출 확인
- 프론트 `dist` 산출물 생성 확인

## 현재 스테이킹 UI 범위

- 전체 스테이킹 목록/필터
- 스테이킹 상세 패널
- `PENDING` 활성화/거절
- `ACTIVE`, `CANCEL_REQUESTED` 관리자 취소
- `Accounts` 탭에서 회원별 최근 스테이킹 표시 및 `stakings` 탭 이동
- reward 지급, principal 실제 차감/반환, maturity 자동 처리 미구현

## Rewards UI 범위

- `rewards` 탭에서 전체 보상 목록/필터/상세 패널 조회
- `Accounts` 탭에서 회원별 최근 보상 표시 및 `/admin?tab=rewards&accountId=<id>` 이동
- `Calc` 탭에서 `DAILY_REWARD` run에 대해 rewards 탭 이동
- `ADMIN` 전용 수동 `DAILY_REWARD` 실행 모달
- `ADMIN` 전용 `DIRECT_REFERRAL` 배치 실행 모달
- `DIRECT_REFERRAL` 실행 결과 summary, duplicate/skip/conflict/failed 집계 표시
- 실행 성공 후 `calc_run_id`와 `reward_type=DIRECT_REFERRAL` 기준 rewards 목록 이동 지원
- `Reward` 상세 패널에서 `DIRECT_REFERRAL` source account/source staking/source principal/rate/formula 표시
- `ADMIN` 전용 `CONFIRMED` 일반 보상 reversal
- `READER`는 조회 전용이며 실행/reversal 버튼이 노출되지 않음
- 현재 V1 `DAILY_REWARD` 정책: 스테이킹 시작일을 포함해 일 단위 전액 지급
- TODO: 시작일 포함 전액 지급 정책은 향후 운영 정책에 따라 조정 가능
- 현재 V1 `DIRECT_REFERRAL` 정책:
  - 대상은 `ACTIVE` + `activated_at 존재` + `cancel_requested_at 없음`
  - sponsor는 `ACTIVE USER`만 허용
  - 동일 source staking 보상은 duplicate로 처리
  - `no_sponsor`, `inactive_sponsor`, `zero_reward`, `duplicate`, `conflict`, `failed` 결과를 구분
  - 자동 reversal은 미구현이며 기존 수동 reward reversal 흐름만 유지

## Direct Referral Admin Guide

- 배치 실행:
  - `Rewards` 탭에서 `직추천 보상 실행`
  - 입력값: `policy_version_id`, `activated_from`, `activated_to`
  - 날짜 범위는 `from <= to`여야 합니다.
- 단건 실행:
  - `Stakings` 상세에서 eligible ACTIVE staking에만 `직추천 보상 계산` 버튼 표시
  - `CANCEL_REQUESTED` staking에는 버튼이 숨겨집니다.
- 결과 해석:
  - `created`: 새 reward 생성
  - `duplicate`: 동일 reward 기존 row 재사용
  - `no_sponsor`: sponsor 없음
  - `inactive_sponsor`: sponsor 비활성 또는 부적격
  - `zero_reward`: 계산 결과 0
  - `conflict`: 기존 reward snapshot 불일치
  - `failed`: 실행 중 예외
- 권한:
  - `ADMIN`만 batch/single 실행 가능
  - `READER`는 조회 전용이며 실행 버튼이 노출되지 않음

## Withdrawals UI 범위

- `withdrawals` 탭에서 전체 출금 목록/필터/상세 패널/통계 카드를 조회
- `Accounts` 탭에서 회원별 최근 출금 5건 표시 및 `/admin?tab=withdrawals&accountId=<id>` 이동
- 상태 전이는 `REQUESTED -> APPROVED -> PROCESSING -> COMPLETED`와 `REQUESTED -> REJECTED`, `PROCESSING -> FAILED`를 지원
- `ADMIN`만 승인, 거절, 처리 시작, 완료, 실패 액션 버튼이 노출됩니다.
- `READER`는 조회 전용이며 mutate API를 호출하지 않습니다.
- 완료 처리 시 `tx_hash`, `network` 입력이 필수입니다.
- 거절/실패 처리 시 `reason` 입력이 필수입니다.
- wallet address는 목록에서 마스킹하고 상세 패널에서만 전체 값을 표시합니다.
- 이번 시스템은 실제 블록체인 송금이나 wallet RPC 호출을 수행하지 않으며, 운영자가 외부 송금 완료 후 수동으로 `COMPLETED` 처리해야 합니다.
