type Level = "info" | "warn" | "error";

const REDACT = ["password", "token", "secret", "authorization", "cookie", "session", "email"];

function sanitize(value: unknown): unknown {
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT.some((r) => k.toLowerCase().includes(r))) {
        out[k] = "[redacted]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta: sanitize(meta) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
