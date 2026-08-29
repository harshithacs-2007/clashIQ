"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";
import { useRealtime } from "@/lib/use-realtime";
import { startScreenShare } from "@/lib/proctor-client";

const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type State = {
  serverNow: number;
  room: { id: string; name: string; status: string; shopEnabled: boolean; challengesOn: boolean };
  me: { teamId: string | null };
  teams: { id: string; name: string; avatarSeed: string }[];
  activities: { id: string; type: string; title: string; status: string; remainingMs: number; endsAt: string | null }[];
  currentActivityId: string | null;
  question: { id: string; prompt: string; points: number; options: { id: string; label: string }[] } | null;
  coding: {
    description: string;
    constraints: string;
    starterCode: Record<string, string>;
    allowedLanguages: number[];
    publicTests: { id: string; input: string; expected: string; points: number }[];
  } | null;
  leaderboard: { rank: number; teamId: string; name: string; score: number; avatarSeed: string }[];
  shop: { id: string; cardType: string; cost: number; inventory: number }[];
};

const LANGS: Record<number, string> = { 71: "python", 63: "javascript", 62: "java" };

export default function PlayPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [source, setSource] = useState("print('ok')");
  const [lang, setLang] = useState(71);
  const [shopMsg, setShopMsg] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const s = await api<State>(`/api/rooms/state?roomId=${roomId}`);
      setState(s);
      setLoadError("");
      if (s.coding?.starterCode?.[String(lang)]) setSource(s.coding.starterCode[String(lang)]!);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load room.");
    }
  }, [roomId, lang]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const rt = useRealtime(roomId, () => { void refresh(); });

  const current = state?.activities.find((a) => a.id === state.currentActivityId);
  const remaining = useMemo(() => {
    if (!current?.endsAt) return current?.remainingMs ?? 0;
    return Math.max(0, new Date(current.endsAt).getTime() - now);
  }, [current, now]);

  async function submitQuiz(optionId: string) {
    if (!current || !state?.question) return;
    setPicked(optionId);
    const res = await api<{ correct: boolean; pointsAwarded: number; duplicate?: boolean }>("/api/quiz/submit", {
      method: "POST",
      body: JSON.stringify({ activityId: current.id, questionId: state.question.id, optionId }),
    });
    setFeedback(res.duplicate ? "Already submitted." : res.correct ? `Correct · +${res.pointsAwarded}` : "Locked in.");
  }

  async function submitCode() {
    if (!current) return;
    setFeedback("Submission received. Judging…");
    const res = await api<{ submissionId: string }>("/api/coding/submit", {
      method: "POST",
      body: JSON.stringify({ activityId: current.id, languageId: lang, source }),
    });
    const poll = async () => {
      const s = await api<{ status: string; pointsAwarded: number }>(`/api/coding/submit?id=${res.submissionId}`);
      if (s.status === "QUEUED" || s.status === "RUNNING") {
        setTimeout(poll, 1200);
        return;
      }
      setFeedback(`${s.status.replaceAll("_", " ")} · ${s.pointsAwarded} pts`);
      void refresh();
    };
    setTimeout(poll, 800);
  }

  async function buy(offerId: string) {
    const res = await api<{ ok: boolean; message?: string }>("/api/power/shop", {
      method: "POST",
      body: JSON.stringify({ offerId, roomId }),
    });
    setShopMsg(res.ok ? "Card acquired." : res.message ?? "Good try! Cards aren't available this time. Try again next time!");
  }

  async function shareScreen() {
    try {
      const room = await startScreenShare(roomId);
      room.on("disconnected", () => {
        void api("/api/proctor/signal", { method: "POST", body: JSON.stringify({ roomId, signal: "CONNECTION_LOST" }) });
      });
      setFeedback("Screen sharing is live. The host can subscribe to your team.");
    } catch {
      setFeedback("Screen sharing needs an explicit browser permission, and LiveKit must be configured.");
    }
  }

  useEffect(() => {
    const vis = () => {
      void api("/api/proctor/signal", {
        method: "POST",
        body: JSON.stringify({
          roomId,
          signal: document.hidden ? "VISIBILITY_HIDDEN" : "VISIBILITY_VISIBLE",
        }),
      }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, [roomId]);

  if (loadError) {
    return (
      <main className="p-8">
        <p className="text-[var(--danger)]">{loadError}</p>
        <Link className="mt-4 inline-block text-[var(--lime)]" href="/join">Join with a room code</Link>
      </main>
    );
  }
  if (!state) return <main className="p-8">Syncing authoritative state…</main>;

  if (state.room.status === "CLOSED") {
    return <Podium roomId={roomId} board={state.leaderboard} />;
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[1fr_280px]">
      <section className="p-6">
        <div className="flex items-center justify-between">
          <Brand compact />
          <div className="mono text-xs text-[var(--mute)]">
            {rt === "live" ? "LINK STABLE" : rt === "reconnecting" ? "Reconnecting…" : "SYNC"} · {state.room.name}
          </div>
        </div>
        <div className="mt-6 flex items-end justify-between">
          <div>
            <p className="mono text-xs text-[var(--lime)]">{current?.type ?? "LOBBY"}</p>
            <h1 className="text-3xl font-semibold">{current?.title ?? "Waiting for host"}</h1>
          </div>
          <div className="mono text-4xl tabular-nums text-[var(--lime)]">{Math.ceil(remaining / 1000)}s</div>
        </div>

        {current?.type === "QUIZ" && state.question && (
          <div className="mt-8">
            <p className="text-xl">{state.question.prompt}</p>
            <div className="mt-4 grid gap-2">
              {state.question.options.map((o) => (
                <button
                  key={o.id}
                  disabled={!!picked}
                  onClick={() => void submitQuiz(o.id)}
                  className={`panel px-4 py-3 text-left ${picked === o.id ? "border-[var(--lime)]" : ""}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {current?.type === "CODING" && state.coding && (
          <div className="mt-6">
            <article className="prose prose-invert max-w-none text-sm text-[var(--mute)] whitespace-pre-wrap">
              {state.coding.description}
            </article>
            <div className="mt-3 flex gap-2">
              <select value={lang} onChange={(e) => setLang(Number(e.target.value))} className="bg-[var(--panel)] px-2 py-1">
                {state.coding.allowedLanguages.map((id) => (
                  <option key={id} value={id}>{LANGS[id] ?? id}</option>
                ))}
              </select>
              <button onClick={() => void shareScreen()} className="border border-[var(--line)] px-3 py-1 text-sm">Share screen</button>
              <button onClick={() => void submitCode()} className="bg-[var(--lime)] px-3 py-1 font-semibold text-black">Submit</button>
            </div>
            <div className="mt-3 h-[420px] overflow-hidden border border-[var(--line)]">
              <Monaco
                height="420px"
                language={LANGS[lang] ?? "plaintext"}
                theme="vs-dark"
                value={source}
                onChange={(v) => setSource(v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 14, automaticLayout: true }}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs">
              {state.coding.publicTests.map((t) => (
                <div key={t.id} className="panel p-2">
                  <span className="text-[var(--mute)]">public · {t.points} pts</span>
                  <pre className="mt-1 overflow-auto">{t.input} → {t.expected}</pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {feedback && <p className="mt-4 text-[var(--signal)]">{feedback}</p>}
      </section>

      <aside className="border-l border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="mono text-xs tracking-widest text-[var(--mute)]">LIVE BOARD</h2>
        <ol className="mt-3 space-y-2">
          {state.leaderboard.map((row) => (
            <motion.li layout key={row.teamId} className="flex items-center justify-between text-sm">
              <span><span className="mono mr-2 text-[var(--mute)]">{row.rank}</span>{row.name}</span>
              <span className="mono text-[var(--lime)]">{row.score}</span>
            </motion.li>
          ))}
        </ol>
        <ChallengeBox roomId={roomId} teams={state.teams} me={state.me.teamId} enabled={state.room.challengesOn} />
      </aside>

      <AnimatePresence>
        {state.shop.length > 0 && state.room.shopEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6"
          >
            <div className="panel w-full max-w-lg p-6">
              <h2 className="text-2xl font-semibold">POWER SHOP OPEN</h2>
              <div className="mt-4 space-y-3">
                {state.shop.map((o) => (
                  <div key={o.id} className="flex items-center justify-between bg-[var(--panel-2)] px-3 py-3">
                    <div>
                      <div className="font-semibold">{o.cardType.replaceAll("_", " ")}</div>
                      <div className="mono text-xs text-[var(--mute)]">{o.cost} points · {o.inventory} left</div>
                    </div>
                    <button onClick={() => void buy(o.id)} className="bg-[var(--lime)] px-4 py-2 font-semibold text-black">BUY</button>
                  </div>
                ))}
              </div>
              {shopMsg && <p className="mt-4 text-sm">{shopMsg}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function ChallengeBox({
  roomId, teams, me, enabled,
}: { roomId: string; teams: { id: string; name: string }[]; me: string | null; enabled: boolean }) {
  if (!enabled || !me) return null;
  return (
    <div className="mt-8">
      <h2 className="mono text-xs tracking-widest text-[var(--mute)]">CHALLENGE</h2>
      <div className="mt-2 space-y-1">
        {teams.filter((t) => t.id !== me).map((t) => (
          <button
            key={t.id}
            className="w-full px-2 py-1 text-left text-sm hover:bg-[var(--panel-2)]"
            onClick={() => void api("/api/challenges", { method: "POST", body: JSON.stringify({ roomId, opponentId: t.id }) })}
          >
            Challenge {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Podium({ roomId, board }: { roomId: string; board: State["leaderboard"] }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <Brand />
      <h1 className="mt-8 text-4xl font-semibold">Final board</h1>
      <ol className="mt-8 w-full max-w-md space-y-3">
        {board.slice(0, 3).map((row, i) => (
          <motion.li
            key={row.teamId}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: i * 0.2 }}
            className="panel flex justify-between px-4 py-4"
          >
            <span className="text-xl">{row.rank}. {row.name}</span>
            <span className="mono text-[var(--lime)]">{row.score}</span>
          </motion.li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-[var(--mute)]">Room {roomId}</p>
    </main>
  );
}
