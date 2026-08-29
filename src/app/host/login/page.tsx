"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/Brand";
import { api } from "@/lib/api-client";

export default function HostLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      if (res.user.role !== "HOST") {
        setError("This console is restricted to host accounts.");
        await api("/api/auth/logout", { method: "POST" });
        return;
      }
      router.push("/host");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Host sign-in failed.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Brand />
      <h1 className="mt-10 text-3xl font-semibold">Host console</h1>
      <p className="mt-2 text-sm text-[var(--mute)]">Authorization is enforced on every API call. The URL cannot promote a participant.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input required name="email" type="email" placeholder="Host email" className="w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        <input required name="password" type="password" placeholder="Password" className="w-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2" />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <button className="w-full bg-[var(--lime)] py-3 font-semibold text-black">Open dashboard</button>
      </form>
    </main>
  );
}
