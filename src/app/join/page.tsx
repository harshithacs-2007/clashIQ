"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { AvatarRig, defaultAvatar } from "@/components/AvatarRig";
import { api } from "@/lib/api-client";
import { AVATAR_STYLES, type AvatarConfig } from "@/lib/constants";

export default function JoinPage() {
  const router = useRouter();
  const [step, setStep] = useState<"code" | "avatar" | "team">("code");
  const [room, setRoom] = useState<{ id: string; name: string; teamSize: number } | null>(null);
  const [avatar, setAvatar] = useState<AvatarConfig>(defaultAvatar());
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [teams, setTeams] = useState<{ id: string; name: string; members: { displayName: string }[] }[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("clashiq_room_code");
    if (stored) setCode(stored);
    void api<{ user: { id: string } | null }>("/api/auth/me").then((r) => {
      if (!r.user) router.push("/login");
    });
  }, [router]);

  async function join(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<{ room: { id: string; name: string; teamSize: number } }>("/api/rooms/join", {
        method: "POST",
        body: JSON.stringify({ code: fd.get("code") }),
      });
      setRoom(res.room);
      setStep("avatar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    }
  }

  async function saveAvatar() {
    await api("/api/avatar", { method: "PUT", body: JSON.stringify(avatar) });
    const state = await api<{ teams: typeof teams }>(`/api/rooms/state?roomId=${room!.id}`);
    setTeams(state.teams);
    setStep("team");
  }

  async function makeTeam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api(`/api/teams?roomId=${room!.id}`, {
      method: "POST",
      body: JSON.stringify({ name: fd.get("name") }),
    });
    router.push(`/play/${room!.id}`);
  }

  async function joinTeam(teamId: string) {
    await api(`/api/teams?roomId=${room!.id}`, {
      method: "POST",
      body: JSON.stringify({ name: "join", teamId }),
    });
    router.push(`/play/${room!.id}`);
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <Brand compact />
      {step === "code" && (
        <form onSubmit={join} className="mt-10 space-y-4">
          <h1 className="text-3xl font-semibold">Enter room code</h1>
          <input name="code" required value={code} onChange={(e) => setCode(e.target.value)} className="mono w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-3 tracking-[0.3em]" placeholder="XXXXXXXX" />
          {error && <p className="text-[var(--danger)]">{error}</p>}
          <button className="bg-[var(--lime)] px-5 py-3 font-semibold text-black">Validate room</button>
        </form>
      )}
      {step === "avatar" && (
        <div className="mt-10">
          <h1 className="text-3xl font-semibold">Build your mark</h1>
          <div className="mt-6 flex gap-8">
            <AvatarRig config={avatar} size={160} />
            <div className="flex-1 space-y-3 text-sm">
              <label className="block">
                Style
                <select
                  className="mt-1 w-full bg-[var(--panel)] px-2 py-2"
                  value={avatar.style}
                  onChange={(e) => setAvatar({ ...avatar, style: e.target.value as AvatarConfig["style"] })}
                >
                  {AVATAR_STYLES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">Hue <input type="range" min={0} max={359} value={avatar.hue} onChange={(e) => setAvatar({ ...avatar, hue: Number(e.target.value) })} /></label>
              <label className="block">Visor <input type="range" min={0} max={5} value={avatar.visor} onChange={(e) => setAvatar({ ...avatar, visor: Number(e.target.value) })} /></label>
              <label className="block">Crest <input type="range" min={0} max={5} value={avatar.crest} onChange={(e) => setAvatar({ ...avatar, crest: Number(e.target.value) })} /></label>
              <label className="block">Mark <input type="range" min={0} max={5} value={avatar.mark} onChange={(e) => setAvatar({ ...avatar, mark: Number(e.target.value) })} /></label>
              <button onClick={() => void saveAvatar()} className="bg-[var(--lime)] px-4 py-2 font-semibold text-black">Lock avatar</button>
            </div>
          </div>
        </div>
      )}
      {step === "team" && room && (
        <div className="mt-10">
          <h1 className="text-3xl font-semibold">Squad up</h1>
          <p className="text-sm text-[var(--mute)]">Max {room.teamSize} per team in {room.name}.</p>
          <ul className="mt-4 space-y-2">
            {teams.map((t) => (
              <li key={t.id} className="panel flex items-center justify-between px-3 py-2">
                <span>{t.name} · {t.members.length}/{room.teamSize}</span>
                <button onClick={() => void joinTeam(t.id)} className="text-sm text-[var(--lime)]">Join</button>
              </li>
            ))}
          </ul>
          <form onSubmit={makeTeam} className="mt-6 flex gap-2">
            <input name="name" required minLength={2} placeholder="New team name" className="flex-1 border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
            <button className="bg-[var(--lime)] px-4 py-2 font-semibold text-black">Create</button>
          </form>
        </div>
      )}
    </main>
  );
}
