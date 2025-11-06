import { useCallback, useEffect, useState, useMemo } from 'react';
import { useWebSocket, type UserTeamScoreUpdate, type WebSocketState } from './useWebSocket';
import { Sport } from '../data/sportsTeams';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Score update event payload with enhanced metadata
 */
export interface ScoreUpdateEvent {
  gameId: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  quarter?: string;
  timeRemaining?: string;
  timestamp: string;
  isUserTeam: boolean;
  teamId?: string;
  teamName?: string;
}

/**
 * Error types for score update processing
 */
export interface ScoreUpdateError {
  type: 'validation' | 'parsing' | 'network' | 'unknown';
  message: string;
  originalData?: any;
  timestamp: string;
}

/**
 * Filter configuration for score updates
 */
export interface ScoreUpdateFilters {
  /** Filter by specific sports */
  sports?: Sport[];
  /** Filter by specific team IDs */
  teamIds?: string[];
  /** Only show updates for user's favorite teams */
  userTeamsOnly?: boolean;
  /** Filter by game status */
  gameStatuses?: string[];
  /** Minimum score difference to trigger update */
  minScoreDifference?: number;
}

/**
 * Hook configuration options
 */
export interface UseScoreUpdatesOptions {
  /** Event filters to apply */
  filters?: ScoreUpdateFilters;
  /** Whether to automatically connect on mount */
  autoConnect?: boolean;
  /** Maximum number of errors to track */
  maxErrorHistory?: number;
  /** Callback for successful score updates */
  onScoreUpdate?: (event: ScoreUpdateEvent) => void;
  /** Callback for errors */
  onError?: (error: ScoreUpdateError) => void;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Hook return type
 */
export interface UseScoreUpdatesReturn {
  /** Current WebSocket connection state */
  connectionState: WebSocketState;
  /** Whether WebSocket is connected */
  isConnected: boolean;
  /** Latest score update event */
  latestUpdate: ScoreUpdateEvent | null;
  /** Array of recent score updates */
  recentUpdates: ScoreUpdateEvent[];
  /** Array of processing errors */
  errors: ScoreUpdateError[];
  /** Current filter configuration */
  currentFilters: ScoreUpdateFilters;
  
