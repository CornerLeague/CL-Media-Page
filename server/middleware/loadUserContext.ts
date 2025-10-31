import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { withSource } from '../logger';

const log = withSource('userctx');

export async function loadUserContext(req: Request, res: Response, next: NextFunction) {
  const requestId = (req as any).id || undefined;
  const uid = (req.user as any)?.uid;
  if (!uid) {
    log.warn({ requestId }, 'no authenticated user in request');
    return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
  }

  try {
    const profile = await storage.getUserProfile(uid);
    if (!profile) {
      log.warn({ requestId, uid }, 'profile not found');
      return res.status(404).json({ error: 'Profile not found', code: 'not_found' });
    }

    const validatedSport = req.validated?.query?.sport;
    const preferredSport = validatedSport ?? (Array.isArray(profile.favoriteSports) ? profile.favoriteSports[0] ?? undefined : undefined);
    const favoriteTeams = Array.isArray(profile.favoriteTeams) ? profile.favoriteTeams : [];

    req.userContext = {
      userId: uid, // using Firebase UID as user identifier
      firebaseUid: uid,
      teamIds: favoriteTeams,
      preferredSport,
    };
    log.info({ requestId, uid, favoriteTeamsCount: favoriteTeams.length }, 'user context loaded');
    return next();
  } catch (err) {
    log.error({ requestId, err }, 'failed to load user context');
    return res.status(500).json({ error: 'Internal server error' });
  }
}