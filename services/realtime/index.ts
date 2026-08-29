import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import Redis from "ioredis";

const PORT = Number(process.env.REALTIME_PORT ?? 4001);
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const SECRET = process.env.REALTIME_SHARED_SECRET ?? "";

type Claims = { sub: string; roomId: string; role: string; teamId: string | null; exp: number };

type Client = { ws: WebSocket; claims: Claims };

function verify(token: string): Claims | null {
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const payload = Buffer.from(p, "base64url").toString("utf8");
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (expected.length !== sig.length) return null;
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  let ok = 0;
  for (let i = 0; i < a.length; i++) ok |= a[i]! ^ b[i]!;
  if (ok !== 0) return null;
  const claims = JSON.parse(payload) as Claims;
  if (claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

const rooms = new Map<string, Set<Client>>();
const redis = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

function add(client: Client) {
  const set = rooms.get(client.claims.roomId) ?? new Set();
  set.add(client);
  rooms.set(client.claims.roomId, set);
}
function remove(client: Client) {
  rooms.get(client.claims.roomId)?.delete(client);
}

function broadcast(channel: string, message: string) {
  const roomId = channel.split(":")[1];
  if (!roomId) return;
  const isHost = channel.startsWith("host:");
  for (const client of rooms.get(roomId) ?? []) {
    if (isHost && client.claims.role !== "HOST") continue;
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(message);
  }
}

sub.psubscribe("room:*", "host:*", "team:*", (err) => {
  if (err) console.error(JSON.stringify({ ts: new Date().toISOString(), msg: "redis_psubscribe_failed" }));
});
sub.on("pmessage", (_pattern, channel, message) => {
  broadcast(channel, message);
});

const http = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "clashiq-realtime", rooms: rooms.size }));
});

const wss = new WebSocketServer({ server: http });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const token = url.searchParams.get("token");
  const claims = token ? verify(token) : null;
  if (!claims) {
    ws.close(4401, "unauthorized");
    return;
  }
  const client: Client = { ws, claims };
  add(client);
  ws.send(JSON.stringify({ event: "HELLO", roomId: claims.roomId, at: new Date().toISOString(), data: { role: claims.role } }));
  ws.on("close", () => remove(client));
  ws.on("error", () => remove(client));
});

http.listen(PORT, () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: "realtime_listen", port: PORT }));
});

void redis;
