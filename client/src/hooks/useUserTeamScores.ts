import { useQuery, UseQueryResult, useQueryClient, QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Sport } from '../data/sportsTeams';
import { useWebSocket } from './useWebSocket';
import { useScoreUpdateService } from './useScoreUpdateService';
import type {
  IncomingWebSocketMessage,
  UserTeamScoreUpdate,
  UserTeamStatusChange,
  SubscriptionConfirmation,
} from './useWebSocket';

// ============================================================================
// PERFORMANCE UTILITIES
// ============================================================================

/**
 * Custom hook for debouncing values to prevent excessive API calls during rapid changes
 * 
 * @template T - The type of value being debounced
 * @param value - The value to debounce
 * @param delay - Delay in milliseconds before the debounced value updates
 * @returns The debounced value that only updates after the delay period
 * 
 * @example
 * ```typescript
 * const debouncedSearchTerm = useDebounce(searchTerm, 300);
 * // API call will only happen 300ms after user stops typing
 * ```
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Performance monitoring hook to track hook performance metrics in development
 * 
 * @param hookName - Name of the hook being monitored for logging purposes
 * @returns Object containing performance metrics including render count and timing data
 * 
 * @example
 * ```typescript
 * const metrics = usePerformanceMonitoring('useUserTeamScores');
 * // In development, logs render performance to console
 * ```
 * 
 * @internal This hook is primarily for development debugging and performance analysis
 */
