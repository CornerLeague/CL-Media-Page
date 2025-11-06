// ============================================================================
// SCORES FEATURE TYPE DEFINITIONS
// ============================================================================

import { Sport } from '@/data/sportsTeams';
import { BaseError, GameStatus, GamePeriod } from './index';

// ============================================================================
// CORE SCORE TYPES
// ============================================================================

/**
 * Individual team score information
 */
export interface TeamScore {
  id: string;
  name: string;
  abbreviation?: string;
  logo?: string;
  pts: number;
  isHome: boolean;
  record?: {
    wins: number;
    losses: number;
    ties?: number;
  };
}

/**
 * Complete game score information with enhanced details
 */
export interface GameScore {
  id: string;
  sport: Sport;
  status: GameStatus;
  period?: GamePeriod;
  timeRemaining?: string;
  homeTeam: TeamScore;
  awayTeam: TeamScore;
  venue?: {
    name: string;
    city: string;
    state?: string;
  };
  startTime: Date;
  lastUpdated: Date;
  broadcasts?: string[];
  odds?: {
    spread: number;
    overUnder: number;
    moneyline: { home: number; away: number };
  };
}

/**
 * Game result with final statistics
 */
export interface GameResult extends Omit<GameScore, 'status' | 'timeRemaining'> {
  status: 'final';
  finalScore: {
    home: number;
    away: number;
  };
  gameStats?: {
    attendance?: number;
    duration?: string;
    weather?: string;
  };
}

/**
 * This is the primary interface for user's favorite team score information
 * Used throughout the application for displaying user-specific score data
 */
export interface UserTeamScoreData {
  userId: string;
  teamId: string;
  sport: Sport;
  games: GameScore[];
  lastUpdated: Date;
  preferences: {
    notifications: boolean;
    realTimeUpdates: boolean;
    showOdds: boolean;
  };
  metadata?: {
    favoriteTeamRank?: number;
    seasonRecord?: { wins: number; losses: number; ties?: number };
    nextGame?: Date;
    lastGameResult?: 'win' | 'loss' | 'tie';
  };
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

/**
 * Response type for user team scores API endpoint
 */
export interface UserTeamScoresResponse {
  success: boolean;
  data: UserTeamScoreData[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  metadata?: {
    lastSync: Date;
    cacheExpiry: Date;
  };
}

/**
 * Response type for individual team score API endpoint
 */
export interface TeamScoreResponse {
  success: boolean;
  data: GameScore;
  metadata?: {
    source: string;
    confidence: number;
    lastVerified: Date;
  };
}

// ============================================================================
// WEBSOCKET EVENT TYPES
// ============================================================================

/**
 * WebSocket event types for real-time score updates
 */
export type ScoreWebSocketEventType = 
  | 'user_team_score_update'
  | 'game_status_change'
  | 'connection_status'
  | 'error'
  | 'heartbeat';

/**
 * Base WebSocket event structure
 */
export interface BaseWebSocketEvent {
  type: ScoreWebSocketEventType;
  timestamp: Date;
  id: string;
}

/**
 * User team score update event
 */
export interface UserTeamScoreUpdateEvent extends BaseWebSocketEvent {
  type: 'user_team_score_update';
  data: {
    userId: string;
    teamId: string;
    gameId: string;
    previousScore: { home: number; away: number };
    newScore: { home: number; away: number };
    scoringTeam: 'home' | 'away';
    sport: Sport;
  };
}

/**
 * Game status change event
 */
export interface GameStatusChangeEvent extends BaseWebSocketEvent {
  type: 'game_status_change';
  data: {
    gameId: string;
    previousStatus: GameStatus;
    newStatus: GameStatus;
    sport: Sport;
    affectedUsers: string[];
  };
}

/**
 * Connection status event
 */
export interface ConnectionStatusEvent extends BaseWebSocketEvent {
  type: 'connection_status';
  data: {
    status: 'connected' | 'disconnected' | 'reconnecting';
    reason?: string;
  };
}

/**
 * Union type for all score WebSocket events
 */
export type ScoreWebSocketEvent = 
  | UserTeamScoreUpdateEvent 
  | GameStatusChangeEvent 
  | ConnectionStatusEvent;

// ============================================================================
// HOOK RETURN TYPES
// ============================================================================

/**
 * Return type for useUserTeamScores hook
 */
export interface UseUserTeamScoresReturn {
  data: UserTeamScoreData[] | null;
  isLoading: boolean;
  error: ScoresError | null;
  refetch: () => Promise<void>;
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * Options for useUserTeamScores hook
 */
export interface UseUserTeamScoresOptions {
  sport?: Sport;
  limit?: number;
  realTime?: boolean;
  includeCompleted?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Return type for useWebSocket hook for scores
 */
export interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  lastEvent: ScoreWebSocketEvent | null;
  error: WebSocketError | null;
  connect: () => void;
  disconnect: () => void;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Extended error type for scores feature
 */
export interface ScoresError {
  type: 'network' | 'auth' | 'validation' | 'server' | 'unknown' | 'websocket' | 'cache';
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp?: string;
  context?: {
    sport?: Sport;
    teamId?: string;
    gameId?: string;
    endpoint?: string;
    operation?: string;
  };
}

/**
 * WebSocket specific error type
 */
export interface WebSocketError extends Omit<ScoresError, 'context'> {
  type: 'websocket';
  context: {
    connectionState: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
    reconnectAttempts: number;
    lastError?: string;
  };
}

// ============================================================================
// COMPONENT PROP TYPES
// ============================================================================

/**
 * Props for ScoresWidget component
 */
export interface ScoresWidgetProps {
  userId: string;
  sports?: Sport[];
  limit?: number;
  showOdds?: boolean;
  realTimeUpdates?: boolean;
  className?: string;
}

/**
 * Props for ScoresSkeleton component
 */
export interface ScoresSkeletonProps {
  count?: number;
  showOdds?: boolean;
  className?: string;
}

/**
 * Props for ScoresError component
 */
export interface ScoresErrorProps {
  error: ScoresError;
  onRetry?: () => void;
  className?: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Score comparison utility type
 */
export interface ScoreComparison {
  gameId: string;
  sport: Sport;
  teamId: string;
  previousScore: number;
  currentScore: number;
  difference: number;
  timestamp: Date;
}

/**
 * Score update notification type
 */
export interface ScoreUpdateNotification {
  id: string;
  gameId: string;
  teamName: string;
  sport: Sport;
  message: string;
  type: 'score_update' | 'game_start' | 'game_end' | 'status_change';
  timestamp: Date;
  read: boolean;
}