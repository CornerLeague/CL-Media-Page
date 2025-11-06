import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { 
  ScoreUpdateService, 
  getScoreUpdateService, 
  type ScoreUpdateConfig,
  type ScoreUpdateFilter,
  type ScoreUpdateMetrics 
} from '@/lib/scoreUpdateService';
import type { 
  UserTeamScoreUpdate, 
  UserTeamStatusChange,
  IncomingWebSocketMessage 
} from '@/hooks/useWebSocket';

// ============================================================================
// HOOK INTERFACE
// ============================================================================

export interface UseScoreUpdateServiceOptions extends ScoreUpdateConfig {
  /** Enable automatic subscription to score updates */
  autoSubscribe?: boolean;
  /** Sport to filter updates for */
  sport?: string;
  /** Team IDs to filter updates for */
  teamIds?: string[];
  /** Custom event handlers */
  onScoreUpdate?: (payload: UserTeamScoreUpdate['payload']) => void;
  onStatusChange?: (update: UserTeamStatusChange) => void;
  onError?: (error: Error) => void;
}

export interface UseScoreUpdateServiceReturn {
  /** Score update service instance */
  service: ScoreUpdateService;
  /** Current metrics */
  metrics: ScoreUpdateMetrics;
  /** Add a filter */
  addFilter: (filter: ScoreUpdateFilter) => void;
  /** Remove a filter */
  removeFilter: (filter: ScoreUpdateFilter) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Reset metrics */
  resetMetrics: () => void;
  /** Update configuration */
  updateConfig: (config: Partial<ScoreUpdateConfig>) => void;
  /** Subscribe to events */
  on: (event: string, callback: Function) => () => void;
  /** Get current game states */
  getGameStates: () => Map<string, any>;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useScoreUpdateService(
  options: UseScoreUpdateServiceOptions = {}
): UseScoreUpdateServiceReturn {
  const queryClient = useQueryClient();
  const { subscribe, unsubscribe, isConnected } = useWebSocketContext();
  
  // Get or create service instance
  const serviceRef = useRef<ScoreUpdateService>();
  if (!serviceRef.current) {
    serviceRef.current = getScoreUpdateService(queryClient, options);
  }
  
  const service = serviceRef.current;

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: IncomingWebSocketMessage) => {
    try {
      switch (message.type) {
        case 'user-team-score-update':
          const success = service.processScoreUpdate(message);
          if (success && options.onScoreUpdate) {
            options.onScoreUpdate(message.payload);
          }
          break;
          
        case 'user-team-status-change':
          const statusSuccess = service.processStatusChange(message);
          if (statusSuccess && options.onStatusChange) {
            options.onStatusChange(message);
          }
          break;
          
        default:
          // Ignore other message types
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      if (options.onError) {
        options.onError(error as Error);
      }
    }
  }, [service, options.onScoreUpdate, options.onStatusChange, options.onError]);

  // Subscribe to WebSocket messages
  useEffect(() => {
    if (!isConnected || !options.autoSubscribe) return;

    subscribe('user-team-score-update', handleWebSocketMessage);
    subscribe('user-team-status-change', handleWebSocketMessage);

    return () => {
      unsubscribe('user-team-score-update', handleWebSocketMessage);
      unsubscribe('user-team-status-change', handleWebSocketMessage);
    };
  }, [isConnected, options.autoSubscribe, subscribe, unsubscribe, handleWebSocketMessage]);

  // Set up initial filters
  useEffect(() => {
    if (options.sport || options.teamIds) {
      const filter: ScoreUpdateFilter = {};
      if (options.sport) filter.sport = options.sport;
      if (options.teamIds) filter.teamIds = options.teamIds;
      
      service.addFilter(filter);
      
      return () => {
        service.removeFilter(filter);
      };
    }
  }, [service, options.sport, options.teamIds]);

  // Memoized methods
  const addFilter = useCallback((filter: ScoreUpdateFilter) => {
    service.addFilter(filter);
  }, [service]);

  const removeFilter = useCallback((filter: ScoreUpdateFilter) => {
    service.removeFilter(filter);
  }, [service]);

  const clearFilters = useCallback(() => {
    service.clearFilters();
  }, [service]);

  const resetMetrics = useCallback(() => {
    service.resetMetrics();
  }, [service]);

  const updateConfig = useCallback((config: Partial<ScoreUpdateConfig>) => {
    service.updateConfig(config);
  }, [service]);

  const on = useCallback((event: string, callback: Function) => {
    return service.on(event, callback);
  }, [service]);

  const getGameStates = useCallback(() => {
    return service.getGameStates();
  }, [service]);

  return {
    service,
    metrics: service.getMetrics(),
    addFilter,
    removeFilter,
    clearFilters,
    resetMetrics,
    updateConfig,
    on,
    getGameStates,
  };
}

// ============================================================================
// SPECIALIZED HOOKS
// ============================================================================

/**
 * Hook for monitoring specific sport score updates
 */
export function useSportScoreUpdates(
  sport: string,
  options: Omit<UseScoreUpdateServiceOptions, 'sport'> = {}
) {
  return useScoreUpdateService({
    ...options,
    sport,
    autoSubscribe: true,
  });
}

/**
 * Hook for monitoring specific team score updates
 */
export function useTeamScoreUpdates(
  teamIds: string[],
  options: Omit<UseScoreUpdateServiceOptions, 'teamIds'> = {}
) {
  return useScoreUpdateService({
    ...options,
    teamIds,
    autoSubscribe: true,
  });
}

/**
 * Hook for monitoring score updates with custom filtering
 */
export function useFilteredScoreUpdates(
  filter: ScoreUpdateFilter,
  options: UseScoreUpdateServiceOptions = {}
) {
  const result = useScoreUpdateService({
    ...options,
    autoSubscribe: true,
  });

  useEffect(() => {
    result.addFilter(filter);
    return () => {
      result.removeFilter(filter);
    };
  }, [result, filter]);

  return result;
}

/**
 * Hook for score update metrics and monitoring
 */
export function useScoreUpdateMetrics(
  options: UseScoreUpdateServiceOptions = {}
) {
  const { metrics, resetMetrics, service } = useScoreUpdateService(options);
  
  // Auto-refresh metrics every second
  useEffect(() => {
    const interval = setInterval(() => {
      // Force re-render by accessing metrics
      service.getMetrics();
    }, 1000);

    return () => clearInterval(interval);
  }, [service]);

  return {
    metrics,
    resetMetrics,
  };
}