import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { app: "corner-league-media" },
});

export function withSource(source: string) {
  return logger.child({ source });
}