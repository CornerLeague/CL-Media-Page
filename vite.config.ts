import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";


export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // Allow configuring dev server port via PORT env (defaults to 5002)
    port: Number(process.env.PORT ?? 5002),
    // Disable the HMR error overlay to prevent red screen blocking
    // when esbuild service crashes or duplicate dev servers cause conflicts.
    // This keeps the UI usable while we investigate underlying issues.
    hmr: {
      overlay: false,
    },
    // Dev proxy: forward API and WebSocket traffic to backend server
    // This ensures the client (on port 5002) can reach the backend (often on 5002)
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? '5002'}`,
        changeOrigin: true,
        secure: false,
      },
      '/ws': {
        target: `ws://localhost:${process.env.API_PORT ?? '5002'}`,
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
