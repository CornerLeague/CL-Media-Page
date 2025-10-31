import { Worker, JobsOptions } from "bullmq";
import { config } from "../config";
import { createRedis, closeRedis, connectRedis } from "./redis";
import { withSource } from "../logger";
import { ScoresAgent } from "../agents/scoresAgent";
import { SportAdapterFactory } from "../agents/adapters";
import { storage } from "../storage";
import { queues, queueEvents } from "./queues";
import type { Redis } from "ioredis";

const log = withSource("jobs");

export interface ScoresIngestHealth {
  completedCount: number;
  failedCount: number;
  lastCompletedAt?: string;
  lastFailedAt?: string;
  lastJobId?: string | number | null;
  lastDurationMs?: number;
  lastError?: string | null;
  lastResult?: { persisted: number; skipped: number; errors: number } | undefined;
}

const scoresIngestHealth: ScoresIngestHealth = {
  completedCount: 0,
  failedCount: 0,
};

let queueEventsInitialized = false;

function coerceResult(rv: any): { persisted: number; skipped: number; errors: number } | undefined {
  if (!rv || typeof rv !== "object") return undefined;
  const persisted = Number((rv as any)?.persisted ?? 0);
  const skipped = Number((rv as any)?.skipped ?? 0);
  const errors = Number((rv as any)?.errors ?? 0);
  return { persisted, skipped, errors };
}

function initScoresIngestObservability() {
  if (queueEventsInitialized) return;
  queueEventsInitialized = true;

  // Listen to queue-level lifecycle events for observability
  queueEvents.scoresIngest.on("completed", async ({ jobId, returnvalue }: any) => {
    scoresIngestHealth.completedCount += 1;
    scoresIngestHealth.lastCompletedAt = new Date().toISOString();
    scoresIngestHealth.lastJobId = jobId ?? null;
    scoresIngestHealth.lastResult = coerceResult(returnvalue);
    try {
      const job = await queues.scoresIngest.getJob(String(jobId));
      const processedOn = (job as any)?.processedOn as number | undefined;
      const finishedOn = (job as any)?.finishedOn as number | undefined;
      const data = (job as any)?.data as { teamIds?: string[]; sport?: string } | undefined;
      if (processedOn && finishedOn) {
        scoresIngestHealth.lastDurationMs = finishedOn - processedOn;
      }
      log.info({
        jobId,
        target: (Array.isArray(data?.teamIds) && data?.teamIds?.length ? data?.teamIds?.join(",") : String(data?.sport ?? "NBA")),
        durationMs: scoresIngestHealth.lastDurationMs,
        result: scoresIngestHealth.lastResult,
      }, "queueEvents completed");
    } catch (e) {
      // Non-fatal if job lookup fails
      log.warn({ jobId, err: e }, "queueEvents completed; job lookup failed");
    }
  });

  queueEvents.scoresIngest.on("failed", async ({ jobId, failedReason }: any) => {
    scoresIngestHealth.failedCount += 1;
    scoresIngestHealth.lastFailedAt = new Date().toISOString();
    scoresIngestHealth.lastJobId = jobId ?? null;
    scoresIngestHealth.lastError = failedReason ?? null;
    try {
      const job = await queues.scoresIngest.getJob(String(jobId));
      const data = (job as any)?.data as { teamIds?: string[]; sport?: string } | undefined;
      log.error({ jobId, target: (Array.isArray(data?.teamIds) && data?.teamIds?.length ? data?.teamIds?.join(",") : String(data?.sport ?? "NBA")), failedReason }, "queueEvents failed");
    } catch (e) {
      log.warn({ jobId, err: e }, "queueEvents failed; job lookup failed");
    }
  });
}

export function getScoresIngestHealth(): ScoresIngestHealth {
  return scoresIngestHealth;
}

export interface ScoresIngestPayload {
  teamIds?: string[];
  limit?: number;
  sport?: string; // Optional sport override
}

export interface MaintenancePayload {
  action?: "cleanup";
}

/**
 * Extract sport code from team ID (e.g., "NBA_LAL" -> "NBA")
 * Falls back to "NBA" if no valid team ID format found
 */
function detectSportFromTeamIds(teamIds?: string[]): string {
  if (!teamIds || teamIds.length === 0) return 'NBA';
  
  const firstTeamId = teamIds[0];
  const parts = firstTeamId.split('_');
  
  if (parts.length >= 2) {
    return parts[0].toUpperCase();
  }
  
  return 'NBA'; // Default fallback
}

export function defaultJobOptions(): JobsOptions {
  return {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 20,
  };
}

