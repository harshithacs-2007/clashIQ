import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "preview", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  REALTIME_URL: z.string().optional(),
  REALTIME_SHARED_SECRET: z.string().min(16),
  JUDGE0_URL: z.string().optional(),
  JUDGE0_AUTH_TOKEN: z.string().optional(),
  JUDGE_QUEUE_NAME: z.string().default("clashiq-judge"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
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
  const parsed = envSchema.safeParse(process.env);
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
  return [env.APP_URL, ...extra];
}

export function isSecureCookie(): boolean {
  return getEnv().APP_ENV !== "development";
}
