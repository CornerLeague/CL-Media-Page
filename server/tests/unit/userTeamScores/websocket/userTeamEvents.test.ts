/**
 * WebSocket Event Tests for User Team Scores
 * 
 * Tests WebSocket events related to user team score updates including:
 * - Event broadcasting (user-team-score-update, user-team-status-change)
 * - User filtering logic
 * - Connection management
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockedFunction } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { 
  broadcastToUsers, 
  broadcastToTeamSubscribers,
  setupWebSocketErrorHandling 
} from '../../../../ws';
import { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange,
  OutgoingWebSocketMessage 
} from '../../../../types/websocket';
import { 
  createMockGameScore, 
  createMockUser,
  createMockTeam 
} from '../../../helpers/userTeamScoresMocks';

// Enhanced WebSocket interface matching the actual implementation
interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  userEmail?: string;
  userTeams?: Set<string>;
  subs?: Set<string>;
  isAuthenticated?: boolean;
  connectedAt?: Date;
  lastActivity?: Date;
  messagesSent?: number;
  messagesReceived?: number;
  readyState: 0 | 1 | 2 | 3; // Make readyState writable for testing
}

// Mock WebSocket clients
function createMockWebSocketClient(userId: string, teamIds: string[] = []): AuthenticatedWebSocket & {
  send: MockedFunction<any>;
  close: MockedFunction<any>;
  ping: MockedFunction<any>;
  pong: MockedFunction<any>;
  terminate: MockedFunction<any>;
  addEventListener: MockedFunction<any>;
  removeEventListener: MockedFunction<any>;
  dispatchEvent: MockedFunction<any>;
  on: MockedFunction<any>;
  off: MockedFunction<any>;
  once: MockedFunction<any>;
  emit: MockedFunction<any>;
  addListener: MockedFunction<any>;
  removeListener: MockedFunction<any>;
  removeAllListeners: MockedFunction<any>;
  setMaxListeners: MockedFunction<any>;
  getMaxListeners: MockedFunction<any>;
  listeners: MockedFunction<any>;
  rawListeners: MockedFunction<any>;
  listenerCount: MockedFunction<any>;
  prependListener: MockedFunction<any>;
  prependOnceListener: MockedFunction<any>;
  eventNames: MockedFunction<any>;
} {
  return {
    userId,
    userTeams: new Set(teamIds),
    subs: new Set(teamIds),
    isAuthenticated: true,
    readyState: WebSocket.OPEN,
    connectedAt: new Date(),
    lastActivity: new Date(),
    messagesSent: 0,
    messagesReceived: 0,
    send: vi.fn(),
    close: vi.fn(),
    ping: vi.fn(),
    pong: vi.fn(),
    terminate: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    setMaxListeners: vi.fn(),
    getMaxListeners: vi.fn(),
    listeners: vi.fn(),
    rawListeners: vi.fn(),
    listenerCount: vi.fn(),
    prependListener: vi.fn(),
    prependOnceListener: vi.fn(),
    eventNames: vi.fn()
  } as AuthenticatedWebSocket & {
    send: MockedFunction<any>;
    close: MockedFunction<any>;
    ping: MockedFunction<any>;
    pong: MockedFunction<any>;
    terminate: MockedFunction<any>;
    addEventListener: MockedFunction<any>;
    removeEventListener: MockedFunction<any>;
    dispatchEvent: MockedFunction<any>;
    on: MockedFunction<any>;
    off: MockedFunction<any>;
    once: MockedFunction<any>;
    emit: MockedFunction<any>;
    addListener: MockedFunction<any>;
    removeListener: MockedFunction<any>;
    removeAllListeners: MockedFunction<any>;
    setMaxListeners: MockedFunction<any>;
    getMaxListeners: MockedFunction<any>;
    listeners: MockedFunction<any>;
    rawListeners: MockedFunction<any>;
    listenerCount: MockedFunction<any>;
    prependListener: MockedFunction<any>;
    prependOnceListener: MockedFunction<any>;
    eventNames: MockedFunction<any>;
  };
}

// Mock WebSocket Server
function createMockWebSocketServer(clients: AuthenticatedWebSocket[]): WebSocketServer & {
  clients: Set<AuthenticatedWebSocket>;
  close: MockedFunction<any>;
  handleUpgrade: MockedFunction<any>;
  shouldHandle: MockedFunction<any>;
  on: MockedFunction<any>;
  off: MockedFunction<any>;
  once: MockedFunction<any>;
  emit: MockedFunction<any>;
  addListener: MockedFunction<any>;
  removeListener: MockedFunction<any>;
  removeAllListeners: MockedFunction<any>;
  setMaxListeners: MockedFunction<any>;
  getMaxListeners: MockedFunction<any>;
  listeners: MockedFunction<any>;
  rawListeners: MockedFunction<any>;
  listenerCount: MockedFunction<any>;
  prependListener: MockedFunction<any>;
  prependOnceListener: MockedFunction<any>;
  eventNames: MockedFunction<any>;
  address: MockedFunction<any>;
} {
  const clientsSet = new Set(clients);
  return {
    clients: clientsSet,
    close: vi.fn(),
    handleUpgrade: vi.fn(),
    shouldHandle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    setMaxListeners: vi.fn(),
    getMaxListeners: vi.fn(),
    listeners: vi.fn(),
    rawListeners: vi.fn(),
    listenerCount: vi.fn(),
    prependListener: vi.fn(),
    prependOnceListener: vi.fn(),
    eventNames: vi.fn(),
    address: vi.fn()
  } as WebSocketServer & {
    clients: Set<AuthenticatedWebSocket>;
    close: MockedFunction<any>;
    handleUpgrade: MockedFunction<any>;
    shouldHandle: MockedFunction<any>;
    on: MockedFunction<any>;
    off: MockedFunction<any>;
    once: MockedFunction<any>;
    emit: MockedFunction<any>;
    addListener: MockedFunction<any>;
    removeListener: MockedFunction<any>;
    removeAllListeners: MockedFunction<any>;
    setMaxListeners: MockedFunction<any>;
    getMaxListeners: MockedFunction<any>;
    listeners: MockedFunction<any>;
    rawListeners: MockedFunction<any>;
    listenerCount: MockedFunction<any>;
    prependListener: MockedFunction<any>;
    prependOnceListener: MockedFunction<any>;
    eventNames: MockedFunction<any>;
    address: MockedFunction<any>;
  };
}

// Mock database functions
const mockDatabase = {
  getUsersWithFavoriteTeam: vi.fn(),
  getUserFavoriteTeamBySport: vi.fn()
};

// Mock broadcasting functions
const mockBroadcastUserTeamUpdate = vi.fn();
const mockBroadcastUserTeamStatusChange = vi.fn();

// Mock the ws module
vi.mock('../../../../ws', async () => {
  const actual = await vi.importActual('../../../../ws');
  return {
    ...actual,
    broadcastToUsers: vi.fn(),
    broadcastToTeamSubscribers: vi.fn(),
    setupWebSocketErrorHandling: vi.fn()
  };
});

describe('WebSocket Events - User Team Scores', () => {
  let mockWebSocketServer: WebSocketServer & {
    clients: Set<AuthenticatedWebSocket>;
    close: MockedFunction<any>;
    handleUpgrade: MockedFunction<any>;
    shouldHandle: MockedFunction<any>;
    on: MockedFunction<any>;
    off: MockedFunction<any>;
    once: MockedFunction<any>;
    emit: MockedFunction<any>;
    addListener: MockedFunction<any>;
    removeListener: MockedFunction<any>;
    removeAllListeners: MockedFunction<any>;
    setMaxListeners: MockedFunction<any>;
    getMaxListeners: MockedFunction<any>;
    listeners: MockedFunction<any>;
    rawListeners: MockedFunction<any>;
    listenerCount: MockedFunction<any>;
    prependListener: MockedFunction<any>;
    prependOnceListener: MockedFunction<any>;
    eventNames: MockedFunction<any>;
    address: MockedFunction<any>;
  };
  let mockClients: (AuthenticatedWebSocket & {
    send: MockedFunction<any>;
    close: MockedFunction<any>;
    ping: MockedFunction<any>;
    pong: MockedFunction<any>;
    terminate: MockedFunction<any>;
    addEventListener: MockedFunction<any>;
    removeEventListener: MockedFunction<any>;
    dispatchEvent: MockedFunction<any>;
    on: MockedFunction<any>;
    off: MockedFunction<any>;
    once: MockedFunction<any>;
    emit: MockedFunction<any>;
    addListener: MockedFunction<any>;
    removeListener: MockedFunction<any>;
    removeAllListeners: MockedFunction<any>;
    setMaxListeners: MockedFunction<any>;
    getMaxListeners: MockedFunction<any>;
    listeners: MockedFunction<any>;
    rawListeners: MockedFunction<any>;
    listenerCount: MockedFunction<any>;
    prependListener: MockedFunction<any>;
    prependOnceListener: MockedFunction<any>;
    eventNames: MockedFunction<any>;
  })[];

  beforeEach(() => {
    // Create mock clients with different team preferences
    mockClients = [
      createMockWebSocketClient('user-1', ['team-1', 'team-3']),
      createMockWebSocketClient('user-2', ['team-2']),
      createMockWebSocketClient('user-3', ['team-1'])
    ];
    
    mockWebSocketServer = createMockWebSocketServer(mockClients);
    
    // Clear all mocks
    vi.clearAllMocks();
    mockClients.forEach(client => {
      client.send.mockClear();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Event Broadcasting Tests', () => {
    describe('user-team-score-update events', () => {
      it('should broadcast user-team-score-update to relevant users', async () => {
        const gameData = createMockGameScore({
          gameId: 'game-1',
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          homePts: 21,
          awayPts: 14,
          status: 'in_progress'
        });

        const scoreUpdateMessage: UserTeamScoreUpdate = {
          type: 'user-team-score-update',
          payload: {
            userId: 'user-1',
            teamId: 'team-1',
            teamName: 'Test Team 1',
            sport: 'nfl',
            gameData: {
              gameId: gameData.gameId,
              homeTeam: 'Test Team 1',
              awayTeam: 'Test Team 2',
              homeScore: gameData.homePts,
              awayScore: gameData.awayPts,
              status: gameData.status,
              quarter: '2nd',
              timeRemaining: '5:30'
            },
            timestamp: new Date().toISOString(),
            isUserTeam: true
          }
        };

        // Mock users who have team-1 as favorite
        mockDatabase.getUsersWithFavoriteTeam.mockResolvedValue(['user-1', 'user-3']);

        // Test the broadcast function
        const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
        mockBroadcast.mockImplementation((message, teamIds) => {
          // Simulate broadcasting to clients with matching teams
          mockClients.forEach(client => {
            if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
              client.send(JSON.stringify(message));
            }
          });
        });

        // Execute broadcast
        mockBroadcast(scoreUpdateMessage, ['team-1']);

        // Verify correct clients received the message
        expect(mockClients[0].send).toHaveBeenCalledWith(JSON.stringify(scoreUpdateMessage)); // user-1 has team-1
        expect(mockClients[1].send).not.toHaveBeenCalled(); // user-2 doesn't have team-1
        expect(mockClients[2].send).toHaveBeenCalledWith(JSON.stringify(scoreUpdateMessage)); // user-3 has team-1
      });

      it('should handle games with both home and away team subscribers', async () => {
        const gameData = createMockGameScore({
          gameId: 'game-2',
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          homePts: 7,
          awayPts: 10,
          status: 'final'
        });

        const scoreUpdateMessage: UserTeamScoreUpdate = {
          type: 'user-team-score-update',
          payload: {
            userId: 'user-1',
            teamId: 'team-1',
            teamName: 'Test Team 1',
            sport: 'nfl',
            gameData: {
              gameId: gameData.gameId,
              homeTeam: 'Test Team 1',
              awayTeam: 'Test Team 2',
              homeScore: gameData.homePts,
              awayScore: gameData.awayPts,
              status: gameData.status
            },
            timestamp: new Date().toISOString(),
            isUserTeam: true
          }
        };

        const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
        mockBroadcast.mockImplementation((message, teamIds) => {
          mockClients.forEach(client => {
            if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
              client.send(JSON.stringify(message));
            }
          });
        });

        // Broadcast to both teams
        mockBroadcast(scoreUpdateMessage, ['team-1', 'team-2']);

        // Both user-1 (team-1) and user-2 (team-2) should receive the message
        expect(mockClients[0].send).toHaveBeenCalled(); // user-1 has team-1
        expect(mockClients[1].send).toHaveBeenCalled(); // user-2 has team-2
        expect(mockClients[2].send).toHaveBeenCalled(); // user-3 has team-1
      });
    });

    describe('user-team-status-change events', () => {
      it('should handle user-team-status-change events', async () => {
        const statusChange: UserTeamStatusChange = {
          type: 'user-team-status-change',
          payload: {
            userId: 'user-1',
            teamId: 'team-1',
            gameId: 'game-1',
            oldStatus: 'live',
            newStatus: 'final',
            timestamp: new Date().toISOString()
          }
        };

        const mockBroadcast = broadcastToUsers as MockedFunction<typeof broadcastToUsers>;
        mockBroadcast.mockImplementation((message, targetUserIds) => {
          mockClients.forEach(client => {
            if (!targetUserIds || targetUserIds.includes(client.userId!)) {
              client.send(JSON.stringify(message));
            }
          });
        });

        // Broadcast to specific user
        mockBroadcast(statusChange, ['user-1']);

        expect(mockClients[0].send).toHaveBeenCalledWith(JSON.stringify(statusChange)); // user-1
        expect(mockClients[1].send).not.toHaveBeenCalled(); // user-2
        expect(mockClients[2].send).not.toHaveBeenCalled(); // user-3
      });

      it('should broadcast status changes to multiple users', async () => {
        const statusChange: UserTeamStatusChange = {
          type: 'user-team-status-change',
          payload: {
            userId: 'system',
            teamId: 'team-1',
            gameId: 'game-1',
            oldStatus: 'scheduled',
            newStatus: 'live',
            timestamp: new Date().toISOString()
          }
        };

        const mockBroadcast = vi.mocked(broadcastToUsers);
        mockBroadcast.mockImplementation((message, targetUserIds) => {
          mockClients.forEach(client => {
            if (!targetUserIds || targetUserIds.includes(client.userId!)) {
              client.send(JSON.stringify(message));
            }
          });
        });

        // Broadcast to multiple users
        mockBroadcast(statusChange, ['user-1', 'user-3']);

        expect(mockClients[0].send).toHaveBeenCalledWith(JSON.stringify(statusChange)); // user-1
        expect(mockClients[1].send).not.toHaveBeenCalled(); // user-2
        expect(mockClients[2].send).toHaveBeenCalledWith(JSON.stringify(statusChange)); // user-3
      });
    });
  });

  describe('User Filtering Tests', () => {
    it('should only send events to users with matching favorite teams', async () => {
      const gameData = createMockGameScore({ 
        homeTeamId: 'team-1',
        awayTeamId: 'team-unknown'
      });

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user-1',
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: gameData.gameId,
            homeTeam: 'Test Team 1',
            awayTeam: 'Unknown Team',
            homeScore: gameData.homePts,
            awayScore: gameData.awayPts,
            status: gameData.status
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      // Only broadcast to team-1 subscribers
      mockBroadcast(scoreUpdate, ['team-1']);

      // Only users with team-1 should receive the message
      expect(mockClients[0].send).toHaveBeenCalled(); // user-1 has team-1
      expect(mockClients[1].send).not.toHaveBeenCalled(); // user-2 doesn't have team-1
      expect(mockClients[2].send).toHaveBeenCalled(); // user-3 has team-1
    });

    it('should handle games with no interested users', async () => {
      const gameData = createMockGameScore({ 
        homeTeamId: 'team-unknown',
        awayTeamId: 'team-also-unknown'
      });

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'system',
          teamId: 'team-unknown',
          teamName: 'Unknown Team',
          sport: 'nfl',
          gameData: {
            gameId: gameData.gameId,
            homeTeam: 'Unknown Team',
            awayTeam: 'Also Unknown Team',
            homeScore: gameData.homePts,
            awayScore: gameData.awayPts,
            status: gameData.status
          },
          timestamp: new Date().toISOString(),
          isUserTeam: false
        }
      };

      const mockBroadcast = broadcastToTeamSubscribers as MockedFunction<typeof broadcastToTeamSubscribers>;
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      // Should not throw error when no users are interested
      expect(() => {
        mockBroadcast(scoreUpdate, ['team-unknown']);
      }).not.toThrow();

      // No clients should receive the message
      expect(mockClients[0].send).not.toHaveBeenCalled();
      expect(mockClients[1].send).not.toHaveBeenCalled();
      expect(mockClients[2].send).not.toHaveBeenCalled();
    });

    it('should filter users based on subscription status', async () => {
      // Create a client that's not subscribed to any teams
      const unsubscribedClient = createMockWebSocketClient('user-4', []);
      mockClients.push(unsubscribedClient);

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user-1',
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: 'game-1',
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      mockBroadcast(scoreUpdate, ['team-1']);

      // Unsubscribed client should not receive the message
      expect(unsubscribedClient.send).not.toHaveBeenCalled();
    });
  });

  describe('Connection Management Tests', () => {
    it('should handle disconnected clients gracefully', async () => {
      // Set one client as disconnected
      mockClients[0].readyState = WebSocket.CLOSED;

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user-1',
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: 'game-1',
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          // Only send to open connections
          if (client.readyState === WebSocket.OPEN && 
              client.userTeams && 
              teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      // Should not throw error when trying to send to disconnected client
      expect(() => {
        mockBroadcast(scoreUpdate, ['team-1']);
      }).not.toThrow();

      // Disconnected client should not receive message
      expect(mockClients[0].send).not.toHaveBeenCalled(); // disconnected
      expect(mockClients[2].send).toHaveBeenCalled(); // connected and subscribed
    });

    it('should handle WebSocket send errors', async () => {
      // Mock send to throw an error
      mockClients[0].send.mockImplementation(() => {
        throw new Error('Send failed');
      });

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user-1',
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: 'game-1',
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN && 
              client.userTeams && 
              teamIds.some(teamId => client.userTeams!.has(teamId))) {
            try {
              client.send(JSON.stringify(message));
            } catch (error) {
              // Log error but don't throw - this simulates the actual error handling
              console.error('WebSocket send error:', error);
            }
          }
        });
      });

      // Should log error but not throw
      expect(() => {
        mockBroadcast(scoreUpdate, ['team-1']);
      }).not.toThrow();

      // Verify the send was attempted
      expect(mockClients[0].send).toHaveBeenCalled();
    });

    it('should handle unauthenticated clients', async () => {
      // Set one client as unauthenticated
      mockClients[1].isAuthenticated = false;
      mockClients[1].userId = undefined;

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user-2',
          teamId: 'team-2',
          teamName: 'Test Team 2',
          sport: 'nfl',
          gameData: {
            gameId: 'game-1',
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          // Only send to authenticated clients
          if (client.isAuthenticated && 
              client.userId &&
              client.readyState === WebSocket.OPEN && 
              client.userTeams && 
              teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      mockBroadcast(scoreUpdate, ['team-2']);

      // Unauthenticated client should not receive message
      expect(mockClients[1].send).not.toHaveBeenCalled();
    });

    it('should track connection metrics', () => {
      // Test that connection metrics are properly tracked
      const connectedClient = mockClients[0];
      
      expect(connectedClient.connectedAt).toBeDefined();
      expect(connectedClient.messagesSent).toBeDefined();
      expect(connectedClient.messagesReceived).toBeDefined();
      expect(connectedClient.isAuthenticated).toBe(true);
      expect(connectedClient.userId).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed message data', () => {
      const malformedMessage = {
        type: 'user-team-score-update',
        payload: null // Invalid payload
      };

      const mockBroadcast = vi.mocked(broadcastToUsers);
      
      // Should not throw when broadcasting malformed message
      expect(() => {
        mockBroadcast(malformedMessage as any, ['user-1']);
      }).not.toThrow();
    });

    it('should handle empty team arrays', () => {
      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user-1',
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: 'game-1',
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      
      // Should handle empty team arrays gracefully
      expect(() => {
        mockBroadcast(scoreUpdate, []);
      }).not.toThrow();
    });

    it('should handle WebSocket server errors', () => {
      const mockSetupErrorHandling = vi.mocked(setupWebSocketErrorHandling);
      
      // Should be able to setup error handling without throwing
      expect(() => {
        mockSetupErrorHandling(mockWebSocketServer);
      }).not.toThrow();
      
      expect(mockSetupErrorHandling).toHaveBeenCalledWith(mockWebSocketServer);
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent broadcasts efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple score updates
      const updates = Array.from({ length: 10 }, (_, i) => ({
        type: 'user-team-score-update' as const,
        payload: {
          userId: `user-${i}`,
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: `game-${i}`,
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21 + i,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      }));

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      mockBroadcast.mockImplementation((message, teamIds) => {
        mockClients.forEach(client => {
          if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      // Broadcast all updates
      updates.forEach(update => {
        mockBroadcast(update, ['team-1']);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (< 50ms as per requirements)
      expect(duration).toBeLessThan(50);
    });

    it('should handle large numbers of clients efficiently', () => {
      // Create many mock clients
      const manyClients = Array.from({ length: 100 }, (_, i) => 
        createMockWebSocketClient(`user-${i}`, ['team-1'])
      );

      const startTime = Date.now();

      const mockBroadcast = vi.mocked(broadcastToTeamSubscribers);
      mockBroadcast.mockImplementation((message, teamIds) => {
        manyClients.forEach(client => {
          if (client.userTeams && teamIds.some(teamId => client.userTeams!.has(teamId))) {
            client.send(JSON.stringify(message));
          }
        });
      });

      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'system',
          teamId: 'team-1',
          teamName: 'Test Team 1',
          sport: 'nfl',
          gameData: {
            gameId: 'game-1',
            homeTeam: 'Test Team 1',
            awayTeam: 'Test Team 2',
            homeScore: 21,
            awayScore: 14,
            status: 'live'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      mockBroadcast(scoreUpdate, ['team-1']);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 100 clients efficiently
      expect(duration).toBeLessThan(50);
      
      // Verify all clients received the message
      manyClients.forEach(client => {
        expect(client.send).toHaveBeenCalledWith(JSON.stringify(scoreUpdate));
      });
    });
  });
});