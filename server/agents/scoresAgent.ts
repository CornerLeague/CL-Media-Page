import type { IScoreSource } from "./types";
import { storage } from "../storage";
import type { InsertGame, Game } from "@shared/schema";
import { logger, withSource } from "../logger";
import { broadcast } from "../ws";
import { config } from "../config";
import { metrics } from "../metrics";
import { createRedis, connectRedis } from "../jobs/redis";
import type { Redis } from "ioredis";
import { ValidationService } from "./validationService";
import type { GameScore, ScheduleGame } from "./types";

let cacheClient: Redis | null = null;
async function getCacheClient(): Promise<Redis | null> {
  if (!config.redisUrl) return null;
  if (!cacheClient) {
    cacheClient = createRedis();
    try { await connectRedis(cacheClient); } catch (err) {
      logger.warn({ err }, "redis connect failed; caching disabled");
      cacheClient = null;
    }
  }
  return cacheClient;
}

function makeTeamCacheKey(teamIds: string[]): string {
  const ids = Array.from(new Set(teamIds)).sort();
  return `scores:teams:${ids.join(",")}`;
}

function makeFeaturedCacheKey(sport: string): string {
  return `scores:sport:${String(sport).toUpperCase()}:featured`;
}

function normalizeDate(input?: string | Date): Date | undefined {
  if (!input) return undefined;
  const d = typeof input === 'string' ? new Date(input) : input;
  return isNaN(d.getTime()) ? undefined : d;
}

export class ScoresAgent {
  private source: IScoreSource;

  constructor(source: IScoreSource) {
    this.source = source;
  }

  // Sanitize team IDs to enforce LEAGUE_TEAMCODE format and uppercase
  private sanitizeTeamIds(ids: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const re = /^[A-Z]{2,4}_[A-Z0-9]+$/;
    for (const raw of ids) {
      if (!raw) continue;
      const upper = raw.toUpperCase().trim();
      if (!re.test(upper)) continue;
      if (seen.has(upper)) continue;
      seen.add(upper);
      out.push(upper);
    }
    return out.sort();
  }

