import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { config } from "./config";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: false,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    // Use default Vite logger; do not force process exit on errors in development
    // customLogger: viteLogger,
    server: serverOptions,
    appType: "custom",
  });

  // Respond to Vite client connectivity pings immediately to avoid aborted fetches
  app.use((req, res, next) => {
    const accept = String(req.headers["accept"] ?? "");
    const isPing = accept.includes("text/x-vite-ping") || accept.includes("text/x-vite-dev-server-ping");
    if (isPing && req.method === "HEAD") {
      // Instrumentation to verify handling path
      try {
        log(`vite-ping: method=${req.method} url=${req.url} accept=${accept}`, "vite");
      } catch {}

      // For HEAD, send 204 with no body to avoid chunked encoding aborts
      res.status(204)
        .set({
          "Content-Type": "text/x-vite-ping",
          "Content-Length": "0",
          "X-Vite-Ping": "1",
        })
        .end();
      return;
    }

    // Let normal GETs fall through to Vite middlewares
    next();
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // Serve index.html as-is without dynamic query versioning to avoid HMR full reload loops
      // let template = await fs.promises.readFile(clientTemplate, "utf-8");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      let page = await vite.transformIndexHtml(url, template);
      // Strip Vite HMR client script to fully disable reload cycles
      page = page.replace(/<script[^>]*src="\/@vite\/client"[^>]*><\/script>/i, "");
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
