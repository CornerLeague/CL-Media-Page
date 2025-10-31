/**
 * NBA Adapter Integration Tests — Fallback Mechanics (1.5.5)
 *
 * Validates fallback from ESPN to CBS using mocked fetcher and HTML fixtures.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NBAAdapter } from '../../agents/adapters';
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

describe('NBAAdapter Fallback (1.5.5) — ESPN → CBS', () => {
  beforeEach(() => {
    // Allow scraping and avoid delays
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('falls back to CBS when ESPN fetch fails', async () => {
    const adapter = new NBAAdapter();

    const cbsHtml = loadFixtureHtml('cbs/nba-scoreboard.sample.html');

    // First call (ESPN) fails; second call (CBS) succeeds
    mockEthicalFetcherSequence([new Error('ESPN failed'), cbsHtml]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);

    const g = games[0];
    expect(g.source).toBe('CBS Sports');
    // Validate mapped team IDs from canonical names
    expect([g.awayTeamId, g.homeTeamId]).toContain('NBA_MIA');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NBA_BOS');
    expect(g.status).toBe('final');
  });

  it('falls back to CBS when ESPN returns no games', async () => {
    const adapter = new NBAAdapter();

    const emptyEspn = '<html><body><div id="no-games"></div></body></html>';
    const cbsHtml = loadFixtureHtml('cbs/nba-scoreboard.sample.html');

    // ESPN returns empty list, CBS provides games
    mockEthicalFetcherSequence([emptyEspn, cbsHtml]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);

    const g = games[0];
    expect(g.source).toBe('CBS Sports');
  });

  it(
    'enforces ethical scraping (robots.txt + rate limiting)',
    async () => {
      const adapter = new NBAAdapter();

      // Stub global fetch to return minimal ESPN-like HTML
      const espnHtml = `
        <html><body>
          <div class="ScoreCell">
            <div class="ScoreCell__TeamName">MIA</div>
            <div class="ScoreCell__TeamName">BOS</div>
            <div class="ScoreCell__Score">98</div>
            <div class="ScoreCell__Score">102</div>
            <div class="ScoreCell__Status">Final</div>
          </div>
        </body></html>
      `;
      vi.spyOn(global as any, 'fetch').mockResolvedValue({ ok: true, text: async () => espnHtml });

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
      const adapter = new NBAAdapter();

      // Spy on global fetch to capture headers and return HTML
      const espnHtml = `
        <html><body>
          <div class="ScoreCell">
            <div class="ScoreCell__TeamName">MIA</div>
            <div class="ScoreCell__TeamName">BOS</div>
            <div class="ScoreCell__Score">98</div>
            <div class="ScoreCell__Score">102</div>
            <div class="ScoreCell__Status">Final</div>
          </div>
        </body></html>
      `;
      const fetchSpy = vi.spyOn(global as any, 'fetch').mockResolvedValue({ ok: true, text: async () => espnHtml });

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

describe('NBAAdapter Box Score (1.5.8)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it.skip('fetchBoxScore is not implemented yet (returns safe defaults)', async () => {
    const adapter = new NBAAdapter();
    const box = await adapter.fetchBoxScore('401000000');
    expect(box).toBeDefined();
    expect(box.source).toBe('unavailable');
    expect(typeof box.home.pts).toBe('number');
    expect(typeof box.away.pts).toBe('number');
  });
});

describe('NBAAdapter Featured Games (1.5.9)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('returns featured games via ESPN DOM and respects limit', async () => {
    const adapter = new NBAAdapter();
    const html = `
      <div class="ScoreboardScoreCell">
        <div class="ScoreCell">
          <div class="ScoreCell__Competitors">
            <div class="ScoreCell__TeamName">Lakers</div>
            <div class="ScoreCell__Score">110</div>
            <div class="ScoreCell__TeamName">Warriors</div>
            <div class="ScoreCell__Score">108</div>
          </div>
          <div class="ScoreCell__Status">Final</div>
        </div>
      </div>
      <div class="ScoreboardScoreCell">
        <div class="ScoreCell">
          <div class="ScoreCell__Competitors">
            <div class="ScoreCell__TeamName">Celtics</div>
            <div class="ScoreCell__Score">99</div>
            <div class="ScoreCell__TeamName">Heat</div>
            <div class="ScoreCell__Score">101</div>
          </div>
          <div class="ScoreCell__Status">Final</div>
        </div>
      </div>
    `;

    mockEthicalFetcherSequence([html]);

    const featured = await adapter.fetchFeaturedGames('NBA', 1);
    expect(Array.isArray(featured)).toBe(true);
    expect(featured.length).toBe(1);
    assertScheduleGameBasic(featured[0]);
    expect(featured[0].source).toMatch(/ESPN/);
  });
});

describe('NBAAdapter Error Handling (1.5.10)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('returns empty array when ESPN and CBS both fail with network errors', async () => {
    const adapter = new NBAAdapter();
    mockEthicalFetcherSequence([
      new Error('ESPN network error'),
      new Error('CBS network error'),
    ]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });

  it('returns empty array when selectors are missing in both sources', async () => {
    const adapter = new NBAAdapter();
    const emptyHtml = '<html><body><div>No scoreboard here</div></body></html>';
    mockEthicalFetcherSequence([emptyHtml, emptyHtml]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });
});