import { z } from "zod";

function nonempty(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function resolveAppUrl(): string {
  const configured = nonempty(process.env.APP_URL) ?? nonempty(process.env.NEXT_PUBLIC_APP_URL);
  if (configured && /^https?:\/\//i.test(configured)) return configured.replace(/\/$/, "");
  const vercel = nonempty(process.env.VERCEL_URL);
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  REALTIME_URL: z.string().optional(),
  REALTIME_SHARED_SECRET: z.string().min(16).optional(),
  JUDGE0_URL: z.string().optional(),
  JUDGE0_AUTH_TOKEN: z.string().optional(),
  JUDGE_QUEUE_NAME: z.string().default("clashiq-judge"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().default(2_097_152),
  CORS_ORIGINS: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    ...process.env,
    APP_URL: resolveAppUrl(),
    REDIS_URL: nonempty(process.env.REDIS_URL),
    DATABASE_URL: nonempty(process.env.DATABASE_URL),
    SESSION_SECRET: nonempty(process.env.SESSION_SECRET),
    REALTIME_SHARED_SECRET: nonempty(process.env.REALTIME_SHARED_SECRET),
    BLOB_READ_WRITE_TOKEN: nonempty(process.env.BLOB_READ_WRITE_TOKEN),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function allowedOrigins(): string[] {
  const env = getEnv();
  const extra = env.CORS_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const vercel = nonempty(process.env.VERCEL_URL);
  const fromVercel = vercel ? [`https://${vercel.replace(/^https?:\/\//, "")}`] : [];
  return [...new Set([env.APP_URL, nonempty(process.env.NEXT_PUBLIC_APP_URL), ...fromVercel, ...extra].filter(Boolean) as string[])];
}

export function isSecureCookie(): boolean {
  if (process.env.VERCEL) return true;
  return getEnv().APP_ENV !== "development";
}
