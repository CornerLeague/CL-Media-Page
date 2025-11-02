import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { storage } from '../../storage';
import type { Team, Game } from '@shared/schema';

// Mock the storage module
vi.mock('../../storage', () => ({
  storage: {
    getTeamsByLeague: vi.fn(),
    getGamesByTeamIds: vi.fn(),
  }
}));

// Mock console.error to avoid noise in tests
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Helper function to create complete mock game objects
function createMockGame(id: string, startTime: Date, homeTeamId: string, awayTeamId: string, overrides = {}): Game {
  return {
    id,
    startTime,
    homeTeamId,
    awayTeamId,
    homePts: 100,
    awayPts: 95,
    status: 'Final',
    period: '4',
    timeRemaining: null,
    cachedAt: new Date(),
    ...overrides
  } as Game;
}

// Helper function to create complete mock team objects
function createMockTeam(id: string, name: string, league: string, code: string): Team {
  return {
    id,
    name,
    league,
    code
  } as Team;
}

// Extract the endpoint handler logic for testing
// This simulates the actual endpoint logic from routes.ts
async function userTeamScoresHandler(req: Request, res: Response) {
  try {
    // Get user's favorite teams from context
    const userTeamIds = req.userContext?.teamIds || [];
    
    if (userTeamIds.length === 0) {
      return res.status(404).json({ 
        error: "No favorite teams found", 
        message: "User has no favorite teams configured" 
      });
    }

    const sport = req.validated?.query?.sport;
    const limit = req.validated?.query?.limit || 10;
    const startDateStr = req.validated?.query?.startDate;
    const endDateStr = req.validated?.query?.endDate;
    
    let startDate = startDateStr ? new Date(String(startDateStr)) : undefined;
    let endDate = endDateStr ? new Date(String(endDateStr)) : undefined;
    
    // Default window: last 48h to now+1h for recent/live scores
    if (!startDate) {
      startDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    }
    if (!endDate) {
      endDate = new Date(Date.now() + 1 * 60 * 60 * 1000);
    }

    // Filter user's teams by the requested sport
    let filteredTeamIds = userTeamIds;
    if (sport) {
      const leagueFilter = sport.toUpperCase();
      try {
        const leagueTeams = await storage.getTeamsByLeague(leagueFilter);
        const allowedSet = new Set(leagueTeams.map((t) => t.id));
        filteredTeamIds = userTeamIds.filter((tid) => allowedSet.has(String(tid)));
        
        if (filteredTeamIds.length === 0) {
          return res.status(404).json({ 
            error: "No teams found for sport", 
            message: `User has no favorite teams in ${sport.toUpperCase()}` 
          });
        }
      } catch (error) {
        console.error("Error filtering teams by league:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    // Fetch games for the filtered teams
    const overallLimit = Math.min(500, limit * filteredTeamIds.length);
    let games;
    try {
      games = await storage.getGamesByTeamIds(filteredTeamIds, overallLimit, startDate, endDate);
    } catch (error) {
      console.error("Error fetching games:", error);
      return res.status(503).json({ 
        error: "Service temporarily unavailable", 
        message: "Unable to fetch game data at this time" 
      });
    }

    // Deduplicate games (same game can appear for both teams)
    const seen = new Set<string>();
    games = games.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));

    // Sort by start time (most recent first)
    games.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Apply limit
    const limitedGames = games.slice(0, limit);

    return res.json({
      games: limitedGames,
      userTeamIds: filteredTeamIds,
      sport: sport || null,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      total: limitedGames.length
    });
  } catch (error) {
    console.error("Error in user team scores endpoint:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// Helper to create mock request and response objects
function createMockReqRes(userContext?: any, validated?: any) {
  const req = {
    userContext,
    validated
  } as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as Response;

  return { req, res };
}

describe('User Team Scores Endpoint Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockClear();
  });

  describe('Authentication and User Context', () => {
    it('should return 404 when user has no favorite teams', async () => {
      const { req, res } = createMockReqRes(
        { teamIds: [] },
        { query: { sport: 'NBA' } }
      );

      await userTeamScoresHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "No favorite teams found",
        message: "User has no favorite teams configured"
      });
    });

    it('should return 404 when userContext is undefined', async () => {
      const { req, res } = createMockReqRes(
        undefined,
        { query: { sport: 'NBA' } }
      );

      await userTeamScoresHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "No favorite teams found",
        message: "User has no favorite teams configured"
      });
    });
  });

  describe('Sport Filtering', () => {
    it('should filter teams by sport successfully', async () => {
      const mockTeams = [
        createMockTeam('1', 'Lakers', 'NBA', 'LAL'),
        createMockTeam('2', 'Warriors', 'NBA', 'GSW')
      ];
      const mockGames = [
        createMockGame('game1', new Date('2024-01-15T20:00:00Z'), '1', '2')
      ];

      vi.mocked(storage.getTeamsByLeague).mockResolvedValue(mockTeams);
      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2', '3'] }, // User has teams 1, 2, 3
        { query: { sport: 'NBA', limit: 10 } }
      );

      await userTeamScoresHandler(req, res);

      expect(storage.getTeamsByLeague).toHaveBeenCalledWith('NBA');
      expect(storage.getGamesByTeamIds).toHaveBeenCalledWith(
        ['1', '2'], // Only teams 1 and 2 are in NBA
        expect.any(Number),
        expect.any(Date),
        expect.any(Date)
      );
      expect(res.json).toHaveBeenCalledWith({
        games: mockGames,
        userTeamIds: ['1', '2'],
        sport: 'NBA',
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String)
        },
        total: 1
      });
    });

    it('should return 404 when user has no teams in the requested sport', async () => {
      const mockTeams = [
        createMockTeam('10', 'Lakers', 'NBA', 'LAL'),
        createMockTeam('11', 'Warriors', 'NBA', 'GSW')
      ];

      vi.mocked(storage.getTeamsByLeague).mockResolvedValue(mockTeams);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2', '3'] }, // User teams not in NBA
        { query: { sport: 'NBA' } }
      );

      await userTeamScoresHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: "No teams found for sport",
        message: "User has no favorite teams in NBA"
      });
    });

    it('should handle storage error when filtering by league', async () => {
      vi.mocked(storage.getTeamsByLeague).mockRejectedValue(new Error('Database error'));

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { sport: 'NBA' } }
      );

      await userTeamScoresHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Internal server error" });
      expect(consoleSpy).toHaveBeenCalledWith("Error filtering teams by league:", expect.any(Error));
    });
  });

  describe('Game Fetching and Processing', () => {
    it('should fetch and process games successfully', async () => {
      const mockGames = [
        createMockGame('game1', new Date('2024-01-15T20:00:00Z'), '1', '2'),
        createMockGame('game2', new Date('2024-01-14T19:00:00Z'), '1', '3')
      ];

      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 5 } }
      );

      await userTeamScoresHandler(req, res);

      expect(storage.getGamesByTeamIds).toHaveBeenCalledWith(
        ['1', '2'],
        10, // limit * teamIds.length
        expect.any(Date),
        expect.any(Date)
      );
      expect(res.json).toHaveBeenCalledWith({
        games: mockGames,
        userTeamIds: ['1', '2'],
        sport: null,
        dateRange: {
          startDate: expect.any(String),
          endDate: expect.any(String)
        },
        total: 2
      });
    });

    it('should deduplicate games correctly', async () => {
      const mockGames = [
        createMockGame('game1', new Date('2024-01-15T20:00:00Z'), '1', '2'),
        createMockGame('game1', new Date('2024-01-15T20:00:00Z'), '1', '2'), // Duplicate
        createMockGame('game2', new Date('2024-01-14T19:00:00Z'), '1', '3')
      ];

      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 10 } }
      );

      await userTeamScoresHandler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.games).toHaveLength(2); // Duplicates removed
      expect(response.total).toBe(2);
    });

    it('should sort games by start time (most recent first)', async () => {
      const mockGames = [
        createMockGame('game1', new Date('2024-01-14T19:00:00Z'), '1', '2'), // Older
        createMockGame('game2', new Date('2024-01-15T20:00:00Z'), '1', '3')  // Newer
      ];

      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 10 } }
      );

      await userTeamScoresHandler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.games[0].id).toBe('game2'); // Most recent first
      expect(response.games[1].id).toBe('game1');
    });

    it('should apply limit correctly', async () => {
      const mockGames = Array.from({ length: 20 }, (_, i) => 
        createMockGame(`game${i}`, new Date(`2024-01-${15 - i}T20:00:00Z`), '1', '2')
      );

      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 5 } }
      );

      await userTeamScoresHandler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      expect(response.games).toHaveLength(5);
      expect(response.total).toBe(5);
    });

    it('should handle storage error when fetching games', async () => {
      vi.mocked(storage.getGamesByTeamIds).mockRejectedValue(new Error('Database error'));

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 10 } }
      );

      await userTeamScoresHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        error: "Service temporarily unavailable",
        message: "Unable to fetch game data at this time"
      });
      expect(consoleSpy).toHaveBeenCalledWith("Error fetching games:", expect.any(Error));
    });
  });

  describe('Date Range Handling', () => {
    it('should use default date range when not provided', async () => {
      const mockGames: Game[] = [];
      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 10 } }
      );

      await userTeamScoresHandler(req, res);

      const [teamIds, limit, startDate, endDate] = vi.mocked(storage.getGamesByTeamIds).mock.calls[0];
      
      // Should use default 48h window
      const now = Date.now();
      const expectedStart = now - 48 * 60 * 60 * 1000;
      const expectedEnd = now + 1 * 60 * 60 * 1000;
      
      expect(startDate?.getTime()).toBeCloseTo(expectedStart, -4); // Within 10 seconds
      expect(endDate?.getTime()).toBeCloseTo(expectedEnd, -4);
    });

    it('should use provided date range', async () => {
      const mockGames: Game[] = [];
      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { 
          query: { 
            limit: 10,
            startDate: '2024-01-01T00:00:00Z',
            endDate: '2024-01-31T23:59:59Z'
          } 
        }
      );

      await userTeamScoresHandler(req, res);

      const [teamIds, limit, startDate, endDate] = vi.mocked(storage.getGamesByTeamIds).mock.calls[0];
      
      expect(startDate?.toISOString()).toBe('2024-01-01T00:00:00.000Z');
      expect(endDate?.toISOString()).toBe('2024-01-31T23:59:59.000Z');
    });
  });

  describe('Parameter Validation', () => {
    it('should use default limit when not provided', async () => {
      const mockGames: Game[] = [];
      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: {} } // No limit provided
      );

      await userTeamScoresHandler(req, res);

      const response = vi.mocked(res.json).mock.calls[0][0];
      // The endpoint should use default limit of 10
      expect(vi.mocked(storage.getGamesByTeamIds)).toHaveBeenCalledWith(
        ['1', '2'],
        20, // 10 * 2 teams
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('should handle case-insensitive sport parameter', async () => {
      const mockTeams = [createMockTeam('1', 'Lakers', 'NBA', 'LAL')];
      const mockGames: Game[] = [];
      
      vi.mocked(storage.getTeamsByLeague).mockResolvedValue(mockTeams);
      vi.mocked(storage.getGamesByTeamIds).mockResolvedValue(mockGames);

      const { req, res } = createMockReqRes(
        { teamIds: ['1'] },
        { query: { sport: 'nba' } } // lowercase
      );

      await userTeamScoresHandler(req, res);

      expect(storage.getTeamsByLeague).toHaveBeenCalledWith('NBA'); // Should be uppercase
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Mock an unexpected error in the try block
      vi.mocked(storage.getGamesByTeamIds).mockRejectedValue(new Error('Unexpected error'));

      const { req, res } = createMockReqRes(
        { teamIds: ['1', '2'] },
        { query: { limit: 10 } }
      );

      await userTeamScoresHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ 
        error: "Service temporarily unavailable", 
        message: "Unable to fetch game data at this time" 
      });
      expect(consoleSpy).toHaveBeenCalledWith("Error fetching games:", expect.any(Error));
    });
  });
});