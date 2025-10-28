import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NHLAdapter } from '../../../agents/adapters/nhlAdapter';
import { ethicalFetcher } from '../../../utils/scraping/fetcher';

function buildESPNNhlJson(events: Array<{
  id: string;
  dateISO: string;
  homeAbbr: string;
  awayAbbr: string;
  homeDisplay: string;
  awayDisplay: string;
  homeScore: number;
  awayScore: number;
  detail: string;
  state: 'pre' | 'in' | 'post';
}>) {
  const payload = {
    events: events.map((e) => ({
      id: e.id,
      date: e.dateISO,
      competitions: [
        {
          date: e.dateISO,
          competitors: [
            {
              homeAway: 'home',
              score: String(e.homeScore),
              team: {
                abbreviation: e.homeAbbr,
                displayName: e.homeDisplay,
                shortDisplayName: e.homeAbbr,
              },
            },
            {
              homeAway: 'away',
              score: String(e.awayScore),
              team: {
                abbreviation: e.awayAbbr,
                displayName: e.awayDisplay,
                shortDisplayName: e.awayAbbr,
              },
            },
          ],
          status: {
            type: {
              state: e.state,
              detail: e.detail,
            },
          },
        },
      ],
      status: {
        type: {
          state: e.state,
          detail: e.detail,
        },
      },
    })),
  };
  return JSON.stringify(payload);
}

function buildESPNDomGameNHL({
  awayName,
  homeName,
  awayScore,
  homeScore,
  status,
}: {
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  status: string;
}) {
  return `
    <html><body>
      <div class="ScoreCell">
        <div class="ScoreboardScoreCell__Abbrev">${awayName}</div>
        <div class="ScoreboardScoreCell__Abbrev">${homeName}</div>
        <div class="ScoreCell__Score">${awayScore}</div>
        <div class="ScoreCell__Score">${homeScore}</div>
        <div class="ScoreCell__Status">${status}</div>
      </div>
    </body></html>
  `;
}

function buildCBSDomGameNHL({
  awayName,
  homeName,
  awayScore,
  homeScore,
  status,
}: {
  awayName: string;
  homeName: string;
  awayScore: number;
  homeScore: number;
  status: string;
}) {
  return `
    <html><body>
      <div class="live-event-card">
        <div class="away-team">
          <div class="team-name-link">${awayName}</div>
          <div class="score">${awayScore}</div>
        </div>
        <div class="home-team">
          <div class="team-name-link">${homeName}</div>
          <div class="score">${homeScore}</div>
        </div>
        <div class="game-status">${status}</div>
      </div>
    </body></html>
  `;
}

