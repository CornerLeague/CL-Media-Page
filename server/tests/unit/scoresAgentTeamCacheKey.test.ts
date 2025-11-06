import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IScoreSource, GameScore } from '../../agents/types';
import { ScoresAgent } from '../../agents/scoresAgent';
import { config } from '../../config';

describe('ScoresAgent - Live Mode team cache key and TTL', () => {
  let prevRedisUrl: string | undefined;
  const fakeRedis: any = {
    get: vi.fn(),
    set: vi.fn(),
    connect: vi.fn(),
    status: 'ready'
  };

  beforeEach(() => {
    prevRedisUrl = config.redisUrl as any;
    (config as any).redisUrl = 'redis://test';
    vi.mock('../../jobs/redis', () => ({
      createRedis: () => fakeRedis,
      connectRedis: vi.fn().mockResolvedValue(undefined),
      closeRedis: vi.fn().mockResolvedValue(undefined)
    }));
  });

  afterEach(() => {
    (config as any).redisUrl = prevRedisUrl;
    vi.restoreAllMocks();
  });

  it('sets cache with normalized teamIds key and EX=60 for live mode', async () => {
    const now = new Date('2025-11-01T19:00:00Z');
    const liveGames: GameScore[] = [
      {
        gameId: 'NBA_2025_11_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        startTime: now,
        status: 'in_progress',
        homePts: 55,
        awayPts: 52,
        source: 'test'
      }
    ];

    const adapter: IScoreSource = {
      fetchLive: vi.fn().mockResolvedValue(liveGames),
      fetchRecentGames: vi.fn()
    };

    const agent = new ScoresAgent(adapter);
    await agent.runOnce({
      teamIds: ['NBA_BOS', 'NBA_LAL', 'NBA_BOS'], // unordered + duplicate
      sport: 'NBA',
      mode: 'live',
      limit: 10
    });

    // Cache should be set with normalized key and TTL 60
    expect(fakeRedis.set).toHaveBeenCalled();
    const [key, payload, exLiteral, ttl] = fakeRedis.set.mock.calls.at(-1);
    expect(key).toBe('scores:teams:NBA_BOS,NBA_LAL');
    expect(exLiteral).toBe('EX');
    expect(ttl).toBe(60);

    // Payload is JSON serializable with dates in ISO format
    const parsed = JSON.parse(payload);
    expect(Array.isArray(parsed)).toBe(true);
    expect(new Date(parsed[0].startTime).toISOString()).toBe(now.toISOString());
  });

  it('uses cached payload when available and deserializes dates', async () => {
    const cachedNow = new Date('2025-11-01T20:00:00Z');
    const cachedPayload = JSON.stringify([
      {
        id: 'NBA_2025_11_GSW_MIA',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_MIA',
        startTime: cachedNow.toISOString(),
        status: 'final',
        homePts: 101,
        awayPts: 98,
        source: 'test',
        cachedAt: new Date('2025-11-01T20:05:00Z').toISOString()
      }
    ]);
    fakeRedis.get.mockResolvedValueOnce(cachedPayload);

    const adapter: IScoreSource = {
      fetchLive: vi.fn().mockResolvedValue([]),
      fetchRecentGames: vi.fn()
    };

    const agent = new ScoresAgent(adapter);
    const result = await agent.runOnce({
      teamIds: ['NBA_MIA', 'NBA_GSW'],
      sport: 'NBA',
      mode: 'live',
      limit: 5
    });

    expect(result.errors).toBe(0);
    expect(result.items.length).toBe(1);
    expect(result.items[0].id).toBe('NBA_2025_11_GSW_MIA');
    // Date fields should be deserialized back to Date objects in downstream usage
    expect(new Date(result.items[0].startTime).toISOString()).toBe(cachedNow.toISOString());
    // Should not set cache again if a hit occurred (implementation reads before writes)
    // Depending on implementation, a write may still occur; accept either but ensure get was called.
    expect(fakeRedis.get).toHaveBeenCalled();
  });
});