function usePerformanceMonitoring(hookName: string) {
  const renderCount = useRef(0);
  const startTime = useRef(Date.now());
  const lastRenderTime = useRef(Date.now());

  renderCount.current += 1;
  const currentTime = Date.now();
  const timeSinceLastRender = currentTime - lastRenderTime.current;
  lastRenderTime.current = currentTime;

  // Log performance metrics in development
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[${hookName}] Render #${renderCount.current}, Time since last: ${timeSinceLastRender}ms`);
    }
  });

  return {
    renderCount: renderCount.current,
    totalTime: currentTime - startTime.current,
    timeSinceLastRender,
  };
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Represents a user's favorite team with comprehensive team information
 * 
 * @interface UserFavoriteTeam
 * @property {string} id - Unique identifier for the favorite team entry
 * @property {Sport} sport - The sport this team plays (e.g., 'nfl', 'nba', 'mlb')
 * @property {string} teamName - Display name of the team
 * @property {string} [league] - Optional league name (e.g., 'NFL', 'NBA')
 * @property {string} [conference] - Optional conference name (e.g., 'AFC', 'NFC')
 * @property {string} [division] - Optional division name (e.g., 'North', 'South')
 * 
 * @example
 * ```typescript
 * const favoriteTeam: UserFavoriteTeam = {
 *   id: 'user-team-123',
 *   sport: 'nfl',
 *   teamName: 'Green Bay Packers',
 *   league: 'NFL',
 *   conference: 'NFC',
 *   division: 'North'
 * };
 * ```
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
 * Represents comprehensive game score data for a specific game
 * 
 * @interface GameScoreData
 * @property {string} gameId - Unique identifier for the game
 * @property {Sport} sport - The sport being played
 * @property {string} homeTeam - Name of the home team
 * @property {string} awayTeam - Name of the away team
 * @property {number} homeScore - Current score of the home team
 * @property {number} awayScore - Current score of the away team
 * @property {'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled'} status - Current game status
 * @property {string} startTime - Game start time in ISO format
 * @property {string} lastUpdated - Last update timestamp in ISO format
 * @property {string} [period] - Optional current period/quarter (e.g., '2nd Quarter', 'OT')
 * @property {string} [timeRemaining] - Optional time remaining in current period
 * @property {boolean} isUserTeamGame - Whether this game involves one of the user's favorite teams
 * @property {string} [userTeamName] - Name of the user's team if isUserTeamGame is true
 * 
 * @example
 * ```typescript
 * const gameData: GameScoreData = {
 *   gameId: 'nfl-2024-week1-gb-chi',
 *   sport: 'nfl',
 *   homeTeam: 'Chicago Bears',
 *   awayTeam: 'Green Bay Packers',
 *   homeScore: 14,
 *   awayScore: 21,
 *   status: 'live',
 *   startTime: '2024-09-08T20:20:00Z',
 *   lastUpdated: '2024-09-08T22:15:30Z',
 *   period: '3rd Quarter',
 *   timeRemaining: '8:42',
 *   isUserTeamGame: true,
 *   userTeamName: 'Green Bay Packers'
 * };
 * ```
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
 * Configuration options for the user team scores query
 * 
 * @interface UserTeamScoresOptions
 * @property {Sport} sport - The sport to filter scores for (required by server)
 * @property {number} [limit=10] - Maximum number of games to return (1-50, defaults to 10)
 * @property {string} [startDate] - Start date for filtering games (ISO date string, e.g., '2024-01-01')
 * @property {string} [endDate] - End date for filtering games (ISO date string, e.g., '2024-12-31')
 * @property {boolean} [enableRealTimeUpdates=false] - Whether to enable real-time updates via WebSocket
 * @property {number} [refetchInterval] - Custom refetch interval in milliseconds (overrides default)
 * 
 * @example
 * ```typescript
 * // Basic usage - get NFL scores
 * const basicOptions: UserTeamScoresOptions = {
 *   sport: 'nfl'
 * };
 * 
 * // Advanced usage with real-time updates and date filtering
 * const advancedOptions: UserTeamScoresOptions = {
 *   sport: 'nba',
 *   limit: 25,
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31',
 *   enableRealTimeUpdates: true,
 *   refetchInterval: 5000
 * };
 * ```
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
 * 
 * @interface UserTeamScoresResult
 * @property {GameScoreData[]} games - Array of game score data matching the query criteria
 * @property {Object} userProfile - User profile information including favorite teams
 * @property {string} userProfile.id - Unique user identifier
 * @property {UserFavoriteTeam[]} userProfile.favoriteTeams - Array of user's favorite teams
 * @property {string} lastUpdated - Timestamp when the data was last updated (ISO format)
 * @property {number} totalGames - Total number of games in the result set
 * @property {number} liveGames - Number of currently live games
 * @property {number} completedGames - Number of completed games
 * @property {number} scheduledGames - Number of scheduled (upcoming) games
 * 
 * @example
 * ```typescript
 * const result: UserTeamScoresResult = {
 *   games: [
 *     // ... array of GameScoreData objects
 *   ],
 *   userProfile: {
 *     id: 'user-123',
 *     favoriteTeams: [
 *       { id: 'fav-1', sport: 'nfl', teamName: 'Green Bay Packers' }
 *     ]
 *   },
 *   lastUpdated: '2024-01-15T10:30:00Z',
 *   totalGames: 15,
 *   liveGames: 3,
 *   completedGames: 8,
 *   scheduledGames: 4
 * };
 * ```
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
 * 
 * @interface UserTeamScoresError
 * @property {'network' | 'auth' | 'validation' | 'server' | 'unknown'} type - Categorized error type for handling
 * @property {string} message - Human-readable error message
 * @property {string} [code] - Optional error code from the server
 * @property {Record<string, any>} [details] - Optional additional error details
 * 
 * @example
 * ```typescript
 * // Network error example
 * const networkError: UserTeamScoresError = {
 *   type: 'network',
 *   message: 'Network error - please check your connection',
 *   details: { originalError: 'TypeError' }
 * };
 * 
 * // Authentication error example
 * const authError: UserTeamScoresError = {
 *   type: 'auth',
 *   message: 'Authentication required',
 *   code: 'AUTH_REQUIRED'
 * };
 * ```
 */
export interface UserTeamScoresError {
  type: 'network' | 'auth' | 'validation' | 'server' | 'unknown';
  message: string;
  code?: string;
  details?: Record<string, any>;
}

