import { config } from "../config";
import IORedis, { Redis } from "ioredis";

export function createRedis(): Redis {
  // If REDIS_URL is not provided OR jobs are disabled, return a disabled stub
  // to avoid accidental connections to localhost during development.
  if (!config.redisUrl || !config.jobsEnabled) {
    const disabledClient = {
      status: "mock-disabled",
      // No-op connect/quit/disconnect to satisfy callers that conditionally manage lifecycle
      async connect() { /* no-op */ },
      async quit() { /* no-op */ },
      async disconnect() { /* no-op */ },
      on() { /* no-op */ },
    } as unknown as Redis;
    return disabledClient;
  }

  const url = config.redisUrl;
  return new IORedis(url, {
    maxRetriesPerRequest: null, // allow blocking commands in bullmq queue events/scheduler
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

export async function connectRedis(client: Redis): Promise<void> {
  const status = (client as any).status;
  if (status === "ready" || status === "mock-disabled") return;
  await client.connect();
}

export async function closeRedis(client: Redis): Promise<void> {
  try {
    // In disabled mode, quit/disconnect are no-ops
    await client.quit();
  } catch {
    try { await client.disconnect(); } catch {}
  }
}