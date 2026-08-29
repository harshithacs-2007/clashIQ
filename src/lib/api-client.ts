"use client";

import { CSRF_COOKIE } from "@/lib/constants";

function csrf() {
  const m = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && init?.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    headers.set("x-csrf-token", csrf());
  }
  let res = await fetch(path, { ...init, headers, credentials: "include" });
  let data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && data.error === "This request could not be verified.") {
    await fetch("/api/auth/me", { credentials: "include" });
    const retryHeaders = new Headers(headers);
    if (method !== "GET" && method !== "HEAD") {
      retryHeaders.set("x-csrf-token", csrf());
    }
    res = await fetch(path, { ...init, headers: retryHeaders, credentials: "include" });
    data = (await res.json().catch(() => ({}))) as T & { error?: string };
  }
  if (!res.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}
