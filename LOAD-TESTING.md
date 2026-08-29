# clashIQ load testing

## Methodology

1. Bring up web + realtime + Redis + Postgres.
2. Seed a room and open it.
3. Use `npm run sim -- ROOMCODE` and/or k6/Playwright for HTTP.
4. Record latency, error rate, Redis CPU, Postgres connections, judge queue depth.
5. **Do not publish invented numbers.** Fill `load-results.json` from actual runs.

`npm run test:load` only smoke-probes `/api/auth/me` at staged concurrency labels. That is not a 100-user proof.

## Scenarios

| Scenario | How |
| --- | --- |
| Joins | simulator against `POST /api/rooms/join` |
| Quiz stampede | N clients `POST /api/quiz/submit` with distinct users |
| Coding stampede | N submits; watch BullMQ + Judge0 |
| Power shop | Inventory=3, N=100 — `tests/load/power-shop.ts` |
| Reconnect burst | drop WS, expect state GET |
| Proctoring | N `getDisplayMedia` into LiveKit; host grid |

## Expected bottlenecks (qualitative)

- Judge0 CPU during coding
- LiveKit bandwidth during full-room share
- Postgres row lock waits on shop `updateMany`
- Single-region Vercel → realtime RTT

## Results

Until you run the suite on target hardware, capacity is **unverified**. Design intent is one room of 50–100 participants, not a guaranteed SLA.
