// ============================================================================
// ENHANCED TYPE DEFINITIONS
// ============================================================================

import { Sport } from '@/data/sportsTeams';
import { 
  BaseError, 
  LoadingState, 
  NotificationState, 
  ComponentState,
  EnhancedScoreData,
  WebSocketState,
  SportTransitionEvent,
  NotificationPreferences,
  DisplayPreferences,
  SportPreferences
} from './index';

// Import existing types
import type { 
  UserTeamScoresResult, 
  UserTeamScoresError,
  UserTeamScoresOptions 
} from '@/hooks/useUserTeamScores';

import type { 
  UserTeamScoreUpdate,
  WebSocketEventHandlers 
} from '@/hooks/useWebSocket';

// ============================================================================
// ENHANCED CONTEXT TYPES
// ============================================================================

/**
 * Enhanced SportContext with transition and state management features
 */
export interface EnhancedSportContextType {
  // Core sport management
  selectedSport: Sport | null;
  setSelectedSport: (sport: Sport | null) => Promise<void>;
  availableSports: Sport[];
  
  // Transition state
  isTransitioning: boolean;
  lastSportChange: Date | null;
  transitionDuration: number;
  previousSport: Sport | null;
  transitionHistory: SportTransitionEvent[];
  
  // Enhanced score management
  scores: {
    scores: Record<string, EnhancedScoreData>;
    lastRefresh: string | null;
    isRefreshing: boolean;
    error: string | null;
    metadata: {
      totalGames: number;
      liveGames: number;
      lastUpdateTime: Date | null;
    };
  };
  
  // Enhanced methods
  refreshScores: () => Promise<void>;
  getScoreForGame: (gameId: string) => EnhancedScoreData | undefined;
  getScoresForTeam: (teamId: string) => EnhancedScoreData[];
  clearScores: () => void;
  
  // WebSocket management
  subscribeToTeam: (teamId: string) => Promise<boolean>;
  unsubscribeFromTeam: (teamId: string) => Promise<boolean>;
  subscribeToSport: (sport: Sport) => Promise<boolean>;
  unsubscribeFromSport: (sport: Sport) => Promise<boolean>;
  
  // Connection state
  webSocketState: WebSocketState;
  isConnectedToRealTime: boolean;
  
  // Event handlers
  onSportChange?: (event: SportTransitionEvent) => void;
  onScoreUpdate?: (update: UserTeamScoreUpdate) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ============================================================================
// ENHANCED HOOK TYPES
// ============================================================================

/**
 * Enhanced useUserTeamScores return type
 */
export interface EnhancedUserTeamScoresReturn extends Omit<UserTeamScoresResult, 'data' | 'error'> {
  // Enhanced data structure
  data?: {
    games: EnhancedScoreData[];
    favoriteTeams: Array<{
      id: string;
      sport: Sport;
      teamName: string;
      league?: string;
      isActive: boolean;
      lastGameDate?: Date;
      nextGameDate?: Date;
    }>;
    lastUpdated: string;
    metadata: {
      totalGames: number;
      liveGames: number;
      upcomingGames: number;
      completedGames: number;
      userTeamGames: number;
    };
  };
  
  // Enhanced error handling
  error: BaseError | null;
  
  // Enhanced methods
  refetch: () => Promise<void>;
  invalidateCache: () => Promise<void>;
  prefetchNextPage: (options?: Partial<UserTeamScoresOptions>) => Promise<void>;
  clearCache: () => void;
  
  // Real-time features
  lastScoreUpdate: Date | null;
  updateCount: number;
  isConnectedToRealTime: boolean;
  realtimeMetrics: {
    updatesReceived: number;
    lastUpdateTime: Date | null;
    averageUpdateLatency: number;
  };
}

/**
 * Enhanced useWebSocket return type
 */
export interface EnhancedWebSocketReturn {
  // Enhanced connection state
  isConnected: boolean;
  connectionState: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';
  
  // Enhanced subscription management
  subscribeToTeam: (teamId: string) => Promise<boolean>;
  unsubscribeFromTeam: (teamId: string) => Promise<boolean>;
  subscribeToUserTeams: (sport?: Sport) => Promise<boolean>;
  unsubscribeFromUserTeams: (sport?: Sport) => Promise<boolean>;
  
  // Enhanced state
  activeSubscriptions: Array<{
    type: 'team' | 'sport' | 'user-teams';
    target: string;
    subscribedAt: Date;
    isActive: boolean;
  }>;
  
  // Metrics and diagnostics
  connectionMetrics: {
    uptime: number;
    messagesReceived: number;
    messagesSent: number;
    reconnectAttempts: number;
    lastReconnectAt?: Date;
    averageLatency: number;
  };
  
  // Error handling
  lastError?: BaseError;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  
  // Enhanced event handlers
  eventHandlers: WebSocketEventHandlers & {
    onConnectionStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
    onSubscriptionChange?: (subscriptions: Array<{ type: string; target: string; isActive: boolean }>) => void;
    onMetricsUpdate?: (metrics: any) => void;
  };
}

// ============================================================================
// ENHANCED COMPONENT PROPS
// ============================================================================

/**
 * Enhanced AISummarySection props
 */
export interface EnhancedAISummarySectionProps {
  // Core props
  className?: string;
  