export async function initWorkers() {
  if (!config.redisUrl) {
    log.warn("REDIS_URL not set; job workers disabled");
    return { stop: async () => {} };
  }

  const connection = createRedis();

  const scoresWorker = new Worker<ScoresIngestPayload>(
    "scores_ingest",
    async (job) => {
      const { teamIds, limit, sport } = job.data || {};
      // Use SportAdapterFactory to get the appropriate adapter
      // Detect sport from team IDs (e.g., "NBA_LAL") or use explicit sport parameter
      const detectedSport = sport || detectSportFromTeamIds(teamIds);
      const adapter = SportAdapterFactory.getAdapter(detectedSport);
      const primaryAgent = new ScoresAgent(adapter);
      try {
        await job.updateProgress(5);
        await job.log(`scores_ingest start: teamIds=${JSON.stringify(teamIds ?? [])}, limit=${limit ?? 5}`);
        const mode = (teamIds && teamIds.length > 0) ? "live" : "featured";
        const result = await primaryAgent.runOnce({ teamIds, limit, sport: detectedSport, mode });
        await job.updateProgress(70);
        await job.log(`scores_ingest primary result: ${JSON.stringify(result)}`);

        if ((result.errors ?? 0) > 0 || (result.items ?? []).length === 0) {
          await job.log("scores_ingest fallback: trying adapter again");
          const fallbackAdapter = SportAdapterFactory.getAdapter(detectedSport);
          const fallbackAgent = new ScoresAgent(fallbackAdapter);
          const fbResult = await fallbackAgent.runOnce({ teamIds, limit, sport: detectedSport, mode });
          await job.updateProgress(95);
          await job.log(`scores_ingest fallback result: ${JSON.stringify(fbResult)}`);
          log.info({ jobId: job.id, result: fbResult }, "scores_ingest processed (fallback)");
          await job.updateProgress(100);
          return fbResult;
        }

        await job.updateProgress(95);
        await job.log(`scores_ingest result: ${JSON.stringify(result)}`);
        log.info({ jobId: job.id, result }, "scores_ingest processed");
        await job.updateProgress(100);
        return result;
      } catch (err: any) {
        await job.log(`scores_ingest error: ${err?.message ?? String(err)}`);
        if (err?.stack) {
          await job.log(err.stack);
        }
        try {
          const lastResortAdapter = SportAdapterFactory.getAdapter(detectedSport);
          const fallbackAgent = new ScoresAgent(lastResortAdapter);
          const fbResult = await fallbackAgent.runOnce({ teamIds, limit });
          await job.log(`scores_ingest last-resort fallback result: ${JSON.stringify(fbResult)}`);
          return fbResult;
        } catch {
          throw err;
        }
      }
    },
    { connection, prefix: config.jobQueuePrefix, concurrency: 2 }
  );

  scoresWorker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "scores_ingest failed");
  });

  scoresWorker.on("completed", (job, result) => {
    log.info({ jobId: job.id, persisted: result?.persisted }, "scores_ingest completed");
  });

  // Schedule live scores jobs per team across supported leagues using configured interval
  try {
    await scheduleLiveTeamJobs();
  } catch (e) {
    log.warn({ err: e }, "scheduling repeatable scores_ingest failed");
  }

  // Schedule featured (sport-scoped) jobs per league using configured non-live interval
  try {
    await scheduleFeaturedSportJobs();
  } catch (e) {
    log.warn({ err: e }, "scheduling featured scores_ingest failed");
  }

  // Maintenance/cleanup worker and scheduling
  const maintenanceWorker = new Worker<MaintenancePayload>(
    "maintenance",
    async (job) => {
      await job.updateProgress(5);
      await job.log("maintenance start");
      const client = createRedis();
      await connectRedis(client);
      try {
        const summary = await performMaintenance(client);
        await job.updateProgress(95);
        await job.log(`maintenance summary: ${JSON.stringify(summary)}`);
        return summary;
      } finally {
        try { await closeRedis(client); } catch {}
        await job.updateProgress(100);
      }
    },
    { connection, prefix: config.jobQueuePrefix, concurrency: 1 }
  );

  maintenanceWorker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "maintenance failed");
  });

  maintenanceWorker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "maintenance completed");
  });

  try {
    await scheduleMaintenanceJob();
  } catch (e) {
    log.warn({ err: e }, "scheduling maintenance failed");
  }

  // Initialize queue-level observability once workers are ready
  try {
    initScoresIngestObservability();
  } catch (e) {
    log.warn({ err: e }, "init queue observability failed");
  }

  async function stop() {
    try { await scoresWorker.close(); } catch {}
    try { await maintenanceWorker.close(); } catch {}
    try { await closeRedis(connection); } catch {}
  }

  return { stop };
}

/**
 * Schedule repeatable live team-scoped jobs for supported leagues.
 * Uses config.liveScoresIntervalMs and unique jobId per team.
 */
export async function scheduleLiveTeamJobs(): Promise<void> {
  const leagues = ["NBA", "NFL", "MLB", "NHL"] as const;
  const baseOpts = { ...defaultJobOptions(), removeOnComplete: true };
  for (const league of leagues) {
    try {
      const teams = await storage.getTeamsByLeague(league);
      for (const team of teams) {
        try {
          await queues.scoresIngest.add(
            "scores_ingest",
            { teamIds: [team.id], limit: 5 },
            { ...baseOpts, jobId: `scores_ingest:${team.id}`, repeat: { every: config.liveScoresIntervalMs } }
          );
          log.info({ league, teamId: team.id, everyMs: config.liveScoresIntervalMs }, "repeatable scores_ingest scheduled");
        } catch (e) {
          log.warn({ league, teamId: team.id, err: e }, "failed to schedule repeatable scores_ingest");
        }
      }
    } catch (e) {
      log.warn({ league, err: e }, "failed to list teams for league");
    }
  }
}

