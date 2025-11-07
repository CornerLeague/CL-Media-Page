import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { z } from "zod";
import { hashPassword } from "./auth";
import rateLimit from "express-rate-limit";
import csurf from "csurf";
import { storage } from "./storage";
import { db } from "./db";
import { teams } from "../shared/schema";
import { createRedis, connectRedis, closeRedis } from "./jobs/redis";
import * as queuesMod from "./jobs/queues";
import { getWsStats } from "./ws";
import { withSource } from "./logger";
import { performance } from "perf_hooks";
import { insertUserProfileSchema } from "../shared/schema";
import { insertUpdateSchema, insertExperienceSchema, insertRsvpSchema, insertTeamSchema, insertGameSchema, insertUserSchema } from "../shared/schema";
import { authenticateFirebase } from "./middleware/authenticateFirebase";
import { loadUserContext } from "./middleware/loadUserContext";
import { validateTeamAccess } from "./middleware/teamAccessGuard";
import { validateScoresQuery, validateScheduleQuery, validateBoxScoreParams, validateUserTeamScoresQuery } from "./middleware/validateRequest";
import { config } from "./config";
import { metrics } from "./metrics";
import { ScoresAgent } from "./agents/scoresAgent";
import { SportAdapterFactory } from "./agents/adapters";
import { 
  UserTeamScoresError,
  NoFavoriteTeamError,
  ScoreFetchError,
  DatabaseError,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  ServiceUnavailableError,
  ErrorResponse,
  extractErrorInfo,
  createErrorResponse,
  logError,
  ErrorSeverity
} from "./types/errors";

/**
 * Centralized error handling function for API endpoints
 */
