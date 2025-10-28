/**
 * NBAAdapter - Start Time Parsing Unit Tests
 * Verifies AM/PM parsing, status mapping distinctions, and edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NBAAdapter } from '@server/agents/adapters/nbaAdapter';

describe('NBAAdapter extractScheduledStart', () => {
  const adapter = new NBAAdapter();

  beforeEach(() => {
    vi.useFakeTimers();
    // Stable local date context: Oct 15, 2025 at 12:00 local
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
    expect(dt!.getFullYear()).toBe(now.getFullYear());
    expect(dt!.getMonth()).toBe(now.getMonth());
    expect(dt!.getDate()).toBe(now.getDate());
  });

  it('parses time with timezone suffix (ET) and ignores it', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('7:00 PM ET');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(19);
    expect(dt!.getMinutes()).toBe(0);
  });

  it('handles Tomorrow prefix by advancing one day', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('Tomorrow 7:30 PM');
    const now = new Date();
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getDate()).toBe(now.getDate() + 1);
    expect(dt!.getHours()).toBe(19 + 0); // 7:30 PM -> 19
    expect(dt!.getMinutes()).toBe(30);
  });

  it('handles 12:00 AM as 00:00 hours', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('12:00 AM');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(0);
    expect(dt!.getMinutes()).toBe(0);
  });

  it('handles 12:00 PM as 12:00 hours', () => {
    const anyAdapter = adapter as any;
    const dt: Date | undefined = anyAdapter.extractScheduledStart('12:00 PM');
    expect(dt instanceof Date).toBe(true);
    expect(dt!.getHours()).toBe(12);
    expect(dt!.getMinutes()).toBe(0);
  });

  it('returns undefined for non-scheduled strings', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.extractScheduledStart('Final')).toBeUndefined();
    expect(anyAdapter.extractScheduledStart('Q4 03:21')).toBeUndefined();
    expect(anyAdapter.extractScheduledStart('Halftime')).toBeUndefined();
  });
});

describe('NBAAdapter status and time helpers', () => {
  const adapter = new NBAAdapter();

  it('mapStatus: treats AM/PM time-of-day as scheduled', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.mapStatus('7:00 PM')).toBe('scheduled');
    expect(anyAdapter.mapStatus('8:30 PM ET')).toBe('scheduled');
  });

  it('mapStatus: identifies in-progress by quarter or clock', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.mapStatus('Q3 10:15')).toBe('in_progress');
    expect(anyAdapter.mapStatus('Q1')).toBe('in_progress');
    expect(anyAdapter.mapStatus('Halftime')).toBe('in_progress');
    expect(anyAdapter.mapStatus('03:21')).toBe('in_progress');
  });

  it('extractTimeRemaining: ignores AM/PM time-of-day', () => {
    const anyAdapter = adapter as any;
    expect(anyAdapter.extractTimeRemaining('7:00 PM')).toBeUndefined();
    expect(anyAdapter.extractTimeRemaining('Q4 03:21')).toBe('03:21');
  });
});