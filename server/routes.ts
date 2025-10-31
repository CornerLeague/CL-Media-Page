import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { hashPassword } from "./auth";
import rateLimit from "express-rate-limit";
import csurf from "csurf";
import { storage } from "./storage";
import { db } from "./db";
import { teams } from "@shared/schema";
import { createRedis, connectRedis, closeRedis } from "./jobs/redis";
import * as queuesMod from "./jobs/queues";
import { getWsStats } from "./ws";
import { withSource } from "./logger";
import { performance } from "perf_hooks";
import { insertUserProfileSchema } from "@shared/schema";
import { insertUpdateSchema, insertExperienceSchema, insertRsvpSchema, insertTeamSchema, insertGameSchema, insertUserSchema } from "@shared/schema";
import { authenticateFirebase } from "./middleware/authenticateFirebase";
import { loadUserContext } from "./middleware/loadUserContext";
import { validateTeamAccess } from "./middleware/teamAccessGuard";
import { validateScoresQuery, validateScheduleQuery, validateBoxScoreParams } from "./middleware/validateRequest";
import { config } from "./config";
import { metrics } from "./metrics";

export async function registerRoutes(app: Express): Promise<Server> {
  // Basic rate limits for auth endpoints
  const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
  const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
  // Per-IP limiter for GET endpoints
  const apiGetLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
  // Use cookie-based CSRF secret to avoid session secret rotation issues
  const csrfProtection = csurf({ cookie: true });

  // Dev-only Prometheus metrics endpoint
  app.get("/metrics", async (_req, res) => {
    if (!config.isDev) {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const content = await metrics.getMetricsContent();
      res.setHeader("Content-Type", metrics.register.contentType);
      return res.send(content);
    } catch (err) {
      return res.status(500).json({ error: "Metrics error" });
    }
  });

  // Health check endpoint
  app.get("/api/healthz", async (_req, res) => {
    const start = performance.now();
    const log = withSource("healthz");
    let version: string | null = null;
    try {
      // Resolve app version from package.json safely in ESM
      const fs = await import("fs");
      const path = await import("path");
      const pkgPath = path.resolve(process.cwd(), "package.json");
      const raw = fs.readFileSync(pkgPath, "utf-8");
      version = JSON.parse(raw)?.version ?? null;
    } catch {}

    // DB check: if Database URL present, run a lightweight select; else consider MemStorage OK
    let dbOk = true;
    let dbLatencyMs: number | null = null;
    let dbMessage: string | null = null;
    if (config.databaseUrl && db) {
      const t0 = performance.now();
      try {
        await db.select().from(teams).limit(1);
        dbLatencyMs = Math.round(performance.now() - t0);
      } catch (err: any) {
        dbOk = false;
        dbLatencyMs = Math.round(performance.now() - t0);
        dbMessage = String(err?.message ?? "db error");
      }
    } else {
      dbOk = true;
      dbMessage = "mem-storage";
    }

    // Redis check: only attempt if Redis URL is configured
    let redisOk = true;
    let redisLatencyMs: number | null = null;
    let redisMessage: string | null = null;
    if (config.redisUrl) {
      const t0 = performance.now();
      const client = createRedis();
      try {
        await connectRedis(client);
        try { await client.ping(); } catch {}
        redisLatencyMs = Math.round(performance.now() - t0);
        await closeRedis(client);
      } catch (err: any) {
        redisOk = false;
        redisLatencyMs = Math.round(performance.now() - t0);
        redisMessage = String(err?.message ?? "redis error");
        try { await closeRedis(client); } catch {}
      }
    } else {
      redisOk = true;
      redisMessage = "not-configured";
    }

    // Jobs: provide a lightweight summary when enabled
    let jobsOk = true;
    let jobsCounts: any = null;
    let jobsRepeatables = 0;
    let jobsMessage: string | null = null;
    if (config.jobsEnabled) {
      try {
      jobsCounts = await queuesMod.queues.scoresIngest.getJobCounts("waiting", "active", "completed", "failed", "delayed");
        try {
      const reps = await queuesMod.queues.scoresIngest.getRepeatableJobs();
          jobsRepeatables = Array.isArray(reps) ? reps.length : 0;
        } catch {}
      } catch (err: any) {
        jobsOk = false;
        jobsMessage = String(err?.message ?? "jobs error");
      }
    } else {
      jobsOk = true;
      jobsMessage = "disabled";
    }

    // WebSocket service
    const ws = getWsStats();
    const wsOk = ws.ready;

    // Aggregate status
    let status: "ok" | "degraded" | "down" = "ok";
    if (!dbOk) status = "down";
    else if (!redisOk || !jobsOk || !wsOk) status = "degraded";

    const durationMs = Math.round(performance.now() - start);
    const body = {
      status,
      version,
      duration_ms: durationMs,
      checks: {
        db: { ok: dbOk, latency_ms: dbLatencyMs, message: dbMessage },
        redis: { ok: redisOk, latency_ms: redisLatencyMs, message: redisMessage },
        jobs: { ok: jobsOk, counts: jobsCounts, repeatables: jobsRepeatables, message: jobsMessage },
        ws: { ok: wsOk, clients: ws.clients, path: ws.path },
      },
    };

    try {
      if (status !== "ok") log.warn({ status, body }, "healthz degraded");
    } catch {}

    return res.status(200).json(body);
  });

  // Session smoke test: increments a counter stored in the session
  app.get("/api/session-ping", async (req, res) => {
    const s: any = req.session as any;
    s.count = (s.count ?? 0) + 1;
    return res.json({ count: s.count });
  });

  // CSRF: provide token to clients
  app.get("/api/auth/csrf", csrfProtection, (req, res) => {
    const token = (req as any).csrfToken();
    res.setHeader("X-CSRF-Token", token);
    return res.json({ csrfToken: token });
  });


  // Auth: register
  const registerSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
  });
  app.post("/api/auth/register", authLimiter, csrfProtection, async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const { username, password } = parsed.data;
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "username already exists" });
      }
      const hashed = await hashPassword(password);
      const user = await storage.createUser({ username, password: hashed });
      req.login(user as any, (err) => {
        if (err) return next(err);
        return res.json({ id: user.id, username: user.username });
      });
    } catch (err) {
      next(err);
    }
  });

  // Auth: login
  const loginSchema = z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
  });
  app.post("/api/auth/login", loginLimiter, csrfProtection, (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
    }
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.login(user, (err2) => {
        if (err2) return next(err2);
        const u: any = user;
        return res.json({ id: u.id, username: u.username });
      });
    })(req, res, next);
  });

  // Auth: logout
  app.post("/api/auth/logout", csrfProtection, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  // Auth: current user
  app.get("/api/auth/me", (req, res) => {
    const user: any = (req as any).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    return res.json({ id: user.id, username: user.username });
  });

  // Get user profile by Firebase UID
  app.get("/api/profile/:firebaseUid", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const profile = await storage.getUserProfile(firebaseUid);
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create or update user profile
  app.post("/api/profile", async (req, res) => {
    try {
      const validationResult = insertUserProfileSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues 
        });
      }
      
      const data = validationResult.data;
      const existingProfile = await storage.getUserProfile(data.firebaseUid);
      
      let profile;
      if (existingProfile) {
        profile = await storage.updateUserProfile(data.firebaseUid, data);
      } else {
        profile = await storage.createUserProfile(data);
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error creating/updating profile:", error);
      return await sendFriendlyDbError(res, error, "upsertUserProfile");
    }
  });

  // Mark onboarding as complete
  app.put("/api/profile/:firebaseUid/onboarding", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const profile = await storage.updateUserProfile(firebaseUid, {
        onboardingCompleted: true
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating onboarding status:", error);
      return await sendFriendlyDbError(res, error, "updateUserProfileOnboarding");
    }
  });

  // Update user profile name
  app.patch("/api/profile/:firebaseUid/name", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { firstName, lastName } = req.body;
      
      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First name and last name are required" });
      }
      
      const profile = await storage.updateUserProfile(firebaseUid, {
        firstName,
        lastName
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating profile name:", error);
      return await sendFriendlyDbError(res, error, "updateUserProfileName");
    }
  });

  // Update favorite sports
  app.patch("/api/profile/:firebaseUid/sports", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { favoriteSports } = req.body;
      
      if (!Array.isArray(favoriteSports)) {
        return res.status(400).json({ error: "favoriteSports must be an array" });
      }
      
      const profile = await storage.updateUserProfile(firebaseUid, {
        favoriteSports
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating favorite sports:", error);
      return await sendFriendlyDbError(res, error, "updateUserProfileSports");
    }
  });

  // Update favorite teams
  app.patch("/api/profile/:firebaseUid/teams", async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { favoriteTeams } = req.body;
      
      if (!Array.isArray(favoriteTeams)) {
        return res.status(400).json({ error: "favoriteTeams must be an array" });
      }
      
      const profile = await storage.updateUserProfile(firebaseUid, {
        favoriteTeams
      });
      
      if (!profile) {
        return res.status(404).json({ error: "Profile not found" });
      }
      
      return res.json(profile);
    } catch (error) {
      console.error("Error updating favorite teams:", error);
      return await sendFriendlyDbError(res, error, "updateUserProfileTeams");
    }
  });

  // --- Dev: Teams management to enable testing (non-auth, development use only) ---
  app.get("/api/dev/teams", async (_req, res) => {
    try {
      const teams = await storage.getAllTeams();
      return res.json(teams);
    } catch (error) {
      console.error("Error listing teams:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dev/teams", async (req, res) => {
    try {
      const parsed = insertTeamSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const created = await storage.createTeam(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error creating team:", error);
      return await sendFriendlyDbError(res, error, "createTeam");
    }
  });

  // --- Dev: Users management to enable testing (non-auth, development use only) ---
  app.get("/api/dev/users", async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Do not expose password hashes in listing
      const sanitized = users.map(u => ({ id: u.id, username: u.username }));
      return res.json(sanitized);
    } catch (error) {
      console.error("Error listing users:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dev/users", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const { username, password } = parsed.data;
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "username already exists" });
      }
      const hashed = await hashPassword(password);
      const created = await storage.createUser({ username, password: hashed });
      // Return sanitized user
      return res.status(201).json({ id: created.id, username: created.username });
    } catch (error) {
      console.error("Error creating user:", error);
      return await sendFriendlyDbError(res, error, "createUser");
    }
  });

  app.get("/api/dev/games", async (_req, res) => {
    try {
      const allTeams = await storage.getAllTeams();
      const ids = allTeams.map((t) => t.id);
      const games = await storage.getGamesByTeamIds(ids, Math.min(500, ids.length * 10));
      return res.json(games);
    } catch (error) {
      console.error("Error listing games:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dev/games", async (req, res) => {
    try {
      // Preprocess startTime if it's a string
      if (req.body?.startTime && typeof req.body.startTime === 'string') {
        req.body.startTime = new Date(req.body.startTime);
      }
      
      const parsed = insertGameSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const created = await storage.createGame(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error creating game:", error);
      return await sendFriendlyDbError(res, error, "createGame");
    }
  });

  // --- Phase 3: Updates (News) ---
  app.get("/api/updates", async (req, res) => {
    try {
      const { teamIds, category, page = "1", pageSize = "10" } = req.query as Record<string, string | string[]>;
      const p = Math.max(1, parseInt(String(page)) || 1);
      const ps = Math.max(1, Math.min(100, parseInt(String(pageSize)) || 10));

      let items = [] as Awaited<ReturnType<typeof storage.getAllUpdates>>;
      const teamIdsArr = Array.isArray(teamIds) ? teamIds : teamIds ? [String(teamIds)] : [];
      if (teamIdsArr.length > 0) {
        // Aggregate updates for specified teams
        const perTeam = await Promise.all(
          teamIdsArr.map((tid) =>
            category
              ? storage.getUpdatesByTeamAndCategory(String(tid), String(category))
              : storage.getUpdatesByTeamId(String(tid)),
          ),
        );
        items = perTeam.flat();
        // Deduplicate by id
        const seen = new Set<string>();
        items = items.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
        // Sort newest first
        items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      } else {
        items = await storage.getAllUpdates();
        if (category) items = items.filter((u) => u.category === String(category));
      }

      const total = items.length;
      const start = (p - 1) * ps;
      const paged = items.slice(start, start + ps);
      return res.json({ items: paged, page: p, pageSize: ps, total });
    } catch (error) {
      console.error("Error fetching updates:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/updates/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const update = await storage.getUpdate(id);
      if (!update) return res.status(404).json({ error: "Not found" });
      return res.json(update);
    } catch (error) {
      console.error("Error fetching update:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // --- Phase 3: Summaries ---
  const generateLimiter = rateLimit({ windowMs: 60 * 1000, max: 3 });

  app.get("/api/summary/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      const summary = await storage.getLatestSummaryByTeamId(teamId);
      if (!summary) return res.status(404).json({ error: "No summary" });
      return res.json(summary);
    } catch (error) {
      console.error("Error fetching summary:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/summary/:teamId/generate", generateLimiter, async (req, res) => {
    try {
      const { teamId } = req.params;
      const { model, force } = req.body ?? {};
      // Stub generation: create a placeholder summary entry
      const created = await storage.createSummary({
        teamId,
        content: `Summary generation ${force ? "(force) " : ""}queued for team ${teamId}.`,
        model: typeof model === "string" ? model : undefined,
      });
      return res.status(202).json(created);
    } catch (error) {
      console.error("Error generating summary:", error);
      return await sendFriendlyDbError(res, error, "generateSummary");
    }
  });

  // --- Phase 3: Experiences & RSVPs ---
  app.get("/api/experiences", async (req, res) => {
    try {
      const { teamIds } = req.query as Record<string, string | string[]>;
      const teamIdsArr = Array.isArray(teamIds) ? teamIds : teamIds ? [String(teamIds)] : [];
      let items = [] as Awaited<ReturnType<typeof storage.getAllExperiences>>;
      if (teamIdsArr.length > 0) {
        const perTeam = await Promise.all(teamIdsArr.map((tid) => storage.getExperiencesByTeamId(String(tid))));
        items = perTeam.flat();
        // Deduplicate and sort by start time asc
        const seen = new Set<string>();
        items = items.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      } else {
        items = await storage.getAllExperiences();
      }
      return res.json(items);
    } catch (error) {
      console.error("Error fetching experiences:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/experiences", async (req, res) => {
    try {
      const body = req.body ?? {};
      // Convert ISO string dates to Date objects
      if (body.startTime && typeof body.startTime === 'string') {
        body.startTime = new Date(body.startTime);
      }
      const parsed = insertExperienceSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const created = await storage.createExperience(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error creating experience:", error);
      return await sendFriendlyDbError(res, error, "createExperience");
    }
  });

  app.patch("/api/experiences/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await storage.updateExperience(id, req.body ?? {});
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    } catch (error) {
      console.error("Error updating experience:", error);
      return await sendFriendlyDbError(res, error, "updateExperience");
    }
  });

  app.delete("/api/experiences/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteExperience(id);
      return res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting experience:", error);
      return await sendFriendlyDbError(res, error, "deleteExperience");
    }
  });

  app.post("/api/experiences/:id/rsvp", async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = insertRsvpSchema.safeParse({ ...req.body, experienceId: id });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const { userId } = parsed.data;
      const exists = await storage.hasRsvp(id, userId);
      if (exists) return res.status(409).json({ error: "Duplicate RSVP" });
      const created = await storage.createRsvp(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error creating RSVP:", error);
      return await sendFriendlyDbError(res, error, "createRsvp");
    }
  });

  app.delete("/api/experiences/:id/rsvp", async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = z.object({ userId: z.string() }).safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const { userId } = parsed.data;
      await storage.deleteRsvp(id, userId);
      return res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting RSVP:", error);
      return await sendFriendlyDbError(res, error, "deleteRsvp");
    }
  });

  // --- Phase 3: Scores ---
  app.get(
    "/api/scores",
    apiGetLimiter,
    authenticateFirebase,
    validateScoresQuery,
    loadUserContext,
    validateTeamAccess,
    async (req, res) => {
    try {
      const { page = "1", pageSize = "10" } = req.query as Record<string, string | string[]>;
      const p = Math.max(1, parseInt(String(page)) || 1);
      const ps = Math.max(1, Math.min(100, parseInt(String(pageSize)) || 10));
      const teamIdsArr = Array.isArray(req.access?.authorizedTeamIds)
        ? req.access!.authorizedTeamIds
        : [];
      const sport = req.access?.sport ?? null;
      const leagueFilter = sport ? String(sport).toUpperCase() : null;

      const startDateStr = req.validated?.query?.startDate;
      const endDateStr = req.validated?.query?.endDate;
      let startDate = startDateStr ? new Date(String(startDateStr)) : undefined;
      let endDate = endDateStr ? new Date(String(endDateStr)) : undefined;
      // Default window for recent/live scores when not provided: last 48h to now+1h
      if (!startDate) {
        startDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      }
      if (!endDate) {
        endDate = new Date(Date.now() + 1 * 60 * 60 * 1000);
      }
      const baseLimit = Math.min(50, Number(req.validated?.query?.limit ?? 10));

      let games = [] as Awaited<ReturnType<typeof storage.getGamesByTeamId>>;
      if (teamIdsArr.length > 0) {
        // If sport provided, restrict requested teams to that league
        let filteredTeamIds = teamIdsArr;
        if (leagueFilter) {
          const leagueTeams = await storage.getTeamsByLeague(leagueFilter);
          const allowedSet = new Set(leagueTeams.map((t) => t.id));
          filteredTeamIds = teamIdsArr.filter((tid) => allowedSet.has(String(tid)));
        }
        const overallLimit = Math.min(500, baseLimit * filteredTeamIds.length);
        games = await storage.getGamesByTeamIds(filteredTeamIds, overallLimit, startDate, endDate);
        const seen = new Set<string>();
        games = games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
      } else {
        // No teamIds: return latest games across cache by sampling teams from storage
        // Fallback: collect from all teams known in storage
        // Note: MemStorage lacks a getAllGames; we approximate by iterating teams and aggregating
        const allTeams = leagueFilter
          ? await storage.getTeamsByLeague(leagueFilter)
          : await storage.getAllTeams();
        const ids = allTeams.map((t) => t.id);
        const overallLimit = Math.min(500, baseLimit * Math.max(1, ids.length));
        games = await storage.getGamesByTeamIds(ids, overallLimit, startDate, endDate);
        const seen = new Set<string>();
        games = games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
      }

      games.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
      const total = games.length;
      const start = (p - 1) * ps;
      const paged = games.slice(start, start + ps);
      return res.json({ items: paged, page: p, pageSize: ps, total });
    } catch (error) {
      console.error("Error fetching scores:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    },
  );

  app.get(
    "/api/scores/:gameId",
    apiGetLimiter,
    authenticateFirebase,
    validateBoxScoreParams,
    loadUserContext,
    validateTeamAccess,
    async (req, res) => {
    try {
      const gameId = req.validated?.params?.gameId ?? req.params.gameId;
      const game = await storage.getGame(gameId);
      if (!game) return res.status(404).json({ error: "Not found" });

      // Enforce team authorization when not in overview mode
      const mode = req.access?.mode ?? "overview";
      const allowed = Array.isArray(req.access?.authorizedTeamIds)
        ? req.access!.authorizedTeamIds
        : [];
      if (mode !== "overview" && allowed.length > 0) {
        const isAuthorized = allowed.includes(String(game.homeTeamId)) || allowed.includes(String(game.awayTeamId));
        if (!isAuthorized) {
          return res.status(403).json({ error: "Access denied", unauthorizedTeams: [game.homeTeamId, game.awayTeamId] });
        }
      }
      return res.json(game);
    } catch (error) {
      console.error("Error fetching game:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    },
  );

  app.get(
    "/api/schedule",
    apiGetLimiter,
    authenticateFirebase,
    validateScheduleQuery,
    loadUserContext,
    validateTeamAccess,
    async (req, res) => {
    try {
      const { page = "1", pageSize = "10" } = req.query as Record<string, string | string[]>;
      const p = Math.max(1, parseInt(String(page)) || 1);
      const ps = Math.max(1, Math.min(100, parseInt(String(pageSize)) || 10));
      const teamIdsArr = Array.isArray(req.access?.authorizedTeamIds)
        ? req.access!.authorizedTeamIds
        : [];
      const sport = req.access?.sport ?? null;
      const leagueFilter = sport ? String(sport).toUpperCase() : null;
      const startDateStr = req.validated?.query?.startDate;
      const endDateStr = req.validated?.query?.endDate;
      let startDate = startDateStr ? new Date(String(startDateStr)) : undefined;
      let endDate = endDateStr ? new Date(String(endDateStr)) : undefined;
      // Defaults: upcoming schedule window now -> now+7 days
      if (!startDate) startDate = new Date();
      if (!endDate) endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const baseLimit = Math.min(50, Number(req.validated?.query?.limit ?? 10));

      let games = [] as Awaited<ReturnType<typeof storage.getGamesByTeamId>>;
      if (teamIdsArr.length > 0) {
        // If sport provided, restrict requested teams to that league
        let filteredTeamIds = teamIdsArr;
        if (leagueFilter) {
          const leagueTeams = await storage.getTeamsByLeague(leagueFilter);
          const allowedSet = new Set(leagueTeams.map((t) => t.id));
          filteredTeamIds = teamIdsArr.filter((tid) => allowedSet.has(String(tid)));
        }
        const overallLimit = Math.min(500, baseLimit * filteredTeamIds.length);
        games = await storage.getGamesByTeamIds(filteredTeamIds, overallLimit, startDate, endDate);
      } else {
        const allTeams = leagueFilter
          ? await storage.getTeamsByLeague(leagueFilter)
          : await storage.getAllTeams();
        const ids = allTeams.map((t) => t.id);
        const overallLimit = Math.min(500, baseLimit * Math.max(1, ids.length));
        games = await storage.getGamesByTeamIds(ids, overallLimit, startDate, endDate);
      }
      // Deduplicate defensively
      const seen = new Set<string>();
      games = games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
      games.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const total = games.length;
      const start = (p - 1) * ps;
      const paged = games.slice(start, start + ps);
      return res.json({ items: paged, page: p, pageSize: ps, total });
    } catch (error) {
      console.error("Error fetching schedule:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
    },
  );

  const httpServer = createServer(app);

  return httpServer;
}


// Helper: Send user-friendly DB error messages (especially foreign key and unique violations)
export async function sendFriendlyDbError(res: any, error: any, action: string) {
  const err: any = error || {};
  const code = err.code as string | undefined;
  const detail = (err.detail as string | undefined) || (err.message as string | undefined) || "";
  const table = err.table as string | undefined;
  const schema = err.schema as string | undefined;
  const constraint = err.constraint as string | undefined;
  const columnFromErr = err.column as string | undefined;

  // Try to parse column, value, and referenced table from standard Postgres detail message
  // Example: Key (user_id)=(abc) is not present in table "users"
  let column = columnFromErr;
  let value: string | undefined;
  let referencedTable: string | undefined = table;
  const match = detail.match(/Key \((.+?)\)=\((.+?)\) is not present in table \"(.+?)\"/);
  if (match) {
    column = match[1];
    value = match[2];
    referencedTable = match[3];
  }

  // Structured server-side logging for better debugging
  console.error(
    `[DB Error] action=${action} code=${code ?? "unknown"} constraint=${constraint ?? ""} table=${table ?? ""} column=${column ?? ""} detail=${detail ?? ""}`,
  );

  const addSuggestions = (col?: string) => {
    const suggestions: string[] = [];
    const c = (col || "").toLowerCase();
    if (c.includes("user")) {
      suggestions.push(
        "Verify the userId exists: GET /api/dev/users",
        "Create a user if needed: POST /api/dev/users",
      );
    }
    if (c.includes("experience")) {
      suggestions.push(
        "Verify the experienceId exists: GET /api/experiences",
        "Create the experience first: POST /api/experiences",
      );
    }
    if (c.includes("team") || c.includes("home") || c.includes("away")) {
      suggestions.push(
        "Verify the teamId exists: GET /api/dev/teams",
        "Create the team if needed: POST /api/dev/teams",
      );
    }
    return suggestions;
  };

  // Previews of valid IDs to guide users
  const previews: Record<string, any[]> = {};
  const inferTarget = (col?: string, refTable?: string) => {
    const c = (col || "").toLowerCase();
    const r = (refTable || "").toLowerCase();
    if (c.includes("user") || r.includes("users")) return "users";
    if (c.includes("experience") || r.includes("experiences")) return "experiences";
    if (c.includes("team") || c.includes("home") || c.includes("away") || r.includes("teams")) return "teams";
    return undefined;
  };

  const target = inferTarget(column, referencedTable);
  try {
    if (target === "users") {
      const users = await storage.getAllUsers();
      previews.users = users.slice(0, 3).map((u) => ({ id: u.id, username: u.username }));
    } else if (target === "experiences") {
      const exps = await storage.getAllExperiences();
      previews.experiences = exps.slice(0, 3).map((e) => ({ id: e.id, title: (e as any).title, teamId: e.teamId, startTime: e.startTime }));
    } else if (target === "teams") {
      const teams = await storage.getAllTeams();
      previews.teams = teams.slice(0, 3).map((t) => ({ id: t.id, name: (t as any).name, league: (t as any).league }));
    }
  } catch (previewErr) {
    // Ignore preview errors; not critical for response
  }

  if (code === "23503") {
    // Foreign key violation
    const suggestions = addSuggestions(column);
    const msgParts: string[] = [];
    if (column && referencedTable) {
      msgParts.push(`The ${column} value${value ? ` '${value}'` : ""} does not exist in table '${referencedTable}'.`);
    } else {
      msgParts.push("One or more referenced IDs do not exist.");
    }

    return res.status(422).json({
      error: "Invalid reference",
      message: msgParts.join(" "),
      action,
      suggestions,
      previews,
      debug: {
        code,
        constraint,
        table,
        schema,
        column,
        detail: detail || undefined,
      },
    });
  }

  if (code === "23505") {
    // Unique violation
    return res.status(409).json({
      error: "Conflict",
      message: "A record with the same unique key already exists.",
      action,
      debug: {
        code,
        constraint,
        table,
        schema,
        detail: detail || undefined,
      },
    });
  }

  // Fallback: generic error with debug info to aid troubleshooting
  return res.status(500).json({
    error: "Internal server error",
    action,
    debug: {
      code: code || undefined,
      constraint: constraint || undefined,
      table: table || undefined,
      schema: schema || undefined,
      detail: detail || undefined,
    },
  });
}
