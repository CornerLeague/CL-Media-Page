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

export const queues = {
  scoresIngest: new Queue("scores_ingest", baseQueueOptions()),
  newsScrape: new Queue("news_scrape", baseQueueOptions()),
  classifyArticles: new Queue("classify_articles", baseQueueOptions()),
  generateSummary: new Queue("generate_summary", baseQueueOptions()),
} as const;

export const queueEvents = {
  scoresIngest: new QueueEvents("scores_ingest", { connection: createRedis(), prefix: config.jobQueuePrefix }),
};