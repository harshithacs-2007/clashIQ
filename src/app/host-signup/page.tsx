"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";

export default function HostSignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/auth/host-signup", {
        method: "POST",
        body: JSON.stringify({ displayName: displayName.trim(), email: email.trim(), password, signupCode: code }),
      });
      router.replace("/host");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create host account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Brand />
        <div className="panel mt-8 p-6">
          <p className="mono text-xs tracking-widest text-[var(--lime)]">HOST ACCESS</p>
          <h1 className="mt-2 text-3xl font-semibold">Create host account</h1>
          <p className="mt-2 text-sm text-[var(--mute)]">Host access requires the private event organizer code.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm">Display name<input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--panel-2)] p-3" /></label>
            <label className="block text-sm">Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--panel-2)] p-3" /></label>
            <label className="block text-sm">Password<input required minLength={10} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--panel-2)] p-3" /></label>
            <label className="block text-sm">Organizer code<input required type="password" value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full border border-[var(--line)] bg-[var(--panel-2)] p-3" /></label>
            {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
            <button disabled={busy} className="w-full bg-[var(--lime)] p-3 font-semibold text-black disabled:opacity-50">{busy ? "Creating…" : "Create host account"}</button>
          </form>
          <Link href="/login" className="mt-4 block text-center text-sm text-[var(--lime)]">Already a host? Sign in</Link>
        </div>
      </div>
    </main>
  );
}
