/// <reference types="vitest" />
/**
 * NBAAdapter - fetchSchedule basic unit tests
 * Verifies scheduled-only filtering, date range boundaries, and team-code pass-through
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NBAAdapter } from '@server/agents/adapters/nbaAdapter';
import type { GameScore, ScheduleGame } from '@server/agents/types';

describe('NBAAdapter fetchSchedule (basics)', () => {
  let adapter: NBAAdapter;

  beforeEach(() => {
    adapter = new NBAAdapter();
    vi.useFakeTimers();
    // Stable base date: Jan 25, 2025
    vi.setSystemTime(new Date(2025, 0, 25, 12, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  function makeGame(
    {
      id,
      homeId,
      awayId,
      status,
      start,
      source = 'ESPN.com',
    }: {
      id: string;
      homeId: string;
      awayId: string;
      status: 'scheduled' | 'in_progress' | 'final';
      start: Date;
      source?: string;
    }
  ): GameScore {
    return {
      gameId: id,
      homeTeamId: homeId,
      awayTeamId: awayId,
      homePts: 0,
      awayPts: 0,
      status,
      period: undefined,
      timeRemaining: undefined,
      startTime: start,
      source,
    };
  }

  it('returns only scheduled games within date range', async () => {
    const spy = vi
      .spyOn(adapter, 'fetchLive')
      .mockResolvedValue([
        makeGame({
          id: 'G1',
          awayId: 'NBA_BOS',
          homeId: 'NBA_LAL',
          status: 'scheduled',
          start: new Date(2025, 0, 25, 19, 30), // Jan 25 7:30 PM
        }),
        makeGame({
          id: 'G2',
          awayId: 'NBA_NYK',
          homeId: 'NBA_MIA',
          status: 'in_progress',
          start: new Date(2025, 0, 25, 20, 0),
        }),
        makeGame({
          id: 'G3',
          awayId: 'NBA_GSW',
          homeId: 'NBA_DEN',
          status: 'final',
          start: new Date(2025, 0, 24, 19, 0),
        }),
        makeGame({
          id: 'G4',
          awayId: 'NBA_CHI',
          homeId: 'NBA_TOR',
          status: 'scheduled',
          start: new Date(2025, 0, 26, 18, 0), // Jan 26 6:00 PM
        }),
      ]);

    const start = new Date(2025, 0, 25, 0, 0);
    const end = new Date(2025, 0, 25, 23, 59, 59);

    const schedule: ScheduleGame[] = await adapter.fetchSchedule([], start, end);
    expect(spy).toHaveBeenCalledOnce();
    expect(Array.isArray(schedule)).toBe(true);
    // Only G1 should be included (scheduled & within Jan 25 range)
    expect(schedule.length).toBe(1);
    expect(schedule[0].gameId).toBe('G1');
    expect(schedule[0].status).toBe('scheduled');
    expect(schedule[0].startTime.getDate()).toBe(25);
  });

  it('respects inclusive range boundaries', async () => {
    vi.spyOn(adapter, 'fetchLive').mockResolvedValue([
      makeGame({
        id: 'G5',
        awayId: 'NBA_SA',
        homeId: 'NBA_HOU',
        status: 'scheduled',
        start: new Date(2025, 0, 25, 0, 0, 0), // exactly at start boundary
      }),
      makeGame({
        id: 'G6',
        awayId: 'NBA_UTA',
        homeId: 'NBA_PHI',
        status: 'scheduled',
        start: new Date(2025, 0, 25, 23, 59, 59), // exactly at end boundary
      }),
    ]);

    const start = new Date(2025, 0, 25, 0, 0, 0);
    const end = new Date(2025, 0, 25, 23, 59, 59);
    const schedule: ScheduleGame[] = await adapter.fetchSchedule([], start, end);
    expect(schedule.map((s: ScheduleGame) => s.gameId)).toEqual(['G5', 'G6']);
  });

  it('passes teamCodes through to fetchLive', async () => {
    const spy = vi
      .spyOn(adapter, 'fetchLive')
      .mockResolvedValue([
        makeGame({
          id: 'G7',
          awayId: 'NBA_LAL',
          homeId: 'NBA_BOS',
          status: 'scheduled',
          start: new Date(2025, 0, 25, 19, 0),
        }),
      ]);

    const schedule: ScheduleGame[] = await adapter.fetchSchedule(['LAL'], new Date(2025, 0, 25), new Date(2025, 0, 26));
    expect(spy).toHaveBeenCalledWith(['LAL']);
    expect(schedule.length).toBe(1);
    expect(schedule[0].awayTeamId).toBe('NBA_LAL');
  });
});