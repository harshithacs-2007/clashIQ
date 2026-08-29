"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await api("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          displayName: fd.get("displayName"),
        }),
      });
      router.push("/join");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Brand />
      <h1 className="mt-10 text-3xl font-semibold">Create competitor account</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          Display name
          <input required minLength={2} name="displayName" className="mt-1 w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        </label>
        <label className="block text-sm">
          Email
          <input required name="email" type="email" className="mt-1 w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        </label>
        <label className="block text-sm">
          Password (10+ characters)
          <input required minLength={10} name="password" type="password" className="mt-1 w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button disabled={pending} className="w-full bg-[var(--lime)] py-3 font-semibold text-black">
          {pending ? "Creating…" : "Join clashIQ"}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--mute)]">
        Already competing? <Link className="text-[var(--lime)]" href="/login">Sign in</Link>
      </p>
    </main>
  );
}
