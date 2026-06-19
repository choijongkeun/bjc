# BJC User Front

일반 회원용 프론트엔드입니다. `web/` 관리자 콘솔과 분리된 독립 Vite 앱으로, 현재는 인증, 네트워크 조회, 스테이킹, Rewards 조회, Withdrawals 흐름을 구현합니다.

## 설치

```bash
cd web-user
npm install
```

## 개발 실행

```bash
cd web-user
npm run dev
```

- 기본 포트: `5174`
- dev 환경에서는 `vite.config.ts`의 proxy로 `/api` 요청을 `http://localhost:3000`으로 전달합니다.
- 오래된 API 서버를 피하려면 `VITE_API_BASE_URL=http://127.0.0.1:3001 npm run dev`처럼 최신 백엔드 포트를 명시해서 실행할 수 있습니다.

## 빌드

```bash
cd web-user
npm run build
```

## 테스트

```bash
cd web-user
npm test
```

## 환경 변수

예시 파일:

```bash
cp .env.example .env.local
```

내용:

```env
VITE_API_BASE_URL=http://localhost:3000
```

- preview 또는 production-like 실행 시에는 `VITE_API_BASE_URL`을 명시하는 방식을 권장합니다.
- `.env`, `.env.local`은 커밋하지 않습니다.

## API 서버 실행 필요

회원가입/로그인/조직도/스테이킹 조회는 루트 API 서버가 실행 중이어야 합니다.

```bash
cd ..
npm run dev
```

## 주요 라우트

- `/`
- `/login`
- `/register`
- `/dashboard`
- `/staking`
- `/staking/:stakingId`
- `/rewards`
- `/rewards/:rewardId`
- `/withdrawals`
- `/withdrawals/:withdrawalId`
- `/network`

## 현재 구현 범위

- 로그인
- 회원가입
- 추천인 코드 확인
- 세션 저장 및 보호 라우트
- 사용자 대시보드
- 스테이킹 상품 목록
- 스테이킹 신청
- 내 스테이킹 목록
- 내 스테이킹 상세
- 내 Rewards 요약/목록/상세
- 내 Withdrawals 잔액/미리보기/신청/목록/상세
- `REQUESTED` 출금 취소
- 스테이킹 상세의 rewards 섹션
- Dashboard rewards/stakings summary
- Dashboard withdrawals summary/action
- PENDING 취소 / ACTIVE 취소 요청
- 추천 조직도
- 바이너리 조직도
- 바이너리 레그 요약
- 하위 회원 목록
- 로그아웃

## 스테이킹 참고

- 신청 후 상태는 먼저 `PENDING`으로 생성됩니다.
- `ACTIVE` 전환은 관리자 화면에서 처리합니다.
- 현재 범위에는 reward 지급, principal 실제 차감/반환, 자동 만기 처리가 포함되지 않습니다.

## Rewards 참고

- Dashboard는 `GET /api/me/rewards/summary`, `GET /api/me/stakings/summary` 값을 그대로 사용합니다.
- Rewards 화면은 `GET /api/me/rewards`, `GET /api/me/rewards/:rewardId`, `GET /api/me/stakings/:stakingId/rewards`를 사용합니다.
- 금액은 모두 string/base amount로 유지하며 `Number`, `parseInt`, `parseFloat`로 변환하지 않습니다.
- Rewards 요약 카드의 `출금 가능 보상`, `출금 완료 보상`은 `/withdrawals` 화면으로 연결됩니다.
- 현재 V1 `DAILY_REWARD` 정책: 스테이킹 시작일을 포함해 일 단위 전액 지급합니다.
- TODO: 시작일 포함 전액 지급 정책은 향후 운영 정책에 따라 변경될 수 있습니다.

## Withdrawals 참고

- 화면은 `GET /api/me/withdrawal-balance`, `POST /api/me/withdrawal-preview`, `POST /api/me/withdrawals`, `GET /api/me/withdrawals`, `GET /api/me/withdrawals/:withdrawalId`, `POST /api/me/withdrawals/:withdrawalId/cancel`을 사용합니다.
- 상단 카드에서 `DAILY_REWARD`, `BONUS`, 예약 금액, 완료 출금액을 조회합니다.
- 미리보기는 참고용이며 실제 신청 시 후보 reward, 수수료, 실수령액을 서버에서 다시 계산합니다.
- 한 번의 요청에는 `DAILY_REWARD`와 `BONUS`를 혼합하지 않습니다.
- `REQUESTED` 상태에서만 사용자가 직접 취소할 수 있습니다.
- 상태는 `REQUESTED`, `APPROVED`, `PROCESSING`, `COMPLETED`, `REJECTED`, `FAILED`, `CANCELLED`를 표시합니다.
- 실제 블록체인 송금, wallet RPC 호출, 자동 재처리, PREPAY_BJC 결제는 이번 UI 범위에 포함되지 않습니다.