function handleApiError(
  error: Error,
  res: any,
  operation: string,
  context?: Record<string, any>
): void {
  const logger = withSource('api-error');
  const requestId = res.locals?.requestId || Math.random().toString(36).substring(7);
  
  // Log the error with context
  logError(logger, error, {
    operation,
    requestId,
    ...context
  });

  // Handle specific error types
  if (error instanceof UserTeamScoresError) {
    const errorResponse = createErrorResponse(error, requestId);
    return res.status(error.statusCode).json(errorResponse);
  }

  if (error instanceof DatabaseError) {
    const errorResponse = createErrorResponse(error, requestId);
    return res.status(error.statusCode).json(errorResponse);
  }

  if (error instanceof ValidationError) {
    const errorResponse = createErrorResponse(error, requestId);
    return res.status(error.statusCode).json(errorResponse);
  }

  if (error instanceof AuthenticationError) {
    const errorResponse = createErrorResponse(error, requestId);
    return res.status(error.statusCode).json(errorResponse);
  }

  if (error instanceof RateLimitError) {
    const errorResponse = createErrorResponse(error, requestId);
    return res.status(error.statusCode).json(errorResponse);
  }

  if (error instanceof ServiceUnavailableError) {
    const errorResponse = createErrorResponse(error, requestId);
    return res.status(error.statusCode).json(errorResponse);
  }

  // Handle unknown errors
  const fallbackError = new UserTeamScoresError(
    'An unexpected error occurred',
    'INTERNAL_ERROR',
    500,
    { operation, originalError: error.message }
  );
  
  const errorResponse = createErrorResponse(fallbackError, requestId);
  return res.status(500).json(errorResponse);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Basic rate limits for auth endpoints with custom error handling
  const authLimiter = rateLimit({ 
    windowMs: 60 * 1000, 
    max: 20,
    handler: (req, res) => {
      const error = new RateLimitError('Authentication rate limit exceeded', {
        limit: 20,
        windowMs: 60000,
        clientIP: req.ip
      });
      return handleApiError(error, res, 'auth-rate-limit', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
  });
  
  const loginLimiter = rateLimit({ 
    windowMs: 60 * 1000, 
    max: 10,
    handler: (req, res) => {
      const error = new RateLimitError('Login rate limit exceeded', {
        limit: 10,
        windowMs: 60000,
        clientIP: req.ip
      });
      return handleApiError(error, res, 'login-rate-limit', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
  });
  
  // Per-IP limiter for GET endpoints
  const apiGetLimiter = rateLimit({ 
    windowMs: 60 * 1000, 
    max: 60, 
    standardHeaders: true, 
    legacyHeaders: false,
    handler: (req, res) => {
      // Record rate-limit metric when a request is blocked
      try { metrics.recordRateLimitHit(req.path, 'ip'); } catch { /* no-op */ }
      const error = new RateLimitError('API rate limit exceeded', {
        limit: 60,
        windowMs: 60000,
        clientIP: req.ip
      });
      return handleApiError(error, res, 'api-rate-limit', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
    }
  });

  // Per-user limiter for user team scores endpoint
  const userScoresLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const uid = (req.user as any)?.uid || (req as any).userContext?.firebaseUid;
      return uid || req.ip;
    },
    handler: (req, res) => {
      // Record rate-limit metric when a request is blocked
      try { metrics.recordRateLimitHit(req.path, 'user'); } catch { /* no-op */ }
      const uid = (req.user as any)?.uid || (req as any).userContext?.firebaseUid;
      const error = new RateLimitError('User rate limit exceeded', {
        limit: 60,
        windowMs: 60000,
        clientIP: req.ip,
        userId: uid
      });
      return handleApiError(error, res, 'user-scores-rate-limit', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        userId: uid
      });
    }
  });
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

    // DB check: if Database URL present and MemStorage not forced, run a lightweight select; else consider MemStorage OK
    let dbOk = true;
    let dbLatencyMs: number | null = null;
    let dbMessage: string | null = null;
    if (!config.useMemStorage && config.databaseUrl && db) {
      const t0 = performance.now();
      try {
        await db.select().from(teams).limit(1);
        dbLatencyMs = Math.round(performance.now() - t0);
      } catch (err: any) {
        dbOk = false;
        dbLatencyMs = Math.round(performance.now() - t0);
        dbMessage = String(err?.message ?? "db error");
        
        // Enhanced structured logging for database health check failures
        const logger = withSource('health-check');
        logError(logger, err, {
          operation: 'database_health_check',
          table: 'teams',
          query: 'SELECT * FROM teams LIMIT 1',
          latencyMs: dbLatencyMs,
          databaseUrl: config.databaseUrl ? '[REDACTED]' : null,
          errorCode: err?.code,
          errorDetail: err?.detail
        });
      }
    } else {
      dbOk = true;
      dbMessage = "mem-storage";
    }

    // Redis check: only attempt if Redis URL is configured and jobs are enabled
    let redisOk = true;
    let redisLatencyMs: number | null = null;
    let redisMessage: string | null = null;
    if (config.redisUrl && config.jobsEnabled) {
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
      redisMessage = config.jobsEnabled ? "not-configured" : "disabled";
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
        ws: { ok: wsOk, clients: ws.clients, authenticatedClients: ws.authenticatedClients, path: ws.path },
      },
    };

    try {
      if (status !== "ok") log.warn({ status, body }, "healthz degraded");
    } catch {}

    return res.status(200).json(body);
  });

  // WebSocket stats endpoint for debugging and monitoring
  app.get("/api/ws/stats", async (_req, res) => {
    try {
      const { getWsStats } = await import("./ws");
      const stats = getWsStats();
      return res.json(stats);
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'get-ws-stats',
        { endpoint: '/api/ws/stats' }
      );
    }
  });

  // Error monitoring endpoints
  app.get("/api/monitoring/errors", async (_req, res) => {
    try {
      const { getMonitoringHealth } = await import("./monitoring/errorMonitoring");
      const health = getMonitoringHealth();
      return res.json(health);
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'get-error-monitoring',
        { endpoint: '/api/monitoring/errors' }
      );
    }
  });

  app.get("/api/monitoring/errors/stats", async (_req, res) => {
    try {
      const { errorMonitoring } = await import("./monitoring/errorMonitoring");
      const stats = errorMonitoring.getErrorStats();
      return res.json(stats);
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'get-error-stats',
        { endpoint: '/api/monitoring/errors/stats' }
      );
    }
  });

  // Accept client-side error reports securely (no sensitive data persisted)
  app.post("/api/monitoring/errors/report", async (req, res) => {
    const logger = withSource('client-error-report');
    try {
      const body = req.body ?? {};
      const rawError = body.error ?? {};
      const metadata = body.metadata ?? {};

      // Minimal validation
      const message = typeof rawError.message === 'string' ? rawError.message : undefined;
      if (!message) {
        return res.status(400).json({ error: 'Invalid payload: missing error.message' });
      }

      // Reconstruct error with sanitized details
      const reportedError = new Error(message);
      if (typeof rawError.name === 'string' && rawError.name) {
        reportedError.name = rawError.name;
      }
      try {
        const stack = typeof rawError.stack === 'string' ? rawError.stack : undefined;
        if (stack) {
          // Limit stack depth to avoid excessive payloads
          (reportedError as any).stack = stack.split('\n').slice(0, 10).join('\n');
        }
      } catch {}

      // Log and track through existing monitoring system
      const context = {
        operation: 'client-error-report',
        requestId: (res as any).locals?.requestId,
        userAgent: typeof metadata.userAgent === 'string' ? metadata.userAgent : req.get('User-Agent'),
        url: typeof metadata.url === 'string' ? metadata.url : undefined,
        clientIP: req.ip,
        sessionId: typeof metadata.sessionId === 'string' ? metadata.sessionId : undefined,
        client: true,
        errorId: typeof metadata.id === 'string' ? metadata.id : undefined,
        // Pass through non-sensitive context if provided
        ...(typeof metadata.context === 'object' && metadata.context ? { context: metadata.context } : {}),
      } as Record<string, any>;

      logError(logger, reportedError, context);

      return res.status(202).json({ status: 'ok' });
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'post-client-error-report',
        { endpoint: '/api/monitoring/errors/report' }
      );
    }
  });

  // User team scores specific health check endpoint
  app.get("/api/monitoring/user-team-scores/health", async (_req, res) => {
    try {
      const { errorMonitoring } = await import("./monitoring/errorMonitoring");
      const stats = errorMonitoring.getErrorStats();
      
      // Filter for user-team-scores related errors
      const userTeamScoresErrors = Array.from(stats.errorsByOperation.entries())
        .filter(([operation]) => operation.includes('user-team-scores'))
        .reduce((total, [, count]) => total + count, 0);
      
      const recentUserTeamScoresErrors = stats.recentErrors
        .filter(error => error.operation.includes('user-team-scores'))
        .length;
      
      // Health thresholds specific to user-team-scores
      const errorThreshold = 50; // Max 50 errors total
      const recentErrorThreshold = 10; // Max 10 recent errors
      
      const isHealthy = userTeamScoresErrors < errorThreshold && 
                       recentUserTeamScoresErrors < recentErrorThreshold;
      
      const status = isHealthy ? 'healthy' : 'degraded';
      const httpStatus = isHealthy ? 200 : 503;
      
      return res.status(httpStatus).json({
        status,
        service: 'user-team-scores',
        errors: {
          total: userTeamScoresErrors,
          recent: recentUserTeamScoresErrors,
          threshold: errorThreshold,
          recentThreshold: recentErrorThreshold
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'get-user-team-scores-health',
        { endpoint: '/api/monitoring/user-team-scores/health' }
      );
    }
  });

  app.get("/api/monitoring/errors/alerts", async (_req, res) => {
    try {
      const { errorMonitoring } = await import("./monitoring/errorMonitoring");
      const limit = Math.min(100, Number(_req.query.limit) || 20);
      const alerts = errorMonitoring.getRecentAlerts(limit);
      return res.json({ alerts, total: alerts.length });
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'get-error-alerts',
        { endpoint: '/api/monitoring/errors/alerts' }
      );
    }
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
        if (err) {
          try { withSource("auth").error({ err, userId: user.id }, "register req.login failed"); } catch {}
          return next(err);
        }
        return res.json({ id: user.id, username: user.username });
      });
    } catch (err) {
      try { withSource("auth").error({ err, body: req.body }, "register failed"); } catch {}
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
      if (err) {
        try { withSource("auth").error({ err }, "login error"); } catch {}
        return next(err);
      }
      if (!user) {
        try { withSource("auth").warn({ info }, "login invalid credentials"); } catch {}
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.login(user, (err2) => {
        if (err2) {
          try { withSource("auth").error({ err: err2, userId: (user as any)?.id }, "login req.login failed"); } catch {}
          return next(err2);
        }
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

  // Auth: current user (Firebase-based)
  app.get("/api/auth/me", authenticateFirebase, (req, res) => {
    const user = (req.user as any);
    if (!user?.uid) {
      return res.status(401).json({ error: "Unauthorized", code: "unauthorized" });
    }
    return res.json({ uid: user.uid, email: user.email ?? null });
  });

  // Get user profile by Firebase UID (protected: must match authenticated user)
  app.get("/api/profile/:firebaseUid", authenticateFirebase, async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const authUid = (req.user as any)?.uid;
      if (!authUid || String(authUid) !== String(firebaseUid)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
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
  app.post("/api/profile", authenticateFirebase, async (req, res) => {
    try {
      const validationResult = insertUserProfileSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validationResult.error.issues 
        });
      }
      
      const data = validationResult.data;
      const authUid = (req.user as any)?.uid;
      if (!authUid || String(authUid) !== String(data.firebaseUid)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
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
  app.put("/api/profile/:firebaseUid/onboarding", authenticateFirebase, async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const authUid = (req.user as any)?.uid;
      if (!authUid || String(authUid) !== String(firebaseUid)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
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
  app.patch("/api/profile/:firebaseUid/name", authenticateFirebase, async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { firstName, lastName } = req.body;
      const authUid = (req.user as any)?.uid;
      if (!authUid || String(authUid) !== String(firebaseUid)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
      
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
  app.patch("/api/profile/:firebaseUid/sports", authenticateFirebase, async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { favoriteSports } = req.body;
      const authUid = (req.user as any)?.uid;
      if (!authUid || String(authUid) !== String(firebaseUid)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
      
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
  app.patch("/api/profile/:firebaseUid/teams", authenticateFirebase, async (req, res) => {
    try {
      const { firebaseUid } = req.params;
      const { favoriteTeams } = req.body;
      const authUid = (req.user as any)?.uid;
      if (!authUid || String(authUid) !== String(firebaseUid)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
      
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
  const generateLimiter = rateLimit({ 
    windowMs: 60 * 1000, 
    max: 3,
    handler: (req, res) => {
      const error = new RateLimitError('Summary generation rate limit exceeded', {
        limit: 3,
        windowMs: 60000,
        clientIP: req.ip
      });
      return handleApiError(error, res, 'generate-rate-limit', {
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        teamId: req.params.teamId
      });
    }
  });

  app.get("/api/summary/:teamId", async (req, res) => {
    try {
      const { teamId } = req.params;
      
      if (!teamId) {
        throw new ValidationError('Team ID is required', { teamId });
      }
      
      const summary = await storage.getLatestSummaryByTeamId(teamId);
      if (!summary) {
        throw new DatabaseError('No summary found for team', { teamId });
      }
      return res.json(summary);
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'get-summary',
        {
          teamId: req.params.teamId,
          userAgent: req.get('User-Agent'),
          clientIP: req.ip
        }
      );
    }
  });

  app.post(
    "/api/summary/:teamId/generate",
    generateLimiter,
    authenticateFirebase,
    loadUserContext,
    async (req, res) => {
    try {
      const { teamId } = req.params;
      const { model, force } = req.body ?? {};
      
      if (!teamId) {
        throw new ValidationError('Team ID is required', { teamId });
      }

      // Enforce that the authenticated user owns/accesses this team
      const userTeams = Array.isArray(req.userContext?.teamIds) ? req.userContext!.teamIds : [];
      if (!userTeams.includes(String(teamId))) {
        return res.status(403).json({ error: 'Access denied', teamId });
      }
      
      // Stub generation: create a placeholder summary entry
      const created = await storage.createSummary({
        teamId,
        content: `Summary generation ${force ? "(force) " : ""}queued for team ${teamId}.`,
        model: typeof model === "string" ? model : undefined,
      });
      return res.status(202).json(created);
    } catch (error) {
      return handleApiError(
        error as Error,
        res,
        'generate-summary',
        {
          teamId: req.params.teamId,
          model: req.body?.model,
          force: req.body?.force,
          userAgent: req.get('User-Agent'),
          clientIP: req.ip
        }
      );
    }
  }
  );

  // --- Phase 3: Experiences & RSVPs ---
  app.get("/api/experiences", authenticateFirebase, async (req, res) => {
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

  app.post("/api/experiences", authenticateFirebase, async (req, res) => {
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

  app.patch("/api/experiences/:id", authenticateFirebase, async (req, res) => {
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

  app.delete("/api/experiences/:id", authenticateFirebase, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteExperience(id);
      return res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting experience:", error);
      return await sendFriendlyDbError(res, error, "deleteExperience");
    }
  });

  app.post("/api/experiences/:id/rsvp", authenticateFirebase, async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = insertRsvpSchema.safeParse({ ...req.body, experienceId: id });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const authUid = (req.user as any)?.uid;
      const { userId } = parsed.data;
      if (!authUid || String(authUid) !== String(userId)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
      const exists = await storage.hasRsvp(id, userId);
      if (exists) return res.status(409).json({ error: "Duplicate RSVP" });
      const created = await storage.createRsvp(parsed.data);
      return res.status(201).json(created);
    } catch (error) {
      console.error("Error creating RSVP:", error);
      return await sendFriendlyDbError(res, error, "createRsvp");
    }
  });

  app.delete("/api/experiences/:id/rsvp", authenticateFirebase, async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = z.object({ userId: z.string() }).safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const authUid = (req.user as any)?.uid;
      const { userId } = parsed.data;
      if (!authUid || String(authUid) !== String(userId)) {
        return res.status(403).json({ error: "Forbidden: UID mismatch" });
      }
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

  // User Team Scores endpoint - returns scores for user's favorite teams
  app.get(
    "/api/user-team-scores",
    apiGetLimiter,
    userScoresLimiter,
    authenticateFirebase,
    validateUserTeamScoresQuery,
    loadUserContext,
    async (req, res) => {
      const t0 = performance.now();
      try {
        const logger = withSource('user-team-scores');
        const requestId = res.locals?.requestId || Math.random().toString(36).substring(7);
        
        // Get user's favorite teams from context
        const userTeamIds = req.userContext?.teamIds || [];
        const userId = (req.user as any)?.uid;
        
        if (userTeamIds.length === 0) {
          throw new NoFavoriteTeamError(
            userId || 'unknown',
            req.validated?.query?.sport || 'all'
          );
        }

        const sport = req.validated?.query?.sport;
        const limit = req.validated?.query?.limit || 10;
        const startDateStr = req.validated?.query?.startDate;
        const endDateStr = req.validated?.query?.endDate;
        
        let startDate: Date;
        let endDate: Date;
        
        try {
          startDate = startDateStr ? new Date(String(startDateStr)) : new Date(Date.now() - 48 * 60 * 60 * 1000);
          endDate = endDateStr ? new Date(String(endDateStr)) : new Date(Date.now() + 1 * 60 * 60 * 1000);
          
          // Validate dates
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new ValidationError('Invalid date format provided', {
              startDate: startDateStr,
              endDate: endDateStr
            });
          }
          
          if (startDate >= endDate) {
            throw new ValidationError('Start date must be before end date', {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString()
            });
          }
        } catch (error) {
          if (error instanceof ValidationError) {
            throw error;
          }
          throw new ValidationError('Invalid date parameters', {
            startDate: startDateStr,
            endDate: endDateStr,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Filter user's teams by the requested sport
        let filteredTeamIds = userTeamIds;
        if (sport) {
          const leagueFilter = sport.toUpperCase();
          try {
            const leagueTeams = await storage.getTeamsByLeague(leagueFilter);
            const allowedSet = new Set(leagueTeams.map((t) => t.id));
            filteredTeamIds = userTeamIds.filter((tid) => allowedSet.has(String(tid)));
            
            if (filteredTeamIds.length === 0) {
              throw new NoFavoriteTeamError(
                userId || 'unknown',
                sport,
                `User has no favorite teams in ${sport.toUpperCase()}`
              );
            }
          } catch (error) {
            if (error instanceof NoFavoriteTeamError) {
              throw error;
            }
            
            logger.error({
              error: extractErrorInfo(error as Error),
              context: { userId, sport, operation: 'getTeamsByLeague' }
            }, 'Error filtering teams by league');
            
            throw new DatabaseError('Failed to filter teams by sport', {
              sport,
              userId,
              operation: 'getTeamsByLeague'
            });
          }
        }

        // Fetch games for the filtered teams
        const overallLimit = Math.min(500, limit * filteredTeamIds.length);
        let games;
        
        try {
          games = await storage.getGamesByTeamIds(filteredTeamIds, overallLimit, startDate, endDate);
        } catch (error) {
          logger.error({
            error: extractErrorInfo(error as Error),
            context: { 
              userId, 
              sport, 
              teamIds: filteredTeamIds,
              dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
              operation: 'getGamesByTeamIds'
            }
          }, 'Error fetching games');
          
          throw new ScoreFetchError('Unable to fetch game data at this time', {
            teamIds: filteredTeamIds,
            dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
            operation: 'getGamesByTeamIds'
          });
        }

        // Deduplicate games (same game can appear for both teams)
        const seen = new Set<string>();
        games = games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));

        // Sort by start time (most recent first)
        games.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

        // Apply limit
        const limitedGames = games.slice(0, limit);

        // Log successful request
        logger.info({
          userId,
          sport,
          teamCount: filteredTeamIds.length,
          gameCount: limitedGames.length,
          requestId
        }, 'Successfully fetched user team scores');
        const durationMs = performance.now() - t0;
        try { metrics.observeApiRequest('/api/user-team-scores', 'GET', 200, durationMs); } catch {}
        return res.json({
          games: limitedGames,
          userTeamIds: filteredTeamIds,
          sport: sport || null,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          },
          total: limitedGames.length,
          requestId
        });
      } catch (error) {
        const durationMs = performance.now() - t0;
        let status = 500;
        if (error instanceof ValidationError) status = 400;
        else if (error instanceof AuthenticationError) status = 401;
        else if (error instanceof RateLimitError) status = 429;
        else if (error instanceof ServiceUnavailableError) status = 503;
        try { metrics.observeApiRequest('/api/user-team-scores', 'GET', status, durationMs); } catch {}
        return handleApiError(
           error as Error,
           res,
           'user-team-scores',
           {
             userId: (req.user as any)?.uid,
             sport: req.validated?.query?.sport,
             userAgent: req.get('User-Agent'),
             clientIP: req.ip
           }
         );
      }
    }
  );

  app.get(
    "/api/scores/:gameId",
    apiGetLimiter,
    authenticateFirebase,
    validateBoxScoreParams,
    loadUserContext,
    validateTeamAccess,
    async (req, res) => {
    const t0 = performance.now();
    try {
      const gameId = req.validated?.params?.gameId ?? req.params.gameId;
      
      if (!gameId) {
        throw new ValidationError('Game ID is required', { gameId });
      }
      
      const game = await storage.getGame(gameId);
      if (!game) {
        throw new DatabaseError('Game not found', { gameId });
      }

      // Enforce team authorization when not in overview mode
      const mode = req.access?.mode ?? "overview";
      const allowed = Array.isArray(req.access?.authorizedTeamIds)
        ? req.access!.authorizedTeamIds
        : [];
      if (mode !== "overview" && allowed.length > 0) {
        const isAuthorized = allowed.includes(String(game.homeTeamId)) || allowed.includes(String(game.awayTeamId));
        if (!isAuthorized) {
          throw new AuthenticationError('Access denied to game', { 
            gameId, 
            homeTeamId: game.homeTeamId, 
            awayTeamId: game.awayTeamId,
            authorizedTeams: allowed
          });
        }
      }
      {
        const durationMs = performance.now() - t0;
        try { metrics.observeApiRequest('/api/scores/:gameId', 'GET', 200, durationMs); } catch {}
      }
      return res.json(game);
    } catch (error) {
      {
        const durationMs = performance.now() - t0;
        let status = 500;
        if (error instanceof ValidationError) status = 400;
        else if (error instanceof AuthenticationError) status = 401;
        else if (error instanceof RateLimitError) status = 429;
        else if (error instanceof ServiceUnavailableError) status = 503;
        try { metrics.observeApiRequest('/api/scores/:gameId', 'GET', status, durationMs); } catch {}
      }
      return handleApiError(
        error as Error,
        res,
        'get-game-scores',
        {
          gameId: req.params.gameId,
          userId: (req.user as any)?.uid,
          userAgent: req.get('User-Agent'),
          clientIP: req.ip
        }
      );
    }
    },
  );

  // Manual refresh endpoint for scores
  app.post(
    "/api/scores/refresh",
    userScoresLimiter,
    authenticateFirebase,
    validateUserTeamScoresQuery,
    loadUserContext,
    validateTeamAccess,
    async (req, res) => {
      const t0 = performance.now();
      try {
        const sport = req.access?.sport ?? req.validated?.query?.sport ?? undefined;
        const limit = Math.min(50, Number(req.validated?.query?.limit ?? 10));
        const teamIdsArr = Array.isArray(req.access?.authorizedTeamIds)
          ? req.access!.authorizedTeamIds
          : [];

        // Select adapter based on sport (fallback handled internally)
        const adapter = SportAdapterFactory.getAdapter(sport ?? "NBA");
        const agent = new ScoresAgent(adapter);
        const mode: "live" | "featured" = teamIdsArr.length > 0 ? "live" : "featured";

        const result = await agent.runOnce({ teamIds: teamIdsArr, limit, sport, mode });

        // Map to client ScoreData shape
        const scores = result.items.map((g) => ({
          gameId: g.id,
          homeTeam: g.homeTeamId,
          awayTeam: g.awayTeamId,
          homeScore: typeof g.homePts === "number" ? g.homePts : 0,
          awayScore: typeof g.awayPts === "number" ? g.awayPts : 0,
          status: g.status,
          quarter: g.period ? String(g.period) : undefined,
          timeRemaining: g.timeRemaining ?? undefined,
          lastUpdated: new Date().toISOString(),
        }));

        {
          const durationMs = performance.now() - t0;
          try { metrics.observeApiRequest('/api/scores/refresh', 'POST', 200, durationMs); } catch {}
        }
        return res.json(scores);
      } catch (error) {
        const durationMs = performance.now() - t0;
        let status = 500;
        if (error instanceof ValidationError) status = 400;
        else if (error instanceof AuthenticationError) status = 401;
        else if (error instanceof RateLimitError) status = 429;
        else if (error instanceof ServiceUnavailableError) status = 503;
        try { metrics.observeApiRequest('/api/scores/refresh', 'POST', status, durationMs); } catch {}
        return handleApiError(
          error as Error,
          res,
          'refresh-scores',
          {
            userId: (req.user as any)?.uid,
            sport: req.validated?.query?.sport ?? req.access?.sport,
            teamCount: Array.isArray(req.access?.authorizedTeamIds) ? req.access!.authorizedTeamIds!.length : 0,
            userAgent: req.get('User-Agent'),
            clientIP: req.ip,
          }
        );
      }
    }
  );

  app.get(
    "/api/schedule",
    apiGetLimiter,
    authenticateFirebase,
    validateScheduleQuery,
    loadUserContext,
    validateTeamAccess,
    async (req, res) => {
    const t0 = performance.now();
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
      {
        const durationMs = performance.now() - t0;
        try { metrics.observeApiRequest('/api/schedule', 'GET', 200, durationMs); } catch {}
      }
      return res.json({ items: paged, page: p, pageSize: ps, total });
    } catch (error) {
      {
        const durationMs = performance.now() - t0;
        let status = 500;
        if (error instanceof ValidationError) status = 400;
        else if (error instanceof AuthenticationError) status = 401;
        else if (error instanceof RateLimitError) status = 429;
        else if (error instanceof ServiceUnavailableError) status = 503;
        try { metrics.observeApiRequest('/api/schedule', 'GET', status, durationMs); } catch {}
      }
      return handleApiError(
        error as Error,
        res,
        'get-schedule',
        {
          userId: (req.user as any)?.uid,
          sport: req.access?.sport,
          teamIds: req.access?.authorizedTeamIds,
          userAgent: req.get('User-Agent'),
          clientIP: req.ip
        }
      );
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

  // Enhanced structured logging for database errors
  const logger = withSource('database-error');
  const dbError = new DatabaseError(
    `Database operation failed: ${action}`,
    {
      operation: action,
      table: table || 'unknown',
      constraint: constraint || 'unknown',
      column: column || 'unknown',
      errorCode: code || 'unknown',
      errorDetail: detail || 'No details available',
      schema: schema || 'unknown'
    }
  );
  
  logError(logger, dbError, {
    operation: action,
    table,
    constraint,
    column,
    errorCode: code,
    errorDetail: detail,
    schema,
    value,
    referencedTable
  });

  // Structured server-side logging for better debugging (keeping for backward compatibility)
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
