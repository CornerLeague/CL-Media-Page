import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IScoreSource } from '../../agents/types';
import { ScoresAgent } from '../../agents/scoresAgent';
import * as ws from '../../ws';
import { storage } from '../../storage';

describe('ScoresAgent - Legacy fallback to fetchRecentGames', () => {
  let broadcastUpdateSpy: any;
  let broadcastStatusSpy: any;
  let createGameSpy: any;

  beforeEach(() => {
    broadcastUpdateSpy = vi.spyOn(ws, 'broadcastUserTeamUpdate').mockResolvedValue();
    broadcastStatusSpy = vi.spyOn(ws, 'broadcastUserTeamStatusChange').mockResolvedValue();
    createGameSpy = vi.spyOn(storage, 'createGame').mockImplementation(async (game) => ({
      ...game,
      period: game.period ?? null,
      timeRemaining: game.timeRemaining ?? null,
      cachedAt: new Date(),
    } as any));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to fetchRecentGames when fetchLive is not available', async () => {
    const insertedGames = [
      {
        id: 'NBA_2025_11_BOS_LAL',
        homeTeamId: 'NBA_BOS',
        awayTeamId: 'NBA_LAL',
        sport: 'NBA',
        startTime: new Date('2025-11-01T18:00:00Z'),
        status: 'final',
        homePts: 100,
        awayPts: 97,
        source: 'legacy',
      },
      {
        id: 'NBA_2025_11_MIA_GSW',
        homeTeamId: 'NBA_MIA',
        awayTeamId: 'NBA_GSW',
        sport: 'NBA',
        startTime: new Date('2025-11-01T19:00:00Z'),
        status: 'final',
        homePts: 89,
        awayPts: 95,
        source: 'legacy',
      },
    ];

    const adapter: IScoreSource = {
      // Simulate legacy adapter without fetchLive
      fetchRecentGames: vi.fn().mockResolvedValue(insertedGames)
    } as any;

    const agent = new ScoresAgent(adapter);
    const result = await agent.runOnce({
      teamIds: ['NBA_BOS', 'NBA_LAL', 'NBA_MIA', 'NBA_GSW'],
      sport: 'NBA',
      mode: 'live',
      limit: 10
    });

    expect(result.errors).toBe(0);
    expect(result.items.length).toBe(2);
    expect(result.items.map(i => i.id)).toContain('NBA_2025_11_BOS_LAL');
    expect(result.items.map(i => i.id)).toContain('NBA_2025_11_MIA_GSW');

    // Persistence via storage.createGame called for both games
    expect(createGameSpy).toHaveBeenCalledTimes(2);

    // Final games should produce status change broadcasts to each team
    expect(broadcastStatusSpy).toHaveBeenCalledTimes(4);
    // Updates broadcast may happen depending on detectGameChanges; not strictly required
    expect(broadcastUpdateSpy).toHaveBeenCalledTimes(0);
  });
});