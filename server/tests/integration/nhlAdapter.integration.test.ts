/**
 * NHL Adapter Integration Tests — Fallback Mechanics (1.5.5)
 *
 * Validates multi-step fallback from ESPN (JSON/DOM) to CBS using mocked fetcher and HTML fixtures.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NHLAdapter } from '../../agents/adapters';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { globalRobotsChecker } from '../../utils/scraping/robotsChecker';
import { globalRateLimiter } from '../../utils/scraping/rateLimiter';
import adapterTestUtils from '../helpers/adapterTestUtils';

const {
  mockEthicalFetcherSequence,
  mockRobotsAllowAll,
  mockRateLimiterImmediate,
  resetScrapingMocks,
  loadFixtureHtml,
  assertScheduleGameBasic,
} = adapterTestUtils;

describe('NHLAdapter Fallback (1.5.5) — ESPN → CBS', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('falls back to CBS when ESPN JSON fails and DOM has no games', async () => {
    const adapter = new NHLAdapter();

    const cbsHtml = loadFixtureHtml('cbs/nhl-scoreboard.sample.html');

    const emptyEspnDom = '<html><body><div id="scoreboard"><!-- no ScoreCell items --></div></body></html>';

    // Sequence:
    // 1) ESPN JSON fails
    // 2) ESPN DOM returns empty
    // 3) CBS returns games
    mockEthicalFetcherSequence([
      new Error('ESPN JSON failed'),
      emptyEspnDom,
      cbsHtml,
    ]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);

    const g = games[0];
    expect(g.source).toBe('CBS Sports');
    // Validate mapped team IDs from canonical names
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_PIT');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_STL');
  });

  it(
    'enforces ethical scraping (robots.txt + rate limiting)',
    async () => {
      const adapter = new NHLAdapter();

      // Stub global fetch to return minimal ESPN JSON scoreboard
      const json = JSON.stringify({
        events: [
          {
            id: '1',
            date: '2025-10-27T23:00:00Z',
            competitions: [
              {
                date: '2025-10-27T23:00:00Z',
                competitors: [
                  {
                    homeAway: 'away',
                    score: '2',
                    team: { abbreviation: 'PIT', displayName: 'Pittsburgh Penguins', shortDisplayName: 'PIT' },
                  },
                  {
                    homeAway: 'home',
                    score: '3',
                    team: { abbreviation: 'STL', displayName: 'St. Louis Blues', shortDisplayName: 'STL' },
                  },
                ],
                status: { type: { state: 'post', detail: 'Final' } },
              },
            ],
            status: { type: { state: 'post', detail: 'Final' } },
          },
        ],
      });

      vi.spyOn(global as any, 'fetch').mockResolvedValue({ ok: true, text: async () => json });

      await adapter.fetchLive([]);

      const robotsCalls = ((globalRobotsChecker.canFetch as any)?.mock?.calls ?? []) as any[];
      const rateLimitCalls = ((globalRateLimiter.waitIfNeeded as any)?.mock?.calls ?? []) as any[];
      expect(robotsCalls.length).toBeGreaterThan(0);
      expect(rateLimitCalls.length).toBeGreaterThan(0);
    },
    30000,
  );

  it(
    'uses configured User-Agent via EthicalFetcher',
    async () => {
      const adapter = new NHLAdapter();

      // Spy on global fetch to capture headers and return JSON
      const json = JSON.stringify({ events: [] });
      const fetchSpy = vi.spyOn(global as any, 'fetch').mockResolvedValue({ ok: true, text: async () => json });

      await adapter.fetchLive([]);

      const ua = ethicalFetcher.getUserAgent();
      const hasUserAgent = fetchSpy.mock.calls.some(([, init]) => {
        const headers = (((init as any)?.headers) ?? {}) as Record<string, string>;
        const headerUA = headers['User-Agent'] || headers['user-agent'];
        return typeof headerUA === 'string' && headerUA.includes(ua.split(' ')[0]);
      });

      expect(hasUserAgent).toBe(true);
    },
    30000,
  );
});

describe('NHLAdapter Box Score (1.5.8)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('returns box score via ESPN summary JSON', async () => {
    const adapter = new NHLAdapter();

    const summaryJson = JSON.stringify({
      competitions: [
        {
          competitors: [
            { homeAway: 'away', score: '3' },
            { homeAway: 'home', score: '4' },
          ],
        },
      ],
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(summaryJson); // ESPN summary JSON

    const box = await adapter.fetchBoxScore('401800020');
    expect(box.gameId).toBe('NHL_ESPN_401800020');
    expect(box.source).toBe('ESPN API');
    expect(box.away.pts).toBe(3);
    expect(box.home.pts).toBe(4);
    expect(box.updatedAt instanceof Date).toBe(true);
  });

  it('falls back to DOM when summary JSON is missing competitors', async () => {
    const adapter = new NHLAdapter();

    const badSummaryJson = JSON.stringify({ competitions: [] });
    const domHtml = `
      <html><body>
        <div class="Competitors">
          <div class="ScoreboardScoreCell__Score">2</div>
          <div class="ScoreboardScoreCell__Score">5</div>
        </div>
      </body></html>
    `;

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(badSummaryJson); // ESPN summary JSON (bad)
    spy.mockResolvedValueOnce(domHtml);        // ESPN game page DOM

    const box = await adapter.fetchBoxScore('401800021');
    expect(box.gameId).toBe('NHL_ESPN_401800021');
    expect(box.source).toBe('ESPN.com');
    expect(box.away.pts).toBe(2);
    expect(box.home.pts).toBe(5);
    expect(box.updatedAt instanceof Date).toBe(true);
  });
});

describe('NHLAdapter Featured Games (1.5.9)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('returns featured games via ESPN JSON and respects limit', async () => {
    const adapter = new NHLAdapter();

    const iso = new Date().toISOString();
    const scoreboardJson = JSON.stringify({
      events: [
        {
          id: '401800101',
          date: iso,
          status: { type: { state: 'pre' } },
          competitions: [
            {
              date: iso,
              status: { type: { state: 'pre' } },
              competitors: [
                { team: { abbreviation: 'TOR', displayName: 'Toronto Maple Leafs' }, homeAway: 'home' },
                { team: { abbreviation: 'MTL', displayName: 'Montreal Canadiens' }, homeAway: 'away' },
              ],
            },
          ],
        },
        {
          id: '401800102',
          date: iso,
          status: { type: { state: 'pre' } },
          competitions: [
            {
              date: iso,
              status: { type: { state: 'pre' } },
              competitors: [
                { team: { abbreviation: 'BOS', displayName: 'Boston Bruins' }, homeAway: 'home' },
                { team: { abbreviation: 'NYR', displayName: 'New York Rangers' }, homeAway: 'away' },
              ],
            },
          ],
        },
      ],
    });

    // NHLAdapter may try primary then alternate JSON; return same payload for both
    mockEthicalFetcherSequence([scoreboardJson, scoreboardJson]);

    const featured = await adapter.fetchFeaturedGames('NHL', 1);
    expect(Array.isArray(featured)).toBe(true);
    expect(featured.length).toBe(1);
    assertScheduleGameBasic(featured[0]);
    expect(featured[0].source).toMatch(/ESPN/);
  });
});

describe('NHLAdapter Error Handling (1.5.10)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('returns empty array when ESPN and CBS both fail with network errors', async () => {
    const adapter = new NHLAdapter();
    mockEthicalFetcherSequence([
      new Error('ESPN network error'),
      new Error('CBS network error'),
    ]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });

  it('returns empty array when selectors are missing in both sources', async () => {
    const adapter = new NHLAdapter();
    const emptyHtml = '<html><body><div>No scoreboard here</div></body></html>';
    mockEthicalFetcherSequence([emptyHtml, emptyHtml]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });
});