import { describe, it, expect, vi } from 'vitest';

// Mock supported sports before importing the middleware
vi.mock('../../agents/adapters/sportAdapterFactory', () => ({
  SportAdapterFactory: {
    getSupportedSports: () => ['nba', 'nfl', 'mlb', 'nhl'],
  },
}));

import { validateScoresQuery, validateScheduleQuery, validateBoxScoreParams } from '../../middleware/validateRequest';

function makeReqRes(init?: {
  query?: Record<string, any>;
  params?: Record<string, any>;
}): { req: any; res: any; next: any } {
  const req: any = {
    path: '/api/test',
    query: init?.query || {},
    params: init?.params || {},
  };
  const resBody: any[] = [];
  const res: any = {
    locals: { requestId: 'req-123' },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      resBody.push(payload);
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('validateRequest middleware', () => {
  it('parses and normalizes scores query: teamIds uppercase, sport lower, default limit', () => {
    const { req, res, next } = makeReqRes({
      query: { teamIds: 'nyk, lal,nyk', sport: 'NBA' },
    });
    validateScoresQuery(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.validated?.query?.teamIds).toEqual(['NYK', 'LAL']);
    expect(req.validated?.query?.sport).toBe('nba');
    expect(req.validated?.query?.limit).toBe(10);
  });

  it('returns 400 when startDate is after endDate', () => {
    const { req, res, next } = makeReqRes({
      query: { startDate: '2025-10-31', endDate: '2025-10-01' },
    });
    validateScoresQuery(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('Invalid payload');
    const messages = (res.body?.details || []).map((d: any) => d.message);
    expect(messages.some((m: string) => m.includes('startDate must be before'))).toBe(true);
    expect(res.body?.requestId).toBe('req-123');
  });

  it('returns 400 when sport is unsupported', () => {
    const { req, res, next } = makeReqRes({ query: { sport: 'soccer' } });
    validateScheduleQuery(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe('Invalid payload');
  });

  it('validates box score params: trims and requires gameId', () => {
    // Valid path
    const ok = makeReqRes({ params: { gameId: ' 12345 ' } });
    validateBoxScoreParams(ok.req, ok.res, ok.next);
    expect(ok.next).toHaveBeenCalledOnce();
    expect(ok.req.validated?.params?.gameId).toBe('12345');

    // Missing gameId
    const bad = makeReqRes({ params: {} });
    validateBoxScoreParams(bad.req, bad.res, bad.next);
    expect(bad.next).not.toHaveBeenCalled();
    expect(bad.res.statusCode).toBe(400);
  });
});