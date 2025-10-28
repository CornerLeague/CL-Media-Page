/**
 * NFLAdapter Unit Tests
 * Verify ESPN scraping, CBS fallback, status parsing, and team filtering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NFLAdapter } from '../../agents/adapters';
import { ethicalFetcher } from '../../utils/scraping/fetcher';

function buildESPNGame({
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
    <div class="ScoreCell">
      <div class="ScoreCell__TeamName">${awayTeam}</div>
      <div class="ScoreCell__TeamName">${homeTeam}</div>
      <div class="ScoreCell__Score">${awayScore}</div>
      <div class="ScoreCell__Score">${homeScore}</div>
      <div class="ScoreCell__Status">${status}</div>
    </div>
  `;
}

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
    <div class="game-item">
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

describe('NFLAdapter - ESPN scraping and CBS fallback', () => {
  let adapter: NFLAdapter;

  beforeEach(() => {
    adapter = new NFLAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses ESPN in-progress game with quarter and time', async () => {
    const espnHtml = `
      <html><body>
        ${buildESPNGame({ awayTeam: 'NE', homeTeam: 'KC', awayScore: 10, homeScore: 7, status: 'Q3 10:15' })}
      </body></html>
    `;

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(espnHtml);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.source).toBe('ESPN.com');
    expect(g.gameId).toContain('NFL_ESPN');
    expect(g.awayTeamId).toBe('NFL_NE');
    expect(g.homeTeamId).toBe('NFL_KC');
    expect(g.awayPts).toBe(10);
    expect(g.homePts).toBe(7);
    expect(g.status).toBe('in_progress');
    expect(g.period).toBe('3');
    expect(g.timeRemaining).toBe('10:15');
  });

  it('parses ESPN halftime status', async () => {
    const espnHtml = `
      <html><body>
        ${buildESPNGame({ awayTeam: 'BUF', homeTeam: 'NYJ', awayScore: 13, homeScore: 10, status: 'Halftime' })}
      </body></html>
    `;

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(espnHtml);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.status).toBe('in_progress');
    expect(g.period).toBe('HALF');
    expect(g.timeRemaining).toBeUndefined();
  });

  it('parses ESPN final status', async () => {
    const espnHtml = `
      <html><body>
        ${buildESPNGame({ awayTeam: 'DAL', homeTeam: 'PHI', awayScore: 24, homeScore: 27, status: 'Final' })}
      </body></html>
    `;

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(espnHtml);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.status).toBe('final');
    expect(g.period).toBeUndefined();
    expect(g.timeRemaining).toBeUndefined();
  });

  it('filters by team codes when provided', async () => {
    const espnHtml = `
      <html><body>
        ${buildESPNGame({ awayTeam: 'NE', homeTeam: 'KC', awayScore: 10, homeScore: 7, status: 'Q1 12:34' })}
        ${buildESPNGame({ awayTeam: 'BUF', homeTeam: 'NYJ', awayScore: 3, homeScore: 0, status: 'Q1 09:12' })}
      </body></html>
    `;

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(espnHtml);

    const games = await adapter.fetchLive(['NE', 'NYJ']);
    expect(games.length).toBe(2);
    const ids = games.map(g => [g.awayTeamId, g.homeTeamId].join(','));
    expect(ids.some(s => s.includes('NFL_NE') && s.includes('NFL_KC'))).toBe(true);
    expect(ids.some(s => s.includes('NFL_BUF') && s.includes('NFL_NYJ'))).toBe(true);
  });

  it('falls back to CBS when ESPN returns no games', async () => {
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
  });

  it('falls back to CBS when ESPN fetch fails', async () => {
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
  });
});