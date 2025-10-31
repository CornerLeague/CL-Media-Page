import { Server as HttpServer } from "http";
import { WebSocketServer } from "ws";
import { withSource } from "./logger";

let wss: WebSocketServer | undefined;

export function initWs(server: HttpServer) {
  // Scope our app WebSocket to a dedicated path to avoid collisions with Vite's HMR WebSocket
  wss = new WebSocketServer({ server, path: "/ws" });
  const wsLog = withSource("ws");
  wss.on("error", (err) => {
    try { wsLog.error({ err }, "websocket server error"); } catch {}
  });
  wss.on("connection", (socket) => {
    // Minimal protocol: clients can send a JSON { type: "subscribe", teamId: "..." }
    (socket as any).subs = new Set<string>();
    socket.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg && msg.type === "subscribe" && typeof msg.teamId === "string") {
          (socket as any).subs.add(msg.teamId);
        }
        if (msg && msg.type === "unsubscribe" && typeof msg.teamId === "string") {
          (socket as any).subs.delete(msg.teamId);
        }
      } catch {
        // ignore
      }
    });
  });
}

export function broadcast(type: string, payload: any) {
  if (!wss) return;
  const msg = JSON.stringify({ type, payload });
  const targetTeams: string[] = Array.isArray(payload?.teamIds) ? payload.teamIds : [];
  // Use forEach on the Set to avoid downlevel iteration issues
  wss.clients.forEach((client) => {
    const subs: Set<string> = (client as any).subs || new Set<string>();
    if (targetTeams.length === 0 || targetTeams.some((t) => subs.has(t))) {
      try { client.send(msg); } catch { /* ignore */ }
    }
  });
}

export function getWsStats(): { ready: boolean; clients: number; path: string } {
  const ready = !!wss;
  const clients = wss ? wss.clients.size : 0;
  return { ready, clients, path: "/ws" };
}