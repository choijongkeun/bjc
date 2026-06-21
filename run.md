# BJC 운영 실행 가이드

이 문서는 현재 저장소 기준으로 API 서버를 PM2로 실행하고, `web/`, `web-user/` 빌드 결과물을 Nginx 정적 파일로 서비스하는 운영 절차를 정리한 문서입니다.

## 1. 배포 전 준비

- 프로젝트 경로 예시: `/var/www/bjc`
- API 내부 포트 예시: `3001`
- User 정적 경로 예시: `/var/www/bjc/web-user/dist`
- Admin 정적 경로 예시: `/var/www/bjc/web/dist`
- 예시 도메인:
  - `user.example.com`
  - `admin.example.com`
  - `api.example.com`
- 운영 전 확인:
  - DB 백업 완료
  - 현재 적용된 migration 확인
  - 운영용 `.env` 준비
  - DNS가 실제 서버를 가리키는지 확인
  - API `3001` 포트는 외부에 직접 개방하지 않고 Nginx만 외부에 노출

## 2. 프로젝트 경로

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
cd /var/www
```

## 3. Node.js 설치

AlmaLinux/CentOS 계열 예시:

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs git
node -v
npm -v
```

LTS 버전을 사용하고, 서버와 CI의 Node.js 메이저 버전은 맞추는 것을 권장합니다.

## 4. PM2 설치

```bash
sudo npm install -g pm2
pm2 -v
```

## 5. 소스 내려받기

```bash
cd /var/www
git clone <REPO_URL> bjc
cd /var/www/bjc
git checkout main
git pull --ff-only origin main
```

## 6. `.env` 설정

현재 코드 기준 필수/선택 환경 변수 예시는 아래와 같습니다.

```bash
cd /var/www/bjc
cp .env.example .env
chmod 600 .env
```

```bash
DB_HOST=127.0.0.1
DB_USER=bjc_user
DB_PASSWORD=CHANGE_ME
DB_NAME=bjc_db
DB_CONNECTION_LIMIT=30

PORT=3001
# 또는 PORT 대신 BJC_API_PORT=3001 사용 가능
# BJC_API_PORT=3001

NODE_ENV=production
BJC_BUILD_COMMIT=CHANGE_ME

# 선택: smoke / batch 기본 URL
BJC_API_BASE_URL=http://127.0.0.1:3001
BJC_SMOKE_BASE_URL=http://127.0.0.1:3001
```

주의:

- 실제 secret 값은 절대 저장소에 커밋하지 않습니다.
- 현재 서버 코드는 `SESSION_SECRET`를 읽지 않습니다. 없는 환경 변수를 임의로 추가하지 마세요.
- `PORT`를 지정하면 `BJC_API_PORT`보다 우선합니다.

## 7. MySQL migration

현재 저장소에는 별도 migration runner가 없고 `mysql/migrations/*.sql` 파일을 순서대로 관리합니다.

적용 전 원칙:

- 운영 DB 전체 백업 후 진행
- 현재 schema 상태와 적용 이력 확인
- 이미 적용된 migration 재실행 금지
- 운영 데이터 삭제 금지

예시:

```bash
cd /var/www/bjc
ls mysql/migrations
```

파일 목록:

- `mysql/migrations/0001_bjc_offchain_core_mysql.sql`
- `mysql/migrations/0002_bjc_member_referral_binary_auth_mysql.sql`
- `mysql/migrations/0003_bjc_account_stakings_mysql.sql`
- `mysql/migrations/0004_bjc_account_rewards_mysql.sql`
- `mysql/migrations/0005_bjc_reward_withdrawals_mysql.sql`
- `mysql/migrations/0006_bjc_direct_referral_rewards_mysql.sql`
- `mysql/migrations/0007_bjc_rank_bonus_mysql.sql`

수동 적용 예시:

```bash
mysql \
  -h "$DB_HOST" \
  -u "$DB_USER" \
  -p \
  "$DB_NAME" \
  < mysql/migrations/0007_bjc_rank_bonus_mysql.sql
```

모든 migration을 매번 일괄 재실행하지 말고, 아직 적용하지 않은 파일만 순서대로 적용하세요.

## 8. 의존성 설치

```bash
cd /var/www/bjc
npm ci
```

## 9. 전체 build

배포 전 CI 또는 검증 서버에서 권장:

```bash
cd /var/www/bjc
npm run test:all
npm run build:all
```

운영 서버에서 테스트를 생략하고 빌드만 할 경우:

```bash
cd /var/www/bjc
npm ci
npm run build:all
```

추가 검증 명령:

```bash
cd /var/www/bjc
npm test
npm run build
npm run verify:all
```

