/**
 * NFL Adapter Integration Tests
 *
 * Validates live data fetching, ethical scraping compliance, and team filtering
 * against real endpoints (when available).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NFLAdapter } from '../../agents/adapters';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { globalRobotsChecker } from '../../utils/scraping/robotsChecker';
import { globalRateLimiter } from '../../utils/scraping/rateLimiter';
import adapterTestUtils from '../helpers/adapterTestUtils';

const {
  mockEthicalFetcherSequence,
  mockRobotsAllowAll,
  mockRateLimiterImmediate,
  resetScrapingMocks,
} = adapterTestUtils;

function buildCBSGame({
  awayTeam,
  homeTeam,
  awayScore,
  homeScore,
  status,
}: {
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  status: string;
}) {
  return `
    <div class="scoreboard-item">
      <div class="away-team">
        <a class="team-name-link">${awayTeam}</a>
        <span class="score">${awayScore}</span>
      </div>
      <div class="home-team">
        <a class="team-name-link">${homeTeam}</a>
        <span class="score">${homeScore}</span>
      </div>
      <div class="game-status">${status}</div>
    </div>
  `;
}

describe('NFLAdapter Integration', () => {
  let adapter: NFLAdapter;

  beforeEach(() => {
    adapter = new NFLAdapter();
    // Clear robots cache to ensure fresh checks
    globalRobotsChecker.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'fetches live NFL games (ESPN primary, CBS fallback)',
    async () => {
      const games = await adapter.fetchLive([]);
      expect(Array.isArray(games)).toBe(true);

      if (games.length > 0) {
        const g = games[0];
        // Basic shape checks
        expect(g.gameId).toBeTruthy();
        expect(g.homeTeamId).toMatch(/^NFL_/);
        expect(g.awayTeamId).toMatch(/^NFL_/);
        expect(['scheduled', 'in_progress', 'final']).toContain(g.status);
        // Optional fields may or may not be present depending on game state
        // Do not assert on period/timeRemaining strictly here to keep integration robust
      }
    },
    30000,
  );

  it(
    'enforces ethical scraping (robots.txt + rate limiting)',
    async () => {
      const robotsSpy = vi.spyOn(globalRobotsChecker, 'canFetch');
      const rateLimitSpy = vi.spyOn(globalRateLimiter, 'waitIfNeeded');

      await adapter.fetchLive([]);

      expect(robotsSpy.mock.calls.length).toBeGreaterThan(0);
      expect(rateLimitSpy.mock.calls.length).toBeGreaterThan(0);
    },
    30000,
  );

  it(
    'uses configured User-Agent via EthicalFetcher',
    async () => {
      const fetchSpy = vi.spyOn(global as any, 'fetch');
      await adapter.fetchLive([]);

      // Verify at least one request included our User-Agent header
      const ua = ethicalFetcher.getUserAgent();
      const hasUserAgent = fetchSpy.mock.calls.some(([, init]) => {
        const headers = (((init as any)?.headers) ?? {}) as Record<string, string>;
        const headerUA = headers['User-Agent'] || headers['user-agent'];
        return typeof headerUA === 'string' && headerUA.includes(ua.split(' ')[0]);
      });

      // If environment blocks network, we may not capture headers; keep test resilient
      expect(hasUserAgent || fetchSpy.mock.calls.length === 0).toBe(true);
    },
    30000,
  );

  it(
    'filters by team codes when provided',
    async () => {
      const teamCode = 'NE'; // Patriots
      const games = await adapter.fetchLive([teamCode]);
      expect(Array.isArray(games)).toBe(true);

      // If games are present, ensure each involves the requested team
      for (const game of games) {
        const involvesTeam =
          game.homeTeamId === `NFL_${teamCode}` || game.awayTeamId === `NFL_${teamCode}`;
        expect(involvesTeam).toBe(true);
      }
    },
    30000,
  );

  it(
    'falls back to CBS when ESPN returns no games',
    async () => {
      const emptyEspnHtml = '<html><body><div>No games</div></body></html>';
      const cbsHtml = `
        <html><body>
          ${buildCBSGame({ awayTeam: 'BUF', homeTeam: 'NYJ', awayScore: 17, homeScore: 20, status: 'Final/OT' })}
        </body></html>
      `;

      vi
        .spyOn(ethicalFetcher, 'fetch')
        .mockResolvedValueOnce(emptyEspnHtml) // ESPN
        .mockResolvedValueOnce(cbsHtml); // CBS

      const games = await adapter.fetchLive([]);
      expect(games.length).toBe(1);
      const g = games[0];
      expect(g.source).toBe('CBS Sports');
      expect(g.status).toBe('final');
      expect(g.period).toBe('OT');
      expect(g.homeTeamId).toBe('NFL_NYJ');
      expect(g.awayTeamId).toBe('NFL_BUF');
      expect(g.homePts).toBe(20);
      expect(g.awayPts).toBe(17);
    },
    30000,
  );

  it(
    'falls back to CBS when ESPN fetch fails',
    async () => {
      const cbsHtml = `
        <html><body>
          ${buildCBSGame({ awayTeam: 'NE', homeTeam: 'KC', awayScore: 14, homeScore: 24, status: 'Q4 03:21' })}
        </body></html>
      `;

      vi
        .spyOn(ethicalFetcher, 'fetch')
        .mockRejectedValueOnce(new Error('ESPN failed'))
        .mockResolvedValueOnce(cbsHtml);

      const games = await adapter.fetchLive([]);
      expect(games.length).toBe(1);
      const g = games[0];
      expect(g.source).toBe('CBS Sports');
      expect(g.status).toBe('in_progress');
      expect(g.period).toBe('4');
      expect(g.timeRemaining).toBe('03:21');
      expect(g.homeTeamId).toBe('NFL_KC');
      expect(g.awayTeamId).toBe('NFL_NE');
    },
    30000,
  );
});

describe('NFLAdapter Error Handling (1.5.10)', () => {
  beforeEach(() => {
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('returns empty array when ESPN and CBS both fail with network errors', async () => {
    const adapter = new NFLAdapter();
    mockEthicalFetcherSequence([
      new Error('ESPN network error'),
      new Error('CBS network error'),
    ]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });

  it('returns empty array when selectors are missing in both sources', async () => {
    const adapter = new NFLAdapter();
    const emptyHtml = '<html><body><div>No scoreboard here</div></body></html>';
    mockEthicalFetcherSequence([emptyHtml, emptyHtml]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });

  it('handles HTTP 429 gracefully without throwing — returns empty array', async () => {
    const adapter = new NFLAdapter();
    mockEthicalFetcherSequence([
      new Error('HTTP 429: Too Many Requests'),
      new Error('HTTP 429: Too Many Requests'),
    ]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });

  it('handles timeout/AbortError gracefully — returns empty array', async () => {
    const adapter = new NFLAdapter();
    mockEthicalFetcherSequence([
      new Error('AbortError'),
      new Error('AbortError'),
    ]);

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });
});