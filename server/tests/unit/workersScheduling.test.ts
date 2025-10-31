import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let originalEnv: NodeJS.ProcessEnv;

describe('Workers Scheduling - Live Team Jobs', () => {
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.LIVE_SCORES_INTERVAL_MS = '45000'; // 45s
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('schedules repeatable jobs per team across NBA/NFL/MLB/NHL', async () => {
    const { storage } = await import('../../storage');
    const { queues } = await import('../../jobs/queues');

    const nbaTeams = [
      { id: 'NBA_LAL', league: 'NBA', name: 'Lakers' },
      { id: 'NBA_BOS', league: 'NBA', name: 'Celtics' },
    ];
    const nflTeams = [
      { id: 'NFL_NE', league: 'NFL', name: 'Patriots' },
    ];
    const mlbTeams = [
      { id: 'MLB_NYY', league: 'MLB', name: 'Yankees' },
    ];
    const nhlTeams = [
      { id: 'NHL_NYR', league: 'NHL', name: 'Rangers' },
      { id: 'NHL_BOS', league: 'NHL', name: 'Bruins' },
    ];

    // Mock storage to return teams per league
    vi.spyOn(storage, 'getTeamsByLeague').mockImplementation(async (league: string) => {
      switch (league) {
        case 'NBA': return nbaTeams as any;
        case 'NFL': return nflTeams as any;
        case 'MLB': return mlbTeams as any;
        case 'NHL': return nhlTeams as any;
        default: return [];
      }
    });

    // Capture calls to queues.scoresIngest.add without touching Redis
    const addSpy = vi.spyOn(queues.scoresIngest, 'add').mockResolvedValue({} as any);

    const { scheduleLiveTeamJobs } = await import('../../jobs/workers');
    await scheduleLiveTeamJobs();

    // Expect one call per team across all leagues
    const expectedCalls = nbaTeams.length + nflTeams.length + mlbTeams.length + nhlTeams.length;
    expect(addSpy).toHaveBeenCalledTimes(expectedCalls);

    // Validate options for a few calls
    const calledWith = addSpy.mock.calls.map(([name, data, opts]) => ({ name, data, opts }));
    for (const cw of calledWith) {
      expect(cw.name).toBe('scores_ingest');
      expect(cw.data?.teamIds?.length).toBe(1);
      expect(cw.data?.limit).toBe(5);
      expect(cw.opts?.repeat?.every).toBe(45000);
      const teamId = cw.data?.teamIds?.[0];
      expect(cw.opts?.jobId).toBe(`scores_ingest:${teamId}`);
    }
  });
});