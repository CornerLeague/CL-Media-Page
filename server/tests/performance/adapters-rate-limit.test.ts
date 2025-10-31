/**
 * Adapter Performance & Rate Limit Boundaries
 * Subtask 1.5.11 — Validate concurrent adapter calls honor rate limiter
 * and keep execution within documented performance thresholds.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

import { NBAAdapter } from '../../agents/adapters/nbaAdapter';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { globalRateLimiter } from '../../utils/scraping/rateLimiter';
import testUtils from '../helpers/testUtils';

describe('Adapters - Performance & Rate Limit Boundaries (1.5.11)', () => {
  const espnNbaFixturePath = path.resolve(
    __dirname,
    '../fixtures/espn/nba-scoreboard.sample.html'
  );
  const cbsNbaFixturePath = path.resolve(
    __dirname,
    '../fixtures/cbs/nba-scoreboard.sample.html'
  );

  let rateWaitSpy: any;
  let ethicalFetchSpy: any;
  let globalFetchSpy: any;

  beforeEach(() => {
    // Reset limiter between tests to avoid cross-test interference
    globalRateLimiter.reset();

    // Spy on rate limiter; do not actually wait to keep tests fast
    rateWaitSpy = vi
      .spyOn(globalRateLimiter, 'waitIfNeeded')
      .mockImplementation(async () => {});

    // Spy on ethical fetcher (use real implementation)
    ethicalFetchSpy = vi.spyOn(ethicalFetcher, 'fetch');

    // Mock global fetch to avoid network while exercising ethicalFetcher
    globalFetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/robots.txt')) {
          return new Response('User-agent: *\nAllow: /', { status: 200 });
        }
        if (url.includes('espn.com') && url.includes('/nba/scoreboard')) {
          const html = fs.readFileSync(espnNbaFixturePath, 'utf8');
          return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
        if (url.includes('cbssports.com') && url.includes('/nba/scoreboard')) {
          const html = fs.readFileSync(cbsNbaFixturePath, 'utf8');
          return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }
        return new Response('<html><body><div>OK</div></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      });
  });

  it('concurrent fetchLive calls pass through rate limiter (NBA)', async () => {
    const adapter = new NBAAdapter();
    const concurrentCalls = 10;

    const { duration, result } = await testUtils.measureTime(async () => {
      return await Promise.all(
        Array.from({ length: concurrentCalls }, () => adapter.fetchLive([]))
      );
    }, 'NBA concurrent fetchLive');

    // Ensure rate limiter is invoked per call
    expect(rateWaitSpy).toHaveBeenCalled();
    expect(rateWaitSpy.mock.calls.length).toBeGreaterThanOrEqual(concurrentCalls);

    // Basic sanity: all calls resolved and returned arrays
    expect(result).toHaveLength(concurrentCalls);
    result.forEach((games) => {
      expect(Array.isArray(games)).toBe(true);
    });

    // Performance threshold: keep under 500ms for 10 concurrent calls under mocks
    expect(duration).toBeLessThan(500);
  });

  it('rate limiter mock prevents stalls while still being exercised', async () => {
    const adapter = new NBAAdapter();

    // Run a small batch sequentially and concurrently
    await adapter.fetchLive([]);
    await adapter.fetchLive([]);
    await Promise.all([adapter.fetchLive([]), adapter.fetchLive([]), adapter.fetchLive([])]);

    // Assert the limiter was used multiple times (sequential + concurrent)
    expect(rateWaitSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
    // Ensure our stub kept things fast
    const { duration } = await testUtils.measureTime(async () => {
      await Promise.all([adapter.fetchLive([]), adapter.fetchLive([])]);
    });
    expect(duration).toBeLessThan(200);
  });

  it('uses ethical fetcher with correct UA (sanity)', () => {
    const ua = ethicalFetcher.getUserAgent();
    expect(ua).toMatch(/CornerLeagueMedia|CornerLeagueBot|cornerleague/i);
    // Ensure our spies are active
    expect(ethicalFetchSpy).toBeDefined();
    expect(globalFetchSpy).toBeDefined();
  });
});