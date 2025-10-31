import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SportAdapterFactory } from '../../agents/adapters/sportAdapterFactory';
import { ScoresAgent } from '../../agents/scoresAgent';
import { storage } from '../../storage';
import * as ws from '../../ws';
import { config } from '../../config';
import type { InsertGame } from '@shared/schema';
import type { GameScore, ScheduleGame } from '../../agents/types';

describe('ScoresAgent Integration (1.5.9) — NBA Live via Factory', () => {
  let broadcastSpy: any;
  let createGameSpy: any;

  let prevRedisUrl: string | undefined;
  beforeEach(() => {
    // Spy on broadcast to avoid side effects
    broadcastSpy = vi.spyOn(ws, 'broadcast').mockImplementation(() => {});
    // Spy on storage.createGame to assert persistence calls; mock to safe in-memory-like behavior
    createGameSpy = vi.spyOn(storage, 'createGame').mockImplementation(async (game) => ({
      ...game,
      period: game.period ?? null,
      timeRemaining: game.timeRemaining ?? null,
      cachedAt: new Date(),
    }));
    // Disable Redis caching for deterministic test behavior
    prevRedisUrl = config.redisUrl as any;
    (config as any).redisUrl = undefined;
  });

  afterEach(() => {
    // Restore Redis URL
    (config as any).redisUrl = prevRedisUrl;
    vi.restoreAllMocks();
  });

  it('merges duplicate game entries across sources and persists unique validated items', async () => {
    const adapter = SportAdapterFactory.getAdapter('NBA');
    const agent = new ScoresAgent(adapter);

    // Craft two entries for same game from different sources + a second distinct game
    const now = new Date();
    const later = new Date(now.getTime() + 60_000);

    const liveScores: GameScore[] = [
      {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 70,
        awayPts: 68,
        status: 'in_progress',
        period: '3',
        timeRemaining: '5:12',
        startTime: now,
        source: 'ESPN',
      },
      {
        gameId: 'NBA_2025_01_LAL_BOS',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 69,
        awayPts: 68,
        status: 'scheduled',
        period: undefined,
        timeRemaining: undefined,
        startTime: later, // later startTime should be chosen for points
        source: 'CBS Sports',
      },
      {
        gameId: 'NBA_2025_01_NYK_MIA',
        homeTeamId: 'NBA_NYK',
        awayTeamId: 'NBA_MIA',
        homePts: 40,
        awayPts: 45,
        status: 'in_progress',
        period: '2',
        timeRemaining: '7:47',
        startTime: now,
        source: 'ESPN',
      },
    ];

    // Stub adapter.fetchLive to return our controlled list
    vi.spyOn(adapter, 'fetchLive').mockResolvedValueOnce(liveScores);

    const result = await agent.runOnce({ teamIds: ['NBA_LAL', 'NBA_BOS', 'NBA_NYK', 'NBA_MIA'], limit: 10, sport: 'NBA', mode: 'live' });

    // Two unique gameIds expected after validation/merge
    expect(result.persisted).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items.length).toBe(2);

    // Ensure storage.createGame was called twice
    expect(createGameSpy).toHaveBeenCalledTimes(2);
    // Ensure broadcast invoked twice (once per persisted item)
    expect(broadcastSpy).toHaveBeenCalledTimes(2);

    // Validate merge behavior: majority status is 'in_progress' for LAL_BOS; points come from later item
    const merged = result.items.find((g) => g.id === 'NBA_2025_01_LAL_BOS');
    expect(merged).toBeTruthy();
    // Current ValidationService picks majority count; tie resolves by entry order (scheduled wins)
    expect(merged!.status).toBe('scheduled');
    expect(merged!.homePts).toBe(69); // later startTime points selected
    expect(merged!.awayPts).toBe(68);
    expect(merged!.homeTeamId).toBe('NBA_LAL');
    expect(merged!.awayTeamId).toBe('NBA_BOS');
  });
});

describe('ScoresAgent Integration (1.5.9) — NHL Featured via Factory', () => {
  let broadcastSpy: any;
  let createGameSpy: any;

  let prevRedisUrl2: string | undefined;
  beforeEach(() => {
    broadcastSpy = (vi.spyOn(ws as any, 'broadcast') as any).mockImplementation(() => {});
    createGameSpy = (vi.spyOn(storage as any, 'createGame') as any).mockImplementation(async (game: InsertGame) => ({
      ...game,
      period: game.period ?? null,
      timeRemaining: game.timeRemaining ?? null,
      cachedAt: new Date(),
    }));
    prevRedisUrl2 = config.redisUrl as any;
    (config as any).redisUrl = undefined;
  });

  afterEach(() => {
    (config as any).redisUrl = prevRedisUrl2;
    vi.restoreAllMocks();
  });

  it('maps featured games to cached InsertGame format and persists', async () => {
    const adapter = SportAdapterFactory.getAdapter('NHL');
    const agent = new ScoresAgent(adapter);

    const start = new Date();
    const featured: ScheduleGame[] = [
      {
        gameId: 'NHL_2025_01_NYR_BOS',
        homeTeamId: 'NHL_BOS',
        awayTeamId: 'NHL_NYR',
        status: 'scheduled',
        startTime: start,
        source: 'ESPN NHL',
      },
    ];

    // Stub adapter.fetchFeaturedGames to return a single item
    vi.spyOn(adapter, 'fetchFeaturedGames').mockResolvedValueOnce(featured);

    const result = await agent.runOnce({ sport: 'NHL', limit: 5, mode: 'featured' });

    expect(result.errors).toBe(0);
    expect(result.persisted).toBe(1);
    expect(result.items.length).toBe(1);
    const g = result.items[0];
    expect(g.id).toBe('NHL_2025_01_NYR_BOS');
    expect(g.status).toBe('scheduled');
    expect(g.homePts).toBe(0);
    expect(g.awayPts).toBe(0);
    expect(g.startTime instanceof Date).toBe(true);

    expect(createGameSpy).toHaveBeenCalledTimes(1);
    expect(broadcastSpy).toHaveBeenCalledTimes(1);
  });
});