  async runOnce(options: { teamIds?: string[]; limit?: number; sport?: string; mode?: "live" | "schedule" | "featured"; startDate?: string | Date; endDate?: string | Date } = {}): Promise<{ persisted: number; skipped: number; errors: number; items: Game[] }>{
    const log = withSource("scores-agent");
    const requestedTeamIds = options.teamIds ?? [];
    const teamIds = this.sanitizeTeamIds(requestedTeamIds);
    const limit = options.limit ?? 5;
    const sport = (options.sport ?? "NBA").toUpperCase();
    const explicitMode = options.mode;
    const mode: "live" | "schedule" | "featured" = explicitMode ?? (teamIds.length > 0 ? "live" : "featured");
    const t0 = performance.now();
    const observe = () => { try { metrics.scoresAgentRunDurationMs.labels(sport, mode).observe(performance.now() - t0); } catch {} };

    // Resolve date window for schedule mode (defaults: today to tomorrow)
    const startDate = normalizeDate(options.startDate) ?? new Date();
    const endDate = normalizeDate(options.endDate) ?? new Date(startDate.getTime() + 24 * 60 * 60 * 1000);

    log.info({ teamIds, limit, sport, mode, startDate, endDate }, "starting runOnce");
    let persisted = 0;
    let skipped = 0;
    let errors = 0;
    const out: Game[] = [];

    // If explicitly in live mode but no valid teamIds after sanitization, enforce isolation by doing nothing
    if (mode === "live" && teamIds.length === 0) {
      log.warn({ requestedTeamIds }, "live mode requested with no valid teamIds; skipping to enforce isolation");
      observe();
      return { persisted, skipped, errors, items: out };
    }

    // Cache short-circuit for team-scoped or featured queries (skip for schedule mode)
    if (mode !== "schedule") {
      try {
        const client = await getCacheClient();
        if (client) {
          const key = teamIds.length > 0 ? makeTeamCacheKey(teamIds) : makeFeaturedCacheKey(sport);
          const cached = await client.get(key);
          if (cached) {
            const parsed = JSON.parse(cached) as any[];
            const cachedItems = parsed.map((g) => ({
              ...g,
              startTime: new Date(g.startTime),
              cachedAt: new Date(g.cachedAt),
            })) as Game[];
            skipped += cachedItems.length;
            log.info({ count: cachedItems.length }, "cache hit; returning cached scores");
            observe();
            return { persisted, skipped, errors, items: cachedItems };
          }
        }
      } catch (e) {
        logger.warn({ err: e }, "cache read failed; continuing without cache");
      }
    }

    const validator = new ValidationService();
    let items: InsertGame[] = [];

    try {
      if (teamIds.length > 0) {
        const teamCodes = Array.from(new Set(teamIds.map((t) => t.split("_")[1]).filter(Boolean)));
        if (mode === "schedule" && typeof this.source.fetchSchedule === "function") {
          const schedule: ScheduleGame[] = await this.source.fetchSchedule!(teamCodes, startDate, endDate);
          items = schedule.slice(0, limit).map((g) => ({
            id: g.gameId,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            homePts: 0,
            awayPts: 0,
            status: g.status ?? "scheduled",
            period: undefined,
            timeRemaining: undefined,
            startTime: g.startTime,
          }));
        } else if (typeof this.source.fetchLive === "function") {
          const liveScores: GameScore[] = await this.source.fetchLive!(teamCodes);
          const validated = validator.validateForTeams(liveScores, teamIds);
          items = validated.items.map((s) => ({
            id: s.gameId,
            homeTeamId: s.homeTeamId,
            awayTeamId: s.awayTeamId,
            homePts: s.homePts,
            awayPts: s.awayPts,
            status: s.status,
            period: s.period ?? undefined,
            timeRemaining: s.timeRemaining ?? undefined,
            startTime: s.startTime,
          }));
        } else {
          // Fallback to legacy recent games fetch
          items = await this.source.fetchRecentGames({ teamIds, limit });
        }
      } else {
        if (mode === "schedule" && typeof this.source.fetchSchedule === "function") {
          const schedule: ScheduleGame[] = await this.source.fetchSchedule!([], startDate, endDate);
          items = schedule.slice(0, limit).map((g) => ({
            id: g.gameId,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            homePts: 0,
            awayPts: 0,
            status: g.status ?? "scheduled",
            period: undefined,
            timeRemaining: undefined,
            startTime: g.startTime,
          }));
        } else if (typeof this.source.fetchFeaturedGames === "function" && mode === "featured") {
          const featured: ScheduleGame[] = await this.source.fetchFeaturedGames!(sport, limit);
          items = featured.map((g) => ({
            id: g.gameId,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            homePts: 0,
            awayPts: 0,
            status: g.status ?? "scheduled",
            period: undefined,
            timeRemaining: undefined,
            startTime: g.startTime,
          }));
        } else {
          items = [];
        }
      }
    } catch (e) {
      errors++;
      log.error({ err: e }, "source fetch failed");
      observe();
      return { persisted, skipped, errors, items: out };
    }

    const seen = new Set<string>();
    for (const g of items) {
      if (seen.has(g.id)) { skipped++; continue; }
      seen.add(g.id);
      try {
        const saved = await storage.createGame(g);
        out.push(saved);
        persisted++;
        try {
          broadcast("scores:update", { teamIds: [saved.homeTeamId, saved.awayTeamId], game: saved });
        } catch (bErr) {
          logger.warn({ err: bErr }, "broadcast failed");
        }
      } catch (err: any) {
        if (err && err.code === "23505") { skipped++; continue; }
        errors++;
        log.error({ err, gameId: g.id }, "persist failed");
      }
    }

    // Populate cache with results (skip for schedule mode)
    if (mode !== "schedule") {
      try {
        const client = await getCacheClient();
        if (client && out.length > 0) {
          const key = teamIds.length > 0 ? makeTeamCacheKey(teamIds) : makeFeaturedCacheKey(sport);
          await client.set(key, JSON.stringify(out), "EX", teamIds.length > 0 ? 60 : 300);
          log.info({ count: out.length }, "cache populated");
        }
      } catch (e) {
        logger.warn({ err: e }, "cache write failed");
      }
    }

    log.info({ persisted, skipped, errors }, "runOnce complete");
    observe();
    return { persisted, skipped, errors, items: out };
  }
}