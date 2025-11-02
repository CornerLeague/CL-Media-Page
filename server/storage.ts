import {
  type User,
  type InsertUser,
  type Session,
  type InsertSession,
  type Team,
  type InsertTeam,
  type UserTeam,
  type InsertUserTeam,
  type Summary,
  type InsertSummary,
  type Game,
  type InsertGame,
  type Update,
  type InsertUpdate,
  type Experience,
  type InsertExperience,
  type Rsvp,
  type InsertRsvp,
  type UserProfile,
  type InsertUserProfile,
  type Article,
  type InsertArticle,
  type BM25Index,
  type InsertBM25Index,
  type NewsSource,
  type InsertNewsSource,
  type ArticleClassification,
  type InsertArticleClassification,
  type GameScoreData,
} from "../shared/schema";
import { randomUUID } from "crypto";
import { PgStorage } from "./pgStorage";
import { config } from "./config";
import { db } from "./db";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Sessions
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;

  // Teams
  createTeam(team: InsertTeam): Promise<Team>;
  getTeam(id: string): Promise<Team | undefined>;
  getAllTeams(): Promise<Team[]>;
  getTeamsByLeague(league: string): Promise<Team[]>;

  // User Teams
  createUserTeam(userTeam: InsertUserTeam): Promise<UserTeam>;
  getUserTeams(userId: string): Promise<UserTeam[]>;
  deleteUserTeam(userId: string, teamId: string): Promise<void>;
  clearUserTeams(userId: string): Promise<void>;

  // Summaries
  createSummary(summary: InsertSummary): Promise<Summary>;
  getSummaryByTeamId(teamId: string): Promise<Summary | undefined>;
  getLatestSummaryByTeamId(teamId: string): Promise<Summary | undefined>;

  // Games (cached)
  createGame(game: InsertGame): Promise<Game>;
  getGame(id: string): Promise<Game | undefined>;
  getGamesByTeamId(teamId: string, limit?: number, startDate?: Date, endDate?: Date): Promise<Game[]>;
  getGamesByTeamIds(teamIds: string[], limit?: number, startDate?: Date, endDate?: Date): Promise<Game[]>;
  getLatestTeamScore(teamId: string): Promise<GameScoreData | undefined>;
  hasScoreChanged(gameId: string, homePts: number, awayPts: number): Promise<boolean>;
  deleteOldGames(olderThan: Date): Promise<void>;

  // Updates
  createUpdate(update: InsertUpdate): Promise<Update>;
  getUpdate(id: string): Promise<Update | undefined>;
  getAllUpdates(): Promise<Update[]>;
  getUpdatesByTeamId(teamId: string): Promise<Update[]>;
  getUpdatesByTeamAndCategory(
    teamId: string,
    category: string,
  ): Promise<Update[]>;

  // Experiences
  createExperience(experience: InsertExperience): Promise<Experience>;
  getExperience(id: string): Promise<Experience | undefined>;
  getAllExperiences(): Promise<Experience[]>;
  getExperiencesByTeamId(teamId: string): Promise<Experience[]>;
  updateExperience(id: string, experience: Partial<Experience>): Promise<Experience | undefined>;
  deleteExperience(id: string): Promise<void>;

  // RSVPs
  createRsvp(rsvp: InsertRsvp): Promise<Rsvp>;
  getRsvp(id: string): Promise<Rsvp | undefined>;
  getRsvpsByExperienceId(experienceId: string): Promise<Rsvp[]>;
  getRsvpsByUserId(userId: string): Promise<Rsvp[]>;
  getRsvpCount(experienceId: string): Promise<number>;
  deleteRsvp(experienceId: string, userId: string): Promise<void>;
  hasRsvp(experienceId: string, userId: string): Promise<boolean>;

  // User Profiles
  getUserProfile(firebaseUid: string): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(firebaseUid: string, profile: Partial<InsertUserProfile>): Promise<UserProfile | undefined>;
  getUserFavoriteTeamBySport(firebaseUid: string, sport: string): Promise<{ teamId: string; sport: string }[]>;

  // Articles
  createArticle(article: InsertArticle): Promise<Article>;
  getArticle(id: string): Promise<Article | undefined>;
  getArticlesByTeam(teamId: string, limit?: number): Promise<Article[]>;
  getArticlesByTeamAndCategory(teamId: string, category: string, limit?: number): Promise<Article[]>;
  getArticleBySourceUrl(sourceUrl: string): Promise<Article | undefined>;
  getRecentArticles(teamId: string, days: number): Promise<Article[]>;
  updateArticle(id: string, article: Partial<Article>): Promise<Article | undefined>;
  deleteArticle(id: string): Promise<void>;
  getUnprocessedArticles(limit?: number): Promise<Article[]>;

  // BM25 Indexes
  getBM25IndexByTeam(teamId: string): Promise<BM25Index | undefined>;
  createBM25Index(index: InsertBM25Index): Promise<BM25Index>;
  updateBM25IndexStats(teamId: string, stats: Partial<BM25Index>): Promise<BM25Index | undefined>;

  // News Sources
  createNewsSource(source: InsertNewsSource): Promise<NewsSource>;
  getNewsSource(id: string): Promise<NewsSource | undefined>;
  getNewsSourceByName(name: string): Promise<NewsSource | undefined>;
  getAllNewsSources(): Promise<NewsSource[]>;
  getActiveNewsSources(): Promise<NewsSource[]>;
  updateNewsSource(id: string, source: Partial<NewsSource>): Promise<NewsSource | undefined>;

  // Article Classifications
  createArticleClassification(classification: InsertArticleClassification): Promise<ArticleClassification>;
  getArticleClassification(id: string): Promise<ArticleClassification | undefined>;
  getClassificationsByArticle(articleId: string): Promise<ArticleClassification[]>;
  deleteArticleClassification(id: string): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private sessions: Map<string, Session>;
  private teams: Map<string, Team>;
  private userTeams: Map<string, UserTeam>;
  private summaries: Map<string, Summary>;
  private games: Map<string, Game>;
  private updates: Map<string, Update>;
  private experiences: Map<string, Experience>;
  private rsvps: Map<string, Rsvp>;
  private userProfiles: Map<string, UserProfile>;
  private articles: Map<string, Article>;
  private bm25Indexes: Map<string, BM25Index>;
  private newsSources: Map<string, NewsSource>;
  private articleClassifications: Map<string, ArticleClassification>;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.teams = new Map();
    this.userTeams = new Map();
    this.summaries = new Map();
    this.games = new Map();
    this.updates = new Map();
    this.experiences = new Map();
    this.rsvps = new Map();
    this.userProfiles = new Map();
    this.articles = new Map();
    this.bm25Indexes = new Map();
    this.newsSources = new Map();
    this.articleClassifications = new Map();
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Sessions
  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = { id, ...insertSession };
    this.sessions.set(id, session);
    return session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const session = this.sessions.get(id);
    if (session && session.expiresAt > new Date()) {
      return session;
    }
    if (session) {
      this.sessions.delete(id);
    }
    return undefined;
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteExpiredSessions(): Promise<void> {
    const now = new Date();
    for (const [id, session] of Array.from(this.sessions.entries())) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }
  }

  // Teams
  async createTeam(team: InsertTeam): Promise<Team> {
    this.teams.set(team.id, team);
    return team;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async getAllTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async getTeamsByLeague(league: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(
      (team) => team.league === league,
    );
  }

  // User Teams
  async createUserTeam(insertUserTeam: InsertUserTeam): Promise<UserTeam> {
    const id = randomUUID();
    const userTeam: UserTeam = { id, ...insertUserTeam };
    this.userTeams.set(id, userTeam);
    return userTeam;
  }

  async getUserTeams(userId: string): Promise<UserTeam[]> {
    return Array.from(this.userTeams.values()).filter(
      (ut) => ut.userId === userId,
    );
  }

  async deleteUserTeam(userId: string, teamId: string): Promise<void> {
    for (const [id, userTeam] of Array.from(this.userTeams.entries())) {
      if (userTeam.userId === userId && userTeam.teamId === teamId) {
        this.userTeams.delete(id);
        return;
      }
    }
  }

  async clearUserTeams(userId: string): Promise<void> {
    for (const [id, userTeam] of Array.from(this.userTeams.entries())) {
      if (userTeam.userId === userId) {
        this.userTeams.delete(id);
      }
    }
  }

  // Summaries
  async createSummary(insertSummary: InsertSummary): Promise<Summary> {
    const id = randomUUID();
    const summary: Summary = {
      id,
      ...insertSummary,
      model: insertSummary.model ?? null,
      generatedAt: new Date(),
    };
    this.summaries.set(id, summary);
    return summary;
  }

  async getSummaryByTeamId(teamId: string): Promise<Summary | undefined> {
    return Array.from(this.summaries.values()).find(
      (s) => s.teamId === teamId,
    );
  }

  async getLatestSummaryByTeamId(teamId: string): Promise<Summary | undefined> {
    const teamSummaries = Array.from(this.summaries.values())
      .filter((s) => s.teamId === teamId)
      .sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
    return teamSummaries[0];
  }

  // Games
  async createGame(game: InsertGame): Promise<Game> {
    const gameWithCache: Game = {
      ...game,
      period: game.period ?? null,
      timeRemaining: game.timeRemaining ?? null,
      cachedAt: new Date(),
    };
    this.games.set(game.id, gameWithCache);
    return gameWithCache;
  }

  async getGame(id: string): Promise<Game | undefined> {
    return this.games.get(id);
  }

  async getGamesByTeamId(teamId: string, limit: number = 10, startDate?: Date, endDate?: Date): Promise<Game[]> {
    let items = Array.from(this.games.values())
      .filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId);
    if (startDate) items = items.filter((g) => g.startTime >= startDate);
    if (endDate) items = items.filter((g) => g.startTime <= endDate);
    return items
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  async getGamesByTeamIds(teamIds: string[], limit: number = 10, startDate?: Date, endDate?: Date): Promise<Game[]> {
    const teamSet = new Set((teamIds || []).map((t) => String(t)));
    let items = Array.from(this.games.values())
      .filter((g) => teamSet.size === 0 || teamSet.has(g.homeTeamId) || teamSet.has(g.awayTeamId));
    if (startDate) items = items.filter((g) => g.startTime >= startDate);
    if (endDate) items = items.filter((g) => g.startTime <= endDate);
    // Deduplicate by id in case of duplicates
    const seen = new Set<string>();
    items = items.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
    return items
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  async deleteOldGames(olderThan: Date): Promise<void> {
    for (const [id, game] of Array.from(this.games.entries())) {
      if (game.cachedAt < olderThan) {
        this.games.delete(id);
      }
    }
  }

  async getLatestTeamScore(teamId: string): Promise<GameScoreData | undefined> {
    try {
      // Input validation
      if (!teamId || typeof teamId !== 'string') {
        console.warn('[MemStorage] getLatestTeamScore: Invalid teamId provided');
        return undefined;
      }

      console.debug(`[MemStorage] Fetching latest team score for teamId: ${teamId}`);

      // Find the latest game for the team
      const teamGames = Array.from(this.games.values())
        .filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

      if (teamGames.length === 0) {
        console.debug(`[MemStorage] No games found for teamId: ${teamId}`);
        return undefined;
      }

      const latestGame = teamGames[0];
      
      // Get team information
      const homeTeam = this.teams.get(latestGame.homeTeamId);
      const awayTeam = this.teams.get(latestGame.awayTeamId);

      if (!homeTeam || !awayTeam) {
        console.warn(`[MemStorage] Missing team data for game ${latestGame.id}: homeTeam=${!!homeTeam}, awayTeam=${!!awayTeam}`);
        return undefined;
      }

      const isHomeGame = latestGame.homeTeamId === teamId;
      const opponent = isHomeGame ? awayTeam : homeTeam;
      const teamScore = isHomeGame ? latestGame.homePts : latestGame.awayPts;

      const result = {
        gameId: latestGame.id,
        homeTeam: {
          id: homeTeam.id,
          name: homeTeam.name,
          code: homeTeam.code,
          league: homeTeam.league,
          score: latestGame.homePts,
        },
        awayTeam: {
          id: awayTeam.id,
          name: awayTeam.name,
          code: awayTeam.code,
          league: awayTeam.league,
          score: latestGame.awayPts,
        },
        status: latestGame.status,
        period: latestGame.period,
        timeRemaining: latestGame.timeRemaining,
        startTime: latestGame.startTime,
        isHomeGame,
        opponent: {
          id: opponent.id,
          name: opponent.name,
          code: opponent.code,
          league: opponent.league,
          score: isHomeGame ? latestGame.awayPts : latestGame.homePts,
        },
        teamScore,
        cachedAt: latestGame.cachedAt,
      };

      console.debug(`[MemStorage] Successfully retrieved latest team score for teamId: ${teamId}, gameId: ${latestGame.id}`);
      return result;
    } catch (error) {
      console.error(`[MemStorage] Error fetching latest team score for teamId ${teamId}:`, error);
      throw error;
    }
  }

  async hasScoreChanged(gameId: string, homePts: number, awayPts: number): Promise<boolean> {
    try {
      // Input validation
      if (!gameId || typeof gameId !== 'string') {
        console.warn('[MemStorage] hasScoreChanged: Invalid gameId provided');
        throw new Error("Invalid gameId: must be a non-empty string");
      }

      if (typeof homePts !== 'number' || typeof awayPts !== 'number') {
        console.warn('[MemStorage] hasScoreChanged: Invalid score values provided');
        throw new Error("Invalid scores: homePts and awayPts must be numbers");
      }

      console.debug(`[MemStorage] Checking score change for gameId: ${gameId}, homePts: ${homePts}, awayPts: ${awayPts}`);

      // Get the current game from storage
      const currentGame = this.games.get(gameId);
      
      if (!currentGame) {
        console.debug(`[MemStorage] Game not found for gameId: ${gameId}, treating as score changed`);
        return true; // If game doesn't exist, consider it a change
      }

      // Compare the scores
      const hasChanged = currentGame.homePts !== homePts || currentGame.awayPts !== awayPts;
      
      console.debug(`[MemStorage] Score comparison for gameId ${gameId}: current(${currentGame.homePts}-${currentGame.awayPts}) vs new(${homePts}-${awayPts}), changed: ${hasChanged}`);
      
      return hasChanged;
    } catch (error) {
      console.error(`[MemStorage] Error checking score change for gameId ${gameId}:`, error);
      throw error;
    }
  }

  // Updates
  async createUpdate(insertUpdate: InsertUpdate): Promise<Update> {
    const id = randomUUID();
    const update: Update = {
      id,
      ...insertUpdate,
      description: insertUpdate.description ?? null,
      source: insertUpdate.source ?? null,
      timestamp: new Date(),
    };
    this.updates.set(id, update);
    return update;
  }

  async getUpdate(id: string): Promise<Update | undefined> {
    return this.updates.get(id);
  }

  async getAllUpdates(): Promise<Update[]> {
    return Array.from(this.updates.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  async getUpdatesByTeamId(teamId: string): Promise<Update[]> {
    return Array.from(this.updates.values())
      .filter((u) => u.teamId === teamId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getUpdatesByTeamAndCategory(
    teamId: string,
    category: string,
  ): Promise<Update[]> {
    return Array.from(this.updates.values())
      .filter((u) => u.teamId === teamId && u.category === category)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Experiences
  async createExperience(
    insertExperience: InsertExperience,
  ): Promise<Experience> {
    const id = randomUUID();
    const experience: Experience = {
      id,
      ...insertExperience,
      description: insertExperience.description ?? null,
      location: insertExperience.location ?? null,
      createdBy: insertExperience.createdBy ?? null,
      createdAt: new Date(),
    };
    this.experiences.set(id, experience);
    return experience;
  }

  async getExperience(id: string): Promise<Experience | undefined> {
    return this.experiences.get(id);
  }

  async getAllExperiences(): Promise<Experience[]> {
    return Array.from(this.experiences.values()).sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
  }

  async getExperiencesByTeamId(teamId: string): Promise<Experience[]> {
    return Array.from(this.experiences.values())
      .filter((e) => e.teamId === teamId)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  async updateExperience(
    id: string,
    updates: Partial<Experience>,
  ): Promise<Experience | undefined> {
    const experience = this.experiences.get(id);
    if (!experience) return undefined;

    const updated = { ...experience, ...updates, id };
    this.experiences.set(id, updated);
    return updated;
  }

  async deleteExperience(id: string): Promise<void> {
    this.experiences.delete(id);
    // Also delete all RSVPs for this experience
    for (const [rsvpId, rsvp] of Array.from(this.rsvps.entries())) {
      if (rsvp.experienceId === id) {
        this.rsvps.delete(rsvpId);
      }
    }
  }

  // RSVPs
  async createRsvp(insertRsvp: InsertRsvp): Promise<Rsvp> {
    const id = randomUUID();
    const rsvp: Rsvp = {
      id,
      ...insertRsvp,
      createdAt: new Date(),
    };
    this.rsvps.set(id, rsvp);
    return rsvp;
  }

  async getRsvp(id: string): Promise<Rsvp | undefined> {
    return this.rsvps.get(id);
  }

  async getRsvpsByExperienceId(experienceId: string): Promise<Rsvp[]> {
    return Array.from(this.rsvps.values()).filter(
      (r) => r.experienceId === experienceId,
    );
  }

  async getRsvpsByUserId(userId: string): Promise<Rsvp[]> {
    return Array.from(this.rsvps.values()).filter((r) => r.userId === userId);
  }

  async getRsvpCount(experienceId: string): Promise<number> {
    return Array.from(this.rsvps.values()).filter(
      (r) => r.experienceId === experienceId,
    ).length;
  }

  async deleteRsvp(experienceId: string, userId: string): Promise<void> {
    for (const [id, rsvp] of Array.from(this.rsvps.entries())) {
      if (rsvp.experienceId === experienceId && rsvp.userId === userId) {
        this.rsvps.delete(id);
        return;
      }
    }
  }

  async hasRsvp(experienceId: string, userId: string): Promise<boolean> {
    return Array.from(this.rsvps.values()).some(
      (r) => r.experienceId === experienceId && r.userId === userId,
    );
  }

  // User Profiles
  async getUserProfile(firebaseUid: string): Promise<UserProfile | undefined> {
    return this.userProfiles.get(firebaseUid);
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const userProfile: UserProfile = {
      firebaseUid: profile.firebaseUid,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      favoriteSports: profile.favoriteSports ?? null,
      favoriteTeams: profile.favoriteTeams ?? null,
      onboardingCompleted: profile.onboardingCompleted ?? false,
    };
    this.userProfiles.set(profile.firebaseUid, userProfile);
    return userProfile;
  }

  async updateUserProfile(
    firebaseUid: string,
    profile: Partial<InsertUserProfile>,
  ): Promise<UserProfile | undefined> {
    const existingProfile = this.userProfiles.get(firebaseUid);
    if (!existingProfile) return undefined;

    const updatedProfile: UserProfile = {
      ...existingProfile,
      ...profile,
      firebaseUid,
    };
    this.userProfiles.set(firebaseUid, updatedProfile);
    return updatedProfile;
  }

  async getUserFavoriteTeamBySport(
    firebaseUid: string,
    sport: string,
  ): Promise<{ teamId: string; sport: string }[]> {
    const profile = this.userProfiles.get(firebaseUid);
    if (!profile || !profile.favoriteTeams) {
      return [];
    }

    const favoriteTeams: { teamId: string; sport: string }[] = [];
    
    for (const teamId of profile.favoriteTeams) {
      const team = this.teams.get(teamId);
      if (team) {
        // Map league to sport (similar to ScoresAgent implementation)
        let teamSport: string;
        switch (team.league) {
          case 'NFL':
            teamSport = 'football';
            break;
          case 'NBA':
            teamSport = 'basketball';
            break;
          case 'MLB':
            teamSport = 'baseball';
            break;
          case 'NHL':
            teamSport = 'hockey';
            break;
          case 'MLS':
            teamSport = 'soccer';
            break;
          default:
            teamSport = team.league.toLowerCase();
        }

        if (teamSport.toLowerCase() === sport.toLowerCase()) {
          favoriteTeams.push({ teamId, sport });
        }
      }
    }

    return favoriteTeams;
  }

  // Articles
  async createArticle(article: InsertArticle): Promise<Article> {
    const id = randomUUID();
    const newArticle: Article = {
      id,
      ...article,
      summary: article.summary ?? null,
      author: article.author ?? null,
      scrapedAt: new Date(),
      category: article.category ?? null,
      confidence: article.confidence ?? null,
      wordCount: article.wordCount ?? null,
      termFrequencies: article.termFrequencies ?? null,
      contentHash: article.contentHash ?? null,
      minHash: article.minHash ?? null,
      relevanceScore: article.relevanceScore ?? null,
      isProcessed: article.isProcessed ?? false,
      isDeleted: article.isDeleted ?? false,
    };
    this.articles.set(id, newArticle);
    return newArticle;
  }

  async getArticle(id: string): Promise<Article | undefined> {
    return this.articles.get(id);
  }

  async getArticlesByTeam(teamId: string, limit: number = 50): Promise<Article[]> {
    return Array.from(this.articles.values())
      .filter((a) => a.teamId === teamId && !a.isDeleted)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  async getArticlesByTeamAndCategory(teamId: string, category: string, limit: number = 50): Promise<Article[]> {
    return Array.from(this.articles.values())
      .filter((a) => a.teamId === teamId && a.category === category && !a.isDeleted)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, limit);
  }

  async getArticleBySourceUrl(sourceUrl: string): Promise<Article | undefined> {
    return Array.from(this.articles.values()).find((a) => a.sourceUrl === sourceUrl);
  }

  async getRecentArticles(teamId: string, days: number): Promise<Article[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return Array.from(this.articles.values())
      .filter((a) => 
        a.teamId === teamId && 
        a.publishedAt >= cutoffDate && 
        !a.isDeleted
      )
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  async updateArticle(id: string, article: Partial<Article>): Promise<Article | undefined> {
    const existing = this.articles.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...article, id };
    this.articles.set(id, updated);
    return updated;
  }

  async deleteArticle(id: string): Promise<void> {
    const article = this.articles.get(id);
    if (article) {
      article.isDeleted = true;
      this.articles.set(id, article);
    }
  }

  async getUnprocessedArticles(limit: number = 100): Promise<Article[]> {
    return Array.from(this.articles.values())
      .filter((a) => !a.isProcessed && !a.isDeleted)
      .sort((a, b) => b.scrapedAt.getTime() - a.scrapedAt.getTime())
      .slice(0, limit);
  }

  // BM25 Indexes
  async getBM25IndexByTeam(teamId: string): Promise<BM25Index | undefined> {
    return Array.from(this.bm25Indexes.values()).find((idx) => idx.teamId === teamId);
  }

  async createBM25Index(index: InsertBM25Index): Promise<BM25Index> {
    const id = randomUUID();
    const newIndex: BM25Index = {
      id,
      ...index,
      totalDocuments: index.totalDocuments ?? 0,
      avgDocLength: index.avgDocLength ?? 0,
      k1: index.k1 ?? '1.5',
      b: index.b ?? '0.75',
      lastRebuiltAt: index.lastRebuiltAt ?? null,
      rebuildInProgress: index.rebuildInProgress ?? false,
      avgQueryTimeMs: index.avgQueryTimeMs ?? null,
      totalQueries: index.totalQueries ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.bm25Indexes.set(id, newIndex);
    return newIndex;
  }

  async updateBM25IndexStats(teamId: string, stats: Partial<BM25Index>): Promise<BM25Index | undefined> {
    const existing = Array.from(this.bm25Indexes.values()).find((idx) => idx.teamId === teamId);
    if (!existing) return undefined;

    const updated = { ...existing, ...stats, updatedAt: new Date() };
    this.bm25Indexes.set(existing.id, updated);
    return updated;
  }

  // News Sources
  async createNewsSource(source: InsertNewsSource): Promise<NewsSource> {
    const id = randomUUID();
    const newSource: NewsSource = {
      id,
      ...source,
      rssUrl: source.rssUrl ?? null,
      baseUrl: source.baseUrl ?? null,
      selectorConfig: source.selectorConfig ?? null,
      totalArticles: source.totalArticles ?? 0,
      relevantArticles: source.relevantArticles ?? 0,
      duplicateArticles: source.duplicateArticles ?? 0,
      reliabilityScore: source.reliabilityScore ?? null,
      isActive: source.isActive ?? true,
      lastScrapedAt: source.lastScrapedAt ?? null,
      lastErrorAt: source.lastErrorAt ?? null,
      errorMessage: source.errorMessage ?? null,
      requestsPerMinute: source.requestsPerMinute ?? 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.newsSources.set(id, newSource);
    return newSource;
  }

  async getNewsSource(id: string): Promise<NewsSource | undefined> {
    return this.newsSources.get(id);
  }

  async getNewsSourceByName(name: string): Promise<NewsSource | undefined> {
    return Array.from(this.newsSources.values()).find((s) => s.name === name);
  }

  async getAllNewsSources(): Promise<NewsSource[]> {
    return Array.from(this.newsSources.values());
  }

  async getActiveNewsSources(): Promise<NewsSource[]> {
    return Array.from(this.newsSources.values()).filter((s) => s.isActive);
  }

  async updateNewsSource(id: string, source: Partial<NewsSource>): Promise<NewsSource | undefined> {
    const existing = this.newsSources.get(id);
    if (!existing) return undefined;

    const updated = { ...existing, ...source, updatedAt: new Date() };
    this.newsSources.set(id, updated);
    return updated;
  }

  // Article Classifications
  async createArticleClassification(classification: InsertArticleClassification): Promise<ArticleClassification> {
    const id = randomUUID();
    const newClassification: ArticleClassification = {
      id,
      ...classification,
      classifiedAt: new Date(),
      classifierVersion: classification.classifierVersion ?? null,
      reasoning: classification.reasoning ?? null,
      keywords: classification.keywords ?? null,
    };
    this.articleClassifications.set(id, newClassification);
    return newClassification;
  }

  async getArticleClassification(id: string): Promise<ArticleClassification | undefined> {
    return this.articleClassifications.get(id);
  }

  async getClassificationsByArticle(articleId: string): Promise<ArticleClassification[]> {
    return Array.from(this.articleClassifications.values())
      .filter((c) => c.articleId === articleId)
      .sort((a, b) => b.classifiedAt.getTime() - a.classifiedAt.getTime());
  }

  async deleteArticleClassification(id: string): Promise<void> {
    this.articleClassifications.delete(id);
  }
}

export const storage: IStorage = !config.useMemStorage && config.databaseUrl && db ? new PgStorage() : new MemStorage();
