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
  // Web scraping configuration
  SCRAPER_USER_AGENT: z.string().optional(),
  SCRAPER_RATE_LIMIT_MS: z.string().optional(),
  SCRAPER_TIMEOUT_MS: z.string().optional(),
  SCRAPER_MAX_RETRIES: z.string().optional(),
  // Proxy configuration (optional)
  PROXY_URL: z.string().optional(),
  PROXY_USERNAME: z.string().optional(),
  PROXY_PASSWORD: z.string().optional(),
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

export const config = {
  nodeEnv: env.NODE_ENV,
  isDev: env.NODE_ENV === "development",
  port: toPort(env.PORT, 5000),
  databaseUrl: env.DATABASE_URL,
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
  // Web scraping configuration
  scraperUserAgent: env.SCRAPER_USER_AGENT ?? 'CornerLeagueMedia/1.0 (+https://cornerleague.com/bot; contact@cornerleague.com)',
  scraperRateLimitMs: parseInt(env.SCRAPER_RATE_LIMIT_MS ?? '2000', 10),
  scraperTimeoutMs: parseInt(env.SCRAPER_TIMEOUT_MS ?? '10000', 10),
  scraperMaxRetries: parseInt(env.SCRAPER_MAX_RETRIES ?? '3', 10),
  // Proxy configuration (optional)
  proxyUrl: env.PROXY_URL,
  proxyUsername: env.PROXY_USERNAME,
  proxyPassword: env.PROXY_PASSWORD,
} as const;

export function warnMissingCriticalEnv(): void {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
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