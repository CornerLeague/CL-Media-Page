import { config } from "../config";
import IORedis, { Redis } from "ioredis";

export function createRedis(): Redis {
  const url = config.redisUrl ?? "redis://127.0.0.1:6379";
  return new IORedis(url, {
    maxRetriesPerRequest: null, // allow blocking commands in bullmq queue events/scheduler
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

export async function connectRedis(client: Redis): Promise<void> {
  if ((client as any).status === "ready") return;
  await client.connect();
}

export async function closeRedis(client: Redis): Promise<void> {
  try {
    await client.quit();
  } catch {
    try { await client.disconnect(); } catch {}
  }
}