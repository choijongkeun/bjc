# BJC Local Dev Smoke Runbook V1

## Fixed Ports

- API: `3001`
- Admin Web preview: `4187`
- User Web preview: `4188`
- API base URL: `http://127.0.0.1:3001`

## Recommended Env Example

```bash
DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_CONNECTION_LIMIT=30

BJC_API_PORT=3001
BJC_ADMIN_PORT=4187
BJC_USER_PORT=4188
BJC_API_BASE_URL=http://127.0.0.1:3001
BJC_SMOKE_BASE_URL=http://127.0.0.1:3001
```

`PORT` is still supported and takes precedence over `BJC_API_PORT`.

## Normal Start Order

### 1. Build and start the API

```bash
npm run build
npm run start:api
```

For the production build entrypoint:

```bash
npm run build
npm start
```

### 2. Preflight before smoke

```bash
npm run preflight:smoke
```

Expected output:

```text
smoke_base_url=http://127.0.0.1:3001
health_status=ok
api_service=bjc-api
preflight=PASS
```

### 3. Run smoke

```bash
npm run smoke:all
```

Or individually:

```bash
npm run smoke:member
npm run smoke:staking
npm run smoke:reward
npm run smoke:withdrawal
```

### 4. Run Admin/User preview with fixed API base URL

Admin:

```bash
cd web
npm run preview:bjc
```

User:

```bash
cd web-user
npm run preview:bjc
```

`preview:bjc` rebuilds with `VITE_API_BASE_URL=http://127.0.0.1:3001` before previewing, which prevents stale preview assets from pointing to the wrong API origin.

## Wrong API Base URL Prevention

- `web` and `web-user` `preview:bjc` rebuild with the fixed BJC API base URL before preview starts.
- Vite dev proxy defaults now point to `http://127.0.0.1:3001`.
- `smoke:staking`, `smoke:reward`, and `smoke:withdrawal` resolve their default API base URL from:

```text
BJC_SMOKE_BASE_URL
-> BJC_API_BASE_URL
-> http://127.0.0.1:3001
```

## Stale Server Detection

`/health` now returns:

```json
{
  "ok": true,
  "service": "bjc-api",
  "environment": "development"
}
```

The smoke preflight fails if:

- `BJC_SMOKE_BASE_URL` is invalid
- `/health` does not respond
- `/health` times out
- `/health` does not identify itself as `bjc-api`

If preflight fails, check the listening process manually:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

Do not auto-kill processes from scripts.

## Warning Notes

- React Router future warnings are suppressed by enabling `v7_startTransition` and `v7_relativeSplatPath` on the current routers used by the app and tests.
- Admin build currently stays below the warning threshold at about `364 kB`.
- User build still emits a Vite chunk warning at about `502 kB`.
- The safest next split points are route-level user pages in [App.tsx](file:///Users/faster/Projects/bjc/web-user/src/App.tsx) and admin tab modules imported in [AdminPage.tsx](file:///Users/faster/Projects/bjc/web/src/pages/AdminPage.tsx).

## Shutdown

Stop preview/API processes with `Ctrl+C` in the terminals where they are running.

## Sensitive Data Rules

Do not commit:

- `.env`
- `.env.local`
- access tokens
- passwords
- DB connection values
- `dist`
- `node_modules`
- smoke logs
- PID files
