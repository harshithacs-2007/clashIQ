# clashIQ architecture

## 1. Shape

```
Browser
  ├─ HTTPS  → Next.js (Vercel or `next start`)  → PostgreSQL
  │                                              → Redis (rate limit, pub/sub, queue)
  │                                              → S3-compatible object store
  ├─ WSS    → realtime service (Node + ws)      → Redis psubscribe
  └─ WebRTC → LiveKit SFU (self-hosted)
                    ↑
Participant code  → HTTP API → DB row → BullMQ → judge worker → Judge0 CE sandbox
```

The browser is untrusted. Next.js never executes participant source code and never stores exclusive competition state in memory.

## 2. Technology decisions

| Layer | Choice | Why |
| --- | --- | --- |
| Web | Next.js 15 App Router, React 19, TypeScript | Fits Vercel; typed HTTP surface |
| UI | Tailwind v4 + custom CSS tokens (ink/lime/signal). No generic purple SaaS kit. | Distinct identity; fewer unused abstractions |
| Animation | Motion for React + CSS; `prefers-reduced-motion` | Required product motion without layout thrash |
| Editor | Monaco (`@monaco-editor/react`) | Competitive-programming baseline |
| Database | PostgreSQL + Prisma | Transactions, FKs, row locks for shop inventory |
| Cache / queue / pubsub | Redis + BullMQ | Required for 50–100 concurrent submits without blocking HTTP |
| Realtime | Dedicated `ws` server + Redis pub/sub | Vercel functions cannot hold sockets |
| Judge | Judge0 Community Edition over HTTP from a worker | Isolated compile/execute; not in Next.js |
| WebRTC | LiveKit (Apache 2.0) | SFU, selective subscribe, thumbnails vs full res |
| Storage | S3 API (MinIO locally) | No local-disk persistence on Vercel |
| Auth | Argon2id + server sessions + HttpOnly cookies | Real accounts; roles never taken from the client |

Rejected: running Socket.io inside Next.js; executing code in serverless; trusting `localStorage` auth; Pusher/Ably as a hard dependency (paid).

## 3. Database

See `prisma/schema.prisma`. Core ideas:

- `User.role` is `PARTICIPANT | HOST` and is only read from the session’s user row.
- `ScoreTransaction` is the audit trail; `LeaderboardEntry` is a maintained aggregate.
- Quiz options keep `isCorrect` server-side; public APIs map options without that field.
- Coding tests keep `hidden` inputs/outputs off the participant payload.
- `PowerShopOffer.inventory` is decremented with `updateMany(... inventory: { gt: 0 })` so concurrent buys cannot go negative.

## 4. HTTP API (selected)

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/signup` `/login` `/logout` | CSRF |
| GET | `/api/auth/me` | session optional |
| POST | `/api/rooms/join` | participant |
| GET | `/api/rooms/state` | member or host |
| POST | `/api/quiz/submit` | member, live activity |
| POST | `/api/coding/submit` | member, live activity |
| POST/PUT | `/api/power/shop` | member buy / host open |
| POST | `/api/challenges` | member |
| POST | `/api/host/control` | HOST + ownership |
| GET | `/api/host/health` | HOST |

Idempotency: `Idempotency-Key` header or derived keys (`quiz:user:question`, `score:code:submissionId`).

## 5. Realtime

1. Client `GET /api/realtime/token?roomId=`
2. Server HMAC-signs `{ sub, roomId, role, teamId, exp }` with `REALTIME_SHARED_SECRET`
3. Client opens `wss://realtime/?token=`
4. Realtime process verifies HMAC and only fans out `room:{id}` (all members) or `host:{id}` (hosts)

On reconnect the client always `GET /api/rooms/state` — sockets are not a source of truth.

Events include `ROOM_UPDATED`, `ACTIVITY_*`, `TIMER_UPDATED`, `LEADERBOARD_UPDATED`, `SUBMISSION_RESULT`, `POWER_SHOP_*`, `CHALLENGE_*`, `PROCTORING_STATUS_CHANGED`.

## 6. Code execution

```
POST /api/coding/submit
  → validate language/size/activity lock/timer
  → insert CodingSubmission QUEUED
  → BullMQ job id = submission id
  → worker: Judge0 wait=true per test (network disabled)
  → persist TestCaseResult (stdout stripped when hidden)
  → score delta = max(0, thisPoints - priorBestForUser)
  → publish SUBMISSION_RESULT
```

Worker concurrency is 4 by default. One failed job retries; others continue.

## 7. Screen sharing

Participant calls `getDisplayMedia()` (explicit permission). Host dashboard requests a LiveKit **subscriber** token. Publishers send screen tracks into `clashiq-{roomId}`. Hosts subscribe selectively (grid vs enlarged). A dead track is isolated per session.

Without LiveKit env vars, proctoring health is `DEGRADED` and tokens return 503 — the rest of the event still runs.

## 8. Authentication

Argon2id hashes. Session token is random 32 bytes, stored as SHA-256, cookie `clashiq_session` HttpOnly, `Secure` when `APP_ENV !== development`, SameSite=Lax. CSRF double-submit cookie `clashiq_csrf` plus Origin allowlist.

Host APIs call `requireHost()` which reads `user.role` from the database-backed session.

## 9. Security / threat model

See [SECURITY.md](SECURITY.md).

## 10. Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md). Web on Vercel; data plane elsewhere.

## 11. Testing strategy

- Unit: timers, crypto, cookie parse (`npm test`)
- Integration: Prisma/hidden-test contract (`npm run test:integration`)
- E2E: Playwright landing/signup (`npm run test:e2e`)
- Concurrency: `tests/load/power-shop.ts` against a live offer
- Simulator: `npm run sim -- CODE`

## 12. Load-testing strategy

Documented in [LOAD-TESTING.md](LOAD-TESTING.md). Do not invent capacity numbers. Target design: 50–100 concurrent participants per room, with judge and SFU as the first bottlenecks.