  // Control functions
  /** Connect to WebSocket */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
  /** Update event filters */
  updateFilters: (filters: Partial<ScoreUpdateFilters>) => void;
  /** Clear recent updates history */
  clearUpdates: () => void;
  /** Clear error history */
  clearErrors: () => void;
  /** Subscribe to specific sport */
  subscribeToSport: (sport: Sport) => void;
  /** Unsubscribe from specific sport */
  unsubscribeFromSport: (sport: Sport) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<Omit<UseScoreUpdatesOptions, 'onScoreUpdate' | 'onError'>> = {
  filters: {},
  autoConnect: true,
  maxErrorHistory: 10,
  debug: false,
};

const MAX_RECENT_UPDATES = 50;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validates a score update payload
 */
function validateScoreUpdate(update: UserTeamScoreUpdate): ScoreUpdateError | null {
  try {
    const { payload } = update;
    
    // Check required fields
    if (!payload.gameData?.gameId) {
      return {
        type: 'validation',
        message: 'Missing required field: gameId',
        originalData: update,
        timestamp: new Date().toISOString(),
      };
    }
    
    if (!payload.sport) {
      return {
        type: 'validation',
        message: 'Missing required field: sport',
        originalData: update,
        timestamp: new Date().toISOString(),
      };
    }
    
    if (!payload.gameData.homeTeam || !payload.gameData.awayTeam) {
      return {
        type: 'validation',
        message: 'Missing required team information',
        originalData: update,
        timestamp: new Date().toISOString(),
      };
    }
    
    // Validate score values
    const { homeScore, awayScore } = payload.gameData;
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
      return {
        type: 'validation',
        message: 'Invalid score values - must be numbers',
        originalData: update,
        timestamp: new Date().toISOString(),
      };
    }
    
    if (homeScore < 0 || awayScore < 0) {
      return {
        type: 'validation',
        message: 'Invalid score values - cannot be negative',
        originalData: update,
        timestamp: new Date().toISOString(),
      };
    }
    
    // Validate timestamp
    if (!payload.timestamp || isNaN(Date.parse(payload.timestamp))) {
      return {
        type: 'validation',
        message: 'Invalid or missing timestamp',
        originalData: update,
        timestamp: new Date().toISOString(),
      };
    }
    
    return null;
  } catch (error) {
    return {
      type: 'validation',
      message: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      originalData: update,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Transforms WebSocket update to ScoreUpdateEvent
 */
function transformScoreUpdate(update: UserTeamScoreUpdate): ScoreUpdateEvent {
  const { payload } = update;
  
  return {
    gameId: payload.gameData.gameId,
    sport: payload.sport as Sport,
    homeTeam: payload.gameData.homeTeam,
    awayTeam: payload.gameData.awayTeam,
    homeScore: payload.gameData.homeScore,
    awayScore: payload.gameData.awayScore,
    status: payload.gameData.status,
    quarter: payload.gameData.quarter,
    timeRemaining: payload.gameData.timeRemaining,
    timestamp: payload.timestamp,
    isUserTeam: payload.isUserTeam,
    teamId: payload.teamId,
    teamName: payload.teamName,
  };
}

/**
 * Applies filters to determine if update should be processed
 */
function shouldProcessUpdate(
  event: ScoreUpdateEvent, 
  filters: ScoreUpdateFilters,
  debug: boolean = false
): boolean {
  // Sport filter
  if (filters.sports && filters.sports.length > 0) {
    if (!filters.sports.includes(event.sport)) {
      if (debug) console.log(`Filtered out update for sport: ${event.sport}`);
      return false;
    }
  }
  
  // Team ID filter
  if (filters.teamIds && filters.teamIds.length > 0) {
    if (!event.teamId || !filters.teamIds.includes(event.teamId)) {
      if (debug) console.log(`Filtered out update for team: ${event.teamId}`);
      return false;
    }
  }
  
  // User teams only filter
  if (filters.userTeamsOnly && !event.isUserTeam) {
    if (debug) console.log(`Filtered out non-user team update: ${event.gameId}`);
    return false;
  }
  
  // Game status filter
  if (filters.gameStatuses && filters.gameStatuses.length > 0) {
    if (!filters.gameStatuses.includes(event.status)) {
      if (debug) console.log(`Filtered out update for status: ${event.status}`);
      return false;
    }
  }
  
  // Minimum score difference filter
  if (filters.minScoreDifference !== undefined) {
    const scoreDiff = Math.abs(event.homeScore - event.awayScore);
    if (scoreDiff < filters.minScoreDifference) {
      if (debug) console.log(`Filtered out update with small score difference: ${scoreDiff}`);
      return false;
    }
  }
  
  return true;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for handling score update event listeners with filtering and error handling
 * 
 * This hook provides a focused interface for listening to score updates with:
 * - Event filtering based on sport, teams, and other criteria
 * - Comprehensive error handling and validation
 * - Recent updates tracking
 * - Easy subscription management
 */
export function useScoreUpdates(options: UseScoreUpdatesOptions = {}): UseScoreUpdatesReturn {
  const mergedOptions = useMemo(() => ({ ...DEFAULT_OPTIONS, ...options }), [options]);
  
  // State management
  const [latestUpdate, setLatestUpdate] = useState<ScoreUpdateEvent | null>(null);
  const [recentUpdates, setRecentUpdates] = useState<ScoreUpdateEvent[]>([]);
  const [errors, setErrors] = useState<ScoreUpdateError[]>([]);
  const [currentFilters, setCurrentFilters] = useState<ScoreUpdateFilters>(
    mergedOptions.filters || {}
  );
  
  // Add error to history
  const addError = useCallback((error: ScoreUpdateError) => {
    setErrors(prev => {
      const newErrors = [error, ...prev].slice(0, mergedOptions.maxErrorHistory);
      return newErrors;
    });
    
    if (mergedOptions.debug) {
      console.error('Score update error:', error);
    }
    
    options.onError?.(error);
  }, [mergedOptions.maxErrorHistory, mergedOptions.debug, options.onError]);
  
  // Process score update with validation and filtering
  const processScoreUpdate = useCallback((update: UserTeamScoreUpdate) => {
    try {
      // Validate the update
      const validationError = validateScoreUpdate(update);
      if (validationError) {
        addError(validationError);
        return;
      }
      
      // Transform to our event format
      const scoreEvent = transformScoreUpdate(update);
      
      // Apply filters
      if (!shouldProcessUpdate(scoreEvent, currentFilters, mergedOptions.debug)) {
        return;
      }
      
      // Update state
      setLatestUpdate(scoreEvent);
      setRecentUpdates(prev => {
        const newUpdates = [scoreEvent, ...prev].slice(0, MAX_RECENT_UPDATES);
        return newUpdates;
      });
      
      if (mergedOptions.debug) {
        console.log('Processed score update:', scoreEvent);
      }
      
      // Call user callback
      options.onScoreUpdate?.(scoreEvent);
      
    } catch (error) {
      const scoreError: ScoreUpdateError = {
        type: 'parsing',
        message: `Failed to process score update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalData: update,
        timestamp: new Date().toISOString(),
      };
      addError(scoreError);
    }
  }, [currentFilters, mergedOptions.debug, options.onScoreUpdate, addError]);
  
  // WebSocket event handlers
  const webSocketEventHandlers = useMemo(() => ({
    onScoreUpdate: processScoreUpdate,
    onError: (event: Event) => {
      const error: ScoreUpdateError = {
        type: 'network',
        message: 'WebSocket connection error',
        originalData: event,
        timestamp: new Date().toISOString(),
      };
      addError(error);
    },
  }), [processScoreUpdate, addError]);
  
  // Initialize WebSocket
  const webSocket = useWebSocket({
    autoConnect: mergedOptions.autoConnect,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    eventHandlers: webSocketEventHandlers,
  });
  
  // Control functions
  const updateFilters = useCallback((newFilters: Partial<ScoreUpdateFilters>) => {
    setCurrentFilters(prev => ({ ...prev, ...newFilters }));
    
    if (mergedOptions.debug) {
      console.log('Updated score update filters:', { ...currentFilters, ...newFilters });
    }
  }, [currentFilters, mergedOptions.debug]);
  
  const clearUpdates = useCallback(() => {
    setLatestUpdate(null);
    setRecentUpdates([]);
    
    if (mergedOptions.debug) {
      console.log('Cleared score updates history');
    }
  }, [mergedOptions.debug]);
  
  const clearErrors = useCallback(() => {
    setErrors([]);
    
    if (mergedOptions.debug) {
      console.log('Cleared error history');
    }
  }, [mergedOptions.debug]);
  
  const subscribeToSport = useCallback((sport: Sport) => {
    webSocket.subscribeToUserTeams(sport);
    
    if (mergedOptions.debug) {
      console.log(`Subscribed to sport: ${sport}`);
    }
  }, [webSocket, mergedOptions.debug]);
  
  const unsubscribeFromSport = useCallback((sport: Sport) => {
    webSocket.unsubscribeFromUserTeams(sport);
    
    if (mergedOptions.debug) {
      console.log(`Unsubscribed from sport: ${sport}`);
    }
  }, [webSocket, mergedOptions.debug]);
  
  // Auto-subscribe to filtered sports when connected
  useEffect(() => {
    if (webSocket.isConnected && currentFilters.sports && currentFilters.sports.length > 0) {
      currentFilters.sports.forEach(sport => {
        webSocket.subscribeToUserTeams(sport);
      });
      
      if (mergedOptions.debug) {
        console.log('Auto-subscribed to filtered sports:', currentFilters.sports);
      }
    }
  }, [webSocket.isConnected, currentFilters.sports, webSocket, mergedOptions.debug]);
  
  return {
    // Connection state
    connectionState: webSocket.state,
    isConnected: webSocket.isConnected,
    
    // Update data
    latestUpdate,
    recentUpdates,
    errors,
    currentFilters,
    
    // Control functions
    connect: webSocket.connect,
    disconnect: webSocket.disconnect,
    updateFilters,
    clearUpdates,
    clearErrors,
    subscribeToSport,
    unsubscribeFromSport,
  };
}

export default useScoreUpdates;