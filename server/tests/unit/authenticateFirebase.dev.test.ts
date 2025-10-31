import { describe, it, expect, vi } from 'vitest';

// Ensure config is mocked to dev mode with no Firebase env, before import
vi.mock('../../config', () => ({
  config: {
    isDev: true,
    firebase: {},
  },
}));

import { authenticateFirebase } from '../../middleware/authenticateFirebase';

function makeReqRes(init?: { headers?: Record<string, string> }): { req: any; res: any; next: any } {
  const req: any = {
    headers: init?.headers || {},
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

describe('authenticateFirebase dev fallback', () => {
  it('returns 401 when dev fallback header is missing', async () => {
    const { req, res, next } = makeReqRes();
    await authenticateFirebase(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe('Unauthorized');
  });

  it('accepts dev fallback when x-dev-firebase-uid is provided', async () => {
    const { req, res, next } = makeReqRes({ headers: { 'x-dev-firebase-uid': 'dev123' } });
    await authenticateFirebase(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user?.uid).toBe('dev123');
  });
});