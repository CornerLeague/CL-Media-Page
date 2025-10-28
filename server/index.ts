import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config, warnMissingCriticalEnv } from "./config";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { verifyPassword } from "./auth";
import { storage } from "./storage";
import { logger, withSource } from "./logger";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Parse cookies for CSRF token cookie support
app.use(cookieParser());

// Phase 2: session middleware with Postgres-backed store (fallback to memory)
const PgSession = connectPgSimple(session);
const sessionStore = config.databaseUrl
  ? new PgSession({
      conString: config.databaseUrl,
      createTableIfMissing: true,
    })
  : undefined;

app.use(
  session({
    name: "sid",
    secret: config.sessionSecret ?? "dev-insecure-secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: !config.isDev, // false on http://127.0.0.1 during development
      httpOnly: true,
      sameSite: config.isDev ? "lax" : "none",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Phase 2: Passport local strategy and session integration
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      const ok = user ? await verifyPassword(password, (user as any).password) : false;
      if (!user || !ok) {
        return done(null, false, { message: "Invalid credentials" });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user ?? false);
  } catch (err) {
    done(err);
  }
});

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Phase 0: environment validation (non-fatal warnings for missing criticals)
  warnMissingCriticalEnv();
  const bootLog = withSource("boot");
  bootLog.info({ env: config.nodeEnv, port: config.port }, "starting server");
  const server = await registerRoutes(app);

  // Initialize WebSocket server for live updates
  const { initWs } = await import("./ws");
  initWs(server);

  // Initialize job workers when enabled
  let jobs: { stop: () => Promise<void> } | undefined;
  if (config.jobsEnabled) {
    try {
      const { initWorkers } = await import("./jobs/workers");
      jobs = await initWorkers();
      bootLog.info({ enabled: true }, "job workers initialized");
    } catch (err) {
      bootLog.error({ err }, "failed to initialize job workers");
    }
  } else {
    bootLog.info({ enabled: false }, "job workers disabled by config");
  }

  // Attach dev agent routes for manual runs
  const { attachDevAgentRoutes } = await import("./dev/agentRoutes");
  attachDevAgentRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err && err.code === "EBADCSRFTOKEN") {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    logger.error({ err }, "unhandled error");
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (config.isDev) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Graceful shutdown for job workers
  function setupShutdown() {
    const stopOnce = async () => {
      if (jobs) {
        try { await jobs.stop(); } catch {}
      }
    };
    process.on("SIGINT", stopOnce);
    process.on("SIGTERM", stopOnce);
    server.on("close", stopOnce);
  }
  setupShutdown();

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = config.port;
  const host = "0.0.0.0";

  // Friendlier startup: in development, automatically retry on EADDRINUSE with incremental ports
  async function startServerWithRetry(server: any, desiredPort: number, host: string, maxRetries: number, delayMs: number): Promise<number> {
    let attempt = 0;
    return await new Promise<number>((resolve, reject) => {
      const tryListen = (p: number) => {
        const onError = (err: any) => {
          server.off("error", onError);
          if (err?.code === "EADDRINUSE" && attempt < maxRetries) {
            const nextPort = p + 1;
            bootLog.warn({ port: p, nextPort }, "port in use, retrying on next port");
            attempt++;
            setTimeout(() => {
              tryListen(nextPort);
            }, delayMs);
          } else {
            reject(err);
          }
        };
        server.once("error", onError);
        server.listen({ port: p, host }, () => {
          server.off("error", onError);
          resolve(p);
        });
      };
      tryListen(desiredPort);
    });
  }

  try {
    const actualPort = await startServerWithRetry(server, port, host, config.isDev ? 3 : 0, 750);
    bootLog.info(`serving on port ${actualPort}`);
  } catch (err: any) {
    bootLog.error({ err, port }, "failed to start server");
    if (err?.code === "EADDRINUSE") {
      bootLog.error("Port is already in use. If another dev server is running, stop it or set PORT to a unique value.");
    }
    // In production, do not auto-retry; exit with failure
    process.exitCode = 1;
  }
})();
