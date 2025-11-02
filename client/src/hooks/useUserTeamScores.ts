import { useQuery, UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sport } from '../data/sportsTeams';
import { useWebSocket } from './useWebSocket';
import type { 
  IncomingWebSocketMessage, 
  UserTeamScoreUpdate, 
  UserTeamStatusChange,
  SubscriptionConfirmation 
} from './useWebSocket';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Represents a user's favorite team
 */
export interface UserFavoriteTeam {
  id: string;
  sport: Sport;
  teamName: string;
  league?: string;
  conference?: string;
  division?: string;
}

/**
 * Represents game score data for a specific game
 */
export interface GameScoreData {
  gameId: string;
  sport: Sport;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';
  startTime: string;
  lastUpdated: string;
  period?: string;
  timeRemaining?: string;
  isUserTeamGame: boolean;
  userTeamName?: string;
}

/**
 * Options for configuring the user team scores query
 */
export interface UserTeamScoresOptions {
  /** The sport to filter scores for (required by server) */
  sport: Sport;
  /** Maximum number of games to return (1-50, defaults to 10) */
  limit?: number;
  /** Start date for filtering games (ISO date string) */
  startDate?: string;
  /** End date for filtering games (ISO date string) */
  endDate?: string;
  /** Whether to enable real-time updates via WebSocket */
  enableRealTimeUpdates?: boolean;
  /** Custom refetch interval in milliseconds */
  refetchInterval?: number;
}

/**
 * Result data structure returned by the user team scores API
 */
export interface UserTeamScoresResult {
  games: GameScoreData[];
  userProfile: {
    id: string;
    favoriteTeams: UserFavoriteTeam[];
  };
  lastUpdated: string;
  totalGames: number;
  liveGames: number;
  completedGames: number;
  scheduledGames: number;
}

/**
 * Error types that can occur when fetching user team scores
 */
export interface UserTeamScoresError {
  type: 'network' | 'auth' | 'validation' | 'server' | 'unknown';
  message: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Return type for the useUserTeamScores hook
 */
export interface UseUserTeamScoresReturn {
  // React Query properties
  data: UserTeamScoresResult | undefined;
  isLoading: boolean;
  isError: boolean;
  error: UserTeamScoresError | null;
  isSuccess: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  refetch: () => void;
  
  // Computed properties
  hasLiveGames: boolean;
  hasScheduledGames: boolean;
  hasCompletedGames: boolean;
  
  // Utility functions
  getGamesByStatus: (status: GameScoreData['status']) => GameScoreData[];
  getGamesBySport: (sport: Sport) => GameScoreData[];
  getUserTeamGames: () => GameScoreData[];
  
  // Cache management utilities
  invalidateCache: () => Promise<void>;
  invalidateAllUserTeamScores: () => Promise<void>;
  prefetchNextPage: (nextOptions: Partial<UserTeamScoresOptions>) => Promise<void>;
  
