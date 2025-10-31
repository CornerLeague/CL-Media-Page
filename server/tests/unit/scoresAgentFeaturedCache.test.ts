import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let originalEnv: NodeJS.ProcessEnv;

describe('ScoresAgent - Featured Cache TTL', () => {
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    // Enable Redis in config so ScoresAgent attempts to cache
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('populates sport-scoped featured cache with TTL 300s', async () => {
    // Fake Redis client with get/set
    const fakeRedis = {
      status: 'ready',
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      connect: vi.fn().mockResolvedValue(undefined),
    } as any;

    // Mock redis helpers used by ScoresAgent
    vi.doMock('../../jobs/redis', () => ({
      createRedis: () => fakeRedis,
      connectRedis: async () => {},
      closeRedis: async () => {},
    }));

    // Mock storage.createGame to return persisted games
    vi.doMock('../../storage', () => ({
      storage: {
        createGame: vi.fn().mockImplementation(async (game: any) => ({
          ...game,
          period: game.period ?? null,
          timeRemaining: game.timeRemaining ?? null,
          cachedAt: new Date(),
        })),
      },
    }));

    // Mock ws.broadcast to avoid WebSocket errors
    vi.doMock('../../ws', () => ({
      broadcast: vi.fn(),
    }));

    // Import after mocks
    const { ScoresAgent } = await import('../../agents/scoresAgent');
    const { DummyScoreSource } = await import('../../agents/adapters/dummyScoreSource');

    const adapter = new DummyScoreSource();
    const agent = new ScoresAgent(adapter);

    const res = await agent.runOnce({ sport: 'NBA', mode: 'featured', limit: 2 });

    expect(res.items.length).toBeGreaterThan(0);

    // Verify cache set: key shape and TTL
    expect(fakeRedis.set).toHaveBeenCalled();
    const calls = (fakeRedis.set as any).mock.calls;
    const last = calls[calls.length - 1];
    expect(last[0]).toBe('scores:sport:NBA:featured');
    expect(typeof last[1]).toBe('string'); // JSON payload
    expect(last[2]).toBe('EX');
    expect(last[3]).toBe(300);
  });
});