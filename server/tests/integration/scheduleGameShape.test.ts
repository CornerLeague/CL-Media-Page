import { describe, it, expect, beforeEach } from 'vitest';
import { NBAAdapter, NHLAdapter, NFLAdapter, MLBAdapter } from '../../agents/adapters';
import {
  mockEthicalFetcherHtml,
  mockEthicalFetcherSequence,
  mockRobotsAllowAll,
  mockRateLimiterImmediate,
  resetScrapingMocks,
  assertScheduleGameBasic,
} from '../helpers/adapterTestUtils';

// Helper: today bounds
const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};
const endOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
};

describe('ScheduleGame Shape Validation', () => {
  beforeEach(() => {
    resetScrapingMocks();
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  it('NHL: fetchSchedule returns scheduled games within date range (ESPN JSON)', async () => {
    const start = startOfToday();
    const end = endOfToday();
    const iso = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 19, 30, 0).toISOString();

    const scoreboardJson = JSON.stringify({
      events: [
        {
          id: 'nhl_sched_1',
          date: iso,
          status: { type: { state: 'pre' } },
          competitions: [
            {
              date: iso,
              status: { type: { state: 'pre' } },
              competitors: [
                { team: { abbreviation: 'NYR' }, homeAway: 'away' },
                { team: { abbreviation: 'NJD' }, homeAway: 'home' },
              ],
            },
          ],
        },
      ],
    });

    // NHLAdapter may try primary then alternate JSON; return same payload for both
    mockEthicalFetcherSequence([scoreboardJson, scoreboardJson]);

    const adapter = new NHLAdapter();
    const schedule = await adapter.fetchSchedule([], start, end);
    expect(schedule.length).toBeGreaterThan(0);
    schedule.forEach((s) => {
      assertScheduleGameBasic(s);
      expect(s.status).toBe('scheduled');
      expect(s.startTime.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(s.startTime.getTime()).toBeLessThanOrEqual(end.getTime());
      expect(s.source).toBeTruthy();
    });
  });

  it('NBA: fetchSchedule filters scheduled-only from live and respects date range', async () => {
    const start = startOfToday();
    const end = endOfToday();
    const html = `
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">BOS</div>
        <div class="ScoreCell__Score">0</div>
        <div class="ScoreCell__TeamName">LAL</div>
        <div class="ScoreCell__Score">0</div>
        <div class="ScoreCell__Status">7:00 PM</div>
      </div>
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">MIA</div>
        <div class="ScoreCell__Score">45</div>
        <div class="ScoreCell__TeamName">NYK</div>
        <div class="ScoreCell__Score">50</div>
        <div class="ScoreCell__Status">Q3 05:45</div>
      </div>
    `;
    mockEthicalFetcherHtml(html);

    const adapter = new NBAAdapter();
    const schedule = await adapter.fetchSchedule([], start, end);
    expect(schedule.length).toBe(1);
    schedule.forEach((s) => {
      assertScheduleGameBasic(s);
      expect(s.status).toBe('scheduled');
      expect(s.startTime.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(s.startTime.getTime()).toBeLessThanOrEqual(end.getTime());
      expect(s.source).toBeTruthy();
    });
  });

  it.skip('NFL: fetchSchedule not implemented yet — skip', async () => {
    const adapter = new NFLAdapter();
    const start = startOfToday();
    const end = endOfToday();
    const schedule = await adapter.fetchSchedule([], start, end);
    expect(Array.isArray(schedule)).toBe(true);
  });

  it.skip('MLB: fetchSchedule not implemented yet — skip', async () => {
    const adapter = new MLBAdapter();
    const start = startOfToday();
    const end = endOfToday();
    const schedule = await adapter.fetchSchedule([], start, end);
    expect(Array.isArray(schedule)).toBe(true);
  });
});