"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
        }),
      });
      router.push(res.user.role === "HOST" ? "/host" : "/join");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Brand />
      <h1 className="mt-10 text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-[var(--mute)]">Sessions recover after refresh. Roles are server-checked.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          Email
          <input required name="email" type="email" className="mt-1 w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        </label>
        <label className="block text-sm">
          Password
          <input required name="password" type="password" className="mt-1 w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button disabled={pending} className="w-full bg-[var(--lime)] py-3 font-semibold text-black">
          {pending ? "Checking…" : "Enter"}
        </button>
      </form>
      <p className="mt-4 text-sm text-[var(--mute)]">
        New here? <Link className="text-[var(--lime)]" href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
