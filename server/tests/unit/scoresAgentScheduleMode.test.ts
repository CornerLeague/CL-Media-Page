import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IScoreSource, ScheduleGame } from '../../agents/types';
import { ScoresAgent } from '../../agents/scoresAgent';
import * as ws from '../../ws';
import { config } from '../../config';
import { storage } from '../../storage';

describe('ScoresAgent - Schedule Mode (no cache, persistence)', () => {
  let prevRedisUrl: string | undefined;
  const fakeRedis: any = {
    get: vi.fn(),
    set: vi.fn(),
    connect: vi.fn(),
    status: 'ready'
  };

  let broadcastUpdateSpy: any;
  let broadcastStatusSpy: any;
  let createGameSpy: any;

  beforeEach(() => {
    // Enable Redis to assert cache is skipped in schedule mode
    prevRedisUrl = config.redisUrl as any;
    (config as any).redisUrl = 'redis://test';

    vi.mock('../../jobs/redis', () => ({
      createRedis: () => fakeRedis,
      connectRedis: vi.fn().mockResolvedValue(undefined),
      closeRedis: vi.fn().mockResolvedValue(undefined)
    }));

    // Spy on broadcast functions
    broadcastUpdateSpy = vi.spyOn(ws, 'broadcastUserTeamUpdate').mockResolvedValue();
    broadcastStatusSpy = vi.spyOn(ws, 'broadcastUserTeamStatusChange').mockResolvedValue();

    // Spy on storage persistence
    createGameSpy = vi.spyOn(storage, 'createGame').mockImplementation(async (game) => ({
      ...game,
      period: game.period ?? null,
      timeRemaining: game.timeRemaining ?? null,
      cachedAt: new Date(),
    } as any));
  });

  afterEach(() => {
    (config as any).redisUrl = prevRedisUrl;
    vi.restoreAllMocks();
  });

  it('fetches schedule for teamIds, persists games, and skips cache operations', async () => {
    const scheduleGames: ScheduleGame[] = [
      {
        gameId: 'NBA_2025_11_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        startTime: new Date('2025-11-01T20:00:00Z'),
        status: 'scheduled',
        source: 'test'
      },
      {
        gameId: 'NBA_2025_11_GSW_MIA',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_MIA',
        startTime: new Date('2025-11-01T22:00:00Z'),
        status: 'scheduled',
        source: 'test'
      }
    ];

    const adapter: IScoreSource = {
      fetchRecentGames: vi.fn(),
      fetchSchedule: vi.fn().mockResolvedValue(scheduleGames)
    };

    const agent = new ScoresAgent(adapter);
    const result = await agent.runOnce({
      teamIds: ['NBA_LAL', 'NBA_BOS', 'NBA_GSW', 'NBA_MIA'],
      sport: 'NBA',
      mode: 'schedule',
      startDate: new Date('2025-11-01T00:00:00Z'),
      endDate: new Date('2025-11-02T00:00:00Z'),
      limit: 10
    });

    // Verify results
    expect(result.errors).toBe(0);
    expect(result.items.length).toBe(2);
    for (const g of result.items) {
      expect(g.status).toBe('scheduled');
      expect(g.homePts).toBe(0);
      expect(g.awayPts).toBe(0);
    }

    // Persistence occurred
    expect(createGameSpy).toHaveBeenCalledTimes(2);

    // Cache operations are skipped in schedule mode
    expect(fakeRedis.get).not.toHaveBeenCalled();
    expect(fakeRedis.set).not.toHaveBeenCalled();

    // New scheduled games are treated as status changes and broadcasted per team
    expect(broadcastUpdateSpy).not.toHaveBeenCalled();
    expect(broadcastStatusSpy).toHaveBeenCalledTimes(4); // two games x two teams
  });

  it('fetches league-wide schedule with no teamIds and still skips cache', async () => {
    const scheduleGames: ScheduleGame[] = [
      {
        gameId: 'NBA_2025_11_DEN_TOR',
        homeTeamId: 'NBA_DEN',
        awayTeamId: 'NBA_TOR',
        startTime: new Date('2025-11-01T18:00:00Z'),
        status: 'scheduled',
        source: 'test'
      }
    ];

    const adapter: IScoreSource = {
      fetchRecentGames: vi.fn(),
      fetchSchedule: vi.fn().mockResolvedValue(scheduleGames)
    };

    const agent = new ScoresAgent(adapter);
    const result = await agent.runOnce({
      sport: 'NBA',
      mode: 'schedule',
      limit: 5
    });

    expect(result.errors).toBe(0);
    expect(result.items.length).toBe(1);
    expect(result.items[0].status).toBe('scheduled');
    expect(result.items[0].homePts).toBe(0);
    expect(result.items[0].awayPts).toBe(0);

    expect(fakeRedis.get).not.toHaveBeenCalled();
    expect(fakeRedis.set).not.toHaveBeenCalled();
  });
});