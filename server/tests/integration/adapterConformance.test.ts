import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NBAAdapter } from '@server/agents/adapters/nbaAdapter';
import { NFLAdapter } from '@server/agents/adapters/nflAdapter';
import { MLBAdapter } from '@server/agents/adapters/mlbAdapter';
import { NHLAdapter } from '@server/agents/adapters/nhlAdapter';
import { ethicalFetcher } from '@server/utils/scraping/fetcher';
import { globalRobotsChecker } from '@server/utils/scraping/robotsChecker';
import { globalRateLimiter } from '@server/utils/scraping/rateLimiter';

/**
 * 1.5.2 Cross-Adapter Interface Conformance
 * - Verify all adapters implement IScoreSource contract
 * - Assert presence of methods and that calling them returns Promises
 * - Ensure calls do not throw synchronously
 */

describe('Adapter Interface Conformance (1.5.2)', () => {
  beforeEach(() => {
    // Allow all robots and make rate limiter immediate
    vi.spyOn(globalRobotsChecker, 'canFetch').mockResolvedValue(true);
    vi.spyOn(globalRobotsChecker as any, 'clearCache').mockImplementation(() => {});
    vi.spyOn(globalRateLimiter, 'waitIfNeeded').mockResolvedValue(undefined);
    vi.spyOn(globalRateLimiter as any, 'reset').mockImplementation(() => {});

    // Mock ethical fetcher to avoid real network
    vi.spyOn(ethicalFetcher, 'fetch').mockImplementation(async (url: string) => {
      // Return minimal valid JSON for ESPN JSON endpoints; HTML otherwise
      if (url.includes('/apis/') || url.includes('site.api.espn.com')) {
        return JSON.stringify({ events: [] });
      }
      return '<html><body><div class="Scoreboard"></div></body></html>';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('NBAAdapter implements required methods and returns Promises', () => {
    const adapter = new NBAAdapter();
    expect(typeof adapter.fetchRecentGames).toBe('function');
    expect(typeof adapter.fetchLive).toBe('function');
    expect(typeof adapter.fetchSchedule).toBe('function');
    expect(typeof adapter.fetchBoxScore).toBe('function');

    const nbaRecent = adapter.fetchRecentGames({ teamIds: ['NBA_LAL'], limit: 1 });
    expect(nbaRecent).toBeInstanceOf(Promise);
    nbaRecent.catch(() => {});

    const nbaLive = adapter.fetchLive!([]);
    expect(nbaLive).toBeInstanceOf(Promise);
    nbaLive.catch(() => {});

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nbaSchedule = adapter.fetchSchedule!([], start, end);
    expect(nbaSchedule).toBeInstanceOf(Promise);
    nbaSchedule.catch(() => {});

    const nbaBox = adapter.fetchBoxScore!('NBA_ESPN_401812345');
    expect(nbaBox).toBeInstanceOf(Promise);
    nbaBox.catch(() => {});
  });

  it('NFLAdapter implements required methods and returns Promises', () => {
    const adapter = new NFLAdapter();
    expect(typeof adapter.fetchRecentGames).toBe('function');
    expect(typeof adapter.fetchLive).toBe('function');
    expect(typeof adapter.fetchSchedule).toBe('function');
    expect(typeof adapter.fetchBoxScore).toBe('function');

    const nflRecent = adapter.fetchRecentGames({ teamIds: ['NFL_NE'], limit: 1 });
    expect(nflRecent).toBeInstanceOf(Promise);
    nflRecent.catch(() => {});

    const nflLive = adapter.fetchLive!([]);
    expect(nflLive).toBeInstanceOf(Promise);
    nflLive.catch(() => {});

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nflSchedule = adapter.fetchSchedule!([], start, end);
    expect(nflSchedule).toBeInstanceOf(Promise);
    nflSchedule.catch(() => {});

    const nflBox = adapter.fetchBoxScore!('NFL_ESPN_401812345');
    expect(nflBox).toBeInstanceOf(Promise);
    nflBox.catch(() => {});
  });

  it('MLBAdapter implements required methods and returns Promises', () => {
    const adapter = new MLBAdapter();
    expect(typeof adapter.fetchRecentGames).toBe('function');
    expect(typeof adapter.fetchLive).toBe('function');
    expect(typeof adapter.fetchSchedule).toBe('function');
    expect(typeof adapter.fetchBoxScore).toBe('function');

    const mlbRecent = adapter.fetchRecentGames({ teamIds: ['MLB_BOS'], limit: 1 });
    expect(mlbRecent).toBeInstanceOf(Promise);
    mlbRecent.catch(() => {});

    const mlbLive = adapter.fetchLive!([]);
    expect(mlbLive).toBeInstanceOf(Promise);
    mlbLive.catch(() => {});

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const mlbSchedule = adapter.fetchSchedule!([], start, end);
    expect(mlbSchedule).toBeInstanceOf(Promise);
    mlbSchedule.catch(() => {});

    const mlbBox = adapter.fetchBoxScore!('MLB_ESPN_401812345');
    expect(mlbBox).toBeInstanceOf(Promise);
    mlbBox.catch(() => {});
  });

  it('NHLAdapter implements required methods and returns Promises', () => {
    const adapter = new NHLAdapter();
    expect(typeof adapter.fetchRecentGames).toBe('function');
    expect(typeof adapter.fetchLive).toBe('function');
    expect(typeof adapter.fetchSchedule).toBe('function');
    expect(typeof adapter.fetchBoxScore).toBe('function');

    const nhlRecent = adapter.fetchRecentGames({ teamIds: ['NHL_TOR'], limit: 1 });
    expect(nhlRecent).toBeInstanceOf(Promise);
    nhlRecent.catch(() => {});

    const nhlLive = adapter.fetchLive!([]);
    expect(nhlLive).toBeInstanceOf(Promise);
    nhlLive.catch(() => {});

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const nhlSchedule = adapter.fetchSchedule!([], start, end);
    expect(nhlSchedule).toBeInstanceOf(Promise);
    nhlSchedule.catch(() => {});

    // Use a valid ESPN-style event id to satisfy initial validation
    const nhlBox = adapter.fetchBoxScore!('NHL_ESPN_401812345');
    expect(nhlBox).toBeInstanceOf(Promise);
    nhlBox.catch(() => {});
  });
});