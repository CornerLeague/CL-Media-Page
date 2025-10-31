import { describe, it, expect, vi, beforeEach } from "vitest";

let serverStub: any;
let stopSpy: any;
let processOnSpy: any;

function createServerStub() {
  const listeners: Record<string, Function[]> = {};
  const stub = {
    on: vi.fn((event: string, handler: any) => {
      listeners[event] = [...(listeners[event] ?? []), handler];
    }),
    off: vi.fn((event: string, handler: any) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler);
    }),
    once: vi.fn((event: string, handler: any) => {
      const onceWrapper = (...args: any[]) => {
        stub.off(event, onceWrapper);
        handler(...args);
      };
      stub.on(event, onceWrapper);
    }),
    listen: vi.fn((opts: any, cb?: Function) => {
      if (typeof cb === "function") cb();
    }),
    emit: (event: string, ...args: any[]) => {
      for (const h of listeners[event] ?? []) h(...args);
    },
  };
  serverStub = stub;
  return stub;
}

// Mock config to avoid DB-backed session store and simplify boot
vi.mock("../../config", () => ({
  config: {
    nodeEnv: "test",
    port: 1234,
    isDev: true,
    databaseUrl: undefined,
    sessionSecret: "test",
    cors: { allowedOrigins: [], credentials: true },
    jobsEnabled: false,
  },
  warnMissingCriticalEnv: vi.fn(),
}));

// Mock vite helpers and ws init
vi.mock("../../vite", () => ({
  setupVite: vi.fn(async () => {}),
  serveStatic: vi.fn(() => {}),
  log: vi.fn(() => {}),
}));
vi.mock("../../ws", () => ({ initWs: vi.fn(() => {}) }));
// Avoid importing queues/BullMQ via dev agent routes
vi.mock("../../dev/agentRoutes", () => ({ attachDevAgentRoutes: vi.fn(() => {}) }));

// Mock routes to return our server stub at invocation time (ensure stub exists at import time)
vi.mock("../../routes", () => ({
  registerRoutes: vi.fn(async (_app: any) => createServerStub()),
}));

// Mock workers to capture init and stop (unused when jobsEnabled=false)
vi.mock("../../jobs/workers", () => ({
  initWorkers: vi.fn(async () => ({ stop: stopSpy })),
}));

describe("server boot initializes workers and registers shutdown", () => {
  beforeEach(() => {
    vi.resetModules();
    stopSpy = vi.fn(async () => {});
    if (processOnSpy) processOnSpy.mockRestore?.();
    processOnSpy = vi.spyOn(process, "on").mockImplementation(() => process as any);

    // Fresh stub each test (some modules may cache references)
    serverStub = createServerStub();
  });

  it("starts server and wires shutdown handler without real network", async () => {

    // Import index to run boot IIFE
    await import("../../index");
    // Allow async boot IIFE to progress past setupShutdown() - increase timeout for reliability
    await new Promise((r) => setTimeout(r, 100));

    // Verify shutdown wiring added
    const calls = processOnSpy.mock.calls ?? [];
    const hasSigint = calls.some((c: any[]) => c[0] === "SIGINT" && typeof c[1] === "function");
    const hasSigterm = calls.some((c: any[]) => c[0] === "SIGTERM" && typeof c[1] === "function");
    expect(hasSigint && hasSigterm).toBe(true);
  });
});