import type { IScoreSource, UserTeamScoresOptions, UserFavoriteTeam, UserTeamScoresResult, UserTeamScoresError } from "./types";
import { UserTeamScoresError as UserTeamScoresErrorClass } from "./types";
import { 
  ScoreFetchError, 
  ValidationError, 
  DatabaseError,
  logError 
} from "../types/errors";
import { storage as defaultStorage } from "../storage";
import type { IStorage } from "../storage";
import type { InsertGame, Game } from "@shared/schema";
import { logger, withSource } from "../logger";
import { broadcast, broadcastUserTeamUpdate, broadcastUserTeamStatusChange } from "../ws";
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
  private storage: IStorage;

  constructor(source: IScoreSource, storage?: IStorage) {
    this.source = source;
    this.storage = storage || defaultStorage;
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
        // Enhanced cache error logging
        logError(log, new Error(`Cache read failed: ${e instanceof Error ? e.message : String(e)}`), {
          operation: 'runOnce-cache-read',
          sport,
          mode,
          teamIds: teamIds.join(','),
          cacheError: e instanceof Error ? e.message : String(e)
        });
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
      const errorMessage = e instanceof Error ? e.message : String(e);
      
      // Use enhanced error logging
      logError(log, new ScoreFetchError(
        `Failed to fetch scores from source: ${errorMessage}`,
        { 
          sport, 
          mode, 
          teamIds, 
          limit,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
          sourceError: errorMessage
        }
      ), {
        operation: 'runOnce-fetch',
        sport,
        teamIds: teamIds.join(',')
      });
      
      observe();
      return { persisted, skipped, errors, items: out };
    }

    // Detect changes before persisting games
    const { scoreChanges, statusChanges } = await this.detectGameChanges(items);

    const seen = new Set<string>();
    for (const g of items) {
      if (seen.has(g.id)) { skipped++; continue; }
      seen.add(g.id);
      try {
        const saved = await this.storage.createGame(g);
        out.push(saved);
        persisted++;
        
        // Use smart broadcasting instead of legacy broadcast
        try {
          // Check if this game had score changes
          const hadScoreChange = scoreChanges.some(sc => sc.id === saved.id);
          const hadStatusChange = statusChanges.some(sc => sc.id === saved.id);
          
          if (hadScoreChange) {
            await broadcastUserTeamUpdate({
              type: 'UserTeamScoreUpdate',
              gameId: saved.id,
              homeTeam: {
                id: saved.homeTeamId,
                score: saved.homePts
              },
              awayTeam: {
                id: saved.awayTeamId,
                score: saved.awayPts
              },
              status: saved.status,
              period: saved.period,
              timeRemaining: saved.timeRemaining,
              timestamp: new Date()
            });
          }
          
          if (hadStatusChange) {
            // For status changes, we need to broadcast for both teams
            await broadcastUserTeamStatusChange(
              saved.id,
              saved.homeTeamId,
              'unknown', // We don't have the old status in this context
              saved.status
            );
            await broadcastUserTeamStatusChange(
              saved.id,
              saved.awayTeamId,
              'unknown', // We don't have the old status in this context
              saved.status
            );
          }
        } catch (bErr) {
          // Enhanced broadcast error logging
          logError(log, new Error(`Smart broadcast failed: ${bErr instanceof Error ? bErr.message : String(bErr)}`), {
            operation: 'runOnce-smart-broadcast',
            gameId: saved.id,
            homeTeamId: saved.homeTeamId,
            awayTeamId: saved.awayTeamId,
            status: saved.status,
            broadcastError: bErr instanceof Error ? bErr.message : String(bErr)
          });
          logger.warn({ err: bErr }, "smart broadcast failed");
        }
      } catch (err: any) {
        if (err && err.code === "23505") { 
          skipped++; 
          continue; 
        }
        errors++;
        
        // Use enhanced error logging for database errors
        logError(log, new DatabaseError(
          `Failed to persist game: ${err instanceof Error ? err.message : String(err)}`,
          {
            gameId: g.id,
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            status: g.status,
            dbErrorCode: err?.code,
            dbError: err instanceof Error ? err.message : String(err)
          }
        ), {
          operation: 'runOnce-persist',
          gameId: g.id
        });
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
        // Enhanced cache write error logging
        logError(log, new Error(`Cache write failed: ${e instanceof Error ? e.message : String(e)}`), {
          operation: 'runOnce-cache-write',
          sport,
          mode,
          teamIds: teamIds.join(','),
          itemCount: out.length,
          cacheError: e instanceof Error ? e.message : String(e)
        });
        logger.warn({ err: e }, "cache write failed");
      }
    }

    log.info({ persisted, skipped, errors }, "runOnce complete");
    observe();
    return { persisted, skipped, errors, items: out };
  }

  // User-specific cache key generation
  private makeUserTeamCacheKey(firebaseUid: string, sport?: string, mode?: string): string {
    const sportPart = sport ? `:${sport}` : '';
    const modePart = mode ? `:${mode}` : '';
    return `user_team_scores:${firebaseUid}${sportPart}${modePart}`;
  }

  // Extract sport from team ID (e.g., "NBA_LAL" -> "NBA")
  private extractSportFromTeamId(teamId: string): string {
    const parts = teamId.split('_');
    return parts[0] || '';
  }

  /**
   * Detect significant changes in games that warrant broadcasting
   */
  private async detectGameChanges(newGames: InsertGame[]): Promise<{ scoreChanges: InsertGame[], statusChanges: InsertGame[] }> {
    const scoreChanges: InsertGame[] = [];
    const statusChanges: InsertGame[] = [];

    for (const newGame of newGames) {
      try {
        const existingGame = await this.storage.getGame(newGame.id);
        
        if (!existingGame) {
          // New game - consider it a status change
          statusChanges.push(newGame);
          continue;
        }

        // Check for score changes
        if (existingGame.homePts !== newGame.homePts || existingGame.awayPts !== newGame.awayPts) {
          scoreChanges.push(newGame);
        }

        // Check for status changes
        if (existingGame.status !== newGame.status) {
          statusChanges.push(newGame);
        }

        // Check for period changes (significant for live games)
        if (existingGame.period !== newGame.period) {
          statusChanges.push(newGame);
        }
      } catch (error) {
          logger.warn({ gameId: newGame.id, error }, 'Error detecting game changes');
          // On error, treat as new game to ensure broadcasting
          statusChanges.push(newGame);
        }
    }

    return { scoreChanges, statusChanges };
  }

  // Get user's favorite teams, optionally filtered by sport
  async getUserFavoriteTeams(firebaseUid: string, sport?: string): Promise<UserFavoriteTeam[]> {
    const log = withSource("scores-agent");
    
    try {
      // Get user profile from storage
      const userProfile = await this.storage.getUserProfile(firebaseUid);
      if (!userProfile) {
        throw new UserTeamScoresErrorClass(
          `User profile not found for firebaseUid: ${firebaseUid}`,
          'USER_NOT_FOUND',
          firebaseUid,
          sport
        );
      }

      // Extract favorite teams from profile
      const favoriteTeams = userProfile.favoriteTeams || [];
      if (favoriteTeams.length === 0) {
        throw new UserTeamScoresErrorClass(
          `No favorite teams configured for user: ${firebaseUid}`,
          'NO_FAVORITE_TEAMS',
          firebaseUid,
          sport
        );
      }

      // Convert team IDs to UserFavoriteTeam objects
      let userFavoriteTeams: UserFavoriteTeam[] = favoriteTeams.map((teamId: string) => ({
        teamId,
        sport: this.extractSportFromTeamId(teamId)
      }));

      // Filter by sport if specified
      if (sport) {
        const sportUpper = sport.toUpperCase();
        userFavoriteTeams = userFavoriteTeams.filter(team => team.sport === sportUpper);
        
        if (userFavoriteTeams.length === 0) {
          throw new UserTeamScoresErrorClass(
            `No favorite teams found for sport: ${sport}`,
            'NO_FAVORITE_TEAMS',
            firebaseUid,
            sport
          );
        }
      }

      log.info({ 
        firebaseUid, 
        sport, 
        totalTeams: favoriteTeams.length, 
        filteredTeams: userFavoriteTeams.length 
      }, "retrieved user favorite teams");

      return userFavoriteTeams;
    } catch (error) {
      if (error instanceof UserTeamScoresErrorClass) {
        throw error;
      }
      
      log.error({ 
        firebaseUid, 
        sport, 
        error: error instanceof Error ? error.message : String(error) 
      }, "failed to get user favorite teams");
      
      throw new UserTeamScoresErrorClass(
        `Failed to retrieve user favorite teams: ${error instanceof Error ? error.message : String(error)}`,
        'FETCH_FAILED',
        firebaseUid,
        sport
      );
    }
  }

  // Cache user team scores with appropriate TTL
  async cacheUserTeamScores(
    firebaseUid: string,
    sport: string | undefined,
    mode: string,
    games: Game[]
  ): Promise<void> {
    const log = withSource("scores-agent");
    
    try {
      const client = await getCacheClient();
      if (!client || games.length === 0) return;

      const key = this.makeUserTeamCacheKey(firebaseUid, sport, mode);
      // Use shorter TTL for live scores, longer for others
      const ttl = mode === 'live' ? 60 : 300;
      
      await client.set(key, JSON.stringify(games), "EX", ttl);
      
      log.info({ 
        firebaseUid, 
        sport, 
        mode, 
        count: games.length, 
        ttl 
      }, "cached user team scores");
    } catch (error) {
      // Enhanced cache error logging
      logError(log, new Error(`Failed to cache user team scores: ${error instanceof Error ? error.message : String(error)}`), {
        operation: 'cacheUserTeamScores',
        firebaseUid,
        sport,
        mode,
        gameCount: games.length,
        cacheError: error instanceof Error ? error.message : String(error)
      });
      
      log.warn({ 
        firebaseUid, 
        sport, 
        mode, 
        error: error instanceof Error ? error.message : String(error) 
      }, "failed to cache user team scores");
    }
  }

  // Get cached user team scores
  async getCachedUserTeamScores(
    firebaseUid: string,
    sport: string | undefined,
    mode: string
  ): Promise<Game[] | null> {
    const log = withSource("scores-agent");
    
    try {
      const client = await getCacheClient();
      if (!client) return null;

      const key = this.makeUserTeamCacheKey(firebaseUid, sport, mode);
      const cached = await client.get(key);
      
      if (!cached) return null;

      const parsed = JSON.parse(cached) as any[];
      const cachedGames = parsed.map((g) => ({
        ...g,
        startTime: new Date(g.startTime),
        cachedAt: new Date(g.cachedAt),
      })) as Game[];

      log.info({ 
        firebaseUid, 
        sport, 
        mode, 
        count: cachedGames.length 
      }, "cache hit for user team scores");

      return cachedGames;
    } catch (error) {
      // Enhanced cache error logging
      logError(log, new Error(`Failed to get cached user team scores: ${error instanceof Error ? error.message : String(error)}`), {
        operation: 'getCachedUserTeamScores',
        firebaseUid,
        sport,
        mode,
        cacheError: error instanceof Error ? error.message : String(error)
      });
      
      log.warn({ 
        firebaseUid, 
        sport, 
        mode, 
        error: error instanceof Error ? error.message : String(error) 
      }, "failed to get cached user team scores");
      return null;
    }
  }

  // Main method to fetch user team scores
  async fetchUserTeamScores(options: UserTeamScoresOptions): Promise<UserTeamScoresResult> {
    const log = withSource("scores-agent");
    const { firebaseUid, sport, limit = 10, mode = 'live', startDate, endDate } = options;
    
    log.info({ firebaseUid, sport, limit, mode, startDate, endDate }, "starting fetchUserTeamScores");

    try {
      // Get user profile and favorite teams
      const userProfile = await this.storage.getUserProfile(firebaseUid);
      if (!userProfile) {
        throw new UserTeamScoresErrorClass(
          `User profile not found for firebaseUid: ${firebaseUid}`,
          'USER_NOT_FOUND',
          firebaseUid,
          sport
        );
      }

      const favoriteTeams = await this.getUserFavoriteTeams(firebaseUid, sport);
      const teamIds = favoriteTeams.map(team => team.teamId);

      // Check cache first (skip for schedule mode)
      let cacheHit = false;
      if (mode !== 'schedule') {
        const cachedGames = await this.getCachedUserTeamScores(firebaseUid, sport, mode);
        if (cachedGames) {
          return {
            games: cachedGames,
            userProfile,
            favoriteTeams,
            cacheHit: true,
            source: 'cache'
          };
        }
      }

      // Fetch fresh scores using existing runOnce method
      const result = await this.runOnce({
        teamIds,
        limit,
        sport,
        mode,
        startDate,
        endDate
      });

      // Cache the results (skip for schedule mode)
      if (mode !== 'schedule' && result.items.length > 0) {
        await this.cacheUserTeamScores(firebaseUid, sport, mode, result.items);
      }

      // Broadcast user-specific update
      try {
        broadcast(`user_scores:update:${firebaseUid}`, {
          firebaseUid,
          sport,
          games: result.items
        });
      } catch (bErr) {
        // Enhanced broadcast error logging
        logError(log, new Error(`User scores broadcast failed: ${bErr instanceof Error ? bErr.message : String(bErr)}`), {
          operation: 'fetchUserTeamScores-broadcast',
          firebaseUid,
          sport,
          gameCount: result.items.length,
          broadcastError: bErr instanceof Error ? bErr.message : String(bErr)
        });
        log.warn({ err: bErr }, "user scores broadcast failed");
      }

      log.info({ 
        firebaseUid, 
        sport, 
        mode, 
        persisted: result.persisted, 
        skipped: result.skipped, 
        errors: result.errors 
      }, "fetchUserTeamScores complete");

      return {
        games: result.items,
        userProfile,
        favoriteTeams,
        cacheHit,
        source: 'live'
      };
    } catch (error) {
      if (error instanceof UserTeamScoresErrorClass) {
        throw error;
      }
      
      log.error({ 
        firebaseUid, 
        sport, 
        error: error instanceof Error ? error.message : String(error) 
      }, "failed to fetch user team scores");
      
      throw new UserTeamScoresErrorClass(
        `Failed to fetch user team scores: ${error instanceof Error ? error.message : String(error)}`,
        'FETCH_FAILED',
        firebaseUid,
        sport
      );
    }
  }

  /**
   * Get user's favorite team for a specific sport.
   * This is an alias for getUserFavoriteTeams with sport filtering.
   * 
   * @param firebaseUid - The user's Firebase UID
   * @param sport - The sport to filter by (required)
   * @returns Promise<UserFavoriteTeam[]> - Array of favorite teams for the specified sport
   * @throws UserTeamScoresError - If user not found, no favorite teams, or no teams for sport
   */
  async getUserFavoriteTeamBySport(firebaseUid: string, sport: string): Promise<UserFavoriteTeam[]> {
    return this.getUserFavoriteTeams(firebaseUid, sport);
  }
}