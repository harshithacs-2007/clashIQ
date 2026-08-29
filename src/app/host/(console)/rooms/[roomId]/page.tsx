"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/lib/use-realtime";
import { HostProctorGrid } from "@/components/HostProctorGrid";
import { QuizBuilder } from "@/components/QuizBuilder";

type Health = Record<string, "HEALTHY" | "DEGRADED" | "OFFLINE">;

type Payload = {
  room: { id: string; name: string; code: string; status: string; currentActivityId: string | null };
  activities: { id: string; type: string; title: string; status: string; remainingMs: number; durationMs: number }[];
  teams: { id: string; name: string; members: { user: { displayName: string } }[] }[];
  board: { rank: number; teamId: string; score: number; name: string; avatars: { displayName: string }[] }[];
  submissions: { id: string; status: string; pointsAwarded: number; user: string }[];
  progress: { teamId: string; name: string; members: string[]; answered: number; total: number }[];
  currentQuestion: { id: string; prompt: string } | null;
  proctor: { userId: string; sharing: boolean; connected: boolean; teamId: string }[];
  health: Health;
  quizzes: { activityId: string; questions: { id: string; prompt: string }[] }[];
  challenges: { id: string; status: string; challengerId: string; opponentId: string }[];
};

export default function HostControl() {
  const { roomId } = useParams<{ roomId: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"ops" | "build" | "proctor">("ops");
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [now, setNow] = useState(Date.now());
  const [fetchedAt, setFetchedAt] = useState(Date.now());

  const load = useCallback(async () => {
    const res = await api<Payload>(`/api/host/rooms/${roomId}`);
    setData(res);
    setFetchedAt(Date.now());
  }, [roomId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useRealtime(roomId, () => { void load(); });

  async function runAction(key: string, fn: () => Promise<void>) {
    if (actionBusy) return;
    setActionBusy(key);
    setActionError(null);
    try {
      await fn();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed. Please try again.");
    } finally {
      setActionBusy(null);
    }
  }

  async function control(action: string, activityId?: string) {
    await runAction(action, async () => {
      await api("/api/host/control", {
        method: "POST",
        body: JSON.stringify({ roomId, action, activityId, extraMs: action === "ADD_TIME" ? 30000 : undefined }),
      });
      await load();
    });
  }

  async function powerShop(action: "OPEN" | "CLOSE") {
    await runAction(`SHOP_${action}`, async () => {
      await api("/api/power/shop", { method: "PUT", body: JSON.stringify({ roomId, action }) });
      await load();
    });
  }

  async function addActivity(type: "QUIZ" | "CODING" | "CHALLENGE") {
    const title = prompt(`${type} title?`);
    if (!title?.trim()) return;
    await runAction(`ADD_${type}`, async () => {
      await api(`/api/host/activities?roomId=${roomId}`, {
        method: "POST",
        body: JSON.stringify({ type, title: title.trim(), durationMs: type === "CODING" ? 900000 : 60000 }),
      });
      await load();
    });
  }

  async function saveCoding(activityId: string) {
    await runAction(`CODING_${activityId}`, async () => {
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
    });
  }

  if (!data) return <main className="p-8">Loading control room…</main>;
  const current = data.activities.find((a) => a.id === data.room.currentActivityId);
  const remaining = current
    ? current.status === "PAUSED" || current.status === "LOCKED" || current.status === "ENDED"
      ? current.remainingMs
      : Math.max(0, current.remainingMs - (now - fetchedAt))
    : 0;

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
        <Brand compact />
        <div className="mono text-xs">
          {data.room.name} · CODE {data.room.code} · {data.room.status}
          <button
            className="ml-3 text-[var(--signal)]"
            onClick={() => void runAction("COPY_LINK", async () => { await navigator.clipboard.writeText(`${window.location.origin}/join/${data.room.code}`); })}
          >
            Copy join link
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          {["ops", "build", "proctor"].map((t) => (
            <button key={t} onClick={() => setTab(t as "ops" | "build" | "proctor")} className={`px-3 py-1 ${tab === t ? "bg-[var(--lime)] text-black" : "border border-[var(--line)]"}`}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {actionError && (
        <div className="mx-5 mt-3 border border-[var(--danger)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">
          {actionError}
        </div>
      )}

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
                <button key={a} disabled={!!actionBusy} onClick={() => void control(a)} className="border border-[var(--line)] px-2 py-1 disabled:opacity-50">{a.replace("_", " ")}</button>
              ))}
            </div>
          </aside>
          <section className="p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="mono text-xs text-[var(--lime)]">{current?.type ?? "STANDBY"}</p>
                <h1 className="text-3xl font-semibold">{current?.title ?? "No active round"}</h1>
              </div>
              <div className="mono text-4xl">{Math.ceil(remaining / 1000)}s</div>
            </div>
            <p className="mt-2 text-sm text-[var(--mute)]">{data.currentQuestion ? `Question: ${data.currentQuestion.prompt}` : "No live question"}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["START", "PAUSE", "RESUME", "LOCK", "UNLOCK", "ADD_TIME", "END", "NEXT", "NEXT_QUESTION"].map((a) => (
                <button
                  key={a}
                  disabled={(!current && a !== "START") || !!actionBusy}
                  onClick={() => void control(a, current?.id ?? data.activities[0]?.id)}
                  className="bg-[var(--panel-2)] px-3 py-2 text-sm disabled:opacity-50"
                >
                  {actionBusy === a ? "WORKING…" : a.replace("_", " ")}
                </button>
              ))}
              <button disabled={!!actionBusy} onClick={() => void powerShop("OPEN")} className="bg-[var(--lime)] px-3 py-2 text-sm font-semibold text-black disabled:opacity-50">Open Power Shop</button>
              <button disabled={!!actionBusy} onClick={() => void powerShop("CLOSE")} className="px-3 py-2 text-sm disabled:opacity-50">Close shop</button>
            </div>
            <h2 className="mt-8 text-sm font-semibold">Run of show</h2>
            <ol className="mt-2 space-y-1">
              {data.activities.map((a) => (
                <li key={a.id} className={`flex justify-between px-3 py-2 ${a.id === current?.id ? "bg-[var(--panel-2)]" : ""}`}>
                  <span>{a.title} · {a.type} · {a.status}</span>
                  <button disabled={!!actionBusy} className="text-xs text-[var(--signal)] disabled:opacity-50" onClick={() => void control("START", a.id)}>Go live</button>
                </li>
              ))}
            </ol>
            <h2 className="mt-8 text-sm font-semibold">Challenges</h2>
            <ul className="mt-2 text-sm">
              {data.challenges.map((c) => (
                <li key={c.id} className="flex justify-between py-1">
                  <span>{c.status}</span>
                  {c.status === "LIVE" && (
                    <button disabled={!!actionBusy} className="text-[var(--lime)] disabled:opacity-50" onClick={() => void runAction(`CHALLENGE_${c.id}`, async () => { await api("/api/challenges", { method: "PATCH", body: JSON.stringify({ challengeId: c.id, action: "COMPLETE", winnerId: c.challengerId }) }); await load(); })}>
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
              {data.board.map((row) => (
                <li key={row.teamId} className="flex justify-between">
                  <span>{row.rank}. {row.name}</span>
                  <span className="mono text-[var(--lime)]">{row.score}</span>
                </li>
              ))}
            </ol>
            <h2 className="mono mt-6 text-xs text-[var(--mute)]">PROGRESS</h2>
            <ul className="mt-2 space-y-1 text-xs">
              {data.progress?.map((p) => (
                <li key={p.teamId}>{p.name}: {p.answered}/{p.total} · {p.members.join(", ")}</li>
              ))}
            </ul>
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
            <button disabled={!!actionBusy} onClick={() => void addActivity("QUIZ")} className="border border-[var(--line)] px-3 py-2 disabled:opacity-50">Add quiz</button>
            <button disabled={!!actionBusy} onClick={() => void addActivity("CODING")} className="border border-[var(--line)] px-3 py-2 disabled:opacity-50">Add coding</button>
            <button disabled={!!actionBusy} onClick={() => void addActivity("CHALLENGE")} className="border border-[var(--line)] px-3 py-2 disabled:opacity-50">Add challenge slot</button>
          </div>
          <ul className="mt-6 space-y-4">
            {data.activities.map((a) => (
              <li key={a.id} className="panel p-4">
                <div className="flex justify-between">
                  <strong>{a.title}</strong>
                  <span className="mono text-xs">{a.type}</span>
                </div>
                {a.type === "QUIZ" && (
                  <QuizBuilder roomId={roomId} activityId={a.id} title={a.title} durationMs={a.durationMs} onChanged={() => void load()} />
                )}
                {a.type === "CODING" && (
                  <button disabled={!!actionBusy} className="mt-2 text-sm text-[var(--lime)] disabled:opacity-50" onClick={() => void saveCoding(a.id)}>Load sample problem + hidden tests</button>
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
                    <span className={sess?.sharing ? "text-[var(--lime)]" : "text-[var(--danger)]"}>{sess?.sharing ? "LIVE" : sess?.connected ? "IDLE" : "OFF"}</span>
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
