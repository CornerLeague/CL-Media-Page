/**
 * WebSocket Event Types for User-Specific Team Updates
 * 
 * This file defines the structure of WebSocket messages for user team score updates,
 * status changes, and subscription management.
 */

export interface UserTeamScoreUpdate {
  type: 'user-team-score-update';
  payload: {
    userId: string;
    teamId: string;
    teamName: string;
    sport: string;
    gameData: {
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      homeScore: number;
      awayScore: number;
      status: string;
      quarter?: string;
      timeRemaining?: string;
    };
    timestamp: string;
    isUserTeam: boolean; // true if this is user's favorite team
  };
}

export interface UserTeamStatusChange {
  type: 'user-team-status-change';
  payload: {
    userId: string;
    teamId: string;
    gameId: string;
    oldStatus: string;
    newStatus: string;
    timestamp: string;
  };
}

export interface UserSubscriptionUpdate {
  type: 'user-subscription-update';
  payload: {
    action: 'subscribe' | 'unsubscribe';
    sport?: string;
    teamId?: string;
  };
}

// Legacy event types for backward compatibility
export interface LegacyTeamSubscription {
  type: 'subscribe' | 'unsubscribe';
  teamId: string;
}

export interface LegacyScoreUpdate {
  type: 'score-update';
  teamId: string;
  data: any;
}

// Union type for all possible WebSocket messages
export type WebSocketMessage = 
  | UserTeamScoreUpdate
  | UserTeamStatusChange
  | UserSubscriptionUpdate
  | LegacyTeamSubscription
  | LegacyScoreUpdate;

// Incoming message types (from client to server)
export interface SubscribeToTeamMessage {
  type: 'subscribe';
  teamId: string;
}

export interface UnsubscribeFromTeamMessage {
  type: 'unsubscribe';
  teamId: string;
}

export interface SubscribeToUserTeamsMessage {
  type: 'subscribe-user-teams';
  sport?: string; // Optional: subscribe to teams for specific sport only
}

export interface UnsubscribeFromUserTeamsMessage {
  type: 'unsubscribe-user-teams';
  sport?: string; // Optional: unsubscribe from teams for specific sport only
}

export type IncomingWebSocketMessage = 
  | SubscribeToTeamMessage
  | UnsubscribeFromTeamMessage
  | SubscribeToUserTeamsMessage
  | UnsubscribeFromUserTeamsMessage;

// Response message types (from server to client)
export interface SubscriptionConfirmation {
  type: 'subscription-confirmation';
  payload: {
    action: 'subscribe' | 'unsubscribe';
    teamId?: string;
    sport?: string;
    success: boolean;
    message?: string;
  };
}

export interface ConnectionStatus {
  type: 'connection-status';
  payload: {
    status: 'connected' | 'authenticated' | 'error';
    userId?: string;
    message?: string;
  };
}

export interface UserTeamsLoaded {
  type: 'user-teams-loaded';
  payload: {
    teams: Array<{
      id: string;
      name: string;
      league: string;
      code: string;
    }>;
    autoSubscribed: boolean;
    message?: string;
  };
}

export type OutgoingWebSocketMessage = 
  | UserTeamScoreUpdate
  | UserTeamStatusChange
  | UserSubscriptionUpdate
  | SubscriptionConfirmation
  | ConnectionStatus
  | UserTeamsLoaded
  | LegacyScoreUpdate;