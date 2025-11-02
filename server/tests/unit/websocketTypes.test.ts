/**
 * Unit tests for WebSocket event types
 */

import { describe, it, expect } from 'vitest';
import { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange, 
  UserSubscriptionUpdate,
  SubscriptionConfirmation,
  ConnectionStatus,
  IncomingWebSocketMessage,
  OutgoingWebSocketMessage
} from '../../types/websocket';

describe('WebSocket Event Types', () => {
  describe('UserTeamScoreUpdate', () => {
    it('should have correct structure', () => {
      const scoreUpdate: UserTeamScoreUpdate = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user123',
          teamId: 'team456',
          teamName: 'Lakers',
          sport: 'basketball',
          gameData: {
            gameId: 'game789',
            homeTeam: 'Lakers',
            awayTeam: 'Warriors',
            homeScore: 95,
            awayScore: 88,
            status: 'Final',
            quarter: '4th',
            timeRemaining: '00:00'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      expect(scoreUpdate.type).toBe('user-team-score-update');
      expect(scoreUpdate.payload.userId).toBe('user123');
      expect(scoreUpdate.payload.gameData.homeScore).toBe(95);
      expect(scoreUpdate.payload.isUserTeam).toBe(true);
    });
  });

  describe('UserTeamStatusChange', () => {
    it('should have correct structure', () => {
      const statusChange: UserTeamStatusChange = {
        type: 'user-team-status-change',
        payload: {
          userId: 'user123',
          teamId: 'team456',
          gameId: 'game789',
          oldStatus: 'In Progress',
          newStatus: 'Final',
          timestamp: new Date().toISOString()
        }
      };

      expect(statusChange.type).toBe('user-team-status-change');
      expect(statusChange.payload.oldStatus).toBe('In Progress');
      expect(statusChange.payload.newStatus).toBe('Final');
    });
  });

  describe('SubscriptionConfirmation', () => {
    it('should handle successful subscription', () => {
      const confirmation: SubscriptionConfirmation = {
        type: 'subscription-confirmation',
        payload: {
          action: 'subscribe',
          teamId: 'team456',
          success: true,
          message: 'Successfully subscribed to team'
        }
      };

      expect(confirmation.type).toBe('subscription-confirmation');
      expect(confirmation.payload.success).toBe(true);
      expect(confirmation.payload.action).toBe('subscribe');
    });

    it('should handle failed subscription', () => {
      const confirmation: SubscriptionConfirmation = {
        type: 'subscription-confirmation',
        payload: {
          action: 'subscribe',
          success: false,
          message: 'Invalid team ID'
        }
      };

      expect(confirmation.payload.success).toBe(false);
      expect(confirmation.payload.message).toBe('Invalid team ID');
    });
  });

  describe('ConnectionStatus', () => {
    it('should handle authenticated status', () => {
      const status: ConnectionStatus = {
        type: 'connection-status',
        payload: {
          status: 'authenticated',
          userId: 'user123',
          message: 'Connection authenticated successfully'
        }
      };

      expect(status.type).toBe('connection-status');
      expect(status.payload.status).toBe('authenticated');
      expect(status.payload.userId).toBe('user123');
    });

    it('should handle error status', () => {
      const status: ConnectionStatus = {
        type: 'connection-status',
        payload: {
          status: 'error',
          message: 'Authentication failed'
        }
      };

      expect(status.payload.status).toBe('error');
      expect(status.payload.userId).toBeUndefined();
    });
  });

  describe('Type Guards', () => {
    it('should properly type incoming messages', () => {
      const subscribeMessage: IncomingWebSocketMessage = {
        type: 'subscribe',
        teamId: 'team123'
      };

      const userTeamsMessage: IncomingWebSocketMessage = {
        type: 'subscribe-user-teams',
        sport: 'basketball'
      };

      expect(subscribeMessage.type).toBe('subscribe');
      expect(userTeamsMessage.type).toBe('subscribe-user-teams');
    });

    it('should properly type outgoing messages', () => {
      const scoreUpdate: OutgoingWebSocketMessage = {
        type: 'user-team-score-update',
        payload: {
          userId: 'user123',
          teamId: 'team456',
          teamName: 'Lakers',
          sport: 'basketball',
          gameData: {
            gameId: 'game789',
            homeTeam: 'Lakers',
            awayTeam: 'Warriors',
            homeScore: 95,
            awayScore: 88,
            status: 'Final'
          },
          timestamp: new Date().toISOString(),
          isUserTeam: true
        }
      };

      const confirmation: OutgoingWebSocketMessage = {
        type: 'subscription-confirmation',
        payload: {
          action: 'subscribe',
          success: true
        }
      };

      expect(scoreUpdate.type).toBe('user-team-score-update');
      expect(confirmation.type).toBe('subscription-confirmation');
    });
  });
});