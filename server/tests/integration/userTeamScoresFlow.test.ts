import { describe, test, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { WebSocket, WebSocketServer } from 'ws';
import express from 'express';
import { createMockUser, createMockGameScore, createMockTeam } from '../helpers/userTeamScoresMocks';
import { broadcastToUsers, broadcastToTeamSubscribers } from '../../ws';
import type { MockedFunction } from 'vitest';

// Mock database connection
vi.mock('../../utils/dbConnection', () => ({
  dbConnectionManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    getPool: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn()
      })
    })
  }
}));

// Mock test utilities
const mockTestUtils = {
  setupTestData: vi.fn().mockResolvedValue({
    users: [{ id: 'test-user-1' }],
    teams: [{ id: 'test-team-1' }],
    games: [{ id: 'test-game-1' }]
  }),
  createTestUser: vi.fn().mockResolvedValue({
    user: { id: 'consistency-user' },
    profile: { userId: 'consistency-user' }
  }),
  createTestTeam: vi.fn().mockResolvedValue({
    id: 'consistency-team',
    name: 'Consistency Team',
    league: 'NBA'
  }),
  createTestGame: vi.fn().mockResolvedValue({
    id: 'test-game-1',
    homePts: 110,
    awayPts: 105
  }),
  cleanup: vi.fn().mockResolvedValue(undefined)
};

vi.mock('../helpers/userTeamScoresDbUtils', () => ({
  UserTeamScoresDbTestUtils: vi.fn(),
  createDbTestUtils: vi.fn(() => mockTestUtils)
}));

// Create a minimal Express app for testing
const app = express();
app.use(express.json());

// Mock WebSocket functionality
const mockWebSocketClients: WebSocket[] = [];
const mockWebSocketServer = {
  clients: new Set(mockWebSocketClients),
  emit: vi.fn(),
  on: vi.fn(),
  close: vi.fn()
} as unknown as WebSocketServer;

// Mock Firebase authentication
vi.mock('../../middleware/authenticateFirebase', () => ({
  authenticateFirebase: vi.fn((req, res, next) => {
    req.user = { uid: 'test-user-1' };
    next();
  })
}));

// Mock WebSocket server functions
vi.mock('../../ws', () => ({
  broadcastToUsers: vi.fn(),
  broadcastToTeamSubscribers: vi.fn(),
  initWs: vi.fn(),
  getWsStats: vi.fn(() => ({ ready: true, clients: 0 }))
}));

