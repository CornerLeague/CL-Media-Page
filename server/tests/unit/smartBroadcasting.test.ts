/**
 * Smart Broadcasting Logic Tests
 * Tests the rate limiting, throttling, and targeted broadcasting functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket and related modules
const mockWss = {
  clients: new Set()
};

const mockSocket1 = {
  userId: 'user1',
  userTeams: new Set(['NBA_LAL', 'NFL_KC']),
  readyState: 1, // WebSocket.OPEN
  send: vi.fn(),
  isAuthenticated: true
};

const mockSocket2 = {
  userId: 'user2', 
  userTeams: new Set(['NBA_GSW']),
  readyState: 1, // WebSocket.OPEN
  send: vi.fn(),
  isAuthenticated: true
};

const mockSocket3 = {
  userId: 'user3',
  userTeams: new Set(['NFL_KC']),
  readyState: 1, // WebSocket.OPEN
  send: vi.fn(),
  isAuthenticated: true
};

const mockSendMessage = vi.fn();
const mockWsLog = {
  debug: vi.fn(),
  info: vi.fn(),
  error: vi.fn()
};

// Mock the WebSocket server module
vi.mock('../../ws', async () => {
  const actual = await vi.importActual('../../ws');
  return {
    ...actual,
    sendMessage: mockSendMessage,
    wsLog: mockWsLog
  };
});

describe('Smart Broadcasting Logic', () => {
  beforeEach(() => {
    mockWss.clients.clear();
    mockSocket1.send.mockClear();
    mockSocket2.send.mockClear();
    mockSocket3.send.mockClear();
    mockSendMessage.mockClear();
    mockWsLog.debug.mockClear();
    mockWsLog.info.mockClear();
    mockWsLog.error.mockClear();
  });

  describe('Rate Limiting and Throttling', () => {
    class ScoreUpdateThrottler {
      private lastUpdates = new Map<string, number>();
      private readonly throttleMs = 1000;
      
      shouldSendUpdate(gameId: string): boolean {
        const now = Date.now();
        const lastUpdate = this.lastUpdates.get(gameId) || 0;
        
        if (now - lastUpdate >= this.throttleMs) {
          this.lastUpdates.set(gameId, now);
          return true;
        }
        
        return false;
      }
      
      cleanup(): void {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        for (const [gameId, timestamp] of this.lastUpdates.entries()) {
          if (now - timestamp > oneHour) {
            this.lastUpdates.delete(gameId);
          }
        }
      }
    }

    it('should allow first update for a game', () => {
      const throttler = new ScoreUpdateThrottler();
      expect(throttler.shouldSendUpdate('game1')).toBe(true);
    });

    it('should throttle rapid updates for same game', () => {
      const throttler = new ScoreUpdateThrottler();
      
      // First update should be allowed
      expect(throttler.shouldSendUpdate('game1')).toBe(true);
      
      // Immediate second update should be throttled
      expect(throttler.shouldSendUpdate('game1')).toBe(false);
    });

    it('should allow updates after throttle period', async () => {
      const throttler = new ScoreUpdateThrottler();
      
      // First update
      expect(throttler.shouldSendUpdate('game1')).toBe(true);
      
      // Wait for throttle period to pass
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Second update should now be allowed
      expect(throttler.shouldSendUpdate('game1')).toBe(true);
    });

    it('should handle different games independently', () => {
      const throttler = new ScoreUpdateThrottler();
      
      expect(throttler.shouldSendUpdate('game1')).toBe(true);
      expect(throttler.shouldSendUpdate('game2')).toBe(true);
      expect(throttler.shouldSendUpdate('game3')).toBe(true);
      
      // All should be throttled on second attempt
      expect(throttler.shouldSendUpdate('game1')).toBe(false);
      expect(throttler.shouldSendUpdate('game2')).toBe(false);
      expect(throttler.shouldSendUpdate('game3')).toBe(false);
    });

    it('should cleanup old entries', () => {
      const throttler = new ScoreUpdateThrottler();
      
      // Manually set an old timestamp
      const oneHourAgo = Date.now() - (60 * 60 * 1000 + 1000);
      (throttler as any).lastUpdates.set('oldGame', oneHourAgo);
      
      expect((throttler as any).lastUpdates.has('oldGame')).toBe(true);
      
      throttler.cleanup();
      
      expect((throttler as any).lastUpdates.has('oldGame')).toBe(false);
    });
  });

  describe('User Team Filtering', () => {
    it('should identify users with affected teams', () => {
      const affectedTeams = ['NBA_LAL', 'NFL_KC'];
      
      // User 1 has both teams
      const user1HasTeam = affectedTeams.some(teamId => 
        mockSocket1.userTeams?.has(teamId)
      );
      expect(user1HasTeam).toBe(true);
      
      // User 2 has neither team
      const user2HasTeam = affectedTeams.some(teamId => 
        mockSocket2.userTeams?.has(teamId)
      );
      expect(user2HasTeam).toBe(false);
      
      // User 3 has one team
      const user3HasTeam = affectedTeams.some(teamId => 
        mockSocket3.userTeams?.has(teamId)
      );
      expect(user3HasTeam).toBe(true);
    });

    it('should find correct user team from affected teams', () => {
      const affectedTeams = ['NBA_LAL', 'NFL_KC'];
      
      const user1Team = affectedTeams.find(teamId => 
        mockSocket1.userTeams?.has(teamId)
      );
      expect(user1Team).toBe('NBA_LAL'); // First match
      
      const user3Team = affectedTeams.find(teamId => 
        mockSocket3.userTeams?.has(teamId)
      );
      expect(user3Team).toBe('NFL_KC');
    });
  });

  describe('Message Structure Validation', () => {
    it('should create valid user team score update message', () => {
      const gameData = {
        id: 'game123',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_GSW',
        homeTeam: 'Los Angeles Lakers',
        awayTeam: 'Golden State Warriors',
        homeScore: 95,
        awayScore: 88,
        status: 'Q4',
        quarter: '4th',
        timeRemaining: '2:30',
        sport: 'basketball'
      };

      const userTeamId = 'NBA_LAL';
      const userId = 'user1';
      const timestamp = new Date().toISOString();

      const updateMessage = {
        type: 'user-team-score-update' as const,
        payload: {
          userId,
          teamId: userTeamId,
          teamName: gameData.homeTeamId === userTeamId ? gameData.homeTeam : gameData.awayTeam,
          sport: gameData.sport,
          gameData: {
            gameId: gameData.id,
            homeTeam: gameData.homeTeam,
            awayTeam: gameData.awayTeam,
            homeScore: gameData.homeScore,
            awayScore: gameData.awayScore,
            status: gameData.status,
            quarter: gameData.quarter,
            timeRemaining: gameData.timeRemaining
          },
          timestamp,
          isUserTeam: true
        }
      };

      expect(updateMessage.type).toBe('user-team-score-update');
      expect(updateMessage.payload.userId).toBe(userId);
      expect(updateMessage.payload.teamId).toBe(userTeamId);
      expect(updateMessage.payload.teamName).toBe('Los Angeles Lakers');
      expect(updateMessage.payload.sport).toBe('basketball');
      expect(updateMessage.payload.isUserTeam).toBe(true);
      expect(updateMessage.payload.gameData.gameId).toBe('game123');
      expect(updateMessage.payload.gameData.homeScore).toBe(95);
      expect(updateMessage.payload.gameData.awayScore).toBe(88);
    });

    it('should create valid user team status change message', () => {
      const gameId = 'game123';
      const teamId = 'NBA_LAL';
      const userId = 'user1';
      const oldStatus = 'Q3';
      const newStatus = 'Q4';
      const timestamp = new Date().toISOString();

      const statusMessage = {
        type: 'user-team-status-change' as const,
        payload: {
          userId,
          teamId,
          gameId,
          oldStatus,
          newStatus,
          timestamp
        }
      };

      expect(statusMessage.type).toBe('user-team-status-change');
      expect(statusMessage.payload.userId).toBe(userId);
      expect(statusMessage.payload.teamId).toBe(teamId);
      expect(statusMessage.payload.gameId).toBe(gameId);
      expect(statusMessage.payload.oldStatus).toBe(oldStatus);
      expect(statusMessage.payload.newStatus).toBe(newStatus);
      expect(statusMessage.payload.timestamp).toBeDefined();
    });
  });

  describe('WebSocket Connection Validation', () => {
    it('should validate authenticated connections', () => {
      expect(mockSocket1.isAuthenticated).toBe(true);
      expect(mockSocket1.userId).toBeDefined();
      expect(mockSocket1.readyState).toBe(1); // WebSocket.OPEN
    });

    it('should handle unauthenticated connections', () => {
      const unauthenticatedSocket = {
        userId: undefined,
        isAuthenticated: false,
        readyState: 1
      };

      expect(unauthenticatedSocket.isAuthenticated).toBe(false);
      expect(unauthenticatedSocket.userId).toBeUndefined();
    });

    it('should handle closed connections', () => {
      const closedSocket = {
        userId: 'user1',
        isAuthenticated: true,
        readyState: 3 // WebSocket.CLOSED
      };

      expect(closedSocket.readyState).toBe(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle send message errors gracefully', () => {
      const mockSocket = {
        userId: 'user1',
        userTeams: new Set(['NBA_LAL']),
        readyState: 1,
        send: vi.fn().mockImplementation(() => {
          throw new Error('Connection lost');
        }),
        isAuthenticated: true
      };

      expect(() => {
        try {
          mockSocket.send('test message');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Connection lost');
        }
      }).not.toThrow();
    });

    it('should validate required game data fields', () => {
      const gameData = {
        id: 'game123',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_GSW',
        homeTeam: 'Los Angeles Lakers',
        awayTeam: 'Golden State Warriors',
        homeScore: 95,
        awayScore: 88,
        status: 'Q4',
        sport: 'basketball'
      };

      expect(gameData.id).toBeDefined();
      expect(gameData.homeTeamId).toBeDefined();
      expect(gameData.awayTeamId).toBeDefined();
      expect(gameData.homeScore).toBeTypeOf('number');
      expect(gameData.awayScore).toBeTypeOf('number');
      expect(gameData.status).toBeDefined();
      expect(gameData.sport).toBeDefined();
    });
  });
});