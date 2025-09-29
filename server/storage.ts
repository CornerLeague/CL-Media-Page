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
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
  getGamesByTeamId(teamId: string, limit?: number): Promise<Game[]>;
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

  async getGamesByTeamId(teamId: string, limit: number = 10): Promise<Game[]> {
    return Array.from(this.games.values())
      .filter((g) => g.homeTeamId === teamId || g.awayTeamId === teamId)
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
}

export const storage = new MemStorage();
