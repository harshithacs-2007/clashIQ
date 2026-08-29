"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";

type EventRow = {
  id: string;
  title: string;
  rooms: { id: string; name: string; code: string; status: string }[];
};

export default function HostHome() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [title, setTitle] = useState("");

  async function load() {
    const res = await api<{ events: EventRow[] }>("/api/host/events");
    setEvents(res.events);
  }

  useEffect(() => { void load(); }, []);

  async function createEvent() {
    await api("/api/host/events", { method: "POST", body: JSON.stringify({ title, description: "" }) });
    setTitle("");
    await load();
  }

  async function createRoom(eventId: string) {
    const name = prompt("Room name?");
    if (!name) return;
    await api(`/api/host/rooms?eventId=${eventId}`, {
      method: "POST",
      body: JSON.stringify({ name, teamSize: 2 }),
    });
    await load();
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between">
        <Brand />
        <span className="mono text-xs text-[var(--mute)]">HOST · CONTROL PLANE</span>
      </header>
      <h1 className="mt-10 text-3xl font-semibold">Events</h1>
      <div className="mt-4 flex gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New event title" className="flex-1 border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        <button onClick={() => void createEvent()} className="bg-[var(--lime)] px-4 py-2 font-semibold text-black">Create event</button>
      </div>
      <div className="mt-8 space-y-4">
        {events.map((ev) => (
          <section key={ev.id} className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{ev.title}</h2>
              <button onClick={() => void createRoom(ev.id)} className="text-sm text-[var(--lime)]">New room</button>
            </div>
            <ul className="mt-3 space-y-2">
              {ev.rooms.map((r) => (
                <li key={r.id} className="flex items-center justify-between bg-[var(--panel-2)] px-3 py-2">
                  <span>{r.name} · <span className="mono">{r.code}</span> · {r.status}</span>
                  <Link className="text-[var(--signal)]" href={`/host/rooms/${r.id}`}>Control</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
