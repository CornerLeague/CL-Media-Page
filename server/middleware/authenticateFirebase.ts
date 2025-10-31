import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { withSource } from '../logger';

const log = withSource('auth');

function hasFirebaseEnv(): boolean {
  const fb = config.firebase || ({} as any);
  return !!(fb.projectId && fb.clientEmail && fb.privateKey);
}

async function lazyGetAdmin(): Promise<any | null> {
  try {
    const admin = await import('firebase-admin');
    return admin;
  } catch (err) {
    // Module missing; return null to trigger dev fallback or 401
    log.warn({ err }, 'firebase-admin not available');
    return null;
  }
}

function initFirebaseOnce(admin: any): void {
  try {
    if (!admin?.apps?.length) {
      const key = (config.firebase.privateKey || '').replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId!,
          clientEmail: config.firebase.clientEmail!,
          privateKey: key,
        }),
      });
      log.info('firebase admin initialized');
    }
  } catch (err) {
    log.error({ err }, 'failed to initialize firebase admin');
    throw err;
  }
}

export async function authenticateFirebase(req: Request, res: Response, next: NextFunction) {
  const h = req.headers['authorization'];
  const requestId = (req as any).id || undefined;

  try {
    // Dev fallback: Allow header override when running in dev and Firebase env missing
    if (config.isDev && !hasFirebaseEnv()) {
      const devUid = String(req.headers['x-dev-firebase-uid'] || '').trim();
      if (!devUid) {
        log.warn({ requestId, reason: 'missing_dev_uid' }, 'unauthorized (dev fallback requires x-dev-firebase-uid)');
        return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
      }
      req.user = { uid: devUid };
      log.info({ requestId, uid: devUid }, 'authenticated via dev fallback');
      return next();
    }

    if (!h || typeof h !== 'string' || !h.startsWith('Bearer ')) {
      log.warn({ requestId, reason: 'missing_or_invalid_scheme' }, 'unauthorized');
      return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    }

    const token = h.slice('Bearer '.length);
    const admin = await lazyGetAdmin();
    if (!admin || !hasFirebaseEnv()) {
      log.error({ requestId, reason: 'admin_unavailable_or_env_missing' }, 'unauthorized');
      return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    }

    initFirebaseOnce(admin);
    const auth = admin.auth();
    const claims = await auth.verifyIdToken(token).catch((err: any) => {
      log.warn({ requestId, reason: 'verification_failed' }, 'unauthorized');
      return null;
    });
    if (!claims || !claims.sub) {
      return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    }

    const uid = claims.sub as string;
    const email = (claims as any).email as string | undefined;
    req.user = { uid, email };
    log.info({ requestId, uid }, 'authenticated via firebase');
    return next();
  } catch (err) {
    log.error({ requestId, err }, 'unexpected auth error');
    return res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
  }
}