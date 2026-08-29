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
      "content-type": init.body instanceof FormData ? undefined : "application/json",
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

async function signupParticipant(name: string) {
  let jar = await boot();
  const email = `quiz-${name}-${Date.now()}@example.com`;
  const signup = await post<{ user: { role: string } }>(jar, "/api/auth/signup", {
    email,
    password: "longenough1",
    displayName: name,
  }, 201);
  return { jar: signup.jar, email };
}

describe.skipIf(!base || !hostEmail || !hostPassword)("live quiz builder → score → leaderboard", () => {
  it("hosts a quiz, hides the answer key, scores on the server, and ranks teams", async () => {
    let host = await boot();
    const login = await post<{ user: { role: string }; error?: string }>(host, "/api/auth/login", {
      email: hostEmail,
      password: hostPassword,
    });
    expect(login.data.error ?? "ok", `host login failed: ${login.data.error ?? login.status}`).toBe("ok");
    expect(login.status).toBe(200);
    host = login.jar;

    const ev = await post<{ event: { id: string } }>(host, "/api/host/events", {
      title: `Quiz ${Date.now()}`,
      description: "",
    }, 201);
    const room = await post<{ room: { id: string; code: string } }>(
      host,
      `/api/host/rooms?eventId=${ev.data.event.id}`,
      { name: "Arena", teamSize: 2 },
      201,
    );
    const roomId = room.data.room.id;
    await post(host, "/api/host/control", { roomId, action: "OPEN_ROOM" }, 200);

    const otherRoom = await post<{ room: { id: string } }>(
      host,
      `/api/host/rooms?eventId=${ev.data.event.id}`,
      { name: "Other", teamSize: 2 },
      201,
    );

    const quiz = await post<{ activity: { id: string } }>(host, `/api/host/activities?roomId=${roomId}`, {
      type: "QUIZ",
      title: "Warmup",
      durationMs: 120000,
      instructions: "Pick the right answer.",
    }, 201);
    const activityId = quiz.data.activity.id;

    const otherQuiz = await post<{ activity: { id: string } }>(host, `/api/host/activities?roomId=${otherRoom.data.room.id}`, {
      type: "QUIZ",
      title: "Secret",
      durationMs: 60000,
    }, 201);
    const otherQ = await post<{ question: { id: string; options: { id: string }[] } }>(host, "/api/host/quiz/questions", {
      activityId: otherQuiz.data.activity.id,
      prompt: "Other room question",
      points: 10,
      options: [
        { label: "X", isCorrect: true },
        { label: "Y", isCorrect: false },
      ],
    }, 201);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const form = new FormData();
    form.set("file", new File([png], "dot.png", { type: "image/png" }));
    form.set("roomId", roomId);
    const uploadRes = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { origin: base!, "x-csrf-token": host.csrf, cookie: host.cookie },
      body: form,
    });
    const uploadJson = (await uploadRes.json()) as { media?: { id: string }; error?: string };
    const imageConfigured = uploadRes.status === 201 && !!uploadJson.media?.id;
    if (!imageConfigured) {
      expect([400, 503, 502]).toContain(uploadRes.status);
    }

    const badQuestion = await post(host, "/api/host/quiz/questions", {
      activityId,
      prompt: "Broken",
      points: 0,
      options: [{ label: "only", isCorrect: true }],
    });
    expect(badQuestion.status).toBe(400);

    const created = await post<{ question: { id: string; options: { id: string; label: string; isCorrect: boolean }[] } }>(
      host,
      "/api/host/quiz/questions",
      {
        activityId,
        prompt: "2 + 2?",
        explanation: "Basic arithmetic",
        points: 100,
        imageId: imageConfigured ? uploadJson.media!.id : undefined,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
          { label: "5", isCorrect: false },
        ],
      },
      201,
    );
    const questionId = created.data.question.id;
    const correctId = created.data.question.options.find((o) => o.isCorrect)!.id;
    const wrongId = created.data.question.options.find((o) => !o.isCorrect)!.id;

    const q2 = await post<{ question: { id: string; options: { id: string }[] } }>(host, "/api/host/quiz/questions", {
      activityId,
      prompt: "Second question should stay hidden",
      points: 50,
      options: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: false },
      ],
    }, 201);

    const edit = await req(host, "/api/host/quiz/questions", {
      method: "PATCH",
      body: JSON.stringify({ questionId, prompt: "What is 2+2?", points: 100 }),
    }, 200);
    expect(edit.status).toBe(200);

    const beforeStart = await post(host, "/api/host/control", { roomId, activityId, action: "START" });
    expect(beforeStart.status).toBe(200);

    const p1 = await signupParticipant("Quiz One");
    let pjar = p1.jar;
    const joined = await post<{ room: { id: string } }>(pjar, "/api/rooms/join", { code: room.data.room.code }, 200);
    pjar = joined.jar;
    await req(pjar, "/api/avatar", {
      method: "PUT",
      body: JSON.stringify({ style: "cyber", hue: 12, visor: 1, crest: 1, mark: 1 }),
    }, 200);
    const team = await post<{ teamId: string }>(pjar, `/api/teams?roomId=${roomId}`, { name: "Nerds" }, 200);
    pjar = team.jar;

    const p2 = await signupParticipant("Quiz Two");
    let p2jar = p2.jar;
    const joined2 = await post<{ room: { id: string } }>(p2jar, "/api/rooms/join", { code: room.data.room.code }, 200);
    p2jar = joined2.jar;
    const team2 = await post<{ teamId: string }>(p2jar, `/api/teams?roomId=${roomId}`, { name: "Sparks" }, 200);
    p2jar = team2.jar;

    const forbiddenBuild = await post(pjar, "/api/host/quiz/questions", {
      activityId,
      prompt: "Hijack",
      options: [
        { label: "no", isCorrect: true },
        { label: "nope", isCorrect: false },
      ],
    });
    expect(forbiddenBuild.status).toBe(403);

    const otherState = await fetch(`${base}/api/rooms/state?roomId=${otherRoom.data.room.id}`, {
      headers: { cookie: pjar.cookie },
    });
    expect(otherState.status).toBe(403);

    const stateRes = await fetch(`${base}/api/rooms/state?roomId=${roomId}`, { headers: { cookie: pjar.cookie } });
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as {
      question: { id: string; prompt: string; options: { id: string; label: string; isCorrect?: boolean }[] } | null;
      activities: { id: string; status: string; remainingMs: number; endsAt: string | null }[];
      leaderboard: { rank: number; teamId: string; score: number; name: string }[];
    };
    const blob = JSON.stringify(state);
    expect(blob).not.toMatch(/isCorrect/);
    expect(blob).not.toMatch(/Basic arithmetic/);
    expect(blob).not.toMatch(/Second question should stay hidden/);
    expect(blob).not.toMatch(p1.email);
    expect(state.question?.id).toBe(questionId);
    expect(state.activities.find((a) => a.id === activityId)?.endsAt).toBeNull();

    const pause = await post(host, "/api/host/control", { roomId, activityId, action: "PAUSE" }, 200);
    expect(pause.status).toBe(200);
    const pausedSubmit = await post(pjar, "/api/quiz/submit", { activityId, questionId, optionId: correctId });
    expect(pausedSubmit.status).toBe(403);
    await post(host, "/api/host/control", { roomId, activityId, action: "RESUME" }, 200);

    const forgedScore = await post(pjar, "/api/quiz/submit", {
      activityId,
      questionId,
      optionId: correctId,
      score: 9999,
      teamId: "forged",
    });
    expect(forgedScore.status).toBe(400);

    const forgedTeam = await post(pjar, "/api/quiz/submit", {
      activityId,
      questionId,
      optionId: correctId,
      teamId: team2.data.teamId,
    });
    expect(forgedTeam.status).toBe(400);

    const otherRoomAnswer = await post(pjar, "/api/quiz/submit", {
      activityId: otherQuiz.data.activity.id,
      questionId: otherQ.data.question.id,
      optionId: otherQ.data.question.options[0]!.id,
    });
    expect([403, 404]).toContain(otherRoomAnswer.status);

    const future = await post(pjar, "/api/quiz/submit", {
      activityId,
      questionId: q2.data.question.id,
      optionId: q2.data.question.options[0]!.id,
    });
    expect(future.status).toBe(403);

    const invalidOpt = await post(pjar, "/api/quiz/submit", { activityId, questionId, optionId: "not-an-option" });
    expect(invalidOpt.status).toBe(400);

    const [s1, s2] = await Promise.all([
      post<{ duplicate?: boolean; correct: boolean; pointsAwarded: number }>(pjar, "/api/quiz/submit", {
        activityId, questionId, optionId: correctId,
      }),
      post<{ duplicate?: boolean; correct: boolean; pointsAwarded: number }>(pjar, "/api/quiz/submit", {
        activityId, questionId, optionId: wrongId,
      }),
    ]);
    const accepted = [s1, s2].filter((s) => s.status === 200);
    expect(accepted.length).toBe(2);
    const awarded = accepted.reduce((n, s) => n + (s.data.duplicate ? 0 : s.data.pointsAwarded), 0);
    expect(awarded).toBe(100);
    expect(accepted.some((s) => s.data.duplicate)).toBe(true);

    const wrong = await post<{ correct: boolean; pointsAwarded: number }>(p2jar, "/api/quiz/submit", {
      activityId, questionId, optionId: wrongId,
    }, 200);
    expect(wrong.data.correct).toBe(false);
    expect(wrong.data.pointsAwarded).toBe(0);

    const refresh = await fetch(`${base}/api/rooms/state?roomId=${roomId}`, { headers: { cookie: pjar.cookie } });
    const again = (await refresh.json()) as {
      mySubmission: { optionId: string } | null;
      leaderboard: { rank: number; teamId: string; score: number; name: string }[];
      question: { id: string };
    };
    expect(again.mySubmission?.optionId).toBeTruthy();
    expect(again.question.id).toBe(questionId);
    const nerds = again.leaderboard.find((r) => r.teamId === team.data.teamId);
    const sparks = again.leaderboard.find((r) => r.teamId === team2.data.teamId);
    expect(nerds?.score).toBe(100);
    expect(sparks?.score ?? 0).toBe(0);
    expect(nerds?.rank).toBe(1);

    const hostView = await fetch(`${base}/api/host/rooms/${roomId}`, { headers: { cookie: host.cookie } });
    expect(hostView.status).toBe(200);
    const hostJson = (await hostView.json()) as {
      board: { rank: number; score: number; name: string }[];
      progress: { teamId: string; answered: number }[];
      currentQuestion: { id: string } | null;
    };
    expect(hostJson.currentQuestion?.id).toBe(questionId);
    expect(hostJson.board[0]?.score).toBe(100);
    expect(hostJson.progress.find((p) => p.teamId === team.data.teamId)?.answered).toBe(1);
    expect(JSON.stringify(hostJson)).not.toMatch(p1.email);

    await post(host, "/api/host/control", { roomId, activityId, action: "LOCK" }, 200);
    const late = await post(p2jar, "/api/quiz/submit", { activityId, questionId: q2.data.question.id, optionId: q2.data.question.options[0]!.id });
    expect(late.status).toBe(403);

    await post(host, "/api/host/control", { roomId, activityId, action: "END" }, 200);

    const short = await post<{ activity: { id: string } }>(host, `/api/host/activities?roomId=${roomId}`, {
      type: "QUIZ",
      title: "Sprint",
      durationMs: 5000,
    }, 201);
    await post(host, "/api/host/quiz/questions", {
      activityId: short.data.activity.id,
      prompt: "Speed?",
      points: 10,
      options: [
        { label: "yes", isCorrect: true },
        { label: "no", isCorrect: false },
      ],
    }, 201);
    await post(host, "/api/host/control", { roomId, activityId: short.data.activity.id, action: "START" }, 200);
    await new Promise((r) => setTimeout(r, 5500));
    const expiredState = await fetch(`${base}/api/rooms/state?roomId=${roomId}`, { headers: { cookie: pjar.cookie } });
    const expired = (await expiredState.json()) as { activities: { id: string; remainingMs: number; status: string }[] };
    const sprint = expired.activities.find((a) => a.id === short.data.activity.id);
    expect(sprint?.remainingMs).toBe(0);
    const lateExpired = await post(pjar, "/api/quiz/submit", {
      activityId: short.data.activity.id,
      questionId: "ignored",
      optionId: "ignored",
    });
    expect(lateExpired.status).toBe(403);

    process.stdout.write(`IMAGE_UPLOAD_LIVE=${imageConfigured ? "PASS" : "FAIL"}\n`);
  });
});
