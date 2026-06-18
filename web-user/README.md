# BJC User Front

일반 회원용 프론트엔드입니다. `web/` 관리자 콘솔과 분리된 독립 Vite 앱으로, 현재는 인증과 네트워크 조회 흐름만 구현합니다.

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

회원가입/로그인/조직도 조회는 루트 API 서버가 실행 중이어야 합니다.

```bash
cd ..
npm run dev
```

## 주요 라우트

- `/`
- `/login`
- `/register`
- `/dashboard`
- `/network`

## 현재 구현 범위

- 로그인
- 회원가입
- 추천인 코드 확인
- 세션 저장 및 보호 라우트
- 사용자 대시보드
- 추천 조직도
- 바이너리 조직도
- 바이너리 레그 요약
- 하위 회원 목록
- 로그아웃

## 현재 placeholder 기능

- `Staking`
- `Rewards`
- `Withdrawals`

위 메뉴는 `Coming Soon` 상태로 표시되며 클릭 시 빈 화면이나 오류 페이지로 이동하지 않습니다.
