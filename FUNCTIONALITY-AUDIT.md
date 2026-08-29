# clashIQ functionality audit

Statuses are from **server code plus tests actually executed**, not from a page rendering. A UI control is not “working” unless it calls a real API that enforces authz and persistence.

Local Postgres at `localhost:5432` is **not reachable** in this workspace (Docker is not running). Vercel still needs a nonempty hosted `DATABASE_URL` and `npx prisma migrate deploy` run against that database.

| Feature | Status | Evidence |
| --- | --- | --- |
| Landing UI | WORKING | Playwright heading test |
| CSRF bootstrap | WORKING | `CsrfBoot` waits for `GET /api/auth/me` before forms; API client retries once on CSRF failure |
| Sign up API | WORKING (code) / BROKEN (this machine) | `POST /api/auth/signup` Argon2id, unique email, HttpOnly session; cannot persist without Postgres |
| Login API | WORKING (code) / BROKEN (this machine) | Generic `Invalid email or password.`; same-origin CSRF; Redis no longer required for login |
| Logout / revoke | WORKING (code) | `POST /api/auth/logout` sets `revokedAt` |
| Session cookie | WORKING (code) | HttpOnly, SameSite=Lax, Secure on Vercel |
| Profile self | WORKING (code) | `GET/PATCH /api/account` — display name only; extra `userId` query is 403 |
| Host role from client | WORKING (denied) | `requireHost` uses DB role |
| Host user payload | WORKING | Host room members selected as `{ id, displayName }` only |
| Create event/room | WORKING (code) | Host APIs |
| Edit/delete room | WORKING (code) | `PATCH/DELETE /api/host/rooms/[id]` |
| Join room by code | WORKING (code) | Server validates open/lock |
| Leave team | WORKING (code) | `DELETE /api/teams?roomId=` |
| Avatars | WORKING (code) | SVG config, `PUT /api/avatar` own user |
| Teams 2–3 | WORKING (code) | Capacity + one membership per room (app check; race possible without DB unique on user+room) |
| Quiz builder/engine | PARTIALLY WORKING | Create/submit/score; duplicate/reorder added; preview UI incomplete |
| Hidden quiz answers | WORKING | Public mapper omits `isCorrect` |
| Coding builder/Monaco | PARTIALLY WORKING | Builder + submit; isolated run-only unused |
| Hidden tests | WORKING | `publicCodingProblem` strips hidden I/O |
| Judge0 | PARTIALLY WORKING | Worker + HTTP Judge0; **BROKEN** until Redis + worker + `JUDGE0_URL` |
| Timers | WORKING (code) | Server `endsAt` / `remainingMs` |
| Leaderboard | PARTIALLY WORKING | Server-built; realtime needs Redis + sidecar |
| Scores | WORKING (code) | No client score-write API; `ScoreTransaction` |
| Power shop | PARTIALLY WORKING | Atomic `inventory > 0`; 100-way race **not measured** |
| Challenges | PARTIALLY WORKING | Create/accept/complete; no separate countdown engine |
| Host controls | PARTIALLY WORKING | START/PAUSE/LOCK/END/NEXT exist |
| Realtime WS | PARTIALLY WORKING | HMAC token; sidecar not on Vercel |
| Screen share | PARTIALLY WORKING | Explicit `getDisplayMedia` + LiveKit; **BROKEN** without LiveKit env |
| Uploads | PARTIALLY WORKING | Host-only + magic bytes; needs S3 |
| Security headers | WORKING (code) | CSP, HSTS (prod), nosniff, frame deny, Permissions-Policy with `display-capture=(self)` |
| E2E full event | NOT IMPLEMENTED | Playwright covers landing, signup heading, failed login copy only |
| 10–100 user load | NOT RUN | No measured results |
| Host self-signup | NOT IMPLEMENTED | Hosts from seed / DB role |

## Unit tests run (2026-08-29)

See git history for latest counts.

Hosted Postgres: **not connected from this workspace** until Neon URLs are set on Vercel and `npm run db:migrate:deploy` succeeds.

Chosen provider for production: **Neon free-tier PostgreSQL** (pooled `DATABASE_URL` + unpooled `DIRECT_URL`). See `docs/VERCEL.md`.


## Integration tests run

Hidden-test contract: **PASS**.

Postgres auth create/revoke: **SKIPPED/UNREACHABLE** — `Can't reach database server at localhost:5432`.

## What previously broke Vercel sign-in (code fixes in this pass)

1. CSRF allowlist tied only to `APP_URL` while preview is `*.vercel.app` → same-origin Origin is now accepted.
2. Login called Redis via `getEnv()` which required `SESSION_SECRET` / `REALTIME_SHARED_SECRET` → empty Vercel env threw 500 before credentials were checked. Redis is now optional; `getRedis()` reads `REDIS_URL` only; env secrets are optional except as needed by sidecar features.
3. CSRF cookie race: forms could POST before `GET /api/auth/me` set the cookie.

Sign-in on Vercel is still **BROKEN** until hosted Postgres is reachable and migrated. Empty `DATABASE_URL` cannot create sessions.

## Production checklist (ops, not code)

- Set nonempty `DATABASE_URL` (Postgres) on the Vercel project.
- Run `npx prisma migrate deploy` against that database (not during Next compile).
- Set `SESSION_SECRET` (≥32 chars) if you want a production secret on record; sessions themselves are opaque random tokens hashed with SHA-256.
- Redis, realtime sidecar, Judge0, LiveKit, S3 remain required for those subsystems.
