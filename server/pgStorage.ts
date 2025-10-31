import type {
  IStorage,
} from "./storage";
import type {
  User,
  InsertUser,
  Session,
  InsertSession,
  Team,
  InsertTeam,
  UserTeam,
  InsertUserTeam,
  Summary,
  InsertSummary,
  Game,
  InsertGame,
  Update,
  InsertUpdate,
  Experience,
  InsertExperience,
  Rsvp,
  InsertRsvp,
  UserProfile,
  InsertUserProfile,
  Article,
  InsertArticle,
  BM25Index,
  InsertBM25Index,
  NewsSource,
  InsertNewsSource,
  ArticleClassification,
  InsertArticleClassification,
} from "@shared/schema";
import { db } from "./db";
import * as schema from "@shared/schema";
import { eq, and, or, lt, gt, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { metrics } from "./metrics";
import { config } from "./config";
import { withSource } from "./logger";

/**
 * Execute a DB operation while measuring latency, recording metrics, and logging slow queries.
 * Rows count is inferred for arrays; otherwise defaults to 1 for single-object/unknown results.
 * Context should avoid sensitive data (no emails, raw tokens).
 */
async function execWithMetrics<T>(
  operation: string,
  table: string,
  exec: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  const start = performance.now();
  try {
    const result = await exec();
    const duration = performance.now() - start;
    const rows =
      Array.isArray(result)
        ? (result as unknown as any[]).length
        : typeof result === "number"
        ? (result as unknown as number)
        : 1;
    try { metrics.observeDbQuery(operation, table, duration, rows); } catch {}
    try {
      if (duration > config.dbSlowQueryMs) {
        const log = withSource("db");
        const payload = {
          operation,
          table,
          duration_ms: Math.round(duration),
          ...(context ?? {}),
        };
        log.warn(payload, "db slow query");
      }
    } catch {}
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    try { metrics.observeDbQuery(operation, table, duration, 0); } catch {}
    try {
      if (duration > config.dbSlowQueryMs) {
        const log = withSource("db");
        const payload = {
          operation,
          table,
          duration_ms: Math.round(duration),
          error: true,
          ...(context ?? {}),
        };
        log.warn(payload, "db slow query");
      }
    } catch {}
    throw error;
  }
}

export class PgStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const rows = await db!.select().from(schema.users).where(eq(schema.users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await db!.select().from(schema.users).where(eq(schema.users.username, username));
    return rows[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db!.select().from(schema.users);
  }

  async createUser(user: InsertUser): Promise<User> {
    const rows = await db!.insert(schema.users).values(user).returning();
    return rows[0];
  }

  // Sessions
  async createSession(session: InsertSession): Promise<Session> {
    const rows = await db!.insert(schema.sessions).values(session).returning();
    return rows[0];
  }

  async getSession(id: string): Promise<Session | undefined> {
    const rows = await db!.select().from(schema.sessions).where(eq(schema.sessions.id, id));
    const s = rows[0];
    if (!s) return undefined;
    if (s.expiresAt > new Date()) return s;
    await this.deleteSession(id);
    return undefined;
  }

  async deleteSession(id: string): Promise<void> {
    await db!.delete(schema.sessions).where(eq(schema.sessions.id, id));
  }

  async deleteExpiredSessions(): Promise<void> {
    await db!.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
  }

  // Teams
  async createTeam(team: InsertTeam): Promise<Team> {
    const rows = await db!.insert(schema.teams).values(team).returning();
    return rows[0];
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const rows = await db!.select().from(schema.teams).where(eq(schema.teams.id, id));
    return rows[0];
  }

  async getAllTeams(): Promise<Team[]> {
    return await execWithMetrics("select_all", "teams", async () => {
      return await db!.select().from(schema.teams);
    });
  }

  async getTeamsByLeague(league: string): Promise<Team[]> {
    return await execWithMetrics("select_league", "teams", async () => {
      return await db!.select().from(schema.teams).where(eq(schema.teams.league, league));
    }, { league });
  }

  // User Teams
  async createUserTeam(userTeam: InsertUserTeam): Promise<UserTeam> {
    const rows = await db!.insert(schema.userTeams).values(userTeam).returning();
    return rows[0];
  }

  async getUserTeams(userId: string): Promise<UserTeam[]> {
    return await db!.select().from(schema.userTeams).where(eq(schema.userTeams.userId, userId));
  }

  async deleteUserTeam(userId: string, teamId: string): Promise<void> {
    await db!.delete(schema.userTeams).where(and(eq(schema.userTeams.userId, userId), eq(schema.userTeams.teamId, teamId)));
  }

  async clearUserTeams(userId: string): Promise<void> {
    await db!.delete(schema.userTeams).where(eq(schema.userTeams.userId, userId));
  }

  // Summaries
  async createSummary(summary: InsertSummary): Promise<Summary> {
    const rows = await db!.insert(schema.summaries).values(summary).returning();
    return rows[0];
  }

  async getSummaryByTeamId(teamId: string): Promise<Summary | undefined> {
    const rows = await db!.select().from(schema.summaries).where(eq(schema.summaries.teamId, teamId));
    return rows[0];
  }

  async getLatestSummaryByTeamId(teamId: string): Promise<Summary | undefined> {
    const rows = await execWithMetrics("select_latest", "summaries", async () => {
      return await db!
        .select()
        .from(schema.summaries)
        .where(eq(schema.summaries.teamId, teamId))
        .orderBy(desc(schema.summaries.generatedAt));
    }, { teamId });
    return rows[0];
  }

  // Games
  async createGame(game: InsertGame): Promise<Game> {
    const rows = await execWithMetrics("insert", "games", async () => {
      return await db!.insert(schema.games).values(game).returning();
    });
    return rows[0];
  }

  async getGame(id: string): Promise<Game | undefined> {
    const rows = await execWithMetrics("select", "games", async () => {
      return await db!.select().from(schema.games).where(eq(schema.games.id, id));
    }, { id });
    return rows[0];
  }

  async getGamesByTeamId(teamId: string, limit: number = 10, startDate?: Date, endDate?: Date): Promise<Game[]> {
    // Fetch top-N recent games for both home and away paths using indexes with optional time window
    let start = performance.now();
    let whereHome: any = eq(schema.games.homeTeamId, teamId);
    if (startDate) whereHome = and(whereHome, gte(schema.games.startTime, startDate));
    if (endDate) whereHome = and(whereHome, lte(schema.games.startTime, endDate));
    const home = await execWithMetrics("select_home", "games", async () => {
      return await db!
        .select()
        .from(schema.games)
        .where(whereHome)
        .orderBy(desc(schema.games.startTime))
        .limit(limit);
    }, { teamId, limit, startDate, endDate });

    start = performance.now();
    let whereAway: any = eq(schema.games.awayTeamId, teamId);
    if (startDate) whereAway = and(whereAway, gte(schema.games.startTime, startDate));
    if (endDate) whereAway = and(whereAway, lte(schema.games.startTime, endDate));
    const away = await execWithMetrics("select_away", "games", async () => {
      return await db!
        .select()
        .from(schema.games)
        .where(whereAway)
        .orderBy(desc(schema.games.startTime))
        .limit(limit);
    }, { teamId, limit, startDate, endDate });

    // Merge, dedupe by id, and return top limit by startTime
    const seen = new Set<string>();
    const merged = [...home, ...away].filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
    merged.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    return merged.slice(0, limit);
  }

  async getGamesByTeamIds(teamIds: string[], limit: number = 10, startDate?: Date, endDate?: Date): Promise<Game[]> {
    const ids = Array.from(new Set(teamIds.map((t) => String(t))));
    if (ids.length === 0) return [];
    let baseWhere: any = or(inArray(schema.games.homeTeamId, ids), inArray(schema.games.awayTeamId, ids));
    if (startDate) baseWhere = and(baseWhere, gte(schema.games.startTime, startDate));
    if (endDate) baseWhere = and(baseWhere, lte(schema.games.startTime, endDate));
    const rows = await execWithMetrics("select_teams", "games", async () => {
      return await db!
        .select()
        .from(schema.games)
        .where(baseWhere)
        .orderBy(desc(schema.games.startTime))
        .limit(limit);
    }, { teamIds: ids, limit, startDate, endDate });
    return rows;
  }

  async deleteOldGames(_olderThan: Date): Promise<void> {
    // Implement with raw SQL once needed
  }

  // Updates
  async createUpdate(update: InsertUpdate): Promise<Update> {
    const rows = await execWithMetrics("insert", "updates", async () => {
      return await db!.insert(schema.updates).values(update).returning();
    });
    return rows[0];
  }

  async getUpdate(id: string): Promise<Update | undefined> {
    const rows = await execWithMetrics("select", "updates", async () => {
      return await db!.select().from(schema.updates).where(eq(schema.updates.id, id));
    }, { id });
    return rows[0];
  }

  async getAllUpdates(): Promise<Update[]> {
    return await execWithMetrics("select_all", "updates", async () => {
      return await db!.select().from(schema.updates);
    });
  }

  async getUpdatesByTeamId(teamId: string): Promise<Update[]> {
    return await execWithMetrics("select_team", "updates", async () => {
      return await db!.select().from(schema.updates).where(eq(schema.updates.teamId, teamId));
    }, { teamId });
  }

  async getUpdatesByTeamAndCategory(teamId: string, category: string): Promise<Update[]> {
    return await execWithMetrics("select_team_category", "updates", async () => {
      return await db!
        .select()
        .from(schema.updates)
        .where(and(eq(schema.updates.teamId, teamId), eq(schema.updates.category, category)));
    }, { teamId, category });
  }

  // Experiences
  async createExperience(experience: InsertExperience): Promise<Experience> {
    const rows = await execWithMetrics("insert", "experiences", async () => {
      return await db!.insert(schema.experiences).values(experience).returning();
    });
    return rows[0];
  }

  async getExperience(id: string): Promise<Experience | undefined> {
    const rows = await execWithMetrics("select", "experiences", async () => {
      return await db!.select().from(schema.experiences).where(eq(schema.experiences.id, id));
    }, { id });
    return rows[0];
  }

  async getAllExperiences(): Promise<Experience[]> {
    return await execWithMetrics("select_all", "experiences", async () => {
      return await db!.select().from(schema.experiences);
    });
  }

  async getExperiencesByTeamId(teamId: string): Promise<Experience[]> {
    return await execWithMetrics("select_team", "experiences", async () => {
      return await db!.select().from(schema.experiences).where(eq(schema.experiences.teamId, teamId));
    }, { teamId });
  }

  async updateExperience(id: string, experience: Partial<Experience>): Promise<Experience | undefined> {
    const rows = await execWithMetrics("update", "experiences", async () => {
      return await db!.update(schema.experiences).set(experience).where(eq(schema.experiences.id, id)).returning();
    }, { id });
    return rows[0];
  }

  async deleteExperience(id: string): Promise<void> {
    await execWithMetrics("delete", "experiences", async () => {
      await db!.delete(schema.experiences).where(eq(schema.experiences.id, id));
      return 0 as unknown as any;
    }, { id });
  }

  // RSVPs
  async createRsvp(rsvp: InsertRsvp): Promise<Rsvp> {
    const rows = await execWithMetrics("insert", "rsvps", async () => {
      return await db!.insert(schema.rsvps).values(rsvp).returning();
    });
    return rows[0];
  }

  async getRsvp(id: string): Promise<Rsvp | undefined> {
    const rows = await execWithMetrics("select", "rsvps", async () => {
      return await db!.select().from(schema.rsvps).where(eq(schema.rsvps.id, id));
    }, { id });
    return rows[0];
  }

  async getRsvpsByExperienceId(experienceId: string): Promise<Rsvp[]> {
    return await execWithMetrics("select_experience", "rsvps", async () => {
      return await db!.select().from(schema.rsvps).where(eq(schema.rsvps.experienceId, experienceId));
    }, { experienceId });
  }

  async getRsvpsByUserId(userId: string): Promise<Rsvp[]> {
    return await execWithMetrics("select_user", "rsvps", async () => {
      return await db!.select().from(schema.rsvps).where(eq(schema.rsvps.userId, userId));
    }, { userId });
  }

  async getRsvpCount(experienceId: string): Promise<number> {
    const rows = await execWithMetrics("count", "rsvps", async () => {
      return await db!.select().from(schema.rsvps).where(eq(schema.rsvps.experienceId, experienceId));
    }, { experienceId });
    return rows.length;
  }

  async deleteRsvp(experienceId: string, userId: string): Promise<void> {
    await execWithMetrics("delete", "rsvps", async () => {
      await db!.delete(schema.rsvps).where(and(eq(schema.rsvps.experienceId, experienceId), eq(schema.rsvps.userId, userId)));
      return 0 as unknown as any;
    }, { experienceId });
  }

  async hasRsvp(experienceId: string, userId: string): Promise<boolean> {
    const rows = await execWithMetrics("count_user", "rsvps", async () => {
      return await db!
        .select({ id: schema.rsvps.id })
        .from(schema.rsvps)
        .where(and(eq(schema.rsvps.experienceId, experienceId), eq(schema.rsvps.userId, userId)));
    }, { experienceId });
    return rows.length > 0;
  }

  // User Profiles
  async getUserProfile(firebaseUid: string): Promise<UserProfile | undefined> {
    const rows = await execWithMetrics("select", "user_profiles", async () => {
      return await db!.select().from(schema.userProfiles).where(eq(schema.userProfiles.firebaseUid, firebaseUid));
    }, { firebaseUid });
    return rows[0];
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const rows = await execWithMetrics("insert", "user_profiles", async () => {
      return await db!.insert(schema.userProfiles).values(profile).returning();
    });
    return rows[0];
  }

  async updateUserProfile(firebaseUid: string, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const rows = await execWithMetrics("update", "user_profiles", async () => {
      return await db!
        .update(schema.userProfiles)
        .set(profile)
        .where(eq(schema.userProfiles.firebaseUid, firebaseUid))
        .returning();
    }, { firebaseUid });
    return rows[0];
  }

  // Articles
  async createArticle(article: InsertArticle): Promise<Article> {
    const rows = await execWithMetrics("insert", "articles", async () => {
      return await db!.insert(schema.articles).values(article).returning();
    });
    return rows[0];
  }

  async getArticle(id: string): Promise<Article | undefined> {
    const rows = await execWithMetrics("select", "articles", async () => {
      return await db!.select().from(schema.articles).where(eq(schema.articles.id, id));
    }, { id });
    return rows[0];
  }

  async getArticlesByTeam(teamId: string, limit: number = 50): Promise<Article[]> {
    return await execWithMetrics("select_team", "articles", async () => {
      return await db!
        .select()
        .from(schema.articles)
        .where(and(eq(schema.articles.teamId, teamId), eq(schema.articles.isDeleted, false)))
        .orderBy(desc(schema.articles.publishedAt))
        .limit(limit);
    }, { teamId, limit });
  }

  async getArticlesByTeamAndCategory(teamId: string, category: string, limit: number = 50): Promise<Article[]> {
    return await execWithMetrics("select_team_category", "articles", async () => {
      return await db!
        .select()
        .from(schema.articles)
        .where(and(
          eq(schema.articles.teamId, teamId),
          eq(schema.articles.category, category),
          eq(schema.articles.isDeleted, false)
        ))
        .orderBy(desc(schema.articles.publishedAt))
        .limit(limit);
    }, { teamId, category, limit });
  }

  async getArticleBySourceUrl(sourceUrl: string): Promise<Article | undefined> {
    const rows = await execWithMetrics("select_source", "articles", async () => {
      return await db!
        .select()
        .from(schema.articles)
        .where(eq(schema.articles.sourceUrl, sourceUrl));
    }, { /* omit raw URL in logs */ });
    return rows[0];
  }

  async getRecentArticles(teamId: string, days: number): Promise<Article[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return await execWithMetrics("select_recent", "articles", async () => {
      return await db!
        .select()
        .from(schema.articles)
        .where(and(
          eq(schema.articles.teamId, teamId),
          sql`${schema.articles.publishedAt} >= ${cutoffDate}`,
          eq(schema.articles.isDeleted, false)
        ))
        .orderBy(desc(schema.articles.publishedAt));
    }, { teamId, days });
  }

  async updateArticle(id: string, article: Partial<Article>): Promise<Article | undefined> {
    const rows = await execWithMetrics("update", "articles", async () => {
      return await db!
        .update(schema.articles)
        .set(article)
        .where(eq(schema.articles.id, id))
        .returning();
    }, { id });
    return rows[0];
  }

  async deleteArticle(id: string): Promise<void> {
    // Soft delete
    await execWithMetrics("soft_delete", "articles", async () => {
      await db!
        .update(schema.articles)
        .set({ isDeleted: true })
        .where(eq(schema.articles.id, id));
      return 0 as unknown as any;
    }, { id });
  }

  async getUnprocessedArticles(limit: number = 100): Promise<Article[]> {
    return await execWithMetrics("select_unprocessed", "articles", async () => {
      return await db!
        .select()
        .from(schema.articles)
        .where(and(
          eq(schema.articles.isProcessed, false),
          eq(schema.articles.isDeleted, false)
        ))
        .orderBy(desc(schema.articles.scrapedAt))
        .limit(limit);
    }, { limit });
  }

  // BM25 Indexes
  async getBM25IndexByTeam(teamId: string): Promise<BM25Index | undefined> {
    const rows = await execWithMetrics("select_team", "bm25_indexes", async () => {
      return await db!
        .select()
        .from(schema.bm25Indexes)
        .where(eq(schema.bm25Indexes.teamId, teamId));
    }, { teamId });
    return rows[0];
  }

  async createBM25Index(index: InsertBM25Index): Promise<BM25Index> {
    const rows = await execWithMetrics("insert", "bm25_indexes", async () => {
      return await db!.insert(schema.bm25Indexes).values(index).returning();
    });
    return rows[0];
  }

  async updateBM25IndexStats(teamId: string, stats: Partial<BM25Index>): Promise<BM25Index | undefined> {
    // Update updatedAt timestamp
    const updateData = { ...stats, updatedAt: new Date() };
    
    const rows = await execWithMetrics("update", "bm25_indexes", async () => {
      return await db!
        .update(schema.bm25Indexes)
        .set(updateData)
        .where(eq(schema.bm25Indexes.teamId, teamId))
        .returning();
    }, { teamId });
    
    return rows[0];
  }

  // News Sources
  async createNewsSource(source: InsertNewsSource): Promise<NewsSource> {
    const rows = await execWithMetrics("insert", "news_sources", async () => {
      return await db!.insert(schema.newsSources).values(source).returning();
    });
    return rows[0];
  }

  async getNewsSource(id: string): Promise<NewsSource | undefined> {
    const rows = await execWithMetrics("select", "news_sources", async () => {
      return await db!
        .select()
        .from(schema.newsSources)
        .where(eq(schema.newsSources.id, id));
    }, { id });
    return rows[0];
  }

  async getNewsSourceByName(name: string): Promise<NewsSource | undefined> {
    const rows = await execWithMetrics("select_name", "news_sources", async () => {
      return await db!
        .select()
        .from(schema.newsSources)
        .where(eq(schema.newsSources.name, name));
    }, { /* omit raw name */ });
    return rows[0];
  }

  async getAllNewsSources(): Promise<NewsSource[]> {
    return await execWithMetrics("select_all", "news_sources", async () => {
      return await db!.select().from(schema.newsSources);
    });
  }

  async getActiveNewsSources(): Promise<NewsSource[]> {
    return await execWithMetrics("select_active", "news_sources", async () => {
      return await db!
        .select()
        .from(schema.newsSources)
        .where(eq(schema.newsSources.isActive, true));
    });
  }

  async updateNewsSource(id: string, source: Partial<NewsSource>): Promise<NewsSource | undefined> {
    const updateData = { ...source, updatedAt: new Date() };
    
    const rows = await execWithMetrics("update", "news_sources", async () => {
      return await db!
        .update(schema.newsSources)
        .set(updateData)
        .where(eq(schema.newsSources.id, id))
        .returning();
    }, { id });
    
    return rows[0];
  }

  // Article Classifications
  async createArticleClassification(classification: InsertArticleClassification): Promise<ArticleClassification> {
    const rows = await execWithMetrics("insert", "article_classifications", async () => {
      return await db!.insert(schema.articleClassifications).values(classification).returning();
    });
    return rows[0];
  }

  async getArticleClassification(id: string): Promise<ArticleClassification | undefined> {
    const rows = await execWithMetrics("select", "article_classifications", async () => {
      return await db!
        .select()
        .from(schema.articleClassifications)
        .where(eq(schema.articleClassifications.id, id));
    }, { id });
    return rows[0];
  }

  async getClassificationsByArticle(articleId: string): Promise<ArticleClassification[]> {
    return await execWithMetrics("select_article", "article_classifications", async () => {
      return await db!
        .select()
        .from(schema.articleClassifications)
        .where(eq(schema.articleClassifications.articleId, articleId))
        .orderBy(desc(schema.articleClassifications.classifiedAt));
    }, { articleId });
  }

  async deleteArticleClassification(id: string): Promise<void> {
    await execWithMetrics("delete", "article_classifications", async () => {
      await db!.delete(schema.articleClassifications).where(eq(schema.articleClassifications.id, id));
      return 0 as unknown as any;
    }, { id });
  }
}
