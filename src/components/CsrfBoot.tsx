"use client";

import { useEffect } from "react";

export function CsrfBoot() {
  useEffect(() => {
    void fetch("/api/auth/me", { credentials: "include" });
  }, []);
  return null;
}