  // WebSocket properties
  isWebSocketConnected: boolean;
  webSocketState: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastScoreUpdate: UserTeamScoreUpdate | null;
  subscribeToRealTimeUpdates: () => void;
  unsubscribeFromRealTimeUpdates: () => void;
}

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

/**
 * Query key factory for user team scores queries
 * Provides consistent cache key generation and invalidation patterns
 */
export const userTeamScoresKeys = {
  all: ['userTeamScores'] as const,
  lists: () => [...userTeamScoresKeys.all, 'list'] as const,
  list: (options: UserTeamScoresOptions) => [...userTeamScoresKeys.lists(), options] as const,
  details: () => [...userTeamScoresKeys.all, 'detail'] as const,
  detail: (userId: string, sport?: Sport) => [...userTeamScoresKeys.details(), userId, sport] as const,
  // New cache key patterns for better granularity
  bySport: (sport: Sport) => [...userTeamScoresKeys.all, 'sport', sport] as const,
  byDateRange: (startDate?: string, endDate?: string) => [...userTeamScoresKeys.all, 'dateRange', startDate, endDate] as const,
  live: () => [...userTeamScoresKeys.all, 'live'] as const,
};

// ============================================================================
// API SERVICE FUNCTION
// ============================================================================

/**
 * Fetches user team scores from the API
 * @param options - Query options including sport, limit, date range
 * @returns Promise resolving to UserTeamScoresResult
 */
const fetchUserTeamScores = async (options: UserTeamScoresOptions): Promise<UserTeamScoresResult> => {
  const { sport, limit = 10, startDate, endDate } = options;
  
  // Build query parameters
  const searchParams = new URLSearchParams();
  searchParams.append('sport', sport);
  
  // Validate and set limit (1-50, default 10)
  const validLimit = Math.min(Math.max(limit, 1), 50);
  searchParams.append('limit', validLimit.toString());
  
  // Add optional date parameters
  if (startDate) {
    searchParams.append('startDate', startDate);
  }
  if (endDate) {
    searchParams.append('endDate', endDate);
  }
  
  try {
    const response = await fetch(`/api/user-team-scores?${searchParams.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Handle different HTTP status codes
    if (!response.ok) {
      switch (response.status) {
        case 401:
          throw new Error('Authentication required');
        case 403:
          throw new Error('Access forbidden');
        case 404:
          throw new Error('User team scores not found');
        case 429:
          throw new Error('Too many requests - please try again later');
        case 500:
        default:
          if (response.status >= 500) {
            throw new Error('Server error - please try again later');
          }
          throw new Error(`Request failed with status ${response.status}`);
      }
    }
    
    const data = await response.json();
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format');
    }
    
    // Transform and validate the response data
    const result: UserTeamScoresResult = {
      games: Array.isArray(data.games) ? data.games : [],
      userProfile: {
        id: data.userProfile?.id || '',
        favoriteTeams: Array.isArray(data.userProfile?.favoriteTeams) ? data.userProfile.favoriteTeams : [],
      },
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      totalGames: typeof data.totalGames === 'number' ? data.totalGames : 0,
      liveGames: typeof data.liveGames === 'number' ? data.liveGames : 0,
      completedGames: typeof data.completedGames === 'number' ? data.completedGames : 0,
      scheduledGames: typeof data.scheduledGames === 'number' ? data.scheduledGames : 0,
    };
    
    return result;
  } catch (error) {
    // Handle network and other errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error - please check your connection');
    }
    
    // Re-throw known errors
    if (error instanceof Error) {
      throw error;
    }
    
    // Handle unknown errors
    throw new Error('An unexpected error occurred');
  }
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Custom hook for fetching and managing user team scores
 * Provides real-time score updates, caching, and utility functions
 * 
 * @param options - Configuration options for the query
 * @returns Hook result with data, loading states, and utility functions
 */
export function useUserTeamScores(
  options: UserTeamScoresOptions
): UseUserTeamScoresReturn {
  const queryClient = useQueryClient();
  
  // State for tracking WebSocket updates
  const [lastScoreUpdate, setLastScoreUpdate] = useState<UserTeamScoreUpdate | null>(null);
  
  // WebSocket event handlers
  const webSocketEventHandlers = useMemo(() => ({
    onScoreUpdate: (update: UserTeamScoreUpdate) => {
      setLastScoreUpdate(update);
      
      // Update cache with new score data if it matches current query
      if (update.payload.sport === options.sport) {
        queryClient.setQueryData(
          userTeamScoresKeys.list(options),
          (oldData: UserTeamScoresResult | undefined) => {
            if (!oldData) return oldData;
            
            // Find and update the specific game
            const updatedGames = oldData.games.map(game => {
              if (game.gameId === update.payload.gameData.gameId) {
                return {
                  ...game,
                  homeScore: update.payload.gameData.homeScore,
                  awayScore: update.payload.gameData.awayScore,
                  status: update.payload.gameData.status as GameScoreData['status'],
                  period: update.payload.gameData.quarter,
                  timeRemaining: update.payload.gameData.timeRemaining,
                  lastUpdated: update.payload.timestamp,
                };
              }
              return game;
            });
            
            // Recalculate counts
            const liveGames = updatedGames.filter(g => g.status === 'live').length;
            const completedGames = updatedGames.filter(g => g.status === 'final').length;
            const scheduledGames = updatedGames.filter(g => g.status === 'scheduled').length;
            
            return {
              ...oldData,
              games: updatedGames,
              liveGames,
              completedGames,
              scheduledGames,
              lastUpdated: update.payload.timestamp,
            };
          }
        );
      }
    },
    
    onStatusChange: (change: UserTeamStatusChange) => {
      // Invalidate cache when game status changes significantly
      queryClient.invalidateQueries({
        queryKey: userTeamScoresKeys.bySport(options.sport),
      });
    },
    
    onSubscriptionConfirmation: (confirmation: SubscriptionConfirmation) => {
      console.log('WebSocket subscription confirmed:', confirmation);
    },
  }), [options.sport, queryClient]);
  
  // Initialize WebSocket connection
  const webSocket = useWebSocket({
    autoConnect: options.enableRealTimeUpdates,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    eventHandlers: webSocketEventHandlers,
  });
  
  // Subscribe to user teams when WebSocket connects and real-time updates are enabled
  useEffect(() => {
    if (options.enableRealTimeUpdates && webSocket.isConnected) {
      webSocket.subscribeToUserTeams(options.sport);
    }
    
    return () => {
      if (options.enableRealTimeUpdates && webSocket.isConnected) {
        webSocket.unsubscribeFromUserTeams(options.sport);
      }
    };
  }, [options.enableRealTimeUpdates, options.sport, webSocket.isConnected, webSocket]);
  
  // WebSocket subscription management functions
  const subscribeToRealTimeUpdates = useCallback(() => {
    if (!webSocket.isConnected) {
      webSocket.connect();
    } else {
      webSocket.subscribeToUserTeams(options.sport);
    }
  }, [webSocket, options.sport]);
  
  const unsubscribeFromRealTimeUpdates = useCallback(() => {
    webSocket.unsubscribeFromUserTeams(options.sport);
  }, [webSocket, options.sport]);
  
  // Helper function to convert generic errors to UserTeamScoresError
  const convertError = (error: unknown): UserTeamScoresError => {
    if (!error) {
      return { type: 'unknown', message: 'An unknown error occurred' };
    }
    
    if (typeof error === 'object' && 'type' in error && 'message' in error) {
      return error as UserTeamScoresError;
    }
    
    if (error instanceof Error) {
      // Determine error type based on message content
      let type: UserTeamScoresError['type'] = 'unknown';
      const message = error.message.toLowerCase();
      
      if (message.includes('network') || message.includes('fetch')) {
        type = 'network';
      } else if (message.includes('auth') || message.includes('unauthorized')) {
        type = 'auth';
      } else if (message.includes('validation') || message.includes('invalid')) {
        type = 'validation';
      } else if (message.includes('server') || message.includes('500')) {
        type = 'server';
      }
      
      return {
        type,
        message: error.message,
        details: { originalError: error.name }
      };
    }
    
    return {
      type: 'unknown',
      message: String(error),
    };
  };

  // Enhanced React Query configuration
  const queryResult = useQuery({
    queryKey: userTeamScoresKeys.list(options),
    queryFn: () => fetchUserTeamScores(options),
    enabled: true,
    
    // Cache configuration optimized for sports data
    staleTime: options.enableRealTimeUpdates ? 5000 : 15000, // 5s for real-time, 15s otherwise
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    
    // Refetch configuration
    refetchInterval: options.refetchInterval || (options.enableRealTimeUpdates ? 10000 : 30000),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    
    // Enhanced retry logic
    retry: (failureCount, error) => {
      // Don't retry on auth errors or client errors (4xx)
      const errorMessage = error?.message?.toLowerCase() || '';
      if (errorMessage.includes('auth') || 
          errorMessage.includes('forbidden') || 
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('404')) {
        return false;
      }
      
      // Retry up to 3 times for network/server errors
      return failureCount < 3;
    },
    
    // Exponential backoff with jitter
    retryDelay: (attemptIndex) => {
      const baseDelay = 1000 * Math.pow(2, attemptIndex);
      const jitter = Math.random() * 0.1 * baseDelay;
      return Math.min(baseDelay + jitter, 30000);
    },
    
    // Network mode for better offline handling
    networkMode: 'online',
    
    // Optimistic updates for better UX
    placeholderData: (previousData) => previousData,
  });

  // Computed properties
  const hasLiveGames = queryResult.data?.liveGames ? queryResult.data.liveGames > 0 : false;
  const hasScheduledGames = queryResult.data?.scheduledGames ? queryResult.data.scheduledGames > 0 : false;
  const hasCompletedGames = queryResult.data?.completedGames ? queryResult.data.completedGames > 0 : false;

  // Utility functions
  const getGamesByStatus = (status: GameScoreData['status']): GameScoreData[] => {
    return queryResult.data?.games.filter(game => game.status === status) || [];
  };

  const getGamesBySport = (sport: Sport): GameScoreData[] => {
    return queryResult.data?.games.filter(game => game.sport === sport) || [];
  };

  const getUserTeamGames = (): GameScoreData[] => {
    return queryResult.data?.games.filter(game => game.isUserTeamGame) || [];
  };

  // Cache management utilities
  const invalidateCache = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.list(options),
    });
  };

  const invalidateAllUserTeamScores = async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.all,
    });
  };

  const prefetchNextPage = async (nextOptions: Partial<UserTeamScoresOptions>): Promise<void> => {
    const mergedOptions = { ...options, ...nextOptions };
    await queryClient.prefetchQuery({
      queryKey: userTeamScoresKeys.list(mergedOptions),
      queryFn: () => fetchUserTeamScores(mergedOptions),
      staleTime: 5000, // Short stale time for prefetched data
    });
  };

  return {
    // React Query properties
    data: queryResult.data,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: convertError(queryResult.error),
    isSuccess: queryResult.isSuccess,
    isFetching: queryResult.isFetching,
    isRefetching: queryResult.isRefetching,
    refetch: queryResult.refetch,
    
    // Computed properties
    hasLiveGames,
    hasScheduledGames,
    hasCompletedGames,
    
    // Utility functions
    getGamesByStatus,
    getGamesBySport,
    getUserTeamGames,
    
    // Cache management utilities
    invalidateCache,
    invalidateAllUserTeamScores,
    prefetchNextPage,
    
    // WebSocket properties
    isWebSocketConnected: webSocket.isConnected,
    webSocketState: webSocket.state,
    lastScoreUpdate,
    subscribeToRealTimeUpdates,
    unsubscribeFromRealTimeUpdates,
  };
}

// ============================================================================
// CACHE UTILITIES
// ============================================================================

/**
 * Utility functions for managing user team scores cache
 * Can be used outside of the hook for global cache management
 */
export const userTeamScoresCacheUtils = {
  /**
   * Invalidate all user team scores queries
   */
  invalidateAll: (queryClient: ReturnType<typeof useQueryClient>) => {
    return queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.all,
    });
  },

  /**
   * Invalidate queries for a specific sport
   */
  invalidateBySport: (queryClient: ReturnType<typeof useQueryClient>, sport: Sport) => {
    return queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.bySport(sport),
    });
  },

  /**
   * Remove all user team scores data from cache
   */
  removeAll: (queryClient: ReturnType<typeof useQueryClient>) => {
    return queryClient.removeQueries({
      queryKey: userTeamScoresKeys.all,
    });
  },

  /**
   * Set query data for a specific options configuration
   */
  setQueryData: (
    queryClient: ReturnType<typeof useQueryClient>,
    options: UserTeamScoresOptions,
    data: UserTeamScoresResult
  ) => {
    return queryClient.setQueryData(userTeamScoresKeys.list(options), data);
  },

  /**
   * Get cached query data for specific options
   */
  getQueryData: (
    queryClient: ReturnType<typeof useQueryClient>,
    options: UserTeamScoresOptions
  ): UserTeamScoresResult | undefined => {
    return queryClient.getQueryData(userTeamScoresKeys.list(options));
  },

  /**
   * Prefetch data for multiple sports
   */
  prefetchMultipleSports: async (
    queryClient: ReturnType<typeof useQueryClient>,
    sports: Sport[],
    baseOptions: Omit<UserTeamScoresOptions, 'sport'>
  ) => {
    const prefetchPromises = sports.map(sport =>
      queryClient.prefetchQuery({
        queryKey: userTeamScoresKeys.list({ ...baseOptions, sport }),
        queryFn: () => fetchUserTeamScores({ ...baseOptions, sport }),
        staleTime: 5000,
      })
    );
    
    await Promise.allSettled(prefetchPromises);
  },
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default useUserTeamScores;