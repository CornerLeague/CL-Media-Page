import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey(),
  league: varchar("league", { length: 10 }).notNull(),
  code: varchar("code", { length: 10 }).notNull(),
  name: text("name").notNull(),
});

export const insertTeamSchema = createInsertSchema(teams);

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export const userTeams = pgTable("user_teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
});

export const insertUserTeamSchema = createInsertSchema(userTeams).omit({
  id: true,
});

export type InsertUserTeam = z.infer<typeof insertUserTeamSchema>;
export type UserTeam = typeof userTeams.$inferSelect;

export const summaries = pgTable("summaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  content: text("content").notNull(),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
  model: varchar("model", { length: 50 }),
});

export const insertSummarySchema = createInsertSchema(summaries).omit({
  id: true,
  generatedAt: true,
});

export type InsertSummary = z.infer<typeof insertSummarySchema>;
export type Summary = typeof summaries.$inferSelect;

export const games = pgTable("games", {
  id: varchar("id").primaryKey(),
  homeTeamId: varchar("home_team_id").notNull().references(() => teams.id),
  awayTeamId: varchar("away_team_id").notNull().references(() => teams.id),
  homePts: integer("home_pts").notNull(),
  awayPts: integer("away_pts").notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  period: varchar("period", { length: 10 }),
  timeRemaining: varchar("time_remaining", { length: 20 }),
  startTime: timestamp("start_time").notNull(),
  cachedAt: timestamp("cached_at").notNull().defaultNow(),
});

export const insertGameSchema = createInsertSchema(games).omit({
  cachedAt: true,
});

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

export const updates = pgTable("updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  category: varchar("category", { length: 20 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  source: text("source"),
});

export const insertUpdateSchema = createInsertSchema(updates).omit({
  id: true,
  timestamp: true,
});

export type InsertUpdate = z.infer<typeof insertUpdateSchema>;
export type Update = typeof updates.$inferSelect;

export const experiences = pgTable("experiences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  type: varchar("type", { length: 20 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startTime: timestamp("start_time").notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertExperienceSchema = createInsertSchema(experiences).omit({
  id: true,
  createdAt: true,
});

export type InsertExperience = z.infer<typeof insertExperienceSchema>;
export type Experience = typeof experiences.$inferSelect;

export const rsvps = pgTable("rsvps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experienceId: varchar("experience_id").notNull().references(() => experiences.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRsvpSchema = createInsertSchema(rsvps).omit({
  id: true,
  createdAt: true,
});

export type InsertRsvp = z.infer<typeof insertRsvpSchema>;
export type Rsvp = typeof rsvps.$inferSelect;

export const userProfiles = pgTable("user_profiles", {
  firebaseUid: text("firebase_uid").primaryKey(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  favoriteSports: text("favorite_sports").array(),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles);

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;
