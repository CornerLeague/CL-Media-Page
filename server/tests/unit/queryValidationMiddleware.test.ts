import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock logger
vi.mock('../../logger', () => ({
  withSource: () => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { validateUserTeamScoresQuery } from '../../middleware/validateRequest';

// Helper to create mock request/response objects
function createMockReqRes(query: Record<string, any> = {}) {
  const req = {
    query,
    path: '/api/user-team-scores',
    validated: {},
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

describe('validateUserTeamScoresQuery middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sport parameter validation', () => {
    it('should accept valid sports', () => {
      const validSports = ['nba', 'nfl', 'mlb', 'nhl', 'soccer', 'college_football', 'college_basketball'];
      
      for (const sport of validSports) {
        const { req, res, next } = createMockReqRes({ sport });
        
        validateUserTeamScoresQuery(req, res, next);
        
        expect(next).toHaveBeenCalledOnce();
        expect(req.validated.query.sport).toBe(sport);
        
        // Reset mocks for next iteration
        next.mockClear();
      }
    });

    it('should convert sport to lowercase', () => {
      const { req, res, next } = createMockReqRes({ sport: 'nba' });
      
      validateUserTeamScoresQuery(req, res, next);
      
      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.sport).toBe('nba');
    });

    it('should reject unsupported sports', () => {
      const { req, res, next } = createMockReqRes({ sport: 'tennis' });
      
      validateUserTeamScoresQuery(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payload',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['sport'],
              message: expect.stringContaining('Invalid enum value')
            })
          ])
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should require sport parameter', () => {
      const { req, res, next } = createMockReqRes({});
      
      validateUserTeamScoresQuery(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payload',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['sport'],
              message: expect.stringContaining('Required')
            })
          ])
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject empty sport parameter', () => {
      const { req, res, next } = createMockReqRes({ sport: '' });
      
      validateUserTeamScoresQuery(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payload',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['sport'],
              message: expect.stringContaining('Invalid enum value')
            })
          ])
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('limit parameter validation', () => {
    it('should use default limit of 10 when not provided', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.limit).toBe(10);
    });

    it('should accept valid limit as string', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '25',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.limit).toBe(25);
    });

    it('should accept valid limit as number', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: 15,
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.limit).toBe(15);
    });

    it('should accept minimum limit of 1', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '1',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.limit).toBe(1);
    });

    it('should accept maximum limit of 50', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '50',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.limit).toBe(50);
    });

    it('should return 400 for limit below 1', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '0',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for limit above 50', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '51',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for non-numeric limit', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: 'abc',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for decimal limit', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '10.5',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('date parameter validation', () => {
    it('should accept valid startDate', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        startDate: '2024-01-01',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.startDate).toBe('2024-01-01');
    });

    it('should accept valid endDate', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        endDate: '2024-12-31',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.endDate).toBe('2024-12-31');
    });

    it('should accept both startDate and endDate', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.startDate).toBe('2024-01-01');
      expect(req.validated.query.endDate).toBe('2024-12-31');
    });

    it('should return 400 for invalid startDate format', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        startDate: 'invalid-date',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid endDate format', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        endDate: '2024-13-01', // Invalid month
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should accept ISO datetime format', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        startDate: '2024-01-01T00:00:00Z',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query.startDate).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('combined parameter validation', () => {
    it('should handle multiple validation errors', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'invalid',
        limit: '0',
        startDate: 'invalid-date'
      });
      
      validateUserTeamScoresQuery(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payload',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['sport'],
              message: expect.stringContaining('Invalid enum value')
            }),
            expect.objectContaining({
              path: ['limit'],
              message: expect.stringContaining('Number must be greater than or equal to 1')
            }),
            expect.objectContaining({
              path: ['startDate'],
              message: expect.stringContaining('Invalid ISO date')
            })
          ])
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should accept all valid parameters', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
        limit: '20',
        startDate: '2024-01-01',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.query).toEqual({
        sport: 'nba',
        limit: 20,
        startDate: '2024-01-01',
      });
    });

    it('should preserve existing validated data', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'nba',
      });
      req.validated = { params: { gameId: 'test-game' } };

      validateUserTeamScoresQuery(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(req.validated.params.gameId).toBe('test-game');
      expect(req.validated.query.sport).toBe('nba');
    });
  });

  describe('error response format', () => {
    it('should include validation details in error response', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'invalid-sport',
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payload',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['sport'],
              message: expect.stringContaining('Invalid enum value')
            }),
          ]),
        })
      );
    });

    it('should include multiple validation errors in details', () => {
      const { req, res, next } = createMockReqRes({
        sport: 'invalid-sport',
        limit: 'not-a-number'
      });

      validateUserTeamScoresQuery(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payload',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['sport'],
              message: expect.stringContaining('Invalid enum value')
            }),
            expect.objectContaining({
              path: ['limit'],
              message: expect.stringContaining('Expected number')
            })
          ]),
        })
      );
    });
  });
});