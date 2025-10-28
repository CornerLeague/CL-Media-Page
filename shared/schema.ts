import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
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
  favoriteTeams: text("favorite_teams").array(),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles);

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

// ===== Articles Management =====

export const articles = pgTable(
  "articles",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: varchar("team_id").notNull().references(() => teams.id),
    
    // Content
    title: text("title").notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    
    // Metadata
    author: text("author"),
    publishedAt: timestamp("published_at").notNull(),
    scrapedAt: timestamp("scraped_at").notNull().defaultNow(),
    
    // Source tracking
    sourceUrl: text("source_url").notNull().unique(),
    sourceName: text("source_name").notNull(),
    sourceType: varchar("source_type", { length: 20 }).notNull(), // 'rss' | 'scraper' | 'api'
    
    // Classification (populated by Classification Agent)
    category: varchar("category", { length: 20 }), // 'injury' | 'trade' | 'roster' | 'general'
    confidence: integer("confidence"), // 0-100
    
    // BM25 scoring metadata
    wordCount: integer("word_count"),
    termFrequencies: text("term_frequencies"), // JSON serialized
    
    // Deduplication
    contentHash: varchar("content_hash", { length: 64 }), // SHA-256
    minHash: text("min_hash"), // JSON array of hash signatures
    
    // Relevance
    relevanceScore: integer("relevance_score"), // 0-100, team relevance
    
    // Status
    isProcessed: boolean("is_processed").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
  },
  (table) => ({
    teamIdIdx: index("articles_team_id_idx").on(table.teamId),
    publishedAtIdx: index("articles_published_at_idx").on(table.publishedAt),
    categoryIdx: index("articles_category_idx").on(table.category),
    sourceUrlIdx: index("articles_source_url_idx").on(table.sourceUrl),
    contentHashIdx: index("articles_content_hash_idx").on(table.contentHash),
  })
);

export const insertArticleSchema = createInsertSchema(articles).omit({
  id: true,
  scrapedAt: true,
});

export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type Article = typeof articles.$inferSelect;

// ===== Article Classifications =====

export const articleClassifications = pgTable(
  "article_classifications",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    articleId: varchar("article_id").notNull().references(() => articles.id),
    
    // Classification results
    category: varchar("category", { length: 20 }).notNull(),
    confidence: integer("confidence").notNull(), // 0-100
    
    // Classification metadata
    classifiedAt: timestamp("classified_at").notNull().defaultNow(),
    classifierVersion: varchar("classifier_version", { length: 20 }),
    
    // Reasoning (for debugging/training)
    reasoning: text("reasoning"), // Why this classification
    keywords: text("keywords").array(), // Key terms that influenced decision
  },
  (table) => ({
    articleIdIdx: index("classifications_article_id_idx").on(table.articleId),
  })
);

export const insertArticleClassificationSchema = createInsertSchema(articleClassifications).omit({
  id: true,
  classifiedAt: true,
});

export type InsertArticleClassification = z.infer<typeof insertArticleClassificationSchema>;
export type ArticleClassification = typeof articleClassifications.$inferSelect;

// ===== News Sources =====

export const newsSources = pgTable(
  "news_sources",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    
    // Source identification
    name: text("name").notNull().unique(),
    domain: text("domain").notNull(),
    sourceType: varchar("source_type", { length: 20 }).notNull(), // 'rss' | 'scraper' | 'api'
    
    // RSS feed specific
    rssUrl: text("rss_url"),
    
    // Scraper specific
    baseUrl: text("base_url"),
    selectorConfig: text("selector_config"), // JSON config for scrapers
    
    // Reliability metrics
    totalArticles: integer("total_articles").notNull().default(0),
    relevantArticles: integer("relevant_articles").notNull().default(0),
    duplicateArticles: integer("duplicate_articles").notNull().default(0),
    reliabilityScore: integer("reliability_score"), // 0-100
    
    // Status
    isActive: boolean("is_active").notNull().default(true),
    lastScrapedAt: timestamp("last_scraped_at"),
    lastErrorAt: timestamp("last_error_at"),
    errorMessage: text("error_message"),
    
    // Rate limiting
    requestsPerMinute: integer("requests_per_minute").notNull().default(10),
    
    // Timestamps
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("news_sources_name_idx").on(table.name),
  })
);

export const insertNewsSourceSchema = createInsertSchema(newsSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNewsSource = z.infer<typeof insertNewsSourceSchema>;
export type NewsSource = typeof newsSources.$inferSelect;

// ===== BM25 Index Metadata =====

export const bm25Indexes = pgTable(
  "bm25_indexes",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    teamId: varchar("team_id").notNull().references(() => teams.id),
    
    // Index statistics
    totalDocuments: integer("total_documents").notNull().default(0),
    avgDocLength: integer("avg_doc_length").notNull().default(0),
    
    // BM25 parameters
    k1: varchar("k1", { length: 10 }).notNull().default("1.5"), // Term frequency saturation
    b: varchar("b", { length: 10 }).notNull().default("0.75"), // Length normalization
    
    // Index metadata
    lastRebuiltAt: timestamp("last_rebuilt_at"),
    rebuildInProgress: boolean("rebuild_in_progress").notNull().default(false),
    
    // Performance metrics
    avgQueryTimeMs: integer("avg_query_time_ms"),
    totalQueries: integer("total_queries").notNull().default(0),
    
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    teamIdIdx: index("bm25_indexes_team_id_idx").on(table.teamId),
  })
);

export const insertBM25IndexSchema = createInsertSchema(bm25Indexes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBM25Index = z.infer<typeof insertBM25IndexSchema>;
export type BM25Index = typeof bm25Indexes.$inferSelect;
