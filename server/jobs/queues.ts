import { Queue, QueueEvents, QueueOptions } from "bullmq";
import { config } from "../config";
import { createRedis } from "./redis";

export type JobName = "scores_ingest" | "news_scrape" | "classify_articles" | "generate_summary";

function baseQueueOptions(): QueueOptions {
  const connection = createRedis();
  return {
    connection,
    prefix: config.jobQueuePrefix,
  };
}

// Create queues and queue events conditionally based on Redis configuration
let queuesObj: any;
let queueEventsObj: any;

if (!config.redisUrl) {
  // When REDIS_URL is not configured, create lightweight stubs to avoid connecting in dev
  const noop = async (..._args: any[]) => undefined as any;
  const noopArray = async () => [] as any[];
  const noopCounts = async () => ({}) as any;

  queuesObj = {
    scoresIngest: {
      add: noop,
      getJob: noop,
      getJobs: noopArray,
      getJobCounts: noopCounts,
      getRepeatableJobs: noopArray,
      removeRepeatableByKey: noop,
      clean: noopArray,
    } as any,
    newsScrape: {} as any,
    classifyArticles: {} as any,
    generateSummary: {} as any,
    maintenance: {
      add: noop,
    } as any,
  } as const;

  queueEventsObj = {
    scoresIngest: { on: (_event: string, _handler: any) => {} } as any,
    maintenance: { on: (_event: string, _handler: any) => {} } as any,
  } as const;
} else {
  queuesObj = {
    scoresIngest: new Queue("scores_ingest", baseQueueOptions()),
    newsScrape: new Queue("news_scrape", baseQueueOptions()),
    classifyArticles: new Queue("classify_articles", baseQueueOptions()),
    generateSummary: new Queue("generate_summary", baseQueueOptions()),
    maintenance: new Queue("maintenance", baseQueueOptions()),
  } as const;

  queueEventsObj = {
    scoresIngest: new QueueEvents("scores_ingest", { connection: createRedis(), prefix: config.jobQueuePrefix }),
    maintenance: new QueueEvents("maintenance", { connection: createRedis(), prefix: config.jobQueuePrefix }),
  } as const;
}

export const queues = queuesObj;
export const queueEvents = queueEventsObj;