describe('NHLAdapter basic parsing and fallbacks', () => {
  const adapter = new NHLAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('parses ESPN JSON in-progress with period and clock', async () => {
    const json = buildESPNNhlJson([
      {
        id: '1',
        dateISO: '2025-10-27T23:00:00Z',
        homeAbbr: 'OTT',
        awayAbbr: 'BOS',
        homeDisplay: 'Ottawa Senators',
        awayDisplay: 'Boston Bruins',
        homeScore: 2,
        awayScore: 1,
        detail: '2nd 10:11',
        state: 'in',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive(['BOS']);
    expect(games.length).toBe(1);
    const g = games[0];
    expect(['in_progress', 'scheduled']).toContain(g.status);
    expect(g.period).toBe('2');
    expect(g.timeRemaining).toBe('10:11');
    expect(g.awayTeamId).toBe('NHL_BOS');
    expect(g.homeTeamId).toBe('NHL_OTT');
    expect(g.awayPts).toBe(1);
    expect(g.homePts).toBe(2);
  });

  it('parses ESPN JSON final with OT correctly', async () => {
    const json = buildESPNNhlJson([
      {
        id: '2',
        dateISO: '2025-10-27T23:00:00Z',
        homeAbbr: 'OTT',
        awayAbbr: 'BOS',
        homeDisplay: 'Ottawa Senators',
        awayDisplay: 'Boston Bruins',
        homeScore: 3,
        awayScore: 2,
        detail: 'Final/OT',
        state: 'post',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive([]);
    expect(games.length).toBe(1);
    const g = games[0];
    expect(g.status).toBe('final');
    expect(g.period).toBe('OT');
    expect(g.timeRemaining).toBeUndefined();
  });

  it('parses ESPN JSON pregame scheduled status and start time', async () => {
    const json = buildESPNNhlJson([
      {
        id: '3',
        dateISO: '2025-10-27T23:00:00Z',
        homeAbbr: 'OTT',
        awayAbbr: 'BOS',
        homeDisplay: 'Ottawa Senators',
        awayDisplay: 'Boston Bruins',
        homeScore: 0,
        awayScore: 0,
        detail: '7:00 PM',
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
    expect(g.startTime instanceof Date).toBe(true);
  });

  it('filters by team code when using ESPN JSON', async () => {
    const json = buildESPNNhlJson([
      {
        id: '4',
        dateISO: '2025-10-27T23:00:00Z',
        homeAbbr: 'OTT',
        awayAbbr: 'BOS',
        homeDisplay: 'Ottawa Senators',
        awayDisplay: 'Boston Bruins',
        homeScore: 1,
        awayScore: 0,
        detail: '1st 15:42',
        state: 'in',
      },
      {
        id: '5',
        dateISO: '2025-10-27T23:00:00Z',
        homeAbbr: 'STL',
        awayAbbr: 'PIT',
        homeDisplay: 'St. Louis Blues',
        awayDisplay: 'Pittsburgh Penguins',
        homeScore: 0,
        awayScore: 0,
        detail: '7:00 PM',
        state: 'pre',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const games = await adapter.fetchLive(['PIT']);
    expect(games.length).toBe(1);
    const g = games[0];
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_PIT');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_STL');
  });

  it('falls back to ESPN DOM when JSON fetch fails', async () => {
    const dom = buildESPNDomGameNHL({
      awayName: 'BOS',
      homeName: 'OTT',
      awayScore: 1,
      homeScore: 2,
      status: '1st 12:34',
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockRejectedValueOnce(new Error('404')); // ESPN JSON fails
    spy.mockResolvedValueOnce(dom); // ESPN DOM HTML

  const games = await adapter.fetchLive(['BOS']);
  expect(games.length).toBe(1);
  const g = games[0];
  expect(['in_progress', 'scheduled']).toContain(g.status);
  expect(g.period).toBe('1');
  expect(g.timeRemaining).toBe('12:34');
  });

  it('falls back to CBS when ESPN JSON and DOM return no games', async () => {
    const emptyJson = JSON.stringify({ events: [] });
    const emptyDom = '<div></div>';
    const cbsDom = buildCBSDomGameNHL({
      awayName: 'PIT',
      homeName: 'STL',
      awayScore: 1,
      homeScore: 1,
      status: 'End 1st',
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(emptyJson); // ESPN JSON
    spy.mockResolvedValueOnce(emptyJson); // ESPN Alt JSON
    spy.mockResolvedValueOnce(emptyDom); // ESPN DOM
    spy.mockResolvedValueOnce(cbsDom); // CBS DOM

  const games = await adapter.fetchLive(['PIT']);
  expect(games.length).toBe(1);
  const g = games[0];
  expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_PIT');
  expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_STL');
  expect(g.status).toBe('in_progress');
  expect(g.period?.startsWith('INT') || g.period === '1').toBe(true);
  });

  it('mapStatus and extract helpers behave for scheduled strings', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.mapStatus('7:00 PM')).toBe('scheduled');
    expect(anyAdapter.extractTimeRemaining('7:00 PM')).toBeUndefined();
    const dt = anyAdapter.extractScheduledStart('7:00 PM');
    expect(dt instanceof Date).toBe(true);
  });

  it('extractPeriod handles intermissions and overtime', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.extractPeriod('End 1st')).toBe('1');
    expect(anyAdapter.extractPeriod('Intermission')).toBe('INT');
    expect(anyAdapter.extractPeriod('After 1st Intermission')).toBe('INT1');
    expect(anyAdapter.extractPeriod('Final/OT')).toBe('OT');
  });
});

describe('NHLAdapter fetchSchedule', () => {
  const adapter = new NHLAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns ESPN JSON schedule for a single day and filters team codes', async () => {
    const json = buildESPNNhlJson([
      {
        id: '401800001',
        dateISO: '2025-10-27T23:00:00Z',
        homeAbbr: 'OTT',
        awayAbbr: 'BOS',
        homeDisplay: 'Ottawa Senators',
        awayDisplay: 'Boston Bruins',
        homeScore: 0,
        awayScore: 0,
        detail: '7:00 PM',
        state: 'pre',
      },
      {
        id: '401800002',
        dateISO: '2025-10-27T23:30:00Z',
        homeAbbr: 'STL',
        awayAbbr: 'PIT',
        homeDisplay: 'St. Louis Blues',
        awayDisplay: 'Pittsburgh Penguins',
        homeScore: 0,
        awayScore: 0,
        detail: '7:30 PM',
        state: 'pre',
      },
    ]);

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(json); // Primary ESPN JSON for date

    const start = new Date('2025-10-27T00:00:00Z');
    const end = new Date('2025-10-27T00:00:00Z');
    const games = await adapter.fetchSchedule(['PIT'], start, end);

    expect(games.length).toBe(1);
    const g = games[0];
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_PIT');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_STL');
    expect(g.status).toBe('scheduled');
    expect(g.source).toBe('ESPN API');
    expect(g.startTime instanceof Date).toBe(true);
  });

  it('uses alternate ESPN site JSON when public JSON is empty', async () => {
    const emptyJson = JSON.stringify({ events: [] });
    const altJson = buildESPNNhlJson([
      {
        id: '401800003',
        dateISO: '2025-10-28T00:00:00Z',
        homeAbbr: 'NYR',
        awayAbbr: 'MTL',
        homeDisplay: 'New York Rangers',
        awayDisplay: 'Montreal Canadiens',
        homeScore: 0,
        awayScore: 0,
        detail: '8:00 PM',
        state: 'pre',
      },
    ]);

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(emptyJson); // Primary ESPN JSON empty
    spy.mockResolvedValueOnce(altJson);   // Alternate ESPN site JSON

    const start = new Date('2025-10-28T00:00:00Z');
    const end = new Date('2025-10-28T00:00:00Z');
    const games = await adapter.fetchSchedule([], start, end);

    expect(games.length).toBe(1);
    const g = games[0];
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_NYR');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_MTL');
    expect(g.status).toBe('scheduled');
    expect(g.source).toBe('ESPN API');
  });

  it('falls back to ESPN DOM when both JSON sources have no events', async () => {
    const emptyJson = JSON.stringify({ events: [] });
    const dom = buildESPNDomGameNHL({
      awayName: 'PIT',
      homeName: 'STL',
      awayScore: 0,
      homeScore: 0,
      status: '7:00 PM',
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(emptyJson); // Primary ESPN JSON empty
    spy.mockResolvedValueOnce(emptyJson); // Alternate ESPN JSON empty
    spy.mockResolvedValueOnce(dom);       // ESPN DOM for date

    const start = new Date('2025-10-29T00:00:00Z');
    const end = new Date('2025-10-29T00:00:00Z');
    const games = await adapter.fetchSchedule([], start, end);

    expect(games.length).toBeGreaterThanOrEqual(1);
    const g = games[0];
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_PIT');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_STL');
    expect(['scheduled', 'in_progress', 'final']).toContain(g.status);
    expect(g.source).toBe('ESPN.com');
    expect(g.startTime instanceof Date).toBe(true);
  });

  it('iterates multiple days and deduplicates by teams and date', async () => {
    // Day 1 JSON: PIT vs STL
    const jsonDay1 = buildESPNNhlJson([
      {
        id: '401800010',
        dateISO: '2025-10-30T00:00:00Z',
        homeAbbr: 'STL',
        awayAbbr: 'PIT',
        homeDisplay: 'St. Louis Blues',
        awayDisplay: 'Pittsburgh Penguins',
        homeScore: 0,
        awayScore: 0,
        detail: '7:00 PM',
        state: 'pre',
      },
    ]);
    // Day 2 JSON: Same teams, different date
    const jsonDay2 = buildESPNNhlJson([
      {
        id: '401800011',
        dateISO: '2025-10-31T00:00:00Z',
        homeAbbr: 'STL',
        awayAbbr: 'PIT',
        homeDisplay: 'St. Louis Blues',
        awayDisplay: 'Pittsburgh Penguins',
        homeScore: 0,
        awayScore: 0,
        detail: '7:00 PM',
        state: 'pre',
      },
    ]);

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(jsonDay1);
    spy.mockResolvedValueOnce(jsonDay2);

    const start = new Date('2025-10-30T00:00:00Z');
    const end = new Date('2025-10-31T00:00:00Z');
    const games = await adapter.fetchSchedule(['PIT'], start, end);

    expect(games.length).toBe(2);
    // Ensure distinct dates
    const dates = games.map(g => g.startTime.toDateString());
    expect(new Set(dates).size).toBe(2);
  });
});

describe('NHLAdapter extractScheduledStart', () => {
  const adapter = new NHLAdapter();

  beforeEach(() => {
    vi.useFakeTimers();
    // Set system time to a stable local date (Oct 15, 2025 at 12:00 local)
    vi.setSystemTime(new Date(2025, 9, 15, 12, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('parses simple PM time to today at 19:00', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('7:00 PM');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(19);
    expect(dt!.getMinutes()).toBe(0);
    const now = new Date();
    expect(dt!.getDate()).toBe(now.getDate());
  });

  it('parses time with timezone suffix (ET) and ignores it', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('8:30 PM ET');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(20);
    expect(dt!.getMinutes()).toBe(30);
  });

  it('respects Tomorrow prefix and advances date by one day', () => {
    const anyAdapter = adapter as any;
    const now = new Date();
    const dt: Date | undefined = anyAdapter.extractScheduledStart('Tomorrow 7:00 PM');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(19);
    expect(dt!.getDate()).toBe(now.getDate() + 1);
  });

  it('handles 12:00 AM as 00:00', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('12:00 AM');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(0);
    expect(dt!.getMinutes()).toBe(0);
  });

  it('handles 12:00 PM as 12:00', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('12:00 PM');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(12);
    expect(dt!.getMinutes()).toBe(0);
  });

  it('is case-insensitive for AM/PM', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('7:00 pm');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(19);
  });

  it('returns undefined for strings without AM/PM time-of-day', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.extractScheduledStart('End 1st')).toBeUndefined();
    expect(anyAdapter.extractScheduledStart('15:32')).toBeUndefined();
    expect(anyAdapter.extractScheduledStart('Final')).toBeUndefined();
  });
});

describe('NHLAdapter fetchBoxScore', () => {
  const adapter = new NHLAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns box score via ESPN summary JSON', async () => {
    const summaryJson = JSON.stringify({
      competitions: [
        {
          competitors: [
            { homeAway: 'away', score: '3' },
            { homeAway: 'home', score: '4' },
          ],
        },
      ],
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(summaryJson); // ESPN summary JSON

    const box = await adapter.fetchBoxScore('401800020');
    expect(box.gameId).toBe('NHL_ESPN_401800020');
    expect(box.source).toBe('ESPN API');
    expect(box.away.pts).toBe(3);
    expect(box.home.pts).toBe(4);
    expect(box.updatedAt instanceof Date).toBe(true);
  });

  it('falls back to DOM when summary JSON is missing competitors', async () => {
    const badSummaryJson = JSON.stringify({ competitions: [] });
    const dom = buildESPNDomGameNHL({
      awayName: 'PIT',
      homeName: 'STL',
      awayScore: 2,
      homeScore: 5,
      status: 'Final',
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    spy.mockResolvedValueOnce(badSummaryJson); // ESPN summary JSON (bad)
    spy.mockResolvedValueOnce(dom);            // ESPN game page DOM

    const box = await adapter.fetchBoxScore('401800021');
    expect(box.gameId).toBe('NHL_ESPN_401800021');
    expect(box.source).toBe('ESPN.com');
    expect(box.away.pts).toBe(2);
    expect(box.home.pts).toBe(5);
    expect(box.updatedAt instanceof Date).toBe(true);
  });
});

describe('NHLAdapter fetchFeaturedGames', () => {
  const adapter = new NHLAdapter();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns featured games via ESPN JSON and respects limit', async () => {
    const json = buildESPNNhlJson([
      {
        id: '401800101',
        dateISO: new Date().toISOString(),
        homeAbbr: 'TOR',
        awayAbbr: 'MTL',
        homeDisplay: 'Toronto Maple Leafs',
        awayDisplay: 'Montreal Canadiens',
        homeScore: 0,
        awayScore: 0,
        detail: '7:00 PM',
        state: 'pre',
      },
      {
        id: '401800102',
        dateISO: new Date().toISOString(),
        homeAbbr: 'BOS',
        awayAbbr: 'NYR',
        homeDisplay: 'Boston Bruins',
        awayDisplay: 'New York Rangers',
        homeScore: 0,
        awayScore: 0,
        detail: '7:30 PM',
        state: 'pre',
      },
    ]);

    vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValueOnce(json);

    const featured = await adapter.fetchFeaturedGames('NHL', 1);
    expect(featured.length).toBe(1);
    const g = featured[0];
    expect(g.source).toBe('ESPN API');
    expect(g.status).toBe('scheduled');
    expect(g.startTime instanceof Date).toBe(true);
    expect(g.gameId).toContain('NHL_ESPN_');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_MTL');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_TOR');
  });

  it('falls back to CBS when ESPN JSON and DOM return no games', async () => {
    const emptyJson = JSON.stringify({ events: [] });
    const emptyEspnDom = '<html><body><div></div></body></html>';
    const cbsDom = buildCBSDomGameNHL({
      awayName: 'PIT',
      homeName: 'STL',
      awayScore: 1,
      homeScore: 2,
      status: 'Final',
    });

    const spy = vi.spyOn(ethicalFetcher, 'fetch');
    // ESPN public JSON empty
    spy.mockResolvedValueOnce(emptyJson);
    // ESPN alternate JSON empty
    spy.mockResolvedValueOnce(emptyJson);
    // ESPN scoreboard DOM yields no games
    spy.mockResolvedValueOnce(emptyEspnDom);
    // CBS DOM provides one game
    spy.mockResolvedValueOnce(cbsDom);

    const featured = await adapter.fetchFeaturedGames('NHL', 3);
    expect(featured.length).toBeGreaterThanOrEqual(1);
    const g = featured[0];
    expect(g.source).toBe('CBS Sports');
    expect(['scheduled', 'in_progress', 'final']).toContain(g.status);
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_PIT');
    expect([g.awayTeamId, g.homeTeamId]).toContain('NHL_STL');
  });

  it('returns empty array when fetchLive throws', async () => {
    const liveSpy = vi.spyOn(adapter, 'fetchLive');
    liveSpy.mockRejectedValueOnce(new Error('fetchLive failed'));

    const featured = await adapter.fetchFeaturedGames('NHL', 2);
    expect(featured).toEqual([]);
  });
});