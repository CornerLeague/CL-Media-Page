/**
 * MLBAdapter Unit Tests
 * Verify ESPN JSON scraping, ESPN DOM fallback, CBS fallback, status parsing, and team filtering
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MLBAdapter } from '@server/agents/adapters/mlbAdapter';
import { ethicalFetcher } from '@server/utils/scraping/fetcher';

function buildESPNJson(events: Array<{
  id: string;
  awayAbbr: string;
  homeAbbr: string;
  awayDisplay: string;
  homeDisplay: string;
  awayScore: number;
  homeScore: number;
  detail: string;
  state: 'pre' | 'in' | 'post';
  date?: string;
}>): string {
  const today = new Date().toISOString();
  const data = {
    events: events.map((e) => ({
      id: e.id,
      date: e.date || today,
      competitions: [
        {
          date: e.date || today,
          status: { type: { detail: e.detail, state: e.state } },
          competitors: [
            {
              homeAway: 'away',
              score: String(e.awayScore),
              team: { displayName: e.awayDisplay, shortDisplayName: e.awayDisplay, name: e.awayDisplay, abbreviation: e.awayAbbr },
            },
            {
              homeAway: 'home',
              score: String(e.homeScore),
              team: { displayName: e.homeDisplay, shortDisplayName: e.homeDisplay, name: e.homeDisplay, abbreviation: e.homeAbbr },
            },
          ],
        },
      ],
      status: { type: { detail: e.detail, state: e.state } },
    })),
  };
  return JSON.stringify(data);
}

function buildESPNDomGame({
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
    <div class="Scoreboard">
      <div class="Scoreboard__Item" data-module="game">
        <div class="ScoreCell">
          <div class="ScoreCell__TeamName team-name">${awayTeam}</div>
          <div class="ScoreCell__TeamName team-name">${homeTeam}</div>
          <div class="ScoreCell__Score score">${awayScore}</div>
          <div class="ScoreCell__Score score">${homeScore}</div>
          <div class="ScoreCell__Status game-status">${status}</div>
        </div>
      </div>
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

describe('MLBAdapter - ESPN JSON, ESPN DOM fallback, CBS fallback', () => {
  let adapter: MLBAdapter;

  beforeEach(() => {
    adapter = new MLBAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses ESPN JSON in-progress with inning and substate', async () => {
    const json = buildESPNJson([
      {
        id: '1001',
        awayAbbr: 'BOS',
        homeAbbr: 'NYY',
        awayDisplay: 'Red Sox',
        homeDisplay: 'Yankees',
        awayScore: 2,
        homeScore: 3,
        detail: 'Top 3rd, 1 Out',
        state: 'in',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.source).toBe('ESPN API');
    expect(g.gameId).toContain('MLB_ESPN_');
    expect(g.awayTeamId).toBe('MLB_BOS');
    expect(g.homeTeamId).toBe('MLB_NYY');
    expect(g.awayPts).toBe(2);
    expect(g.homePts).toBe(3);
    expect(g.status).toBe('in_progress');
    expect(g.period).toBe('3');
    // Substate takes precedence for timeRemaining
    expect(g.timeRemaining).toBe('Top 3');
  });

  it('parses ESPN JSON final with extra innings (F/10)', async () => {
    const json = buildESPNJson([
      {
        id: '1002',
        awayAbbr: 'LAD',
        homeAbbr: 'SF',
        awayDisplay: 'Dodgers',
        homeDisplay: 'Giants',
        awayScore: 5,
        homeScore: 6,
        detail: 'F/10',
        state: 'post',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.status).toBe('final');
    // For Final/10, inning number is extracted and set as period
    expect(g.period).toBe('10');
    expect(g.timeRemaining).toBeUndefined();
  });

  it('parses ESPN JSON postponed as scheduled', async () => {
    const json = buildESPNJson([
      {
        id: '1003',
        awayAbbr: 'NYM',
        homeAbbr: 'ATL',
        awayDisplay: 'Mets',
        homeDisplay: 'Braves',
        awayScore: 0,
        homeScore: 0,
        detail: 'Postponed',
        state: 'pre',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.status).toBe('scheduled');
    expect(g.period).toBeUndefined();
    expect(g.timeRemaining).toBeUndefined();
  });

  it('filters by team codes with ESPN JSON', async () => {
    const json = buildESPNJson([
      {
        id: '2001',
        awayAbbr: 'BOS',
        homeAbbr: 'NYY',
        awayDisplay: 'Red Sox',
        homeDisplay: 'Yankees',
        awayScore: 1,
        homeScore: 0,
        detail: 'Top 1st',
        state: 'in',
      },
      {
        id: '2002',
        awayAbbr: 'SF',
        homeAbbr: 'LAD',
        awayDisplay: 'Giants',
        homeDisplay: 'Dodgers',
        awayScore: 3,
        homeScore: 2,
        detail: 'Bottom 2nd',
        state: 'in',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive(['NYY']);
    expect(games.length).toBe(1);
    const g = games[0];
    expect([g.awayTeamId, g.homeTeamId]).toContain('MLB_NYY');
  });

  it('falls back to ESPN DOM when JSON fetch fails', async () => {
    const espnHtml = `
      <html><body>
        ${buildESPNDomGame({ awayTeam: 'Red Sox', homeTeam: 'Yankees', awayScore: 4, homeScore: 5, status: 'Bottom 9th' })}
      </body></html>
    `;

    vi
      .spyOn(ethicalFetcher, 'fetch')
      .mockRejectedValueOnce(new Error('ESPN JSON failed'))
      .mockResolvedValueOnce(espnHtml);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);

    const g = games[0];
    expect(g.source).toBe('ESPN.com');
    expect(g.status).toBe('in_progress');
    expect(g.period).toBe('9');
    expect(g.timeRemaining).toBe('Bot 9');
    expect(g.homeTeamId).toBe('MLB_NYY');
    expect(g.awayTeamId).toBe('MLB_BOS');
  });

  it('falls back to CBS when ESPN JSON returns no games', async () => {
    const emptyJson = JSON.stringify({ events: [] });
    const cbsHtml = `
      <html><body>
        ${buildCBSGame({ awayTeam: 'Giants', homeTeam: 'Dodgers', awayScore: 2, homeScore: 3, status: 'Final/10' })}
      </body></html>
    `;

    vi
      .spyOn(ethicalFetcher, 'fetch')
      .mockResolvedValueOnce(emptyJson)
      .mockResolvedValueOnce(cbsHtml);

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
  });

  it('returns empty array when both ESPN and CBS fail', async () => {
    vi
      .spyOn(ethicalFetcher, 'fetch')
      .mockRejectedValueOnce(new Error('ESPN JSON failed'))
      .mockRejectedValueOnce(new Error('ESPN DOM failed'))
      .mockRejectedValueOnce(new Error('CBS failed'));

    const games = await adapter.fetchLive([]);
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBe(0);
  });
});

describe('MLBAdapter - parsing helpers', () => {
  let adapter: MLBAdapter;

  beforeEach(() => {
    adapter = new MLBAdapter();
  });

  it('mapStatus: postponed and ppd -> scheduled', () => {
    expect((adapter as any).mapStatus('Postponed')).toBe('scheduled');
    expect((adapter as any).mapStatus('PPD')).toBe('scheduled');
  });

  it('mapStatus: final and F/10 -> final', () => {
    expect((adapter as any).mapStatus('Final')).toBe('final');
    expect((adapter as any).mapStatus('F/10')).toBe('final');
  });

  it('mapStatus: delay/delayed -> in_progress', () => {
    expect((adapter as any).mapStatus('Rain Delay')).toBe('in_progress');
    expect((adapter as any).mapStatus('Delayed Start')).toBe('in_progress');
  });

  it('mapStatus: inning indicators -> in_progress', () => {
    expect((adapter as any).mapStatus('Top 3rd')).toBe('in_progress');
    expect((adapter as any).mapStatus('Bottom 9th')).toBe('in_progress');
    expect((adapter as any).mapStatus('Live')).toBe('in_progress');
  });

  it('mapStatus: typical scheduled time -> scheduled', () => {
    expect((adapter as any).mapStatus('7:05 PM')).toBe('scheduled');
  });

  it('extractInning: handles ordinals and numbers', () => {
    expect((adapter as any).extractInning('Top 3rd')).toBe('3');
    expect((adapter as any).extractInning('Bottom 9th')).toBe('9');
    expect((adapter as any).extractInning('inning 5')).toBe('5');
    expect((adapter as any).extractInning('Final')).toBeUndefined();
  });

  it('extractSubstate: normalizes Top/Bot/Mid/End', () => {
    expect((adapter as any).extractSubstate('Top 3rd')).toBe('Top 3');
    expect((adapter as any).extractSubstate('Bottom 9th')).toBe('Bot 9');
    expect((adapter as any).extractSubstate('Mid 4th')).toBe('Mid 4');
    expect((adapter as any).extractSubstate('End 7th')).toBe('End 7');
  });

  it('extractOuts: parses outs correctly', () => {
    expect((adapter as any).extractOuts('1 Out')).toBe('1 Out');
    expect((adapter as any).extractOuts('2 Outs')).toBe('2 Outs');
    expect((adapter as any).extractOuts('Top 3rd')).toBeUndefined();
  });
});