import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let originalEnv: NodeJS.ProcessEnv;

describe('Workers Scheduling - Featured Sport Jobs', () => {
  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.NONLIVE_SCORES_INTERVAL_MS = '3600000'; // 1h
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('schedules repeatable featured jobs per sport with correct jobId and interval', async () => {
    const { queues } = await import('../../jobs/queues');
    const addSpy = vi.spyOn(queues.scoresIngest, 'add').mockResolvedValue({} as any);

    const { scheduleFeaturedSportJobs } = await import('../../jobs/workers');
    await scheduleFeaturedSportJobs();

    // Expect one call per league (NBA, NFL, MLB, NHL)
    expect(addSpy).toHaveBeenCalledTimes(4);

    const calls = addSpy.mock.calls.map(([, data, opts]) => ({ data, opts }));
    const expectedJobIds = new Set([
      'scores_ingest:featured:NBA',
      'scores_ingest:featured:NFL',
      'scores_ingest:featured:MLB',
      'scores_ingest:featured:NHL',
    ]);
    for (const c of calls) {
      expect(Array.isArray(c.data.teamIds)).toBe(true);
      expect(c.data.teamIds.length).toBe(0);
      expect(typeof c.data.sport).toBe('string');
      expect(c.data.limit).toBe(10);
      // Non-null assertions used because scheduleFeaturedSportJobs always supplies opts with repeat & jobId
      expect(c.opts!.repeat!.every).toBe(3600000);
      expect(expectedJobIds.has(c.opts!.jobId as string)).toBe(true);
    }
  });
});