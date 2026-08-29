"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/lib/use-realtime";
import { HostProctorGrid } from "@/components/HostProctorGrid";

type Health = Record<string, "HEALTHY" | "DEGRADED" | "OFFLINE">;

type Payload = {
  room: { id: string; name: string; code: string; status: string; currentActivityId: string | null };
  activities: { id: string; type: string; title: string; status: string; remainingMs: number }[];
  teams: { id: string; name: string; members: { user: { displayName: string } }[] }[];
  board: { teamId: string; score: number }[];
  submissions: { id: string; status: string; pointsAwarded: number; user: string }[];
  proctor: { userId: string; sharing: boolean; connected: boolean; teamId: string }[];
  health: Health;
  quizzes: { activityId: string; questions: { id: string; prompt: string }[] }[];
  challenges: { id: string; status: string; challengerId: string; opponentId: string }[];
};

export default function HostControl() {
  const { roomId } = useParams<{ roomId: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"ops" | "build" | "proctor">("ops");

  const load = useCallback(async () => {
    const res = await api<Payload>(`/api/host/rooms/${roomId}`);
    setData(res);
  }, [roomId]);

  useEffect(() => { void load(); }, [load]);
  useRealtime(roomId, () => { void load(); });

  async function control(action: string, activityId?: string) {
    await api("/api/host/control", {
      method: "POST",
      body: JSON.stringify({ roomId, action, activityId, extraMs: action === "ADD_TIME" ? 30000 : undefined }),
    });
    await load();
  }

  async function addActivity(type: "QUIZ" | "CODING" | "CHALLENGE") {
    const title = prompt(`${type} title?`);
    if (!title) return;
    await api(`/api/host/activities?roomId=${roomId}`, {
      method: "POST",
      body: JSON.stringify({ type, title, durationMs: type === "CODING" ? 900000 : 60000 }),
    });
    await load();
  }

  async function addQuestion(activityId: string) {
    const promptText = prompt("Question text?");
    if (!promptText) return;
    await api("/api/host/quiz/questions", {
      method: "POST",
      body: JSON.stringify({
        activityId,
        prompt: promptText,
        explanation: "Reviewed by host.",
        points: 100,
        options: [
          { label: "Option A", isCorrect: true },
          { label: "Option B", isCorrect: false },
          { label: "Option C", isCorrect: false },
          { label: "Option D", isCorrect: false },
        ],
      }),
    });
    await load();
  }

  async function saveCoding(activityId: string) {
    await api("/api/host/coding", {
      method: "PUT",
      body: JSON.stringify({
        activityId,
        description: "Read an integer n and print n*n.",
        constraints: "1 <= n <= 1000",
        inputFormat: "A single integer n",
        outputFormat: "n squared",
        examples: [{ input: "4", output: "16" }],
        difficulty: "easy",
        allowedLanguages: [71, 63],
        starterCode: { "71": "n=int(input())\nprint(n*n)\n", "63": "const n=+require('fs').readFileSync(0,'utf8');\nconsole.log(n*n)\n" },
        tests: [
          { input: "4", expected: "16", points: 20, hidden: false },
          { input: "5", expected: "25", points: 20, hidden: true },
          { input: "10", expected: "100", points: 60, hidden: true },
        ],
      }),
    });
    await load();
  }

  if (!data) return <main className="p-8">Loading control room…</main>;
  const current = data.activities.find((a) => a.id === data.room.currentActivityId);

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
        <Brand compact />
        <div className="mono text-xs">
          {data.room.name} · CODE {data.room.code} · {data.room.status}
          <button
            className="ml-3 text-[var(--signal)]"
            onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/join/${data.room.code}`)}
          >
            Copy join link
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          {(["ops", "build", "proctor"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 ${tab === t ? "bg-[var(--lime)] text-black" : "border border-[var(--line)]"}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {tab === "ops" && (
        <div className="grid grid-cols-[220px_1fr_280px] gap-0">
          <aside className="border-r border-[var(--line)] p-4">
            <h2 className="mono text-xs text-[var(--mute)]">SYSTEM</h2>
            {Object.entries(data.health).map(([k, v]) => (
              <div key={k} className="mt-2 flex justify-between text-xs">
                <span>{k}</span>
                <span className={v === "HEALTHY" ? "text-[var(--lime)]" : v === "DEGRADED" ? "text-[var(--warn)]" : "text-[var(--danger)]"}>{v}</span>
              </div>
            ))}
            <h2 className="mono mt-6 text-xs text-[var(--mute)]">ROOM</h2>
            <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
              {["OPEN_ROOM", "LOCK_ROOM", "PAUSE_ROOM", "RESUME_ROOM", "CLOSE_ROOM"].map((a) => (
                <button key={a} onClick={() => void control(a)} className="border border-[var(--line)] px-2 py-1">{a.replace("_", " ")}</button>
              ))}
            </div>
          </aside>
          <section className="p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="mono text-xs text-[var(--lime)]">{current?.type ?? "STANDBY"}</p>
                <h1 className="text-3xl font-semibold">{current?.title ?? "No active round"}</h1>
              </div>
              <div className="mono text-4xl">{Math.ceil((current?.remainingMs ?? 0) / 1000)}s</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["START", "PAUSE", "RESUME", "LOCK", "UNLOCK", "ADD_TIME", "END", "NEXT"].map((a) => (
                <button
                  key={a}
                  disabled={!current && a !== "START"}
                  onClick={() => void control(a, current?.id ?? data.activities[0]?.id)}
                  className="bg-[var(--panel-2)] px-3 py-2 text-sm"
                >
                  {a.replace("_", " ")}
                </button>
              ))}
              <button onClick={() => void api("/api/power/shop", { method: "PUT", body: JSON.stringify({ roomId, action: "OPEN" }) })} className="bg-[var(--lime)] px-3 py-2 text-sm font-semibold text-black">
                Open Power Shop
              </button>
              <button onClick={() => void api("/api/power/shop", { method: "PUT", body: JSON.stringify({ roomId, action: "CLOSE" }) })} className="px-3 py-2 text-sm">
                Close shop
              </button>
            </div>
            <h2 className="mt-8 text-sm font-semibold">Run of show</h2>
            <ol className="mt-2 space-y-1">
              {data.activities.map((a) => (
                <li key={a.id} className={`flex justify-between px-3 py-2 ${a.id === current?.id ? "bg-[var(--panel-2)]" : ""}`}>
                  <span>{a.title} · {a.type} · {a.status}</span>
                  <button className="text-xs text-[var(--signal)]" onClick={() => void control("START", a.id)}>Go live</button>
                </li>
              ))}
            </ol>
            <h2 className="mt-8 text-sm font-semibold">Challenges</h2>
            <ul className="mt-2 text-sm">
              {data.challenges.map((c) => (
                <li key={c.id} className="flex justify-between py-1">
                  <span>{c.status}</span>
                  {c.status === "LIVE" && (
                    <button className="text-[var(--lime)]" onClick={() => void api("/api/challenges", { method: "PATCH", body: JSON.stringify({ challengeId: c.id, action: "COMPLETE", winnerId: c.challengerId }) })}>
                      Award challenger
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <aside className="border-l border-[var(--line)] p-4">
            <h2 className="mono text-xs text-[var(--mute)]">LEADERBOARD</h2>
            <ol className="mt-2 space-y-1 text-sm">
              {data.board.map((row, i) => (
                <li key={row.teamId} className="flex justify-between">
                  <span>{i + 1}. {data.teams.find((t) => t.id === row.teamId)?.name}</span>
                  <span className="mono text-[var(--lime)]">{row.score}</span>
                </li>
              ))}
            </ol>
            <h2 className="mono mt-6 text-xs text-[var(--mute)]">TEAMS</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {data.teams.map((t) => (
                <li key={t.id}>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-[var(--mute)]">{t.members.map((m) => m.user.displayName).join(", ")}</div>
                </li>
              ))}
            </ul>
            <h2 className="mono mt-6 text-xs text-[var(--mute)]">SUBMISSIONS</h2>
            <ul className="mt-2 space-y-1 text-xs">
              {data.submissions.map((s) => (
                <li key={s.id}>{s.user} · {s.status} · {s.pointsAwarded}</li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {tab === "build" && (
        <section className="p-6">
          <div className="flex gap-2">
            <button onClick={() => void addActivity("QUIZ")} className="border border-[var(--line)] px-3 py-2">Add quiz</button>
            <button onClick={() => void addActivity("CODING")} className="border border-[var(--line)] px-3 py-2">Add coding</button>
            <button onClick={() => void addActivity("CHALLENGE")} className="border border-[var(--line)] px-3 py-2">Add challenge slot</button>
          </div>
          <ul className="mt-6 space-y-4">
            {data.activities.map((a) => (
              <li key={a.id} className="panel p-4">
                <div className="flex justify-between">
                  <strong>{a.title}</strong>
                  <span className="mono text-xs">{a.type}</span>
                </div>
                {a.type === "QUIZ" && (
                  <div className="mt-2">
                    <button className="text-sm text-[var(--lime)]" onClick={() => void addQuestion(a.id)}>Add question</button>
                    <ul className="mt-2 text-sm text-[var(--mute)]">
                      {data.quizzes.find((q) => q.activityId === a.id)?.questions.map((q) => (
                        <li key={q.id}>{q.prompt}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {a.type === "CODING" && (
                  <button className="mt-2 text-sm text-[var(--lime)]" onClick={() => void saveCoding(a.id)}>Load sample problem + hidden tests</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "proctor" && (
        <section className="p-6">
          <p className="text-sm text-[var(--mute)]">Signals only — visibility changes are not automatic cheating verdicts. Click a live tile to enlarge.</p>
          <HostProctorGrid roomId={roomId} />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.teams.map((t, i) => {
              const sess = data.proctor.find((p) => p.teamId === t.id);
              return (
                <article key={t.id} className="panel aspect-video p-3">
                  <div className="flex justify-between text-xs">
                    <span>TEAM {String(i + 1).padStart(2, "0")}</span>
                    <span className={sess?.sharing ? "text-[var(--lime)]" : "text-[var(--danger)]"}>
                      {sess?.sharing ? "LIVE" : sess?.connected ? "IDLE" : "OFF"}
                    </span>
                  </div>
                  <div className="mt-6 text-center text-sm text-[var(--mute)]">{t.name}</div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
