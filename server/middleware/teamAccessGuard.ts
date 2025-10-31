import type { Request, Response, NextFunction } from 'express';
import { withSource } from '../logger';

const log = withSource('access');

export function validateTeamAccess(req: Request, res: Response, next: NextFunction) {
  const requestId = (req as any).id || undefined;
  const userTeams = Array.isArray(req.userContext?.teamIds) ? req.userContext!.teamIds : [];
  const requestedTeams = Array.isArray(req.validated?.query?.teamIds) ? req.validated!.query!.teamIds! : [];
  const sport = req.validated?.query?.sport ?? req.userContext?.preferredSport ?? null;

  let mode: 'requested' | 'favorites' | 'overview' = 'overview';
  let authorizedTeamIds: string[] = [];

  if (requestedTeams.length > 0) {
    mode = 'requested';
    const unauthorized = requestedTeams.filter((t) => !userTeams.includes(t));
    log.info({ requestId, mode, requestedCount: requestedTeams.length, favoritesCount: userTeams.length, unauthorizedCount: unauthorized.length }, 'team access check');
    if (unauthorized.length > 0) {
      return res.status(403).json({ error: 'Access denied', unauthorizedTeams: unauthorized });
    }
    authorizedTeamIds = requestedTeams;
  } else if (userTeams.length > 0) {
    mode = 'favorites';
    authorizedTeamIds = userTeams;
    log.info({ requestId, mode, requestedCount: 0, favoritesCount: userTeams.length, unauthorizedCount: 0 }, 'team access check');
  } else {
    mode = 'overview';
    authorizedTeamIds = [];
    log.info({ requestId, mode, requestedCount: 0, favoritesCount: 0, unauthorizedCount: 0 }, 'team access check');
  }

  req.access = { mode, sport, authorizedTeamIds };
  return next();
}