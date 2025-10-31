import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Helper to import config fresh per test case
async function importFreshConfig() {
  const mod = await import('../../config');
  return mod.config;
}

let originalEnv: NodeJS.ProcessEnv;

describe('Config Parsing - Background Jobs Intervals and Cleanup Cron', () => {
  beforeEach(() => {
    // Preserve env and reset modules for fresh import behavior
    originalEnv = { ...process.env };
    vi.resetModules();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Restore env and reset modules
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('should use sane defaults when env vars are absent', async () => {
    delete process.env.LIVE_SCORES_INTERVAL_MS;
    delete process.env.NONLIVE_SCORES_INTERVAL_MS;
    delete process.env.CLEANUP_RUN_AT_CRON;

    const config = await importFreshConfig();

    expect(config.liveScoresIntervalMs).toBe(30000);
    expect(config.nonliveScoresIntervalMs).toBe(3600000);
    expect(config.cleanupRunAtCron).toBe('0 3 * * *');
  });

  it('should parse valid interval values within bounds', async () => {
    process.env.LIVE_SCORES_INTERVAL_MS = '45000';
    process.env.NONLIVE_SCORES_INTERVAL_MS = '1800000'; // 30m
    process.env.CLEANUP_RUN_AT_CRON = '0 1 * * *';

    const config = await importFreshConfig();

    expect(config.liveScoresIntervalMs).toBe(45000);
    expect(config.nonliveScoresIntervalMs).toBe(1800000);
    expect(config.cleanupRunAtCron).toBe('0 1 * * *');
  });

  it('should clamp interval values to min/max bounds', async () => {
    process.env.LIVE_SCORES_INTERVAL_MS = '1000'; // below min (10s)
    process.env.NONLIVE_SCORES_INTERVAL_MS = '999999999'; // above max (24h)

    const config = await importFreshConfig();

    expect(config.liveScoresIntervalMs).toBe(10000);
    expect(config.nonliveScoresIntervalMs).toBe(86400000);
  });
});