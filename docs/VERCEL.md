# Vercel + hosted PostgreSQL (authentication)

Vercel hosts **only** the Next.js app. Do not run Postgres, Redis, the realtime WebSocket server, the judge worker, Judge0, or LiveKit as persistent processes on Vercel.

## Database choice

Use **Neon** (free tier at [neon.tech](https://neon.tech)). It is PostgreSQL 16, supports this Prisma schema (enums, JSON, foreign keys, unique constraints, transactions), and provides a connection pooler suitable for Vercel serverless.

Do not point preview deployments at the production database.

## Prisma URLs

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled URL (`-pooler` host). App queries. Add `pgbouncer=true` on Neon. |
| `DIRECT_URL` | Unpooled URL. `npm run db:migrate:deploy` only. |

Local Docker: set both to the same URL.

Migrations are **not** run during `next build`. After the production database exists:

```bash
npm run db:migrate:deploy
```

That command refuses to run if `DATABASE_URL` is missing (no mock database).

## Vercel project settings

- Framework: Next.js
- Build: `DIRECT_URL=${DIRECT_URL:-$DATABASE_URL} npx prisma generate && next build` (see `vercel.json`)
- Install: `npm ci`
- Root directory: repository root

### Production environment variables (server-only unless `NEXT_PUBLIC_`)

Required for authentication:

- `DATABASE_URL` — Neon pooled (nonempty)
- `DIRECT_URL` — Neon unpooled (nonempty)
- `APP_URL` — `https://<production-host>`
- `SESSION_SECRET` — ≥32 random characters

Set production and preview separately. Preview should use a different Neon branch/project.

Optional until those subsystems are deployed: `REDIS_URL`, `REALTIME_*`, `JUDGE0_*`, `S3_*`, `LIVEKIT_*`.

Never set secrets with a `NEXT_PUBLIC_` prefix.

## After connecting Neon

1. Put the two URLs in Vercel **Production** (and a different pair in **Preview**).
2. Run `npm run db:migrate:deploy` locally with production `DIRECT_URL` loaded (do not commit the URL).
3. Redeploy.
4. Test signup → login → `/api/auth/me` → refresh → logout on the production host.

Until step 2 succeeds, authentication must stay **FAIL** (no fake success UI).
