import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NBAAdapter } from '@server/agents/adapters/nbaAdapter';
import { NFLAdapter } from '@server/agents/adapters/nflAdapter';
import { MLBAdapter } from '@server/agents/adapters/mlbAdapter';
import { NHLAdapter } from '@server/agents/adapters/nhlAdapter';
import {
  assertGameScoreBasic,
  mockEthicalFetcherHtml,
  mockRobotsAllowAll,
  mockRateLimiterImmediate,
  resetScrapingMocks,
  loadFixtureHtml,
} from '../helpers/adapterTestUtils';

/**
 * 1.5.3 Data Shape Validation — GameScore
 *
 * Validate that adapters produce consistent GameScore shape across sources.
 * - Use fixtures or inline samples to drive adapter parsing
 * - Assert required fields and numeric scores
 * - Keep network deterministic via mocks
 */

describe('GameScore Shape (1.5.3)', () => {
  beforeEach(() => {
    resetScrapingMocks();
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  afterEach(() => {
    resetScrapingMocks();
  });

  it('NBA from ESPN HTML contains required fields and numeric scores', async () => {
    const html = `
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">BOS</div>
        <div class="ScoreCell__TeamName">LAL</div>
        <div class="ScoreCell__Score">98</div>
        <div class="ScoreCell__Score">101</div>
        <div class="ScoreCell__Status">Q4 2:15</div>
      </div>
    `;
    mockEthicalFetcherHtml(html);

    const adapter = new NBAAdapter();
    const games = await adapter.fetchLive!([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
    const g = games[0];
    assertGameScoreBasic(g);
    expect(typeof g.homePts).toBe('number');
    expect(typeof g.awayPts).toBe('number');
    expect(typeof g.source).toBe('string');
  });

  it('NFL from ESPN HTML contains required fields and numeric scores', async () => {
    const html = `
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">KC</div>
        <div class="ScoreCell__TeamName">NE</div>
        <div class="ScoreCell__Score">3</div>
        <div class="ScoreCell__Score">7</div>
        <div class="ScoreCell__Status">Q1 12:34</div>
      </div>
    `;
    mockEthicalFetcherHtml(html);

    const adapter = new NFLAdapter();
    const games = await adapter.fetchLive!([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
    const g = games[0];
    assertGameScoreBasic(g);
    expect(typeof g.homePts).toBe('number');
    expect(typeof g.awayPts).toBe('number');
    expect(typeof g.source).toBe('string');
  });

  it('MLB from ESPN JSON contains required fields and numeric scores', async () => {
    const mlbJson = JSON.stringify({
      events: [
        {
          id: '401234567',
          date: new Date().toISOString(),
          competitions: [
            {
              competitors: [
                { team: { abbreviation: 'BOS', displayName: 'Boston Red Sox' }, score: '4', homeAway: 'home' },
                { team: { abbreviation: 'NYY', displayName: 'New York Yankees' }, score: '2', homeAway: 'away' }
              ],
              status: { type: { state: 'in', detail: 'End 1st' } }
            }
          ]
        }
      ]
    });
    mockEthicalFetcherHtml(mlbJson);

    const adapter = new MLBAdapter();
    const games = await adapter.fetchLive!([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
    const g = games[0];
    assertGameScoreBasic(g);
    expect(typeof g.homePts).toBe('number');
    expect(typeof g.awayPts).toBe('number');
    expect(typeof g.source).toBe('string');
  });

  it('NHL from ESPN JSON contains required fields and numeric scores', async () => {
    const nhlJson = JSON.stringify({
      events: [
        {
          id: '401999999',
          date: new Date().toISOString(),
          competitions: [
            {
              competitors: [
                { team: { abbreviation: 'MTL', displayName: 'Montreal Canadiens' }, score: '1', homeAway: 'home' },
                { team: { abbreviation: 'TOR', displayName: 'Toronto Maple Leafs' }, score: '2', homeAway: 'away' }
              ],
              status: { type: { state: 'in', detail: '1st' } }
            }
          ]
        }
      ]
    });
    mockEthicalFetcherHtml(nhlJson);

    const adapter = new NHLAdapter();
    const games = await adapter.fetchLive!([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
    const g = games[0];
    assertGameScoreBasic(g);
    expect(typeof g.homePts).toBe('number');
    expect(typeof g.awayPts).toBe('number');
    expect(typeof g.source).toBe('string');
  });
});