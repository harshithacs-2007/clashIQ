/**
 * Event simulator — drives fake participants against a live API.
 * Usage: APP_URL=http://localhost:3000 tsx services/simulator/index.ts <roomCode>
 */
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.error("Usage: npm run sim -- <ROOM_CODE>");
    process.exit(1);
  }
  const password = process.env.SEED_PARTICIPANT_PASSWORD ?? "change-this-participant-password";
  const n = Number(process.env.SIM_USERS ?? 10);
  const results: string[] = [];
  for (let i = 0; i < n; i++) {
    const email = `sim${i}@clashiq.local`;
    await fetch(`${APP_URL}/api/auth/signup`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password, displayName: `Sim ${i}` }),
    }).catch(() => undefined);
    const login = await fetch(`${APP_URL}/api/auth/login`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const setCookie = login.headers.get("set-cookie") ?? "";
    const csrf = cookieValue(setCookie, "clashiq_csrf");
    const cookie = setCookie;
    await fetch(`${APP_URL}/api/rooms/join`, {
      method: "POST",
      headers: { ...jsonHeaders(csrf), cookie },
      body: JSON.stringify({ code }),
    });
    results.push(email);
  }
  console.log(JSON.stringify({ simulated: results.length, users: results }));
}

function jsonHeaders(csrf?: string) {
  return {
    "content-type": "application/json",
    origin: APP_URL,
    ...(csrf ? { "x-csrf-token": csrf } : {}),
  };
}

function cookieValue(header: string, name: string) {
  const m = header.match(new RegExp(`${name}=([^;]+)`));
  return m?.[1];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