/**
 * Return type for the useUserTeamScores hook
 * 
 * @interface UseUserTeamScoresReturn
 * 
 * **React Query Properties:**
 * @property {UserTeamScoresResult | undefined} data - The fetched user team scores data
 * @property {boolean} isLoading - True when initial data is being fetched
 * @property {boolean} isError - True when an error has occurred
 * @property {UserTeamScoresError | null} error - Error object if an error occurred
 * @property {boolean} isSuccess - True when data has been successfully fetched
 * @property {boolean} isFetching - True when any fetch is in progress (including background refetch)
 * @property {boolean} isRefetching - True when a refetch is in progress
 * @property {() => void} refetch - Function to manually trigger a refetch
 * 
 * **Computed Properties:**
 * @property {boolean} hasLiveGames - True if there are any live games in the current data
 * @property {boolean} hasScheduledGames - True if there are any scheduled games in the current data
 * @property {boolean} hasCompletedGames - True if there are any completed games in the current data
 * 
 * **Utility Functions:**
 * @property {(status: GameScoreData['status']) => GameScoreData[]} getGamesByStatus - Filter games by status
 * @property {(sport: Sport) => GameScoreData[]} getGamesBySport - Filter games by sport
 * @property {() => GameScoreData[]} getUserTeamGames - Get only games involving user's favorite teams
 * 
 * **Cache Management:**
 * @property {() => Promise<void>} invalidateCache - Invalidate the current query's cache
 * @property {() => Promise<void>} invalidateAllUserTeamScores - Invalidate all user team scores caches
 * @property {(nextOptions: Partial<UserTeamScoresOptions>) => Promise<void>} prefetchNextPage - Prefetch data with different options
 * 
 * **WebSocket Properties:**
 * @property {boolean} isWebSocketConnected - True if WebSocket is connected
 * @property {'connecting' | 'connected' | 'disconnected' | 'error'} webSocketState - Current WebSocket connection state
 * @property {UserTeamScoreUpdate | null} lastScoreUpdate - Last received score update via WebSocket
 * @property {() => void} subscribeToRealTimeUpdates - Subscribe to real-time score updates
 * @property {() => void} unsubscribeFromRealTimeUpdates - Unsubscribe from real-time score updates
 * 
 * @example
 * ```typescript
 * const {
 *   data,
 *   isLoading,
 *   error,
 *   hasLiveGames,
 *   getGamesByStatus,
 *   isWebSocketConnected,
 *   subscribeToRealTimeUpdates
 * } = useUserTeamScores({ sport: 'nfl', enableRealTimeUpdates: true });
 * 
 * // Check for live games
 * if (hasLiveGames) {
 *   const liveGames = getGamesByStatus('live');
 *   console.log(`${liveGames.length} games are currently live`);
 * }
 * 
 * // Enable real-time updates
 * useEffect(() => {
 *   if (!isWebSocketConnected) {
 *     subscribeToRealTimeUpdates();
 *   }
 * }, [isWebSocketConnected, subscribeToRealTimeUpdates]);
 * ```
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
 * Cache key factory for user team scores queries
 * 
 * Provides consistent cache key generation and invalidation patterns for React Query.
 * This factory ensures proper cache segmentation and enables efficient cache invalidation
 * at different levels of granularity.
 * 
 * **Cache Key Hierarchy:**
 * - `all`: Base key for all user team scores queries
 * - `lists`: All list-type queries
 * - `list(options)`: Specific list query with options
 * - `details`: All detail-type queries
 * - `detail(userId, sport)`: Specific user detail query
 * - `bySport(sport)`: All queries for a specific sport
 * - `byDateRange(start, end)`: All queries within a date range
 * - `live`: All live game queries
 * 
 * @example
 * ```typescript
 * // Generate cache key for NFL scores
 * const nflKey = userTeamScoresKeys.list({ sport: 'nfl', limit: 10 });
 * 
 * // Invalidate all NFL-related queries
 * queryClient.invalidateQueries({ queryKey: userTeamScoresKeys.bySport('nfl') });
 * 
 * // Invalidate all user team scores
 * queryClient.invalidateQueries({ queryKey: userTeamScoresKeys.all });
 * ```
 * 
 * @see {@link https://tanstack.com/query/latest/docs/react/guides/query-keys} React Query Key Management
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
 * Fetches user team scores from the API with comprehensive error handling
 * 
 * This function handles the HTTP request to fetch user team scores data, including
 * parameter validation, request formatting, response parsing, and error categorization.
 * 
 * **Request Processing:**
 * - Validates and sanitizes input parameters
 * - Constructs query parameters with proper encoding
 * - Enforces limit constraints (1-50, default 10)
 * - Handles optional date range parameters
 * 
 * **Error Handling:**
 * - Network errors (connection issues, timeouts)
 * - Authentication errors (401, 403)
 * - Validation errors (400, invalid parameters)
 * - Server errors (500, 502, 503)
 * - Response parsing errors
 * 
 * @param {UserTeamScoresOptions} options - Query options for fetching scores
 * @param {Sport} options.sport - The sport to fetch scores for
 * @param {number} [options.limit=10] - Maximum number of games (1-50)
 * @param {string} [options.startDate] - Start date filter (ISO format)
 * @param {string} [options.endDate] - End date filter (ISO format)
 * 
 * @returns {Promise<UserTeamScoresResult>} Promise resolving to user team scores data
 * 
 * @throws {UserTeamScoresError} Categorized error with type, message, and details
 * 
 * @example
 * ```typescript
 * try {
 *   const result = await fetchUserTeamScores({
 *     sport: 'nfl',
 *     limit: 20,
 *     startDate: '2024-01-01',
 *     endDate: '2024-01-31'
 *   });
 *   
 *   console.log(`Found ${result.totalGames} games`);
 *   console.log(`${result.liveGames} games are currently live`);
 * } catch (error) {
 *   if (error.type === 'auth') {
 *     // Handle authentication error
 *     redirectToLogin();
 *   } else if (error.type === 'network') {
 *     // Handle network error
 *     showNetworkErrorMessage();
 *   }
 * }
 * ```
 * 
 * @internal This function is used internally by the useUserTeamScores hook
 */
