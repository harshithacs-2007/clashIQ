# clashIQ

Realtime competition OS for college technical events: quizzes, judged coding, teams, power cards, and host-operated proctoring.

This is not a mock dashboard. Scores, timers, inventory, answers, and hidden tests are server-authoritative.

## Requirements

- Node.js 22+
- Docker (PostgreSQL, Redis, optional MinIO / LiveKit / Judge0)
- A host machine that is **not** Vercel for WebSockets, the judge worker, and LiveKit

## Quick start

```bash
cp .env.example .env.local
# edit SESSION_SECRET and REALTIME_SHARED_SECRET (32+ / 16+ random chars)

docker compose up -d postgres redis
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

Seeded host: `SEED_HOST_EMAIL` / `SEED_HOST_PASSWORD` from `.env.local`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js web app |
| `npm run dev:realtime` | WebSocket service (port 4001) |
| `npm run dev:judge` | Judge worker (Judge0 HTTP) |
| `npm run dev:all` | All three |
| `npm test` | Unit tests |
| `npm run test:e2e` | Playwright |
| `npm run test:load` | Smoke probes at 10–100 (not a capacity claim) |
| `npm run sim -- ROOMCODE` | Fake participant joins |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Security: [SECURITY.md](SECURITY.md). Deploy: [DEPLOYMENT.md](DEPLOYMENT.md). Load tests: [LOAD-TESTING.md](LOAD-TESTING.md). Event gate: [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md).

## What does not run on Vercel

Vercel hosts the Next.js UI and HTTP APIs only.

Long-lived WebSockets, BullMQ workers, Judge0 sandboxes, LiveKit SFU, PostgreSQL, and Redis must be separate processes/services.
