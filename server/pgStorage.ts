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
import { eq, and, lt, desc, sql } from "drizzle-orm";

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
    return await db!.select().from(schema.teams);
  }

  async getTeamsByLeague(league: string): Promise<Team[]> {
    return await db!.select().from(schema.teams).where(eq(schema.teams.league, league));
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
    const rows = await db!
      .select()
      .from(schema.summaries)
      .where(eq(schema.summaries.teamId, teamId))
      .orderBy(desc(schema.summaries.generatedAt));
    return rows[0];
  }

  // Games
  async createGame(game: InsertGame): Promise<Game> {
    const rows = await db!.insert(schema.games).values(game).returning();
    return rows[0];
  }

  async getGame(id: string): Promise<Game | undefined> {
    const rows = await db!.select().from(schema.games).where(eq(schema.games.id, id));
    return rows[0];
  }

  async getGamesByTeamId(teamId: string, limit: number = 10): Promise<Game[]> {
    // teamId match if home or away
    const rows = await db!
      .select()
      .from(schema.games)
      .where(and(eq(schema.games.homeTeamId, teamId))) as any;
    const rows2 = await db!
      .select()
      .from(schema.games)
      .where(and(eq(schema.games.awayTeamId, teamId))) as any;
    const combined = [...rows, ...rows2].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    return combined.slice(0, limit);
  }

  async deleteOldGames(_olderThan: Date): Promise<void> {
    // Implement with raw SQL once needed
  }

  // Updates
  async createUpdate(update: InsertUpdate): Promise<Update> {
    const rows = await db!.insert(schema.updates).values(update).returning();
    return rows[0];
  }

  async getUpdate(id: string): Promise<Update | undefined> {
    const rows = await db!.select().from(schema.updates).where(eq(schema.updates.id, id));
    return rows[0];
  }

  async getAllUpdates(): Promise<Update[]> {
    return await db!.select().from(schema.updates);
  }

  async getUpdatesByTeamId(teamId: string): Promise<Update[]> {
    return await db!.select().from(schema.updates).where(eq(schema.updates.teamId, teamId));
  }

  async getUpdatesByTeamAndCategory(teamId: string, category: string): Promise<Update[]> {
    return await db!
      .select()
      .from(schema.updates)
      .where(and(eq(schema.updates.teamId, teamId), eq(schema.updates.category, category)));
  }

  // Experiences
  async createExperience(experience: InsertExperience): Promise<Experience> {
    const rows = await db!.insert(schema.experiences).values(experience).returning();
    return rows[0];
  }

  async getExperience(id: string): Promise<Experience | undefined> {
    const rows = await db!.select().from(schema.experiences).where(eq(schema.experiences.id, id));
    return rows[0];
  }

  async getAllExperiences(): Promise<Experience[]> {
    return await db!.select().from(schema.experiences);
  }

  async getExperiencesByTeamId(teamId: string): Promise<Experience[]> {
    return await db!.select().from(schema.experiences).where(eq(schema.experiences.teamId, teamId));
  }

  async updateExperience(id: string, experience: Partial<Experience>): Promise<Experience | undefined> {
    const rows = await db!.update(schema.experiences).set(experience).where(eq(schema.experiences.id, id)).returning();
    return rows[0];
  }

  async deleteExperience(id: string): Promise<void> {
    await db!.delete(schema.experiences).where(eq(schema.experiences.id, id));
  }

  // RSVPs
  async createRsvp(rsvp: InsertRsvp): Promise<Rsvp> {
    const rows = await db!.insert(schema.rsvps).values(rsvp).returning();
    return rows[0];
  }

  async getRsvp(id: string): Promise<Rsvp | undefined> {
    const rows = await db!.select().from(schema.rsvps).where(eq(schema.rsvps.id, id));
    return rows[0];
  }

  async getRsvpsByExperienceId(experienceId: string): Promise<Rsvp[]> {
    return await db!.select().from(schema.rsvps).where(eq(schema.rsvps.experienceId, experienceId));
  }

  async getRsvpsByUserId(userId: string): Promise<Rsvp[]> {
    return await db!.select().from(schema.rsvps).where(eq(schema.rsvps.userId, userId));
  }

  async getRsvpCount(experienceId: string): Promise<number> {
    const rows = await db!.select().from(schema.rsvps).where(eq(schema.rsvps.experienceId, experienceId));
    return rows.length;
  }

  async deleteRsvp(experienceId: string, userId: string): Promise<void> {
    await db!.delete(schema.rsvps).where(and(eq(schema.rsvps.experienceId, experienceId), eq(schema.rsvps.userId, userId)));
  }

  async hasRsvp(experienceId: string, userId: string): Promise<boolean> {
    const rows = await db!
      .select({ id: schema.rsvps.id })
      .from(schema.rsvps)
      .where(and(eq(schema.rsvps.experienceId, experienceId), eq(schema.rsvps.userId, userId)));
    return rows.length > 0;
  }

  // User Profiles
  async getUserProfile(firebaseUid: string): Promise<UserProfile | undefined> {
    const rows = await db!.select().from(schema.userProfiles).where(eq(schema.userProfiles.firebaseUid, firebaseUid));
    return rows[0];
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const rows = await db!.insert(schema.userProfiles).values(profile).returning();
    return rows[0];
  }

  async updateUserProfile(firebaseUid: string, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined> {
    const rows = await db!
      .update(schema.userProfiles)
      .set(profile)
      .where(eq(schema.userProfiles.firebaseUid, firebaseUid))
      .returning();
    return rows[0];
  }

  // Articles
  async createArticle(article: InsertArticle): Promise<Article> {
    const rows = await db!.insert(schema.articles).values(article).returning();
    return rows[0];
  }

  async getArticle(id: string): Promise<Article | undefined> {
    const rows = await db!.select().from(schema.articles).where(eq(schema.articles.id, id));
    return rows[0];
  }

  async getArticlesByTeam(teamId: string, limit: number = 50): Promise<Article[]> {
    return await db!
      .select()
      .from(schema.articles)
      .where(and(eq(schema.articles.teamId, teamId), eq(schema.articles.isDeleted, false)))
      .orderBy(desc(schema.articles.publishedAt))
      .limit(limit);
  }

  async getArticlesByTeamAndCategory(teamId: string, category: string, limit: number = 50): Promise<Article[]> {
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
  }

  async getArticleBySourceUrl(sourceUrl: string): Promise<Article | undefined> {
    const rows = await db!
      .select()
      .from(schema.articles)
      .where(eq(schema.articles.sourceUrl, sourceUrl));
    return rows[0];
  }

  async getRecentArticles(teamId: string, days: number): Promise<Article[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return await db!
      .select()
      .from(schema.articles)
      .where(and(
        eq(schema.articles.teamId, teamId),
        sql`${schema.articles.publishedAt} >= ${cutoffDate}`,
        eq(schema.articles.isDeleted, false)
      ))
      .orderBy(desc(schema.articles.publishedAt));
  }

  async updateArticle(id: string, article: Partial<Article>): Promise<Article | undefined> {
    const rows = await db!
      .update(schema.articles)
      .set(article)
      .where(eq(schema.articles.id, id))
      .returning();
    return rows[0];
  }

  async deleteArticle(id: string): Promise<void> {
    // Soft delete
    await db!
      .update(schema.articles)
      .set({ isDeleted: true })
      .where(eq(schema.articles.id, id));
  }

  async getUnprocessedArticles(limit: number = 100): Promise<Article[]> {
    return await db!
      .select()
      .from(schema.articles)
      .where(and(
        eq(schema.articles.isProcessed, false),
        eq(schema.articles.isDeleted, false)
      ))
      .orderBy(desc(schema.articles.scrapedAt))
      .limit(limit);
  }

  // BM25 Indexes
  async getBM25IndexByTeam(teamId: string): Promise<BM25Index | undefined> {
    const rows = await db!
      .select()
      .from(schema.bm25Indexes)
      .where(eq(schema.bm25Indexes.teamId, teamId));
    return rows[0];
  }

  async createBM25Index(index: InsertBM25Index): Promise<BM25Index> {
    const rows = await db!.insert(schema.bm25Indexes).values(index).returning();
    return rows[0];
  }

  async updateBM25IndexStats(teamId: string, stats: Partial<BM25Index>): Promise<BM25Index | undefined> {
    // Update updatedAt timestamp
    const updateData = { ...stats, updatedAt: new Date() };
    
    const rows = await db!
      .update(schema.bm25Indexes)
      .set(updateData)
      .where(eq(schema.bm25Indexes.teamId, teamId))
      .returning();
    
    return rows[0];
  }

  // News Sources
  async createNewsSource(source: InsertNewsSource): Promise<NewsSource> {
    const rows = await db!.insert(schema.newsSources).values(source).returning();
    return rows[0];
  }

  async getNewsSource(id: string): Promise<NewsSource | undefined> {
    const rows = await db!
      .select()
      .from(schema.newsSources)
      .where(eq(schema.newsSources.id, id));
    return rows[0];
  }

  async getNewsSourceByName(name: string): Promise<NewsSource | undefined> {
    const rows = await db!
      .select()
      .from(schema.newsSources)
      .where(eq(schema.newsSources.name, name));
    return rows[0];
  }

  async getAllNewsSources(): Promise<NewsSource[]> {
    return await db!.select().from(schema.newsSources);
  }

  async getActiveNewsSources(): Promise<NewsSource[]> {
    return await db!
      .select()
      .from(schema.newsSources)
      .where(eq(schema.newsSources.isActive, true));
  }

  async updateNewsSource(id: string, source: Partial<NewsSource>): Promise<NewsSource | undefined> {
    const updateData = { ...source, updatedAt: new Date() };
    
    const rows = await db!
      .update(schema.newsSources)
      .set(updateData)
      .where(eq(schema.newsSources.id, id))
      .returning();
    
    return rows[0];
  }

  // Article Classifications
  async createArticleClassification(classification: InsertArticleClassification): Promise<ArticleClassification> {
    const rows = await db!.insert(schema.articleClassifications).values(classification).returning();
    return rows[0];
  }

  async getArticleClassification(id: string): Promise<ArticleClassification | undefined> {
    const rows = await db!
      .select()
      .from(schema.articleClassifications)
      .where(eq(schema.articleClassifications.id, id));
    return rows[0];
  }

  async getClassificationsByArticle(articleId: string): Promise<ArticleClassification[]> {
    return await db!
      .select()
      .from(schema.articleClassifications)
      .where(eq(schema.articleClassifications.articleId, articleId))
      .orderBy(desc(schema.articleClassifications.classifiedAt));
  }

  async deleteArticleClassification(id: string): Promise<void> {
    await db!.delete(schema.articleClassifications).where(eq(schema.articleClassifications.id, id));
  }
}
