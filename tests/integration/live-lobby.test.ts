import { describe, expect, it } from "vitest";

const base = process.env.LIVE_APP_URL?.replace(/\/$/, "");
const hostEmail = (() => {
  const email = process.env.SEED_HOST_EMAIL?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "host@clashiq.local";
})();
const hostPassword = process.env.SEED_HOST_PASSWORD;

type Jar = { csrf: string; cookie: string };

async function boot(): Promise<Jar> {
  const res = await fetch(`${base}/api/auth/me`);
  const cookie = res.headers.get("set-cookie") ?? "";
  const csrf = cookie.match(/clashiq_csrf=([^;]+)/)?.[1] ?? "";
  return { csrf: decodeURIComponent(csrf), cookie };
}

function nextJar(prev: string, res: Response): string {
  const set = res.headers.getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  const map = new Map<string, string>();
  for (const part of prev.split(",").join(";").split(";")) {
    const [k, v] = part.trim().split("=");
    if (k && v) map.set(k, v);
  }
  for (const line of set) {
    const pair = line.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) map.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function req<T>(jar: Jar, path: string, init: RequestInit, expectStatus?: number): Promise<{ status: number; data: T; jar: Jar }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      origin: base!,
      "x-csrf-token": jar.csrf,
      cookie: jar.cookie,
      ...(init.headers ?? {}),
    },
  });
  const cookie = nextJar(jar.cookie, res);
  const csrf = cookie.match(/clashiq_csrf=([^;]+)/)?.[1] ?? jar.csrf;
  const data = (await res.json()) as T;
  if (expectStatus) expect(res.status).toBe(expectStatus);
  return { status: res.status, data, jar: { cookie, csrf: decodeURIComponent(csrf) } };
}

async function post<T>(jar: Jar, path: string, body: unknown, expectStatus?: number) {
  return req<T>(jar, path, { method: "POST", body: JSON.stringify(body) }, expectStatus);
}

describe.skipIf(!base || !hostEmail || !hostPassword)("live host → join → lobby", () => {
  it("creates an open room, lets a participant join a team, and shows them in host lobby", async () => {
    let jar = await boot();
    const login = await post<{ user: { role: string }; error?: string }>(jar, "/api/auth/login", {
      email: hostEmail,
      password: hostPassword,
    });
    expect(login.data.error ?? "ok", `host login failed: ${login.data.error ?? login.status}`).toBe("ok");
    expect(login.status).toBe(200);
    expect(login.data.user.role).toBe("HOST");
    jar = login.jar;

    const title = `Lobby ${Date.now()}`;
    const ev = await post<{ event: { id: string } }>(jar, "/api/host/events", { title, description: "" }, 201);
    const room = await post<{ room: { id: string; code: string; status: string } }>(
      jar,
      `/api/host/rooms?eventId=${ev.data.event.id}`,
      { name: "Main", teamSize: 2 },
      201,
    );
    expect(room.data.room.status).toBe("DRAFT");
    expect(room.data.room.code.length).toBeGreaterThanOrEqual(4);

    const opened = await post(jar, "/api/host/control", { roomId: room.data.room.id, action: "OPEN_ROOM" }, 200);
    expect(opened.status).toBe(200);

    const partEmail = `lobby-${Date.now()}@example.com`;
    let pjar = await boot();
    const signup = await post<{ user: { role: string } }>(pjar, "/api/auth/signup", {
      email: partEmail,
      password: "longenough1",
      displayName: "Lobby Runner",
    }, 201);
    expect(signup.data.user.role).toBe("PARTICIPANT");
    pjar = signup.jar;

    const joined = await post<{ room: { id: string }; alreadyOnTeam: boolean }>(pjar, "/api/rooms/join", {
      code: room.data.room.code,
    }, 200);
    expect(joined.data.alreadyOnTeam).toBe(false);
    pjar = joined.jar;

    const avatar = await req(pjar, "/api/avatar", {
      method: "PUT",
      body: JSON.stringify({
        style: "cyber",
        hue: 140,
        visor: 1,
        crest: 2,
        mark: 1,
      }),
    }, 200);
    expect(avatar.status).toBe(200);
    pjar = avatar.jar;

    const team = await post<{ teamId: string }>(pjar, `/api/teams?roomId=${joined.data.room.id}`, {
      name: "Alpha",
    }, 200);
    expect(team.data.teamId).toBeTruthy();
    pjar = team.jar;

    const stateRes = await fetch(`${base}/api/rooms/state?roomId=${joined.data.room.id}`, {
      headers: { cookie: team.jar.cookie },
    });
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as { teams: { name: string; members: { displayName: string }[] }; me: { teamId: string | null } };
    expect(state.me.teamId).toBe(team.data.teamId);
    expect(JSON.stringify(state)).not.toMatch(/@example\.com/);
    expect(state.teams.some((t) => t.name === "Alpha")).toBe(true);

    const hostLobby = await fetch(`${base}/api/host/rooms/${room.data.room.id}`, {
      headers: { cookie: jar.cookie },
    });
    expect(hostLobby.status).toBe(200);
    const lobby = (await hostLobby.json()) as { teams: { name: string; members: { user: { displayName: string } }[] } };
    expect(lobby.teams.some((t) => t.name === "Alpha" && t.members.some((m) => m.user.displayName === "Lobby Runner"))).toBe(true);
    expect(JSON.stringify(lobby)).not.toMatch(partEmail);

    const forbidden = await post(pjar, "/api/host/events", { title: "Nope", description: "" });
    expect(forbidden.status).toBe(403);
  });
});
