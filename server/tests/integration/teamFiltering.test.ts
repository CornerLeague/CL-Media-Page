import { describe, it, expect, beforeEach } from 'vitest';
import { NBAAdapter, NFLAdapter, MLBAdapter, NHLAdapter } from '../../agents/adapters';
import {
  mockEthicalFetcherHtml,
  mockRobotsAllowAll,
  mockRateLimiterImmediate,
  resetScrapingMocks,
  assertGameScoreBasic,
} from '../helpers/adapterTestUtils';

// Helper to extract team code (suffix) from standardized team id, e.g., nba_LAL -> LAL
const getCode = (teamId: string) => teamId.split('_')[1];

describe('Adapter Team Filtering Behavior', () => {
  beforeEach(() => {
    resetScrapingMocks();
    mockRobotsAllowAll();
    mockRateLimiterImmediate();
  });

  it('NBA: filtering by ["LAL"] returns only games with LAL; empty returns featured', async () => {
    const html = `
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">BOS</div>
        <div class="ScoreCell__Score">102</div>
        <div class="ScoreCell__TeamName">LAL</div>
        <div class="ScoreCell__Score">98</div>
        <div class="ScoreCell__Status">Q4 02:10</div>
      </div>
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">MIA</div>
        <div class="ScoreCell__Score">87</div>
        <div class="ScoreCell__TeamName">NYK</div>
        <div class="ScoreCell__Score">90</div>
        <div class="ScoreCell__Status">Q3 05:45</div>
      </div>
    `;
    mockEthicalFetcherHtml(html);

    const adapter = new NBAAdapter();
    const featured = await adapter.fetchLive([]);
    expect(featured.length).toBeGreaterThanOrEqual(2);

    const filtered = await adapter.fetchLive(['LAL']);
    expect(filtered.length).toBe(1);
    filtered.forEach((g) => {
      assertGameScoreBasic(g);
      const involvesLAL = getCode(g.homeTeamId) === 'LAL' || getCode(g.awayTeamId) === 'LAL';
      expect(involvesLAL).toBe(true);
    });
  });

  it('NFL: filtering by ["NE"] returns only games with NE', async () => {
    const html = `
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">KC</div>
        <div class="ScoreCell__Score">14</div>
        <div class="ScoreCell__TeamName">NE</div>
        <div class="ScoreCell__Score">10</div>
        <div class="ScoreCell__Status">Q2 06:30</div>
      </div>
      <div class="ScoreCell">
        <div class="ScoreCell__TeamName">DAL</div>
        <div class="ScoreCell__Score">7</div>
        <div class="ScoreCell__TeamName">PHI</div>
        <div class="ScoreCell__Score">3</div>
        <div class="ScoreCell__Status">Q1 12:00</div>
      </div>
    `;
    mockEthicalFetcherHtml(html);

    const adapter = new NFLAdapter();
    const filtered = await adapter.fetchLive(['NE']);
    expect(filtered.length).toBe(1);
    filtered.forEach((g) => {
      assertGameScoreBasic(g);
      const involvesNE = getCode(g.homeTeamId) === 'NE' || getCode(g.awayTeamId) === 'NE';
      expect(involvesNE).toBe(true);
    });
  });

  it('MLB: filtering by ["BOS"] returns only games with BOS (ESPN JSON)', async () => {
    const today = new Date();
    const iso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 0, 0).toISOString();
    const scoreboardJson = JSON.stringify({
      events: [
        {
          id: 'mlb1',
          competitions: [
            {
              date: iso,
              status: { type: { state: 'in' } },
              competitors: [
                { team: { abbreviation: 'BOS' }, homeAway: 'home', score: '4' },
                { team: { abbreviation: 'NYY' }, homeAway: 'away', score: '2' },
              ],
            },
          ],
        },
        {
          id: 'mlb2',
          competitions: [
            {
              date: iso,
              status: { type: { state: 'in' } },
              competitors: [
                { team: { abbreviation: 'TEX' }, homeAway: 'home', score: '1' },
                { team: { abbreviation: 'HOU' }, homeAway: 'away', score: '3' },
              ],
            },
          ],
        },
      ],
    });
    mockEthicalFetcherHtml(scoreboardJson);

    const adapter = new MLBAdapter();
    const filtered = await adapter.fetchLive(['BOS']);
    expect(filtered.length).toBe(1);
    filtered.forEach((g) => {
      assertGameScoreBasic(g);
      const involvesBOS = getCode(g.homeTeamId) === 'BOS' || getCode(g.awayTeamId) === 'BOS';
      expect(involvesBOS).toBe(true);
    });
  });

  it('NHL: filtering by ["NYR"] returns only games with NYR (ESPN JSON)', async () => {
    const today = new Date();
    const iso = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 19, 30, 0).toISOString();
    const scoreboardJson = JSON.stringify({
      events: [
        {
          id: 'nhl1',
          competitions: [
            {
              date: iso,
              status: { type: { state: 'pre' } },
              competitors: [
                { team: { abbreviation: 'MTL' }, homeAway: 'home', score: '0' },
                { team: { abbreviation: 'TOR' }, homeAway: 'away', score: '0' },
              ],
            },
          ],
        },
        {
          id: 'nhl2',
          competitions: [
            {
              date: iso,
              status: { type: { state: 'pre' } },
              competitors: [
                { team: { abbreviation: 'NYR' }, homeAway: 'home', score: '0' },
                { team: { abbreviation: 'NJD' }, homeAway: 'away', score: '0' },
              ],
            },
          ],
        },
      ],
    });
    mockEthicalFetcherHtml(scoreboardJson);

    const adapter = new NHLAdapter();
    const filtered = await adapter.fetchLive(['NYR']);
    expect(filtered.length).toBe(1);
    filtered.forEach((g) => {
      assertGameScoreBasic(g);
      const involvesNYR = getCode(g.homeTeamId) === 'NYR' || getCode(g.awayTeamId) === 'NYR';
      expect(involvesNYR).toBe(true);
    });
  });
});