/**
 * Schedule repeatable featured (sport-scoped) jobs for supported leagues.
 * Uses config.nonliveScoresIntervalMs and unique per-sport jobId.
 */
export async function scheduleFeaturedSportJobs(): Promise<void> {
  const leagues = ["NBA", "NFL", "MLB", "NHL"] as const;
  const baseOpts = { ...defaultJobOptions(), removeOnComplete: true };
  for (const league of leagues) {
    try {
      await queues.scoresIngest.add(
        "scores_ingest",
        { teamIds: [], limit: 10, sport: league },
        { ...baseOpts, jobId: `scores_ingest:featured:${league}`, repeat: { every: config.nonliveScoresIntervalMs } }
      );
      log.info({ league, everyMs: config.nonliveScoresIntervalMs }, "repeatable featured scores_ingest scheduled");
    } catch (e) {
      log.warn({ league, err: e }, "failed to schedule featured scores_ingest");
    }
  }
}

/**
 * Schedule maintenance job using cron pattern from config or default daily interval.
 */
export async function scheduleMaintenanceJob(): Promise<void> {
  const baseOpts = { ...defaultJobOptions(), removeOnComplete: true };
  const repeat = config.cleanupRunAtCron
    ? { pattern: config.cleanupRunAtCron }
    : { every: 24 * 60 * 60 * 1000 };
  await queues.maintenance.add(
    "cleanup",
    { action: "cleanup" },
    { ...baseOpts, jobId: "maintenance:cleanup", repeat }
  );
  log.info({ repeat }, "repeatable maintenance scheduled");
}

/**
 * Perform maintenance actions: purge old jobs, reconcile repeatables, clear caches.
 */
export async function performMaintenance(client: Redis): Promise<{ cleanedJobs: number; removedRepeatables: number; deletedCacheKeys: number }> {
  let cleanedJobs = 0;
  let removedRepeatables = 0;
  let deletedCacheKeys = 0;

  // Purge stale BullMQ jobs (older than 7 days)
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  try {
    // BullMQ clean signature is (graceMs, limit, type) and returns string[] of removed job ids
    cleanedJobs += (await queues.scoresIngest.clean(sevenDaysMs, 1000, "completed")).length;
    cleanedJobs += (await queues.scoresIngest.clean(sevenDaysMs, 1000, "failed")).length;
  } catch (e) {
    log.warn({ err: e }, "queue clean failed");
  }

  // Reconcile repeatable jobs with desired configuration
  try {
    removedRepeatables += await reconcileRepeatableScoresJobs();
  } catch (e) {
    log.warn({ err: e }, "reconcile repeatables failed");
  }

  // Clear Redis caches for scores keys
  try {
    deletedCacheKeys += await deleteKeysByPattern(client, "scores:teams:*");
    deletedCacheKeys += await deleteKeysByPattern(client, "scores:sport:*:featured");
  } catch (e) {
    log.warn({ err: e }, "cache cleanup failed");
  }

  return { cleanedJobs, removedRepeatables, deletedCacheKeys };
}

/**
 * Delete keys for a given pattern using SCAN to avoid blocking Redis.
 */
export async function deleteKeysByPattern(client: Redis, pattern: string): Promise<number> {
  let cursor = "0";
  let totalDeleted = 0;
  do {
    const [nextCursor, keys] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      totalDeleted += await client.del(...keys);
    }
  } while (cursor !== "0");
  return totalDeleted;
}

/**
 * Ensure only desired repeatable jobs exist for scores_ingest.
 * Removes obsolete repeatables when teams or intervals change.
 */
export async function reconcileRepeatableScoresJobs(): Promise<number> {
  const leagues = ["NBA", "NFL", "MLB", "NHL"] as const;
  const desiredIds = new Set<string>();
  for (const league of leagues) {
    try {
      const teams = await storage.getTeamsByLeague(league);
      for (const team of teams) {
        desiredIds.add(`scores_ingest:${team.id}`);
      }
      desiredIds.add(`scores_ingest:featured:${league}`);
    } catch (e) {
      log.warn({ league, err: e }, "list teams failed during reconcile");
    }
  }

  let removed = 0;
  const reps = await queues.scoresIngest.getRepeatableJobs();
  for (const r of reps) {
    const id = (r as any).id as string | undefined;
    const key = (r as any).key as string | undefined;
    if (!id || !key) continue;
    if (id.startsWith("scores_ingest:") && !desiredIds.has(id)) {
      try {
        await queues.scoresIngest.removeRepeatableByKey(key);
        removed++;
        log.info({ removedId: id }, "removed obsolete repeatable job");
      } catch (e) {
        log.warn({ id, err: e }, "failed to remove repeatable by key");
      }
    }
  }
  return removed;
}