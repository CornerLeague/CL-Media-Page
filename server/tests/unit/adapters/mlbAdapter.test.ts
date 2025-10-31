import { describe, it, beforeEach, expect, vi } from 'vitest';
import { MLBAdapter } from '@server/agents/adapters/mlbAdapter';
import adapterTestUtils from '@server/tests/helpers/adapterTestUtils';
import { ethicalFetcher } from '@server/utils/scraping/fetcher';

describe('MLBAdapter.fetchLive (ESPN JSON)', () => {
  beforeEach(() => {
    adapterTestUtils.resetScrapingMocks();
    adapterTestUtils.mockRobotsAllowAll();
    adapterTestUtils.mockRateLimiterImmediate();
  });

  it('parses games from ESPN JSON and respects team filtering', async () => {
    // Load sample ESPN JSON fixture
    const json = adapterTestUtils.loadFixtureHtml('espn/mlb-scoreboard.sample.json');
    const spy = adapterTestUtils.mockEthicalFetcherSequence([json]);

    const adapter = new MLBAdapter();

    // Filter to NYY to only get the Yankees vs Red Sox game
    const results = await adapter.fetchLive(['NYY']);
    expect(results.length).toBe(1);

    const g = results[0];
    adapterTestUtils.assertGameScoreBasic(g);
    expect(g.source).toContain('ESPN');
    expect(g.homeTeamId).toBe('MLB_BOS');
    expect(g.awayTeamId).toBe('MLB_NYY');
    expect(g.homePts).toBe(5);
    expect(g.awayPts).toBe(3);
    expect(g.status).toBe('final');

    // Ensure the fetch was called once (JSON endpoint)
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when robots disallow fetching', async () => {
    // Disallow all robots; ethicalFetcher.fetch will throw
    adapterTestUtils.mockRobotsDisallowAll();
    adapterTestUtils.mockRateLimiterImmediate();

    // Make fetch throw by default when robots disallow
    const fetchSpy = vi.spyOn(ethicalFetcher, 'fetch').mockImplementation(async () => {
      throw new Error('robots disallow');
    });

    const adapter = new MLBAdapter();
    const results = await adapter.fetchLive([]);
    expect(results).toEqual([]);
    expect(fetchSpy).toHaveBeenCalled();
  });
});