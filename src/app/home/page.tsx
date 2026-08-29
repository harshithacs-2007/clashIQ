"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { AvatarRig, defaultAvatar } from "@/components/AvatarRig";
import { api } from "@/lib/api-client";
import type { AvatarConfig } from "@/lib/constants";

type Account = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatar: { config: AvatarConfig } | null;
  events: { eventTitle: string; roomName: string; roomId: string; teamName: string }[];
};

export default function HomePage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  async function load() {
    try {
      const data = await api<Account>("/api/account");
      setAccount(data);
      setName(data.displayName);
    } catch {
      router.push("/login");
    }
  }

  useEffect(() => {
    void load();
    // Initial session probe only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/account", { method: "PATCH", body: JSON.stringify({ displayName: name }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!account) return <main className="p-8">Loading account…</main>;
  const cfg = account.avatar?.config ?? defaultAvatar();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex items-center justify-between">
        <Brand compact />
        <button onClick={() => void logout()} className="text-sm text-[var(--mute)]">Sign out</button>
      </header>
      <h1 className="mt-8 text-3xl font-semibold">Your desk</h1>
      <section className="panel mt-6 flex gap-6 p-5">
        <AvatarRig config={cfg} size={96} />
        <div className="flex-1">
          <p className="text-sm text-[var(--mute)]">Signed in as</p>
          <p className="font-medium">{account.email}</p>
          <form onSubmit={(e) => void saveName(e)} className="mt-3 flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 border border-[var(--line)] bg-[var(--ink)] px-3 py-2" />
            <button className="bg-[var(--lime)] px-3 py-2 font-semibold text-black">Save name</button>
          </form>
          {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </section>
      <div className="mt-6 flex gap-3">
        <Link href="/join" className="bg-[var(--lime)] px-4 py-3 font-semibold text-black">Join a room</Link>
      </div>
      <h2 className="mt-10 text-lg font-semibold">Events</h2>
      <ul className="mt-3 space-y-2">
        {account.events.length === 0 && <li className="text-sm text-[var(--mute)]">No teams yet.</li>}
        {account.events.map((ev) => (
          <li key={ev.roomId} className="panel flex justify-between px-4 py-3">
            <span>{ev.eventTitle} · {ev.roomName} · {ev.teamName}</span>
            <Link className="text-[var(--signal)]" href={`/play/${ev.roomId}`}>Open</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
