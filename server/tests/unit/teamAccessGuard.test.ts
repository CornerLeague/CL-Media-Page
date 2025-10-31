import { describe, it, expect, vi } from 'vitest';
import { validateTeamAccess } from '../../middleware/teamAccessGuard';

function makeReqRes(init?: {
  userTeams?: string[];
  requestedTeams?: string[];
  sport?: string | undefined | null;
}): { req: any; res: any; next: any } {
  const req: any = {
    path: '/api/test',
    validated: { query: { teamIds: init?.requestedTeams || [], sport: init?.sport } },
    userContext: { teamIds: init?.userTeams || [], preferredSport: init?.sport },
  };
  const res: any = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('teamAccessGuard', () => {
  it('allows requested mode when all requested teams are authorized', () => {
    const { req, res, next } = makeReqRes({ userTeams: ['NYK', 'LAL'], requestedTeams: ['NYK'] });
    validateTeamAccess(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.access?.mode).toBe('requested');
    expect(req.access?.authorizedTeamIds).toEqual(['NYK']);
  });

  it('denies requested mode when any requested team is unauthorized', () => {
    const { req, res, next } = makeReqRes({ userTeams: ['NYK'], requestedTeams: ['NYK', 'BOS'] });
    validateTeamAccess(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body?.error).toBe('Access denied');
    expect(res.body?.unauthorizedTeams).toEqual(['BOS']);
  });

  it('falls back to favorites mode when no requested teams and user has favorites', () => {
    const { req, res, next } = makeReqRes({ userTeams: ['NYK', 'LAL'], requestedTeams: [] });
    validateTeamAccess(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.access?.mode).toBe('favorites');
    expect(req.access?.authorizedTeamIds).toEqual(['NYK', 'LAL']);
  });

  it('uses overview mode when neither requested nor favorites exist', () => {
    const { req, res, next } = makeReqRes({ userTeams: [], requestedTeams: [] });
    validateTeamAccess(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.access?.mode).toBe('overview');
    expect(req.access?.authorizedTeamIds).toEqual([]);
  });
});