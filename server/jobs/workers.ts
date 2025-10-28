import { Worker, JobsOptions } from "bullmq";
import { config } from "../config";
import { createRedis, closeRedis } from "./redis";
import { withSource } from "../logger";
import { ScoresAgent } from "../agents/scoresAgent";
import { SportAdapterFactory } from "../agents/adapters";
import { storage } from "../storage";
import { queues } from "./queues";

const log = withSource("jobs");

export interface ScoresIngestPayload {
  teamIds?: string[];
  limit?: number;
  sport?: string; // Optional sport override
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
        const result = await primaryAgent.runOnce({ teamIds, limit });
        await job.updateProgress(70);
        await job.log(`scores_ingest primary result: ${JSON.stringify(result)}`);

        if ((result.errors ?? 0) > 0 || (result.items ?? []).length === 0) {
          await job.log("scores_ingest fallback: trying adapter again");
          const fallbackAdapter = SportAdapterFactory.getAdapter(detectedSport);
          const fallbackAgent = new ScoresAgent(fallbackAdapter);
          const fbResult = await fallbackAgent.runOnce({ teamIds, limit });
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

  // Schedule repeatable scores_ingest per NBA team every 5 minutes
  try {
    const nbaTeams = await storage.getTeamsByLeague("NBA");
    const baseOpts = { ...defaultJobOptions(), removeOnComplete: true };
    for (const team of nbaTeams) {
      try {
        await queues.scoresIngest.add(
          "scores_ingest",
          { teamIds: [team.id], limit: 5 },
          { ...baseOpts, jobId: `scores_ingest:${team.id}`, repeat: { every: 5 * 60 * 1000 } }
        );
        log.info({ teamId: team.id }, "repeatable scores_ingest scheduled");
      } catch (e) {
        log.warn({ teamId: team.id, err: e }, "failed to schedule repeatable scores_ingest");
      }
    }
  } catch (e) {
    log.warn({ err: e }, "scheduling repeatable scores_ingest failed");
  }

  async function stop() {
    try { await scoresWorker.close(); } catch {}
    try { await closeRedis(connection); } catch {}
  }

  return { stop };
}