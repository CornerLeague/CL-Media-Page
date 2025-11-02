import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SESSION_SECRET: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  JOBS_ENABLED: z.string().optional(),
  JOB_QUEUE_PREFIX: z.string().optional(),
  // Force in-memory storage for local/dev regardless of DATABASE_URL
  USE_MEM_STORAGE: z.string().optional(),
  // Background jobs intervals and maintenance
  LIVE_SCORES_INTERVAL_MS: z.string().optional(),
  NONLIVE_SCORES_INTERVAL_MS: z.string().optional(),
  CLEANUP_RUN_AT_CRON: z.string().optional(),
  // Web scraping configuration
  SCRAPER_USER_AGENT: z.string().optional(),
  SCRAPER_RATE_LIMIT_MS: z.string().optional(),
  SCRAPER_TIMEOUT_MS: z.string().optional(),
  SCRAPER_MAX_RETRIES: z.string().optional(),
  // Proxy configuration (optional)
  PROXY_URL: z.string().optional(),
  PROXY_USERNAME: z.string().optional(),
  PROXY_PASSWORD: z.string().optional(),
  // CORS configuration
  CORS_ORIGINS: z.string().optional(),
  CORS_CREDENTIALS: z.string().optional(),
  // DB monitoring
  DB_SLOW_QUERY_MS: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast if NODE_ENV is invalid; other vars are handled as optional for Phase 0
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

const env = parsed.data;

function toPort(val: string | undefined, fallback: number): number {
  const parsedPort = parseInt(val ?? "", 10);
  return Number.isFinite(parsedPort) ? parsedPort : fallback;
}

function parseCsvList(val: string | undefined): string[] {
  if (!val) return [];
  return val
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

// Interval bounds and parsing helpers for background jobs
const INTERVAL_BOUNDS = {
  LIVE_MIN_MS: 10_000, // 10s minimum to avoid over-scraping
  LIVE_MAX_MS: 300_000, // 5m maximum for live checks
  NONLIVE_MIN_MS: 300_000, // 5m minimum for featured refreshes
  NONLIVE_MAX_MS: 86_400_000, // 24h maximum for non-live updates
} as const;

function parseIntervalMs(
  val: string | undefined,
  {
    defaultMs,
    minMs,
    maxMs,
    name,
  }: { defaultMs: number; minMs: number; maxMs: number; name: string }
): number {
  const raw = parseInt(val ?? "", 10);
  if (!Number.isFinite(raw)) return defaultMs;
  if (raw < minMs) {
    console.warn(
      `${name} too low (${raw}ms). Clamping to minimum ${minMs}ms.`
    );
    return minMs;
  }
  if (raw > maxMs) {
    console.warn(
      `${name} too high (${raw}ms). Clamping to maximum ${maxMs}ms.`
    );
    return maxMs;
  }
  return raw;
}

export const config = {
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === "development",
  port: toPort(env.PORT, 5000),
  databaseUrl: env.DATABASE_URL,
  // Explicit override to use in-memory storage, regardless of DATABASE_URL presence
  useMemStorage: ["1", "true", "yes"].includes((env.USE_MEM_STORAGE ?? "").toLowerCase()),
  redisUrl: env.REDIS_URL,
  sessionSecret: env.SESSION_SECRET,
  deepseekApiKey: env.DEEPSEEK_API_KEY,
  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
  },
  jobsEnabled: ["1", "true", "yes"].includes((env.JOBS_ENABLED ?? "").toLowerCase()),
  jobQueuePrefix: env.JOB_QUEUE_PREFIX ?? "jobs",
  // Background jobs intervals and maintenance
  liveScoresIntervalMs: parseIntervalMs(env.LIVE_SCORES_INTERVAL_MS, {
    defaultMs: 30_000,
    minMs: INTERVAL_BOUNDS.LIVE_MIN_MS,
    maxMs: INTERVAL_BOUNDS.LIVE_MAX_MS,
    name: "LIVE_SCORES_INTERVAL_MS",
  }),
  nonliveScoresIntervalMs: parseIntervalMs(env.NONLIVE_SCORES_INTERVAL_MS, {
    defaultMs: 3_600_000,
    minMs: INTERVAL_BOUNDS.NONLIVE_MIN_MS,
    maxMs: INTERVAL_BOUNDS.NONLIVE_MAX_MS,
    name: "NONLIVE_SCORES_INTERVAL_MS",
  }),
  cleanupRunAtCron: env.CLEANUP_RUN_AT_CRON ?? "0 3 * * *", // daily at 03:00 UTC
  // Web scraping configuration
  scraperUserAgent: env.SCRAPER_USER_AGENT ?? 'CornerLeagueMedia/1.0 (+https://cornerleague.com/bot; contact@cornerleague.com)',
  scraperRateLimitMs: parseInt(env.SCRAPER_RATE_LIMIT_MS ?? '2000', 10),
  scraperTimeoutMs: parseInt(env.SCRAPER_TIMEOUT_MS ?? '10000', 10),
  scraperMaxRetries: parseInt(env.SCRAPER_MAX_RETRIES ?? '3', 10),
  // Proxy configuration (optional)
  proxyUrl: env.PROXY_URL,
  proxyUsername: env.PROXY_USERNAME,
  proxyPassword: env.PROXY_PASSWORD,
  // DB monitoring
  dbSlowQueryMs: Math.min(10_000, Math.max(50, parseInt(env.DB_SLOW_QUERY_MS ?? '200', 10) || 200)),
  // CORS configuration
  cors: {
    allowedOrigins:
      parseCsvList(env.CORS_ORIGINS).length > 0
        ? parseCsvList(env.CORS_ORIGINS)
        : [
            // sensible defaults for local development
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
          ],
    credentials: ["1", "true", "yes"].includes((env.CORS_CREDENTIALS ?? (env.NODE_ENV === 'development' ? 'true' : 'false')).toLowerCase()),
  },
} as const;

export function warnMissingCriticalEnv(): void {
  const missing: string[] = [];
  if (!config.databaseUrl && !config.useMemStorage) missing.push("DATABASE_URL");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");
  // Redis is recommended but optional in Phase 0
  // DeepSeek key optional until Summary agent is enabled
  const msg = missing.length
    ? `Missing critical env vars: ${missing.join(", ")}`
    : null;
  if (msg) {
    console.warn(msg);
  }
}