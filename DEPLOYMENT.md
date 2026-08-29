# clashIQ deployment

## Environments

| Name | `APP_ENV` | Data |
| --- | --- | --- |
| Development | `development` | local Docker Postgres/Redis |
| Preview | `preview` | **isolated** database + Redis (never production) |
| Production | `production` | production database + Redis + judge + LiveKit |

Copy `.env.example`. Never commit `.env.local`.

## Vercel (web only)

1. Push this repo to GitHub.
2. In Vercel: Import Project → select the GitHub repo.
3. Framework: Next.js. Build command is in `vercel.json` (`prisma generate`, `prisma migrate deploy`, `next build`).
4. Create **Preview** and **Production** env var sets. Preview `DATABASE_URL` must not be production.
5. Set every variable from `.env.example` except secrets you generate yourself.
6. `NEXT_PUBLIC_REALTIME_URL` must be the public `wss://` sidecar, not `ws://localhost`.
7. Deploy. Confirm `/api/health` returns `{ ok: true }` on the production origin.

Vercel **must not** run the realtime server, judge worker, Judge0, or LiveKit.


## Sidecar processes

Run on a small VM (Fly, Railway, Hetzner, campus lab):

```bash
# realtime
REALTIME_PORT=4001 tsx services/realtime/index.ts

# judge worker
tsx services/judge-worker/index.ts
```

Put them behind TLS (Caddy/nginx).

### Judge0

Deploy [Judge0 CE](https://github.com/judge0/judge0) with its official compose. Point `JUDGE0_URL` at it. This is the only supported execution path.

### LiveKit

`docker compose up livekit` for development (`--dev` keys). Production: a real LiveKit config with TURN if students are on restricted NAT. Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

### Object storage

MinIO locally. Production: any S3-compatible bucket (self-hosted MinIO, Cloudflare R2, etc.).

## External services (honest cost)

| Service | OSS? | Self-host? | Free? | Notes |
| --- | --- | --- | --- | --- |
| PostgreSQL | Yes | Yes | Local yes | Hosted extras cost money at event scale |
| Redis | Yes | Yes | Local yes | Same |
| Next.js on Vercel | Framework OSS | `next start` elsewhere | Hobby may fit 100 users of **HTTP** | Realtime/judge not included |
| Judge0 CE | Yes (GPL) | Yes | Compute is not free | CPU-heavy during coding rounds |
| LiveKit | Apache 2.0 | Yes | Compute + bandwidth | Screen share is the bandwidth hog |
| MinIO | AGPL | Yes | Local yes | |

A 100-person coding round with screen share will not stay at $0 on someone else’s cloud. Self-hosting on lab hardware can approach $0 **cash**, not $0 electricity/ops.

## Database backup / restore

```bash
pg_dump "$DATABASE_URL" > backup.sql
psql "$DATABASE_URL" < backup.sql
```

Migrations: `npx prisma migrate deploy`. Rollback: restore dump + `prisma migrate` to the previous folder if needed. Practice restore on preview before an event.

## Production checklist

- [ ] `npm run typecheck` `lint` `test` `build`
- [ ] Preview uses a non-prod database
- [ ] Secrets rotated; seed passwords changed
- [ ] Judge0 about endpoint healthy
- [ ] Realtime WSS reachable from browsers
- [ ] LiveKit tested with two machines
- [ ] Power shop concurrency script run
- [ ] `pg_dump` scheduled
- [ ] Host run-of-show rehearsal
