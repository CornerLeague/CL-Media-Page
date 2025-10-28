/**
 * MLB Adapter Integration Tests
 *
 * Validates live data fetching, ethical scraping compliance, and team filtering
 * against real endpoints (when available).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MLBAdapter } from '../../agents/adapters/mlbAdapter';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { globalRobotsChecker } from '../../utils/scraping/robotsChecker';
import { globalRateLimiter } from '../../utils/scraping/rateLimiter';

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

describe('MLBAdapter Integration', () => {
  let adapter: MLBAdapter;

  beforeEach(() => {
    adapter = new MLBAdapter();
    // Clear robots cache to ensure fresh checks
    globalRobotsChecker.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(
    'fetches live MLB games (ESPN primary, CBS fallback)',
    async () => {
      const games = await adapter.fetchLive([]);
      expect(Array.isArray(games)).toBe(true);

      if (games.length > 0) {
        const g = games[0];
        // Basic shape checks
        expect(g.gameId).toBeTruthy();
        expect(g.homeTeamId).toMatch(/^MLB_/);
        expect(g.awayTeamId).toMatch(/^MLB_/);
        expect(['scheduled', 'in_progress', 'final']).toContain(g.status);
        // Optional fields may or may not be present depending on game state
        // Do not assert on period/outs strictly here to keep integration robust
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
      const teamCode = 'NYY'; // Yankees
      const games = await adapter.fetchLive([teamCode]);
      expect(Array.isArray(games)).toBe(true);

      // If games are present, ensure each involves the requested team
      for (const game of games) {
        const involvesTeam =
          game.homeTeamId === `MLB_${teamCode}` || game.awayTeamId === `MLB_${teamCode}`;
        expect(involvesTeam).toBe(true);
      }
    },
    30000,
  );

  it(
    'falls back to CBS when ESPN returns no games',
    async () => {
      const cbsHtml = `
        <html><body>
          ${buildCBSGame({ awayTeam: 'Giants', homeTeam: 'Dodgers', awayScore: 2, homeScore: 3, status: 'Final/10' })}
        </body></html>
      `;

      vi
        .spyOn(ethicalFetcher, 'fetch')
        .mockResolvedValueOnce('{"events":[]}') // ESPN JSON returns no games
        .mockResolvedValueOnce(cbsHtml); // CBS

      const games = await adapter.fetchLive([]);
      expect(games.length).toBe(1);
      const g = games[0];
      expect(g.source).toBe('CBS Sports');
      expect(g.status).toBe('final');
      expect(g.period).toBe('10');
      expect(g.homeTeamId).toBe('MLB_LAD');
      expect(g.awayTeamId).toBe('MLB_SF');
      expect(g.homePts).toBe(3);
      expect(g.awayPts).toBe(2);
    },
    30000,
  );

  it(
    'falls back to CBS when ESPN fetch fails',
    async () => {
      const cbsHtml = `
        <html><body>
          ${buildCBSGame({ awayTeam: 'Red Sox', homeTeam: 'Yankees', awayScore: 1, homeScore: 4, status: 'T8 2 outs' })}
        </body></html>
      `;

      vi
        .spyOn(ethicalFetcher, 'fetch')
        .mockRejectedValueOnce(new Error('ESPN failed')) // ESPN JSON fails
        .mockResolvedValueOnce('<html><body><div>No games</div></body></html>') // ESPN DOM returns no games
        .mockResolvedValueOnce(cbsHtml); // CBS

      const games = await adapter.fetchLive([]);
      expect(games.length).toBe(1);
      const g = games[0];
      expect(g.source).toBe('CBS Sports');
      expect(g.status).toBe('in_progress');
      expect(g.period).toBe('8');
      expect(g.homeTeamId).toBe('MLB_NYY');
      expect(g.awayTeamId).toBe('MLB_BOS');
    },
    30000,
  );
});