const fetchUserTeamScores = async (
  options: UserTeamScoresOptions,
  signal?: AbortSignal
): Promise<UserTeamScoresResult> => {
  const { sport, limit = 10, startDate, endDate } = options;
  
  // Build query parameters
  const searchParams = new URLSearchParams();
  searchParams.append('sport', String(sport).toLowerCase());
  
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Determine dev override and attach appropriate auth headers
    let devOverrideEnabled = false;
    try {
      const { isDev, isDevHeaderAllowed, getDevUid } = await import('@/lib/devAuth');
      devOverrideEnabled = isDev() && isDevHeaderAllowed();
      if (devOverrideEnabled) {
        const devUid = getDevUid() || 'dev-user';
        if (devUid) headers['x-dev-firebase-uid'] = String(devUid);
        if (!import.meta.env.PROD) {
          console.log('[fetchUserTeamScores] dev header set:', !!devUid, 'uid:', devUid);
        }
      }
    } catch {}

    // If dev override is not enabled, attach Firebase ID token
    if (!devOverrideEnabled) {
      try {
        const { getFirebaseIdToken } = await import('@/lib/firebaseClient');
        const idToken = await getFirebaseIdToken();
        if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
      } catch {}
    }

    const requestUrl = `/api/user-team-scores?${searchParams.toString()}`;
    if (!import.meta.env.PROD) {
      console.log('[fetchUserTeamScores] GET', requestUrl, 'headers:', headers);
    }
    let response = await fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
      headers,
      signal,
    });

    // On 401, if using Firebase auth, refresh token once and retry
    if (response.status === 401 && !devOverrideEnabled) {
      try {
        const { getFirebaseIdToken } = await import('@/lib/firebaseClient');
        const refreshed = await getFirebaseIdToken(true);
        if (refreshed) {
          headers['Authorization'] = `Bearer ${refreshed}`;
          response = await fetch(requestUrl, {
            method: 'GET',
            credentials: 'include',
            headers,
            signal,
          });
        }
      } catch {}
    }
    
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
    // If the request was aborted, rethrow the AbortError so React Query treats it as a cancellation
    if ((error as any)?.name === 'AbortError') {
      throw error;
    }
    if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
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
 * Custom React hook for fetching and managing user team scores with real-time updates
 * 
 * This hook provides a comprehensive solution for managing sports scores data for a user's favorite teams.
 * It integrates React Query for efficient data fetching and caching, WebSocket connections for real-time
 * updates, performance monitoring, and various utility functions for data manipulation.
 * 
 * **Key Features:**
 * - Efficient data fetching with React Query integration
 * - Real-time score updates via WebSocket connections
 * - Intelligent caching and cache invalidation
 * - Performance monitoring and optimization
 * - Debounced sport changes to prevent excessive API calls
 * - Comprehensive error handling with categorized error types
 * - Utility functions for filtering and manipulating game data
 * - Support for multiple sports and date range filtering
 * 
 * **Performance Optimizations:**
 * - Debounced sport changes (300ms delay)
 * - Memoized options and computed values
 * - Efficient WebSocket event handling
 * - Smart cache key generation for granular invalidation
 * 
 * @param {UserTeamScoresOptions} options - Configuration options for the hook
 * @param {Sport} options.sport - The sport to fetch scores for (required)
 * @param {number} [options.limit=10] - Maximum number of games to fetch (1-50)
 * @param {string} [options.startDate] - Start date for filtering games (ISO format)
 * @param {string} [options.endDate] - End date for filtering games (ISO format)
 * @param {boolean} [options.enableRealTimeUpdates=false] - Enable WebSocket real-time updates
 * @param {number} [options.refetchInterval] - Interval for automatic refetching (milliseconds)
 * 
 * @returns {UseUserTeamScoresReturn} Hook result object containing:
 * - **data**: The fetched user team scores data
 * - **loading states**: isLoading, isFetching, isRefetching, etc.
 * - **error handling**: error object with categorized error types
 * - **computed properties**: hasLiveGames, hasScheduledGames, etc.
 * - **utility functions**: getGamesByStatus, getGamesBySport, etc.
 * - **cache management**: invalidateCache, prefetchNextPage, etc.
 * - **WebSocket properties**: connection state and real-time update controls
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const { data, isLoading, error } = useUserTeamScores({
 *   sport: 'nfl'
 * });
 * 
 * // Advanced usage with real-time updates
 * const {
 *   data,
 *   isLoading,
 *   hasLiveGames,
 *   getGamesByStatus,
 *   isWebSocketConnected,
 *   subscribeToRealTimeUpdates,
 *   lastScoreUpdate
 * } = useUserTeamScores({
 *   sport: 'nba',
 *   limit: 20,
 *   enableRealTimeUpdates: true,
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31'
 * });
 * 
 * // Handle real-time updates
 * useEffect(() => {
 *   if (hasLiveGames && !isWebSocketConnected) {
 *     subscribeToRealTimeUpdates();
 *   }
 * }, [hasLiveGames, isWebSocketConnected]);
 * 
 * // Filter games by status
 * const liveGames = getGamesByStatus('live');
 * const completedGames = getGamesByStatus('final');
 * ```
 * 
 * @example
 * ```typescript
 * // Error handling
 * const { data, error, isError } = useUserTeamScores({ sport: 'mlb' });
 * 
 * if (isError && error) {
 *   switch (error.type) {
 *     case 'network':
 *       console.error('Network error:', error.message);
 *       break;
 *     case 'auth':
 *       console.error('Authentication required:', error.message);
 *       break;
 *     case 'validation':
 *       console.error('Invalid parameters:', error.details);
 *       break;
 *     default:
 *       console.error('Unknown error:', error.message);
 *   }
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Cache management
 * const { invalidateCache, prefetchNextPage } = useUserTeamScores({ sport: 'nhl' });
 * 
 * // Manually refresh data
 * const handleRefresh = async () => {
 *   await invalidateCache();
 * };
 * 
 * // Prefetch next month's data
 * const prefetchNextMonth = async () => {
 *   const nextMonth = new Date();
 *   nextMonth.setMonth(nextMonth.getMonth() + 1);
 *   
 *   await prefetchNextPage({
 *     startDate: nextMonth.toISOString().split('T')[0]
 *   });
 * };
 * ```
 * 
 * @since 1.0.0
 * @see {@link UserTeamScoresOptions} for detailed options documentation
 * @see {@link UseUserTeamScoresReturn} for complete return type documentation
 * @see {@link GameScoreData} for game data structure
 * @see {@link UserTeamScoresError} for error handling patterns
 */
export function useUserTeamScores(
  options: UserTeamScoresOptions
): UseUserTeamScoresReturn {
  const queryClient = useQueryClient();
  
  // Performance monitoring
  const performanceMetrics = usePerformanceMonitoring('useUserTeamScores');
  
  // Debounce sport changes to prevent excessive API calls during rapid switching
  const debouncedSport = useDebounce(options.sport, 300);
  
  // Create debounced options object with memoization
  const debouncedOptions = useMemo(() => ({
    ...options,
    sport: debouncedSport,
  }), [options.limit, options.startDate, options.endDate, options.enableRealTimeUpdates, options.refetchInterval, debouncedSport]);
  
  // State for tracking WebSocket updates
  const [lastScoreUpdate, setLastScoreUpdate] = useState<UserTeamScoreUpdate | null>(null);
  
  // Memoized WebSocket event handlers to prevent unnecessary re-renders
  const webSocketEventHandlers = useMemo(() => ({
    onScoreUpdate: (update: UserTeamScoreUpdate) => {
      setLastScoreUpdate(update);
      
      // Update cache with new score data if it matches current query
      if (update.payload.sport === debouncedOptions.sport) {
        queryClient.setQueryData(
          userTeamScoresKeys.list(debouncedOptions),
          (oldData: UserTeamScoresResult | undefined) => {
            if (!oldData) return oldData;
            
            // Optimized game update using Map for O(1) lookup
            const gameMap = new Map(oldData.games.map(game => [game.gameId, game]));
            const targetGame = gameMap.get(update.payload.gameData.gameId);
            
            if (targetGame) {
              const updatedGame = {
                ...targetGame,
                homeScore: update.payload.gameData.homeScore,
                awayScore: update.payload.gameData.awayScore,
                status: update.payload.gameData.status as GameScoreData['status'],
                period: update.payload.gameData.quarter,
                timeRemaining: update.payload.gameData.timeRemaining,
                lastUpdated: update.payload.timestamp,
              };
              
              gameMap.set(update.payload.gameData.gameId, updatedGame);
              const updatedGames = Array.from(gameMap.values());
              
              // Efficiently recalculate counts
              let liveGames = 0;
              let completedGames = 0;
              let scheduledGames = 0;
              
              for (const game of updatedGames) {
                switch (game.status) {
                  case 'live':
                    liveGames++;
                    break;
                  case 'final':
                    completedGames++;
                    break;
                  case 'scheduled':
                    scheduledGames++;
                    break;
                }
              }
              
              return {
                ...oldData,
                games: updatedGames,
                liveGames,
                completedGames,
                scheduledGames,
                lastUpdated: update.payload.timestamp,
              };
            }
            
            return oldData;
          }
        );
      }
    },
    
    onStatusChange: (change: UserTeamStatusChange) => {
      // Invalidate cache when game status changes significantly
      queryClient.invalidateQueries({
        queryKey: userTeamScoresKeys.bySport(debouncedOptions.sport),
      });
    },
    
    onSubscriptionConfirmation: (confirmation: SubscriptionConfirmation) => {
        // WebSocket subscription confirmed - no logging needed in production
      },
  }), [debouncedOptions.sport, queryClient, debouncedOptions]);
  
  // Initialize WebSocket connection
  const webSocket = useWebSocket({
    autoConnect: debouncedOptions.enableRealTimeUpdates,
    autoReconnect: true,
    maxReconnectAttempts: 5,
    eventHandlers: webSocketEventHandlers,
  });

  // Initialize score update service for intelligent score processing
  const scoreUpdateService = useScoreUpdateService({
    autoSubscribe: debouncedOptions.enableRealTimeUpdates,
    sport: debouncedOptions.sport,
    onScoreUpdate: (update) => {
      // Trigger cache invalidation for affected queries
      queryClient.invalidateQueries({
        queryKey: userTeamScoresKeys.list({ 
          ...debouncedOptions, 
          sport: update.sport as Sport
        }),
      });
    },
    onStatusChange: (change) => {
      // Trigger cache invalidation for status changes
      queryClient.invalidateQueries({
        queryKey: userTeamScoresKeys.list(debouncedOptions),
      });
    },
    enableThrottling: true,
    throttleInterval: 2000, // Throttle updates to prevent excessive API calls
  });
  
  // Subscribe to user teams when WebSocket connects and real-time updates are enabled
  useEffect(() => {
    if (debouncedOptions.enableRealTimeUpdates && webSocket.isConnected) {
      webSocket.subscribeToUserTeams(debouncedOptions.sport);
    }
    
    return () => {
      if (debouncedOptions.enableRealTimeUpdates && webSocket.isConnected) {
        webSocket.unsubscribeFromUserTeams(debouncedOptions.sport);
      }
    };
  }, [debouncedOptions.enableRealTimeUpdates, debouncedOptions.sport, webSocket.isConnected]);
  
  // Memoized WebSocket subscription management functions
  const subscribeToRealTimeUpdates = useCallback(() => {
    if (!webSocket.isConnected) {
      webSocket.connect();
    } else {
      webSocket.subscribeToUserTeams(debouncedOptions.sport);
    }
  }, [webSocket, debouncedOptions.sport]);
  
  const unsubscribeFromRealTimeUpdates = useCallback(() => {
    webSocket.unsubscribeFromUserTeams(debouncedOptions.sport);
  }, [webSocket, debouncedOptions.sport]);
  
  // Helper function to convert generic errors to UserTeamScoresError
  const convertError = useCallback((error: unknown): UserTeamScoresError => {
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
  }, []);

  // Enhanced React Query configuration with debounced options
  const queryResult = useQuery({
    queryKey: userTeamScoresKeys.list(debouncedOptions),
    queryFn: ({ signal }) => fetchUserTeamScores(debouncedOptions, signal),
    enabled: true,
    
    // Cache configuration optimized for sports data
    staleTime: debouncedOptions.enableRealTimeUpdates ? 5000 : 60000, // 5s for real-time, 60s otherwise
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    
    // Refetch configuration
    refetchInterval: debouncedOptions.refetchInterval || (debouncedOptions.enableRealTimeUpdates ? 10000 : 60000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: debouncedOptions.enableRealTimeUpdates ? true : false,
    
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
    
    // Prefer cached data for the target sport to enable instant switching
    placeholderData: (previousData) => {
      const cachedForTarget = queryClient.getQueryData(
        userTeamScoresKeys.list(debouncedOptions)
      ) as UserTeamScoresResult | undefined;
      return cachedForTarget ?? previousData;
    },
  });

  // Memoized computed properties to prevent unnecessary recalculations
  const hasLiveGames = useMemo(() => 
    queryResult.data?.liveGames ? queryResult.data.liveGames > 0 : false, 
    [queryResult.data?.liveGames]
  );
  
  const hasScheduledGames = useMemo(() => 
    queryResult.data?.scheduledGames ? queryResult.data.scheduledGames > 0 : false, 
    [queryResult.data?.scheduledGames]
  );
  
  const hasCompletedGames = useMemo(() => 
    queryResult.data?.completedGames ? queryResult.data.completedGames > 0 : false, 
    [queryResult.data?.completedGames]
  );

  // Memoized utility functions to prevent recreation on every render
  const getGamesByStatus = useCallback((status: GameScoreData['status']): GameScoreData[] => {
    return queryResult.data?.games.filter(game => game.status === status) || [];
  }, [queryResult.data?.games]);

  const getGamesBySport = useCallback((sport: Sport): GameScoreData[] => {
    return queryResult.data?.games.filter(game => game.sport === sport) || [];
  }, [queryResult.data?.games]);

  const getUserTeamGames = useCallback((): GameScoreData[] => {
    return queryResult.data?.games.filter(game => game.isUserTeamGame) || [];
  }, [queryResult.data?.games]);

  // Memoized cache management utilities
  const invalidateCache = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.list(debouncedOptions),
    });
  }, [queryClient, debouncedOptions]);

  const invalidateAllUserTeamScores = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.all,
    });
  }, [queryClient]);

  const prefetchNextPage = useCallback(async (nextOptions: Partial<UserTeamScoresOptions>): Promise<void> => {
    const mergedOptions = { ...debouncedOptions, ...nextOptions };
    await queryClient.prefetchQuery({
      queryKey: userTeamScoresKeys.list(mergedOptions),
      queryFn: () => fetchUserTeamScores(mergedOptions),
      staleTime: 5000, // Short stale time for prefetched data
    });
  }, [queryClient, debouncedOptions]);

  return {
    // React Query properties with error conversion
    data: queryResult.data,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error ? convertError(queryResult.error) : null,
    isSuccess: queryResult.isSuccess,
    isFetching: queryResult.isFetching,
    isRefetching: queryResult.isRefetching,
    refetch: queryResult.refetch,
    
    // Computed properties (memoized)
    hasLiveGames,
    hasScheduledGames,
    hasCompletedGames,
    
    // Utility functions (memoized)
    getGamesByStatus,
    getGamesBySport,
    getUserTeamGames,
    
    // Cache management utilities (memoized)
    invalidateCache,
    invalidateAllUserTeamScores,
    prefetchNextPage,
    
    // WebSocket properties
    isWebSocketConnected: webSocket.isConnected,
    webSocketState: webSocket.state,
    lastScoreUpdate: null, // Will be updated by WebSocket events
    subscribeToRealTimeUpdates,
    unsubscribeFromRealTimeUpdates,
    
    // Performance monitoring data (development only)
    ...(import.meta.env.DEV && {
      performanceMetrics,
    }),
  };
};

// Cache utilities for global cache management
export const userTeamScoresCacheUtils = {
  // Invalidate all user team scores queries
  invalidateAll: async (queryClient: QueryClient): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: userTeamScoresKeys.all,
    });
  },
  
  // Remove specific query from cache
  remove: (queryClient: QueryClient, options: UserTeamScoresOptions): void => {
    queryClient.removeQueries({
      queryKey: userTeamScoresKeys.list(options),
    });
  },
  
  // Set query data directly
  setQueryData: (
    queryClient: QueryClient, 
    options: UserTeamScoresOptions, 
    data: UserTeamScoresResult
  ): void => {
    queryClient.setQueryData(userTeamScoresKeys.list(options), data);
  },
  
  // Get query data from cache
  getQueryData: (
    queryClient: QueryClient, 
    options: UserTeamScoresOptions
  ): UserTeamScoresResult | undefined => {
    return queryClient.getQueryData(userTeamScoresKeys.list(options));
  },
  
  // Prefetch for multiple sports
  prefetchMultipleSports: async (
    queryClient: QueryClient,
    sports: Sport[],
    baseOptions: Omit<UserTeamScoresOptions, 'sport'>
  ): Promise<void> => {
    const prefetchPromises = sports.map(sport =>
      queryClient.prefetchQuery({
        queryKey: userTeamScoresKeys.list({ ...baseOptions, sport }),
        queryFn: () => fetchUserTeamScores({ ...baseOptions, sport }),
        staleTime: 5000,
      })
    );
    
    await Promise.all(prefetchPromises);
  },
};

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default useUserTeamScores;