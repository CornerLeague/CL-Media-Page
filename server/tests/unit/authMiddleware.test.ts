import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock config before importing the middleware
vi.mock('../../config', () => ({
  config: {
    isDev: true,
    firebase: {},
  },
}));

// Mock logger
vi.mock('../../logger', () => ({
  withSource: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { authenticateFirebase } from '../../middleware/authenticateFirebase';

// Helper to create mock request/response objects
function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
    id: 'test-request-id',
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    statusCode: 200,
    body: null,
  } as unknown as Response;

  const next = vi.fn();

  return { req, res, next };
}

describe('authenticateFirebase middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('dev fallback mode (isDev=true, no Firebase env)', () => {
    it('should return 401 when x-dev-firebase-uid header is missing', async () => {
      const { req, res, next } = createMockReqRes();

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when x-dev-firebase-uid header is empty', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': '',
      });

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when x-dev-firebase-uid header is whitespace only', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': '   ',
      });

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should authenticate successfully with valid x-dev-firebase-uid', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': 'test-user-123',
      });

      await authenticateFirebase(req, res, next);

      expect(req.user).toEqual({ uid: 'test-user-123' });
      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should trim whitespace from x-dev-firebase-uid', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': '  test-user-456  ',
      });

      await authenticateFirebase(req, res, next);

      expect(req.user).toEqual({ uid: 'test-user-456' });
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('production mode (missing authorization header)', () => {
    beforeEach(() => {
      // Mock config for production mode with Firebase env
      vi.doMock('../../config', () => ({
        config: {
          isDev: false,
          firebase: {
            projectId: 'test-project',
            clientEmail: 'test@test.com',
            privateKey: 'test-key',
          },
        },
      }));
    });

    it('should return 401 when authorization header is missing', async () => {
      const { req, res, next } = createMockReqRes();

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header does not start with Bearer', async () => {
      const { req, res, next } = createMockReqRes({
        authorization: 'Basic token123',
      });

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is just "Bearer"', async () => {
      const { req, res, next } = createMockReqRes({
        authorization: 'Bearer',
      });

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is "Bearer "', async () => {
      const { req, res, next } = createMockReqRes({
        authorization: 'Bearer ',
      });

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 401 on unexpected errors', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': 'test-user',
      });

      // Mock an error in the middleware
      const originalUser = req.user;
      Object.defineProperty(req, 'user', {
        get() {
          throw new Error('Unexpected error');
        },
        set() {
          throw new Error('Unexpected error');
        },
      });

      await authenticateFirebase(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        code: 'unauthorized',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('request ID handling', () => {
    it('should work when request ID is undefined', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': 'test-user',
      });
      delete (req as any).id;

      await authenticateFirebase(req, res, next);

      expect(req.user).toEqual({ uid: 'test-user' });
      expect(next).toHaveBeenCalledOnce();
    });

    it('should work with custom request ID', async () => {
      const { req, res, next } = createMockReqRes({
        'x-dev-firebase-uid': 'test-user',
      });
      (req as any).id = 'custom-request-id';

      await authenticateFirebase(req, res, next);

      expect(req.user).toEqual({ uid: 'test-user' });
      expect(next).toHaveBeenCalledOnce();
    });
  });
});