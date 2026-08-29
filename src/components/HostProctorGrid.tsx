"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { api } from "@/lib/api-client";

export function HostProctorGrid({ roomId }: { roomId: string }) {
  const [status, setStatus] = useState("Connecting SFU…");
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lk: Room | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { token, url } = await api<{ token: string; url: string }>("/api/proctor/token", {
          method: "POST",
          body: JSON.stringify({ roomId, role: "host" }),
        });
        if (cancelled) return;
        lk = new Room({ adaptiveStream: true, dynacast: true });
        lk.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind !== Track.Kind.Video || !grid.current) return;
          const el = track.attach();
          el.className = "h-full w-full object-contain bg-black";
          const wrap = document.createElement("div");
          wrap.className = "aspect-video overflow-hidden border border-[#2c3540]";
          wrap.appendChild(el);
          wrap.addEventListener("click", () => {
            wrap.classList.toggle("col-span-2");
            wrap.classList.toggle("row-span-2");
          });
          grid.current.appendChild(wrap);
        });
        await lk.connect(url, token);
        setStatus("SFU live — click a tile to enlarge");
      } catch {
        setStatus("LiveKit not configured. Connection tiles still show share signals.");
      }
    })();
    return () => {
      cancelled = true;
      void lk?.disconnect();
    };
  }, [roomId]);

  return (
    <div>
      <p className="mono text-xs text-[var(--mute)]">{status}</p>
      <div ref={grid} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4" />
    </div>
  );
}