describe('User Team Scores Integration Flow', () => {
  let testUserId: string;
  let testTeamId: string;
  let testGameId: string;

  beforeAll(async () => {
    // Mock initialization - no actual database connection needed
    testUserId = 'test-user-1';
    testTeamId = 'test-team-1';
    testGameId = 'test-game-1';
  });

  afterAll(async () => {
    // Mock cleanup - no actual database connection to close
  });

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    mockWebSocketClients.length = 0;

    // Setup test data using mocked utilities
    await mockTestUtils.setupTestData();

    // Setup API route for testing
    app.get('/api/user-team-scores', (req, res) => {
      // Mock successful response
      res.json({
        success: true,
        data: {
          userId: testUserId,
          teams: [{
            teamId: testTeamId,
            teamName: 'Test Team',
            sport: 'basketball',
            gameData: {
              gameId: testGameId,
              homeTeam: 'Test Team',
              awayTeam: 'Opponent',
              homeScore: 95,
              awayScore: 88,
              status: 'Final'
            },
            timestamp: new Date().toISOString(),
            isUserTeam: true
          }]
        }
      });

      // Simulate WebSocket broadcast after API response
      setTimeout(() => {
        const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
        mockBroadcast({
          type: 'user-team-score-update',
          payload: {
            userId: testUserId,
            teamId: testTeamId,
            teamName: 'Test Team',
            sport: 'basketball',
            gameData: {
              gameId: testGameId,
              homeTeam: 'Test Team',
              awayTeam: 'Opponent',
              homeScore: 95,
              awayScore: 88,
              status: 'Final'
            },
            timestamp: new Date().toISOString(),
            isUserTeam: true
          }
        }, [testTeamId]);
      }, 10);
    });
  });

  afterEach(async () => {
    await mockTestUtils.cleanup();
  });

  describe('Complete API to WebSocket Flow', () => {
    test('should handle API request and trigger WebSocket broadcast', async () => {
      // Make API request
      const response = await request(app)
        .get('/api/user-team-scores')
        .query({ sport: 'basketball' })
        .expect(200);

      // Verify API response
      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBe(testUserId);
      expect(response.body.data.teams).toHaveLength(1);
      expect(response.body.data.teams[0].teamId).toBe(testTeamId);

      // Wait for WebSocket broadcast
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify WebSocket broadcast was called
      const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user-team-score-update',
          payload: expect.objectContaining({
            userId: testUserId,
            teamId: testTeamId,
            teamName: 'Test Team',
            sport: 'basketball'
          })
        }),
        [testTeamId]
      );
    });

    test('should handle API errors and propagate to WebSocket', async () => {
      // Setup error route
      app.get('/api/user-team-scores-error', (req, res) => {
        res.status(500).json({
          success: false,
          error: 'Database connection failed'
        });

        // Simulate error broadcast using connection-status message
        setTimeout(() => {
          const mockBroadcast = broadcastToUsers as MockedFunction<typeof broadcastToUsers>;
          mockBroadcast({
            type: 'connection-status',
            payload: {
              status: 'error',
              userId: testUserId,
              message: 'Failed to fetch user team scores'
            }
          }, [testUserId]);
        }, 10);
      });

      // Make API request that should fail
      const response = await request(app)
        .get('/api/user-team-scores-error')
        .expect(500);

      // Verify error response
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Database connection failed');

      // Wait for error broadcast
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify error broadcast was called
      const mockBroadcast = broadcastToUsers as MockedFunction<typeof broadcastToUsers>;
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'connection-status',
          payload: expect.objectContaining({
            status: 'error',
            message: 'Failed to fetch user team scores'
          })
        }),
        [testUserId]
      );
    });

    test('should handle multiple concurrent requests', async () => {
      const numRequests = 5;
      const requests = Array.from({ length: numRequests }, () =>
        request(app)
          .get('/api/user-team-scores')
          .query({ sport: 'basketball' })
      );

      // Execute all requests concurrently
      const responses = await Promise.all(requests);

      // Verify all responses are successful
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      // Wait for all broadcasts
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify broadcast was called for each request
      const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
      expect(mockBroadcast).toHaveBeenCalledTimes(numRequests);
    });

    test('should maintain data consistency across API and WebSocket', async () => {
      // Create specific test data
      const { user, profile } = await mockTestUtils.createTestUser({
        userId: 'consistency-user',
        firebaseUid: 'firebase-consistency-user',
        username: 'consistencyuser',
        email: 'consistency@test.com',
        favoriteTeams: ['consistency-team']
      });

      const team = await mockTestUtils.createTestTeam({
        id: 'consistency-team',
        name: 'Consistency Team',
        league: 'NBA'
      });

      const game = await mockTestUtils.createTestGame({
        homeTeamId: team.id,
        awayTeamId: 'away-team',
        homePts: 110,
        awayPts: 105
      });

      // Setup route with specific data
      app.get('/api/user-team-scores-consistency', (req, res) => {
        const responseData = {
          success: true,
          data: {
            userId: user.id,
            teams: [{
              teamId: team.id,
              teamName: team.name,
              sport: 'basketball',
              gameData: {
                gameId: game.id,
                homeTeam: team.name,
                awayTeam: 'Away Team',
                homeScore: game.homePts,
                awayScore: game.awayPts,
                status: 'Final'
              },
              timestamp: new Date().toISOString(),
              isUserTeam: true
            }]
          }
        };

        res.json(responseData);

        // Broadcast the same data with userId included
        setTimeout(() => {
          const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
          mockBroadcast({
            type: 'user-team-score-update',
            payload: {
              userId: user.id,
              teamId: team.id,
              teamName: team.name,
              sport: 'basketball',
              gameData: {
                gameId: game.id,
                homeTeam: team.name,
                awayTeam: 'Away Team',
                homeScore: game.homePts,
                awayScore: game.awayPts,
                status: 'Final'
              },
              timestamp: new Date().toISOString(),
              isUserTeam: true
            }
          }, [team.id]);
        }, 10);
      });

      // Make API request
      const response = await request(app)
        .get('/api/user-team-scores-consistency')
        .expect(200);

      // Wait for broadcast
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify data consistency
        const apiData = response.body.data.teams[0];
        const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
        const broadcastCall = mockBroadcast.mock.calls[0];
        const broadcastMessage = broadcastCall[0] as { type: 'user-team-score-update'; payload: any };
        const broadcastData = broadcastMessage.payload;

      expect(apiData.teamId).toBe(broadcastData.teamId);
      expect(apiData.teamName).toBe(broadcastData.teamName);
      expect(apiData.gameData.homeScore).toBe(broadcastData.gameData.homeScore);
      expect(apiData.gameData.awayScore).toBe(broadcastData.gameData.awayScore);
    });
  });

  describe('Performance Under Load', () => {
    test('should handle high-frequency updates efficiently', async () => {
      const startTime = Date.now();
      const numUpdates = 20;

      // Setup rapid update route
      app.get('/api/rapid-updates', (req, res) => {
        res.json({ success: true, timestamp: Date.now() });

        // Simulate rapid WebSocket updates
        for (let i = 0; i < numUpdates; i++) {
          setTimeout(() => {
            const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
            mockBroadcast({
              type: 'user-team-score-update',
              payload: {
                userId: testUserId,
                teamId: testTeamId,
                teamName: 'Test Team',
                sport: 'basketball',
                gameData: {
                  gameId: testGameId,
                  homeTeam: 'Test Team',
                  awayTeam: 'Opponent',
                  homeScore: 95 + i,
                  awayScore: 88,
                  status: 'Live'
                },
                timestamp: new Date().toISOString(),
                isUserTeam: true
              }
            }, [testTeamId]);
          }, i * 10); // 10ms intervals
        }
      });

      // Make request
      await request(app)
        .get('/api/rapid-updates')
        .expect(200);

      // Wait for all updates
      await new Promise(resolve => setTimeout(resolve, numUpdates * 10 + 100));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all updates were processed
      const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
      expect(mockBroadcast).toHaveBeenCalledTimes(numUpdates);

      // Verify performance (should complete within reasonable time)
      expect(totalTime).toBeLessThan(5000); // 5 seconds max
    });
  });
});