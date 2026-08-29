"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";

type EventRow = {
  id: string;
  title: string;
  rooms: { id: string; name: string; code: string; status: string; teamSize: number }[];
};

export default function HostHome() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [teamSize, setTeamSize] = useState(2);
  const [copied, setCopied] = useState("");

  async function load() {
    setError("");
    try {
      const res = await api<{ events: EventRow[] }>("/api/host/events");
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load events.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createEvent() {
    setPending(true);
    setError("");
    try {
      await api("/api/host/events", { method: "POST", body: JSON.stringify({ title, description: "" }) });
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setPending(false);
    }
  }

  async function createRoom(eventId: string) {
    const name = prompt("Room name?");
    if (!name) return;
    setError("");
    try {
      await api(`/api/host/rooms?eventId=${eventId}`, {
        method: "POST",
        body: JSON.stringify({ name, teamSize }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
    }
  }

  async function openRoom(roomId: string) {
    setError("");
    try {
      await api("/api/host/control", {
        method: "POST",
        body: JSON.stringify({ roomId, action: "OPEN_ROOM" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open room.");
    }
  }

  async function copyJoinLink(code: string) {
    const url = `${window.location.origin}/join/${code}`;
    await navigator.clipboard.writeText(url);
    setCopied(code);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between">
        <Brand />
        <span className="mono text-xs text-[var(--mute)]">HOST · CONTROL PLANE</span>
      </header>
      <h1 className="mt-10 text-3xl font-semibold">Events</h1>
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New event title" className="flex-1 border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        <select value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="border border-[var(--line)] bg-[var(--panel)] px-2">
          <option value={2}>Teams of 2</option>
          <option value={3}>Teams of 3</option>
        </select>
        <button disabled={pending} onClick={() => void createEvent()} className="bg-[var(--lime)] px-4 py-2 font-semibold text-black">
          {pending ? "Creating…" : "Create event"}
        </button>
      </div>
      <div className="mt-8 space-y-4">
        {events.length === 0 && !error && <p className="text-sm text-[var(--mute)]">No events yet. Create one to get a room code.</p>}
        {events.map((ev) => (
          <section key={ev.id} className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{ev.title}</h2>
              <button onClick={() => void createRoom(ev.id)} className="text-sm text-[var(--lime)]">New room</button>
            </div>
            <ul className="mt-3 space-y-2">
              {ev.rooms.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-[var(--panel-2)] px-3 py-2">
                  <span>{r.name} · <span className="mono">{r.code}</span> · {r.status} · {r.teamSize}p</span>
                  <span className="flex gap-3 text-sm">
                    {r.status === "DRAFT" && (
                      <button onClick={() => void openRoom(r.id)} className="text-[var(--lime)]">Open joins</button>
                    )}
                    <button onClick={() => void copyJoinLink(r.code)} className="text-[var(--signal)]">
                      {copied === r.code ? "Copied" : "Copy join link"}
                    </button>
                    <Link className="text-[var(--signal)]" href={`/host/rooms/${r.id}`}>Control</Link>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
