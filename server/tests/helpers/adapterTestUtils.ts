/**
 * Adapter Test Utilities (Phase 2 — Scores Agent)
 *
 * Shared helpers for adapter integration tests:
 * - Mock/stub ethicalFetcher, globalRobotsChecker, globalRateLimiter
 * - Load HTML fixtures for ESPN/CBS to avoid live network calls
 * - Common assertions for GameScore, ScheduleGame, BoxScore shapes
 */

import fs from 'fs';
import path from 'path';
import { expect, vi } from 'vitest';
import { ethicalFetcher } from '@server/utils/scraping/fetcher';
import { globalRobotsChecker } from '@server/utils/scraping/robotsChecker';
import { globalRateLimiter } from '@server/utils/scraping/rateLimiter';
import type { GameScore, ScheduleGame, BoxScore } from '@server/agents/types';

/**
 * Mock ethicalFetcher to return a fixed HTML string
 */
export function mockEthicalFetcherHtml(html: string) {
  return vi.spyOn(ethicalFetcher, 'fetch').mockResolvedValue(html);
}

/**
 * Mock ethicalFetcher with a sequence of responses (strings or errors)
 */
export function mockEthicalFetcherSequence(sequence: Array<string | Error>) {
  let index = 0;
  return vi.spyOn(ethicalFetcher, 'fetch').mockImplementation(async () => {
    const next = sequence[Math.min(index, sequence.length - 1)];
    index++;
    if (next instanceof Error) {
      throw next;
    }
    return String(next);
  });
}

/**
 * Allow all robots.txt checks
 */
export function mockRobotsAllowAll() {
  return vi.spyOn(globalRobotsChecker, 'canFetch').mockResolvedValue(true);
}

/**
 * Disallow all robots.txt checks
 */
export function mockRobotsDisallowAll() {
  return vi.spyOn(globalRobotsChecker, 'canFetch').mockResolvedValue(false);
}

/**
 * Make rate limiter return immediately
 */
export function mockRateLimiterImmediate() {
  return vi.spyOn(globalRateLimiter, 'waitIfNeeded').mockResolvedValue(undefined);
}

/**
 * Reset all scraping-related mocks and caches
 */
export function resetScrapingMocks() {
  vi.restoreAllMocks();
  try {
    (globalRobotsChecker as any).clearCache?.();
  } catch {}
  try {
    (globalRateLimiter as any).reset?.();
  } catch {}
}

/**
 * Resolve a path to a fixture inside server/tests/fixtures
 */
export function getFixturePath(...segments: string[]): string {
  return path.resolve(__dirname, '../fixtures', ...segments);
}

/**
 * Load an HTML fixture file by relative path within server/tests/fixtures
 */
export function loadFixtureHtml(relativePath: string): string {
  const filePath = getFixturePath(relativePath);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Basic shape assertions for GameScore
 */
export function assertGameScoreBasic(g: GameScore) {
  expect(g.gameId).toBeTruthy();
  expect(typeof g.homeTeamId).toBe('string');
  expect(typeof g.awayTeamId).toBe('string');
  expect(['scheduled', 'in_progress', 'final']).toContain(g.status);
  expect(g.startTime instanceof Date).toBe(true);
  // Optional fields can be undefined/null depending on status
}

/**
 * Basic shape assertions for ScheduleGame
 */
export function assertScheduleGameBasic(s: ScheduleGame) {
  expect(s.gameId).toBeTruthy();
  expect(typeof s.homeTeamId).toBe('string');
  expect(typeof s.awayTeamId).toBe('string');
  expect(s.startTime instanceof Date).toBe(true);
  expect(['scheduled', 'in_progress', 'final']).toContain(s.status);
}

/**
 * Basic shape assertions for BoxScore
 */
export function assertBoxScoreBasic(b: BoxScore) {
  expect(b.gameId).toBeTruthy();
  expect(typeof b.home?.pts).toBe('number');
  expect(typeof b.away?.pts).toBe('number');
  expect(b.updatedAt instanceof Date).toBe(true);
}

const adapterTestUtils = {
  // Mocks
  mockEthicalFetcherHtml,
  mockEthicalFetcherSequence,
  mockRobotsAllowAll,
  mockRobotsDisallowAll,
  mockRateLimiterImmediate,
  resetScrapingMocks,

  // Fixtures
  getFixturePath,
  loadFixtureHtml,

  // Assertions
  assertGameScoreBasic,
  assertScheduleGameBasic,
  assertBoxScoreBasic,
};

export default adapterTestUtils;