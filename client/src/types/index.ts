// ============================================================================
// CORE TYPES
// ============================================================================

import { Sport } from '@/data/sportsTeams';

/**
 * Base error interface for consistent error handling
 */
export interface BaseError {
  type: 'network' | 'auth' | 'validation' | 'server' | 'unknown';
  message: string;
  code?: string;
  details?: Record<string, any>;
  timestamp?: string;
}

/**
 * Loading state interface for consistent loading handling
 */
export interface LoadingState {
  isLoading: boolean;
  isTransitioning?: boolean;
  loadingMessage?: string;
  progress?: number;
}

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = any> {
  data?: T;
  error?: BaseError;
  success: boolean;
  timestamp: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// SPORT CONTEXT TYPES
// ============================================================================

/**
 * Enhanced sport context state with transition support
 */
export interface SportContextState {
  selectedSport: Sport | null;
  availableSports: Sport[];
  isTransitioning: boolean;
  lastSportChange: Date | null;
  transitionDuration?: number;
  previousSport?: Sport | null;
}

/**
 * Sport transition event data
 */
export interface SportTransitionEvent {
  fromSport: Sport | null;
  toSport: Sport | null;
  timestamp: Date;
  duration?: number;
  success: boolean;
  error?: BaseError;
}

/**
 * Sport change notification configuration
 */
export interface SportChangeNotificationConfig {
  showLoading: boolean;
  showSuccess: boolean;
  showError: boolean;
  autoHideDelay: number;
  enableSound: boolean;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

/**
 * Notification severity levels
 */
export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * Notification display variants
 */
export type NotificationVariant = 'default' | 'destructive' | 'outline' | 'secondary';

/**
 * Base notification interface
 */
export interface BaseNotification {
  id: string;
  type: NotificationSeverity;
  variant?: NotificationVariant;
  title?: string;
  message: string;
  duration?: number;
  persistent?: boolean;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Sport-specific notification
 */
export interface SportNotification extends BaseNotification {
  sportName?: string;
  sportIcon?: string;
  relatedTeam?: string;
  gameId?: string;
}

/**
 * Notification state management
 */
export interface NotificationState {
  notifications: BaseNotification[];
  maxNotifications: number;
  defaultDuration: number;
  isEnabled: boolean;
  soundEnabled: boolean;
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * Generic component state for loading, error, and empty states
 */
export interface ComponentState<T = any> {
  data?: T;
  isLoading: boolean;
  isTransitioning?: boolean;
  error?: BaseError;
  isEmpty?: boolean;
  lastUpdated?: Date;
  retryCount?: number;
  maxRetries?: number;
}

/**
 * State manager configuration
 */
export interface StateManagerConfig {
  enableRetry: boolean;
  maxRetries: number;
  retryDelay: number;
  showEmptyState: boolean;
  showLoadingOverlay: boolean;
  emptyStateMessage?: string;
  loadingMessage?: string;
}

/**
 * Loading component variants
 */
export type LoadingVariant = 'default' | 'pulse' | 'activity' | 'sport-transition';

/**
 * Error component variants
 */
export type ErrorVariant = 'default' | 'destructive' | 'warning' | 'connection';

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

/**
 * WebSocket connection state
 */
export type WebSocketConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

/**
 * WebSocket subscription state
 */
export interface WebSocketSubscription {
  id: string;
  type: 'team' | 'sport' | 'user-teams';
  target: string; // team ID, sport name, or user ID
  isActive: boolean;
  subscribedAt: Date;
  lastActivity?: Date;
}

/**
 * WebSocket connection metrics
 */
export interface WebSocketMetrics {
  connectionUptime: number;
  messagesReceived: number;
  messagesSent: number;
  reconnectAttempts: number;
  lastReconnectAt?: Date;
  averageLatency?: number;
}

/**
 * Enhanced WebSocket state
 */
export interface WebSocketState {
  connectionState: WebSocketConnectionState;
  subscriptions: WebSocketSubscription[];
  metrics: WebSocketMetrics;
  error?: BaseError;
  isReconnecting: boolean;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

// ============================================================================
// SCORE AND GAME TYPES
// ============================================================================

/**
 * Enhanced game status with more granular states
 */
export type GameStatus = 
  | 'scheduled' 
  | 'pre-game' 
  | 'live' 
  | 'halftime' 
  | 'overtime' 
  | 'final' 
  | 'postponed' 
  | 'cancelled' 
  | 'suspended';

/**
 * Game period information
 */
export interface GamePeriod {
  current: number;
  total: number;
  name: string; // 'Quarter', 'Period', 'Inning', etc.
  timeRemaining?: string;
  isOvertime?: boolean;
}

/**
 * Enhanced score data with additional metadata
 */
export interface EnhancedScoreData {
  gameId: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: GameStatus;
  period?: GamePeriod;
  venue?: string;
  startTime: Date;
  lastUpdated: Date;
  isUserTeamGame: boolean;
  userTeams: string[];
  highlights?: string[];
  metadata?: Record<string, any>;
}

/**
 * Score update event
 */
export interface ScoreUpdateEvent {
  gameId: string;
  sport: Sport;
  previousScore: { home: number; away: number };
  newScore: { home: number; away: number };
  scoringTeam: 'home' | 'away';
  scoringType?: string; // 'touchdown', 'field-goal', 'basket', etc.
  timestamp: Date;
  period?: GamePeriod;
}

// ============================================================================
// USER PREFERENCES TYPES
// ============================================================================

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  scoreUpdates: boolean;
  gameStart: boolean;
  gameEnd: boolean;
  favoriteTeamsOnly: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  quietHours?: {
    enabled: boolean;
    start: string; // HH:MM format
    end: string; // HH:MM format
  };
}

/**
 * User display preferences
 */
export interface DisplayPreferences {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
  showScores: boolean;
  showLogos: boolean;
  animationsEnabled: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // in seconds
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
}

/**
 * User sport preferences
 */
export interface SportPreferences {
  favoriteTeams: Array<{
    sport: Sport;
    teamId: string;
    teamName: string;
    priority: number;
  }>;
  followedSports: Sport[];
  defaultSport?: Sport;
  sportOrder: Sport[];
}

/**
 * Complete user preferences
 */
export interface UserPreferences {
  notifications: NotificationPreferences;
  display: DisplayPreferences;
  sports: SportPreferences;
  lastUpdated: Date;
  version: string;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================

/**
 * User interaction event
 */
export interface UserInteractionEvent {
  type: 'click' | 'view' | 'scroll' | 'search' | 'filter' | 'share';
  target: string;
  context?: Record<string, any>;
  timestamp: Date;
  sessionId: string;
  userId?: string;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  pageLoadTime: number;
  apiResponseTime: number;
  webSocketLatency: number;
  renderTime: number;
  memoryUsage?: number;
  timestamp: Date;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Generic pagination parameters
 */
export interface PaginationParams {
  page: number;
  limit: number;
  offset?: number;
  total?: number;
}

/**
 * Generic sort parameters
 */
export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Generic filter parameters
 */
export interface FilterParams {
  [key: string]: any;
}

/**
 * Generic query parameters
 */
export interface QueryParams {
  pagination?: PaginationParams;
  sort?: SortParams;
  filters?: FilterParams;
  search?: string;
}

/**
 * Async operation state
 */
export interface AsyncOperationState<T = any> {
  data?: T;
  isLoading: boolean;
  error?: BaseError;
  isSuccess: boolean;
  isError: boolean;
  lastFetch?: Date;
  retryCount: number;
}

// ============================================================================
// TYPE GUARDS AND UTILITIES
// ============================================================================

/**
 * Type guard for checking if an error is a BaseError
 */
export const isBaseError = (error: any): error is BaseError => {
  return error && typeof error === 'object' && 'type' in error && 'message' in error;
};

/**
 * Type guard for checking if a notification is a SportNotification
 */
export const isSportNotification = (notification: BaseNotification): notification is SportNotification => {
  return 'sportName' in notification;
};

/**
 * Type guard for checking WebSocket connection state
 */
export const isWebSocketConnected = (state: WebSocketConnectionState): boolean => {
  return state === 'connected';
};

// ============================================================================
// MAIN TYPE EXPORTS
// ============================================================================

// Re-export core types
export * from './enhanced';
export * from './scores';

// Re-export from data
export type { Sport } from '@/data/sportsTeams';

// ============================================================================
// CONVENIENCE RE-EXPORTS
// ============================================================================

// Enhanced types for easy import
export type {
  EnhancedSportContextType,
  EnhancedUserTeamScoresReturn,
  EnhancedWebSocketReturn,
  EnhancedAISummarySectionProps,
  EnhancedScoresWidgetProps,
  EnhancedNotificationProps,
  EnhancedAppState,
  EnhancedAsyncResult,
  EnhancedFormState,
  EnhancedModalState
} from './enhanced';

// Scores types for easy import
export type {
  UserTeamScoreData,
  GameScore,
  GameResult,
  TeamScore,
  UseUserTeamScoresReturn,
  UseUserTeamScoresOptions,
  UseWebSocketReturn,
  ScoreWebSocketEvent,
  UserTeamScoreUpdateEvent,
  ScoresWidgetProps,
  ScoresSkeletonProps,
  ScoresErrorProps,
  ScoresError
} from './scores';