  // Enhanced loading states
  loadingState?: LoadingState;
  showLoadingOverlay?: boolean;
  loadingMessage?: string;
  
  // Enhanced error handling
  errorState?: ComponentState;
  showErrorBoundary?: boolean;
  onError?: (error: BaseError) => void;
  onRetry?: () => Promise<void>;
  
  // Transition support
  showTransitionIndicator?: boolean;
  transitionMessage?: string;
  transitionDuration?: number;
  
  // Enhanced callbacks
  onSportChange?: (fromSport: Sport | null, toSport: Sport | null) => void;
  onDataUpdate?: (data: any) => void;
  onUserInteraction?: (event: string, data?: any) => void;
  
  // Display options
  compactMode?: boolean;
  showMetadata?: boolean;
  enableAnimations?: boolean;
  
  // Real-time features
  enableRealTimeUpdates?: boolean;
  updateIndicatorDuration?: number;
}

/**
 * Enhanced ScoresWidget props
 */
export interface EnhancedScoresWidgetProps {
  // Enhanced data
  games?: EnhancedScoreData[];
  loading?: boolean;
  error?: BaseError;
  
  // Enhanced display options
  showTransitions?: boolean;
  compactMode?: boolean;
  showMetadata?: boolean;
  showTeamLogos?: boolean;
  showGameDetails?: boolean;
  maxGamesDisplayed?: number;
  
  // Enhanced interactions
  onGameClick?: (gameId: string, game: EnhancedScoreData) => void;
  onTeamClick?: (teamName: string, sport: Sport) => void;
  onRefresh?: () => Promise<void>;
  onShare?: (gameId: string) => void;
  
  // Real-time features
  enableRealTimeUpdates?: boolean;
  highlightUpdates?: boolean;
  updateAnimationDuration?: number;
  showUpdateIndicators?: boolean;
  
  // Styling
  className?: string;
  variant?: 'default' | 'compact' | 'detailed';
  theme?: 'light' | 'dark' | 'auto';
}

/**
 * Enhanced notification component props
 */
export interface EnhancedNotificationProps {
  // Core notification data
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  
  // Enhanced display options
  variant?: 'default' | 'destructive' | 'outline' | 'filled';
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
  duration?: number;
  persistent?: boolean;
  
  // Enhanced interactions
  onClose?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  
  // Sport-specific features
  sportName?: string;
  sportIcon?: string;
  relatedTeam?: string;
  gameId?: string;
  
  // Styling and animation
  className?: string;
  showIcon?: boolean;
  enableAnimation?: boolean;
  animationDuration?: number;
}

// ============================================================================
// ENHANCED STATE MANAGEMENT
// ============================================================================

/**
 * Enhanced application state
 */
export interface EnhancedAppState {
  // User state
  user: {
    isAuthenticated: boolean;
    profile?: any;
    preferences: {
      notifications: NotificationPreferences;
      display: DisplayPreferences;
      sports: SportPreferences;
    };
  };
  
  // Sport state
  sports: {
    selected: Sport | null;
    available: Sport[];
    isTransitioning: boolean;
    transitionHistory: SportTransitionEvent[];
  };
  
  // UI state
  ui: {
    theme: 'light' | 'dark' | 'system';
    sidebarOpen: boolean;
    notifications: NotificationState;
    loading: LoadingState;
    errors: BaseError[];
  };
  
  // Real-time state
  realtime: {
    webSocket: WebSocketState;
    subscriptions: Array<{
      type: string;
      target: string;
      isActive: boolean;
    }>;
    lastUpdate: Date | null;
  };
  
  // Performance state
  performance: {
    renderTimes: number[];
    apiResponseTimes: number[];
    webSocketLatency: number[];
    memoryUsage?: number;
  };
}

// ============================================================================
// ENHANCED UTILITY TYPES
// ============================================================================

/**
 * Enhanced async operation result
 */
export interface EnhancedAsyncResult<T = any> {
  data?: T;
  error?: BaseError;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  lastFetch?: Date;
  retryCount: number;
  canRetry: boolean;
  retry: () => Promise<void>;
  cancel: () => void;
}

/**
 * Enhanced form state
 */
export interface EnhancedFormState<T = any> {
  values: T;
  errors: Record<keyof T, string | null>;
  touched: Record<keyof T, boolean>;
  isValid: boolean;
  isSubmitting: boolean;
  isDirty: boolean;
  submitCount: number;
  lastSubmitTime?: Date;
}

/**
 * Enhanced modal state
 */
export interface EnhancedModalState {
  isOpen: boolean;
  title?: string;
  content?: React.ReactNode;
  size: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable: boolean;
  persistent: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

// ============================================================================
// TYPE UTILITIES
// ============================================================================

/**
 * Extract enhanced props from a component type
 */
export type EnhancedProps<T> = T extends React.ComponentType<infer P> ? P & {
  loading?: boolean;
  error?: BaseError;
  onRetry?: () => void;
  className?: string;
  'data-testid'?: string;
} : never;

/**
 * Create an enhanced version of an existing hook return type
 */
export type EnhanceHookReturn<T> = T & {
  isLoading: boolean;
  error: BaseError | null;
  lastUpdate: Date | null;
  retryCount: number;
  canRetry: boolean;
  retry: () => Promise<void>;
  reset: () => void;
};