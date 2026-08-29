"use client";

import { Room } from "livekit-client";
import { api } from "./api-client";

export async function startScreenShare(roomId: string) {
  const { token, url } = await api<{ token: string; url: string }>("/api/proctor/token", {
    method: "POST",
    body: JSON.stringify({ roomId, role: "publisher" }),
  });
  const room = new Room();
  await room.connect(url, token);
  await room.localParticipant.setScreenShareEnabled(true);
  await api("/api/proctor/signal", {
    method: "POST",
    body: JSON.stringify({ roomId, signal: "SHARE_STARTED" }),
  });
  return room;
}
