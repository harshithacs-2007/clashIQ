# Production readiness

This is a checklist, not a claim of guaranteed uptime or an unhackable system.

## What Vercel hosts

The Next.js UI and HTTP APIs only.

Not on Vercel: PostgreSQL, Redis, the WebSocket process, BullMQ judge worker, Judge0, LiveKit, MinIO.

## Required production env (Vercel + sidecars)

Set these in the Vercel project (Production and Preview **separately**). Never commit values.

- `APP_ENV=production` (preview: `preview`)
- `APP_URL` / `NEXT_PUBLIC_APP_URL` — the deployment origin
- `DATABASE_URL` — **non-dev** Postgres (preview must not use production)
- `REDIS_URL`
- `SESSION_SECRET` (≥32 random bytes)
- `REALTIME_SHARED_SECRET`
- `NEXT_PUBLIC_REALTIME_URL` — `wss://` of the realtime sidecar
- `JUDGE0_URL` / optional `JUDGE0_AUTH_TOKEN`
- `LIVEKIT_URL` / `NEXT_PUBLIC_LIVEKIT_URL` / API key + secret
- S3-compatible keys if uploads are enabled

`NEXT_PUBLIC_*` is visible in the browser. Do not put database URLs, session secrets, Judge0 tokens, or LiveKit API secrets in `NEXT_PUBLIC_*`.

## Local gate before a real event

```text
[ ] npm run typecheck
[ ] npm test
[ ] npm run build  (local; does not run prisma migrate unless you invoke it)
[ ] docker compose up -d postgres redis
[ ] npx prisma migrate deploy && npm run db:seed
[ ] npm run dev:all
[ ] Host login + create room
[ ] Participant join + quiz
[ ] Coding submit (Judge0 optional; otherwise UNAVAILABLE)
[ ] Power shop open + buy
[ ] Reconnect / refresh restores state
```

## Sidecar deploy

Run `services/realtime` and `services/judge-worker` on a VM with TLS. Point `NEXT_PUBLIC_REALTIME_URL` at that host.

## Known limitations

- 50–100 concurrent users is a **design target**, not a measured SLA.
- Screen share and judging are degraded until LiveKit/Judge0 are up.
- Participants can still leak a live question out-of-band.
- Redis/Postgres outages take down mutations (rate limit and sessions depend on them).
