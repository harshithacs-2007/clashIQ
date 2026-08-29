# clashIQ security

clashIQ is built as **defense in depth**. It is not unhackable, cheat-proof, or guaranteed available.

## Authentication

- Passwords: Argon2id (`@node-rs/argon2`). Never logged.
- Sessions: opaque tokens, hashed at rest, revocable.
- Cookies: HttpOnly session; `Secure` outside development; SameSite=Lax.
- CSRF: Origin/Referer allowlist + `X-CSRF-Token` matching a non-HttpOnly cookie.
- Login: per-IP rate limit + failed-attempt throttle per email.
- Roles: `PARTICIPANT` | `HOST` on `User`. Changing client JS, URLs, or cookies cannot mint a host session.

## Authorization

Every mutating route loads the session user from the database. Host routes additionally check `event.hostId`. Participant room routes require `TeamMember` for that `roomId`.

## Threats (malicious participant)

| Attempt | Mitigation |
| --- | --- |
| POST a huge score | No score-write API; only `ScoreTransaction` from quiz/judge/challenge/shop |
| Read future answers | Public quiz payload omits `isCorrect` and upcoming questions |
| Read hidden tests | Public coding payload only lists non-hidden cases |
| Impersonate host | Role from session user row |
| Buy last card 100 times | `updateMany` where `inventory > 0`; unique `(offerId, teamId)` |
| Replay quiz submit | Unique `(questionId, userId)` |
| XSS via names/questions | React text encoding; uploads are images only |
| CSRF | Origin + token |
| Code escape | Judge0 isolation; worker is not the web process |
| Subscribe to another room WS | Token bound to authorized `roomId` |
| Watch another team's screen | LiveKit: only the event host may subscribe |
| Freeze/steal a team in another room | Target team must share `roomId` |
| Buy another room's shop offer | Offer `roomId` must match |
| Read score ledger as any HOST account | Ledger only if `event.hostId` matches |

## Sandbox

Judge0 (or equivalent) must run with network disabled, CPU/memory/time/process limits. clashIQ never runs submissions inside Next.js or Vercel functions.

If `JUDGE0_URL` is unset, submissions become `UNAVAILABLE` rather than executing locally.

## Uploads

Size cap, declared MIME allowlist, magic-byte check, generated object keys. Not executed as application code.

## Rate limits

Login, join, quiz, coding, shop, uploads, LiveKit tokens, proctor signals. Limits are meant to allow a full room, not a scrape bot.

## Headers

CSP allows Monaco workers (`blob:`, limited `unsafe-eval`) and WebRTC (`connect-src`). HSTS in production. `X-Frame-Options: DENY`. `Permissions-Policy` camera/mic off; `display-capture=(self)`.

## Known limitations

- A participant who already sees a live question can share it out-of-band (shoulder, second device). Proctoring signals are **hints**, not verdicts.
- LiveKit/Judge0 misconfiguration degrades those subsystems; the HTTP app should still host quizzes.
- CSRF cookie is readable by XSS; XSS remains a high-severity bug class — keep React’s escaping, avoid `dangerouslySetInnerHTML`.
- Preview deployments must use non-production databases or they will share competition data.
- Host UI routes are gated by a server layout (`User.role === HOST`); APIs still re-check. Cookie presence in middleware is not a role grant.
- CORS is an explicit allowlist (`APP_URL` + `CORS_ORIGINS`), not `*`.
- Power-card *use* idempotency is per team/card/target; a second distinct use of the same card type against the same target is rejected until you send a new `Idempotency-Key`.
