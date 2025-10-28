import { ScoresAgent } from "../agents/scoresAgent";
import { SportAdapterFactory } from "../agents/adapters";
import { sendFriendlyDbError } from "../routes";
import { queues } from "../jobs/queues";
import { config } from "../config";
import { defaultJobOptions } from "../jobs/workers";

import type { Express } from "express";

export function attachDevAgentRoutes(app: Express) {
  app.post("/api/dev/agents/scores/run", async (req, res) => {
    try {
      const { teamIds, limit, source = "dummy", sport = "NBA", mode, startDate, endDate } = req.body || {};
      // Use SportAdapterFactory to get the appropriate adapter for the sport
      // Falls back to DummyScoreSource for not-yet-implemented adapters
      const adapter = SportAdapterFactory.getAdapter(sport);
      const agent = new ScoresAgent(adapter);
      const result = await agent.runOnce({ teamIds, limit, sport, mode, startDate, endDate });
      res.json(result);
    } catch (err) {
      return await sendFriendlyDbError(res, err, "runScoresAgent");
    }
  });

  // Enqueue a scores_ingest job (dev only)
  app.post("/api/dev/jobs/scores_ingest/enqueue", async (req, res) => {
    try {
      if (!config.jobsEnabled) {
        return res.status(400).json({ error: "Jobs are disabled by config" });
      }
      const { teamIds, limit, opts } = req.body || {};
      const baseOpts = { ...defaultJobOptions(), removeOnComplete: false };
      const job = await queues.scoresIngest.add("scores_ingest", { teamIds, limit }, { ...baseOpts, ...(opts || {}) });
      res.json({ jobId: job.id, name: job.name, queue: job.queueName });
    } catch (err) {
      return await sendFriendlyDbError(res, err, "enqueueScoresIngest");
    }
  });

  // Get job status/result (dev only)
  app.get("/api/dev/jobs/scores_ingest/:id", async (req, res) => {
    try {
      if (!config.jobsEnabled) {
        return res.status(400).json({ error: "Jobs are disabled by config" });
      }
      const id = req.params.id;
      const job = await queues.scoresIngest.getJob(id);
      if (!job) return res.status(404).json({ error: "Job not found" });
      const state = await job.getState();
      const progress = job.progress ?? null;
      const failedReason = (job as any).failedReason ?? null;
      const stacktrace = (job as any).stacktrace ?? null;
      let logs: string[] = [];
      try {
        const logRes = await queues.scoresIngest.getJobLogs(job.id as string);
        logs = (logRes as any)?.logs ?? [];
      } catch {}
      res.json({ id: job.id, name: job.name, state, progress, returnvalue: job.returnvalue ?? null, failedReason, stacktrace, logs });
    } catch (err) {
      return await sendFriendlyDbError(res, err, "getScoresIngestJob");
    }
  });

  // List recent jobs with pagination (dev only)
  app.get("/api/dev/jobs/scores_ingest", async (req, res) => {
    try {
      if (!config.jobsEnabled) {
        return res.status(400).json({ error: "Jobs are disabled by config" });
      }
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      // Optional: filter by statuses via query, default to a mix of common states
      const statusesParam = String(req.query.statuses ?? "completed,failed,waiting,active,delayed");
      const statuses = statusesParam.split(",").map((s) => s.trim()).filter(Boolean) as any;

      const jobs = await queues.scoresIngest.getJobs(statuses, start, end);
      const items = await Promise.all(
        jobs.map(async (job) => {
          const state = await job.getState();
          return {
            id: job.id,
            name: job.name,
            state,
            returnvalue: job.returnvalue ?? null,
            attemptsMade: job.attemptsMade ?? 0,
            failedReason: (job as any).failedReason ?? null,
            timestamp: (job as any).timestamp ?? null,
            processedOn: (job as any).processedOn ?? null,
            finishedOn: (job as any).finishedOn ?? null,
          };
        })
      );

      const counts = await queues.scoresIngest.getJobCounts(...statuses);

      res.json({
        page,
        pageSize,
        statuses,
        counts,
        items,
      });
    } catch (err) {
      return await sendFriendlyDbError(res, err, "listScoresIngestJobs");
    }
  });
}