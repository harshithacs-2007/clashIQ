"use client";

import { useEffect, useState, type ReactNode } from "react";

export function CsrfBoot({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/me", { credentials: "include" }).finally(() => setReady(true));
  }, []);

  if (!ready) {
    return <div className="p-8 text-sm text-[var(--mute)]">Connecting…</div>;
  }
  return <>{children}</>;
}
