import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScoresAgent } from '../../agents/scoresAgent';
import { DummyScoreSource } from '../../agents/adapters/dummyScoreSource';
import { storage } from '../../storage';
import * as ws from '../../ws';
import { config } from '../../config';

describe('ScoresAgent - Live Mode Team Isolation', () => {
  let prevRedisUrl: string | undefined;
  let createGameSpy: any;
  let broadcastSpy: any;

  beforeEach(() => {
    // Disable Redis caching for deterministic behavior
    prevRedisUrl = config.redisUrl as any;
    (config as any).redisUrl = undefined;
    // Avoid side-effectful broadcast/storage
    broadcastSpy = vi.spyOn(ws, 'broadcast').mockImplementation(() => {});
    createGameSpy = vi.spyOn(storage, 'createGame').mockImplementation(async (game) => ({
      ...game,
      period: game.period ?? null,
      timeRemaining: game.timeRemaining ?? null,
      cachedAt: new Date(),
    }));
  });

  afterEach(() => {
    (config as any).redisUrl = prevRedisUrl;
    vi.restoreAllMocks();
  });

  it('persists only games involving requested teams', async () => {
    const adapter = new DummyScoreSource();
    const agent = new ScoresAgent(adapter);

    const result = await agent.runOnce({ teamIds: ['NBA_LAL', 'NBA_BOS'], mode: 'live', limit: 4 });

    expect(result.errors).toBe(0);
    expect(result.items.length).toBeGreaterThan(0);
    const allowed = new Set(['NBA_LAL', 'NBA_BOS']);
    for (const g of result.items) {
      expect(allowed.has(g.homeTeamId) || allowed.has(g.awayTeamId)).toBe(true);
    }
  });

  it('returns empty result and does not fetch when teamIds are invalid in live mode', async () => {
    const adapter = new DummyScoreSource();
    const agent = new ScoresAgent(adapter);
    const fetchLiveSpy = vi.spyOn(adapter, 'fetchLive');

    const result = await agent.runOnce({ teamIds: ['bad', '123'], mode: 'live', limit: 4 });

    expect(result.errors).toBe(0);
    expect(result.persisted).toBe(0);
    expect(result.items.length).toBe(0);
    expect(fetchLiveSpy).not.toHaveBeenCalled();
  });
});