`npm run verify:all`은 smoke까지 포함하므로 운영 DB에서 바로 실행하기 전에 fixture 생성/정리 영향을 반드시 검토하세요.

## 10. PM2 실행

`ecosystem.config.cjs`는 현재 다음 조건을 충족합니다.

- `name: bjc-api`
- `cwd: __dirname`
- `script: dist/src/server.js`
- `instances: 1`
- `exec_mode: fork`
- `autorestart: true`
- `watch: false`
- `max_memory_restart: 512M`
- `time: true`
- `env_production.NODE_ENV=production`
- `env_production.PORT=3001`

실행:

```bash
cd /var/www/bjc
pm2 start ecosystem.config.cjs --env production
pm2 status
pm2 logs bjc-api
```

현재 배치/락 동작을 고려해 `instances=1`을 유지합니다. 검증 없이 cluster mode로 바꾸지 마세요.

## 11. PM2 재시작

```bash
cd /var/www/bjc
pm2 restart bjc-api --update-env
```

## 12. PM2 로그

```bash
cd /var/www/bjc
pm2 logs bjc-api
tail -f logs/pm2/bjc-api.out.log
tail -f logs/pm2/bjc-api.error.log
```

## 13. PM2 자동 시작

```bash
pm2 save
pm2 startup
```

`pm2 startup` 실행 후 출력되는 `sudo` 명령을 서버에서 한 번 더 실행해야 재부팅 후 자동 시작이 완성됩니다.

## 14. PM2 중지 / 삭제

```bash
pm2 stop bjc-api
pm2 delete bjc-api
```

## 15. Admin/User 정적 파일 배치

운영에서는 Admin/User 프론트를 PM2 preview 서버로 띄우지 말고 Nginx 정적 파일로만 서비스합니다.

```bash
cd /var/www/bjc
npm run build:all
ls web/dist
ls web-user/dist
```

정적 파일 위치:

- Admin: `/var/www/bjc/web/dist`
- User: `/var/www/bjc/web-user/dist`

프론트는 `/api` 상대 경로를 사용하므로, User/Admin 각 도메인의 `/api/`를 같은 API 서버로 프록시하는 구성이 가장 단순하고 안전합니다.

## 16. Nginx 설정

예시 전체 설정:

