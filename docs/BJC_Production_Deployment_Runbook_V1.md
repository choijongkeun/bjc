# BJC Production Deployment Runbook V1

## Scope
- 실제 운영 배포는 이번 작업 범위에 포함하지 않습니다.
- 이 문서는 API, Admin, User 를 운영 전 검증 가능한 상태로 배포 준비하는 절차만 다룹니다.

## Requirements
- Node.js 22+
- npm 10+
- MySQL 8+
- reverse proxy: Nginx
- process manager: PM2

## Environment
- API 필수 env 는 루트 `.env.example` 기준을 사용합니다.
- Frontend 는 `BJC_API_BASE_URL` / `VITE_API_BASE_URL` 만 필요합니다.
- secret 은 `ecosystem.config.cjs` 나 nginx 설정에 직접 넣지 않습니다.

## Build
- 전체 테스트: `npm run test:all`
- 전체 빌드: `npm run build:all`
- 전체 검증: `npm run verify:all`

## Verify All
- `verify:all` 은 다음을 순서대로 수행합니다.
- `test:all`
- `build:all`
- built API 를 `3011` 포트로 임시 기동
- `preflight:smoke`
- `smoke:all`
- API 종료
- `e2e`

## API Runtime
- PM2 예시는 `ecosystem.config.cjs` 를 사용합니다.
- 프로덕션 기본 포트는 `PORT=3001` 예시입니다.
- health endpoint: `GET /health`
- readiness endpoint: `GET /ready`

## Frontend Runtime
- 운영 권장 방식은 PM2 preview 가 아니라 정적 build 산출물을 Nginx 로 서빙하는 것입니다.
- 예시 nginx 설정은 `deploy/nginx/bjc.conf.example` 에 있습니다.
- SPA fallback 은 `try_files $uri /index.html` 를 사용합니다.

## Smoke / E2E
- smoke 는 API 단일 프로세스를 대상으로 실행합니다.
- E2E 는 `API 3011`, `Admin 4191`, `User 4192` 고정 포트를 사용합니다.
- stale server 를 재사용하지 않도록 Playwright `reuseExistingServer=false` 를 사용합니다.

## Rollback
- 이전 git tag 또는 이전 release artifact 로 되돌립니다.
- API rollback 후 `/ready` 확인
- 핵심 smoke 재실행
- Admin/User static asset rollback

## Backup
- 배포 전 DB backup 을 별도 경로에 저장합니다.
- backup 파일은 저장소에 commit 하지 않습니다.

## Post Deploy Checklist
- `/health` 200
- `/ready` 200
- ADMIN 로그인
- USER 로그인
- reward summary / withdrawals / reports 확인
- 최근 batch duplicate/conflict/failure 요약 확인

## Notes
- CSV export 는 현재 `ADMIN` 전용입니다.
- SIDECAR 는 settlement 전용이며 reward materialization 은 미구현입니다.
