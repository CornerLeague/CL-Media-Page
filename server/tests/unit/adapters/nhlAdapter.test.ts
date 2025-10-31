import { describe, it, beforeEach, expect, vi } from 'vitest';
import { NHLAdapter } from '@server/agents/adapters/nhlAdapter';
import adapterTestUtils from '@server/tests/helpers/adapterTestUtils';
import { ethicalFetcher } from '@server/utils/scraping/fetcher';

describe('NHLAdapter.fetchLive (ESPN JSON)', () => {
  beforeEach(() => {
    adapterTestUtils.resetScrapingMocks();
    adapterTestUtils.mockRobotsAllowAll();
    adapterTestUtils.mockRateLimiterImmediate();
  });

  it('parses games from ESPN JSON and respects team filtering', async () => {
    const json = adapterTestUtils.loadFixtureHtml('espn/nhl-scoreboard.sample.json');
    const spy = adapterTestUtils.mockEthicalFetcherSequence([json]);

    const adapter = new NHLAdapter();
    const results = await adapter.fetchLive(['VGK']);
    expect(results.length).toBe(1);

    const g = results[0];
    adapterTestUtils.assertGameScoreBasic(g);
    expect(g.source).toContain('ESPN');
    expect(g.homeTeamId).toBe('NHL_LAK');
    expect(g.awayTeamId).toBe('NHL_VGK');
    expect(g.homePts).toBe(2);
    expect(g.awayPts).toBe(1);
    expect(g.status).toBe('in_progress');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when robots disallow fetching', async () => {
    adapterTestUtils.mockRobotsDisallowAll();
    adapterTestUtils.mockRateLimiterImmediate();

    const fetchSpy = vi.spyOn(ethicalFetcher, 'fetch').mockImplementation(async () => {
      throw new Error('robots disallow');
    });

    const adapter = new NHLAdapter();
    const results = await adapter.fetchLive([]);
    expect(results).toEqual([]);
    expect(fetchSpy).toHaveBeenCalled();
  });
});