```nginx
server {
    listen 80;
    server_name user.example.com;

    root /var/www/bjc/web-user/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}

server {
    listen 80;
    server_name admin.example.com;

    root /var/www/bjc/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

설명:

- User/Admin은 각각 정적 파일을 직접 서빙합니다.
- `/api/`는 모두 내부 API `127.0.0.1:3001`로 프록시합니다.
- 가장 권장되는 운영 구성은 `user.example.com/api/*`, `admin.example.com/api/*` 모두 같은 API로 보내는 방식입니다.
- 프론트를 `api.example.com` 절대 URL로 바꾸는 경우에는 별도 CORS 검토가 필요합니다.

## 17. Nginx 검사 / 재시작

AlmaLinux/CentOS 계열 예시:

```bash
sudo cp deploy/nginx/bjc.conf.example /etc/nginx/conf.d/bjc.conf
sudo nginx -t
sudo systemctl reload nginx
```

직접 작성한 설정 파일을 사용할 경우 예시:

```bash
sudo vi /etc/nginx/conf.d/bjc.conf
sudo nginx -t
sudo systemctl reload nginx
```

SELinux가 활성화된 서버라면 필요 시:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

방화벽 예시:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

외부 방화벽/보안그룹에는 `80`, `443`만 열고 `3001`은 직접 열지 않는 구성을 권장합니다.

## 18. Certbot SSL

DNS가 실제 서버를 가리킨 뒤 실행합니다.

```bash
sudo certbot --nginx \
  -d user.example.com \
  -d admin.example.com \
  -d api.example.com
```

자동 갱신 확인:

```bash
sudo certbot renew --dry-run
```

## 19. Health / Readiness

API 직접 확인:

```bash
curl -i http://127.0.0.1:3001/health
curl -i http://127.0.0.1:3001/ready
```

Nginx 적용 후 확인:

```bash
curl -i https://api.example.com/health
curl -i https://api.example.com/ready
```

현재 기준:

- `/health`: 프로세스 기본 생존 확인
- `/ready`: DB 연결 및 주요 테이블 준비 상태 확인

`/ready`가 `503`이면 애플리케이션 재시작보다 먼저 아래를 점검하세요.

- DB 접속 가능 여부
- `.env`의 `DB_*` 값
- migration 적용 상태
- 권한 또는 네트워크 문제

## 20. smoke

```bash
cd /var/www/bjc
BJC_SMOKE_BASE_URL=http://127.0.0.1:3001 npm run preflight:smoke
BJC_SMOKE_BASE_URL=http://127.0.0.1:3001 npm run smoke:all
```

주의:

- smoke는 fixture 계정/정책/거래를 생성하고 정리합니다.
- 운영 DB에서도 동작하도록 작성돼 있지만, 최초 배포 검증은 별도 staging DB를 권장합니다.
- 운영 DB에서 실행 전에는 반드시 백업과 fixture cleanup 가능 여부를 확인하세요.

## 21. E2E

```bash
cd /var/www/bjc
npm run e2e
```

주의:

- E2E는 Chromium 기반 브라우저 환경이 필요합니다.
- 운영 서버는 GUI/브라우저 패키지 제약이 있을 수 있으므로 CI 또는 별도 검증 서버에서 실행하는 것을 권장합니다.

## 22. 배치 dry-run / 실행

현재 배치 CLI는 `login_id/password`로 실제 로그인 후 Bearer 토큰을 받아 Admin API를 호출합니다.

권장 방식:

```bash
cd /var/www/bjc
export BJC_BATCH_BASE_URL=http://127.0.0.1:3001
export BJC_BATCH_LOGIN_ID=CHANGE_ME
export BJC_BATCH_PASSWORD=CHANGE_ME
```

일일 보상 dry-run:

```bash
npm run batch:daily-reward -- \
  --date=2026-06-20 \
  --policy=<POLICY_ID>
```

실행:

```bash
npm run batch:daily-reward -- \
  --date=2026-06-20 \
  --policy=<POLICY_ID> \
  --execute
```

다른 배치 예시:

```bash
npm run batch:direct-referral -- --from=2026-06-01 --to=2026-06-20 --policy=<POLICY_ID> --execute
npm run batch:rank-qualification -- --date=2026-06-20 --policy=<POLICY_ID> --execute
npm run batch:rank-bonus -- --date=2026-06-20 --policy=<POLICY_ID> --execute
npm run batch:contribution -- --date=2026-06-20 --policy=<POLICY_ID> --execute
npm run batch:sidecar -- --date=2026-06-20 --policy=<POLICY_ID> --execute
```

주의:

- `--execute`가 없으면 dry-run입니다.
- 토큰/비밀번호를 shell history에 직접 남기지 않도록 CLI 인자보다 환경 변수를 권장합니다.
- 실행이 끝나면 CLI가 `/api/auth/logout`을 호출해 세션을 정리합니다.

## 23. 배포 후 UI 점검

Admin 확인:

- 아이디/비밀번호 로그인
- READER 로그인
- 회원 관리
- 보상 실행
- 출금 관리
- 보고서 CSV
- Rank 관리
- 로그아웃
- 새로고침 후 세션 유지

User 확인:

- 아이디/비밀번호 로그인
- 회원가입
- 스테이킹
- 보상
- 직급
- 출금
- 로그아웃
- 새로고침 후 세션 유지

반응형 확인 폭:

- `375 x 812`
- `768 x 1024`
- `1440 x 900`

## 24. 장애 대응

기본 확인 순서:

1. `pm2 status`
2. `pm2 logs bjc-api`
3. `curl -i http://127.0.0.1:3001/health`
4. `curl -i http://127.0.0.1:3001/ready`
5. `sudo nginx -t`
6. `sudo systemctl status nginx`

증상별 우선 점검:

- `401/세션 만료 증가`: 로그인 API, `/api/auth/me`, 프론트 도메인별 `/api` 프록시 확인
- `/ready = 503`: DB 접속, migration, 권한, 방화벽 확인
- 정적 화면은 뜨지만 API 실패: Nginx `/api/` 프록시와 PM2 API 상태 확인
- CSV/대용량 응답 실패: Nginx timeout 및 API 로그 확인

## 25. 롤백

권장 순서:

1. 새 커밋 배포 전 DB 백업 확보
2. 문제 발생 시 이전 안정 커밋으로 checkout
3. `npm ci`
4. `npm run build:all`
5. `pm2 restart bjc-api --update-env`
6. `curl /health`, `/ready`, 주요 화면 확인

예시:

```bash
cd /var/www/bjc
git log --oneline -5
git checkout <PREVIOUS_STABLE_COMMIT>
npm ci
npm run build:all
pm2 restart bjc-api --update-env
```

DB schema가 이미 앞으로 진행된 상태라면, 애플리케이션만 과거 커밋으로 내리는 것이 안전한지 먼저 검토하세요. 파괴적 수동 rollback SQL은 충분한 검증 없이 바로 실행하지 마세요.
