"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./api-client";

export function useRealtime(roomId: string | null, onEvent: (event: string, data: unknown) => void) {
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "reconnecting">("idle");
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!roomId) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let delay = 500;

    async function connect() {
      if (stopped) return;
      setStatus((s) => (s === "idle" ? "connecting" : "reconnecting"));
      try {
        const tok = await api<{ token: string; url: string }>(`/api/realtime/token?roomId=${roomId}`);
        ws = new WebSocket(`${tok.url}?token=${encodeURIComponent(tok.token)}`);
        ws.onopen = () => {
          delay = 500;
          setStatus("live");
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as { event: string; data: unknown };
            cb.current(msg.event, msg.data);
          } catch {
            /* ignore malformed */
          }
        };
        ws.onclose = () => {
          if (stopped) return;
          setStatus("reconnecting");
          setTimeout(connect, delay);
          delay = Math.min(delay * 2, 8000);
        };
      } catch {
        setTimeout(connect, delay);
        delay = Math.min(delay * 2, 8000);
      }
    }

    void connect();
    return () => {
      stopped = true;
      ws?.close();
    };
  }, [roomId]);

  return status;
}
