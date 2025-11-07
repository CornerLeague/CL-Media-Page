import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Sport } from '@/data/sportsTeams';
import type { UserTeamScoresResult } from './useUserTeamScores';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface SportScoreCache {
  [sport: string]: {
    data: UserTeamScoresResult;
    lastUpdated: Date;
    isRefreshing: boolean;
  };
}

export interface SportScoreCacheConfig {
  /** Maximum number of sports to cache */
  maxCacheSize?: number;
  /** Time in milliseconds before data is considered stale */
  staleTime?: number;
  /** Background refresh interval in milliseconds */
  backgroundRefreshInterval?: number;
  /** Enable background refresh for non-active sports */
  enableBackgroundRefresh?: boolean;
  /** Enable debug logging */
  enableDebugLogging?: boolean;
}

export interface UseSportScoreCacheOptions extends SportScoreCacheConfig {
  /** Current active sport */
  activeSport: Sport | null;
  /** User ID for cache key generation */
  userId?: string;
}

export interface UseSportScoreCacheReturn {
  /** Current cache state */
  cache: SportScoreCache;
  /** Get cached data for a sport */
  getCachedData: (sport: Sport) => UserTeamScoresResult | null;
  /** Check if sport data is cached and fresh */
  isCached: (sport: Sport) => boolean;
  /** Check if sport data is stale */
  isStale: (sport: Sport) => boolean;
  /** Manually refresh data for a sport */
  refreshSport: (sport: Sport) => Promise<void>;
  /** Clear cache for a specific sport */
  clearSport: (sport: Sport) => void;
  /** Clear entire cache */
  clearCache: () => void;
  /** Get cache statistics */
  getCacheStats: () => {
    totalSports: number;
    staleSports: number;
    refreshingSports: number;
    cacheSize: number;
  };
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: Required<SportScoreCacheConfig> = {
  maxCacheSize: 5,
  staleTime: 5 * 60 * 1000, // 5 minutes
  backgroundRefreshInterval: 30 * 1000, // 30 seconds
  enableBackgroundRefresh: true,
  enableDebugLogging: false,
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useSportScoreCache(
  options: UseSportScoreCacheOptions
): UseSportScoreCacheReturn {
  const {
    activeSport,
    userId,
    maxCacheSize = DEFAULT_CONFIG.maxCacheSize,
    staleTime = DEFAULT_CONFIG.staleTime,
    backgroundRefreshInterval = DEFAULT_CONFIG.backgroundRefreshInterval,
    enableBackgroundRefresh = DEFAULT_CONFIG.enableBackgroundRefresh,
    enableDebugLogging = DEFAULT_CONFIG.enableDebugLogging,
  } = options;

  const queryClient = useQueryClient();
  const [cache, setCache] = useState<SportScoreCache>({});
  const backgroundRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActiveTimeRef = useRef<Map<Sport, number>>(new Map());

  // Debug logging helper
  const log = useCallback((message: string, data?: any) => {
    if (enableDebugLogging) {
      console.log(`[SportScoreCache] ${message}`, data || '');
    }
  }, [enableDebugLogging]);

  // Generate cache key for React Query
  const getCacheKey = useCallback((sport: Sport) => {
    return ['userTeamScores', sport, userId];
  }, [userId]);

  // Check if sport data is cached and fresh
  const isCached = useCallback((sport: Sport): boolean => {
    const cached = cache[sport];
    if (!cached) return false;

    const now = Date.now();
    const age = now - cached.lastUpdated.getTime();
    return age <= staleTime;
  }, [cache, staleTime]);

  // Check if sport data is stale
  const isStale = useCallback((sport: Sport): boolean => {
    const cached = cache[sport];
    if (!cached) return true;
    
    const now = Date.now();
    const age = now - cached.lastUpdated.getTime();
    return age > staleTime;
  }, [cache, staleTime]);

  // Get cached data for a sport
  const getCachedData = useCallback((sport: Sport): UserTeamScoresResult | null => {
    const cached = cache[sport];
    return cached?.data || null;
  }, [cache]);

  // Refresh data for a specific sport
  const refreshSport = useCallback(async (sport: Sport): Promise<void> => {
    if (!userId) return;

    log(`Refreshing data for sport: ${sport}`);

    // Mark as refreshing
    setCache(prev => ({
      ...prev,
      [sport]: {
        ...prev[sport],
        isRefreshing: true,
      },
    }));

    try {
      // Fetch fresh data from React Query
      const cacheKey = getCacheKey(sport);
      const freshData = await queryClient.fetchQuery({
        queryKey: cacheKey,
        staleTime: 0, // Force fresh fetch
      }) as UserTeamScoresResult;

      // Update cache with fresh data
      setCache(prev => ({
        ...prev,
        [sport]: {
          data: freshData,
          lastUpdated: new Date(),
          isRefreshing: false,
        },
      }));

      log(`Successfully refreshed data for sport: ${sport}`);
    } catch (error) {
      log(`Failed to refresh data for sport: ${sport}`, error);
      
      // Mark as not refreshing; staleness is computed from lastUpdated
      setCache(prev => ({
        ...prev,
        [sport]: {
          ...prev[sport],
          isRefreshing: false,
        },
      }));
    }
  }, [userId, queryClient, getCacheKey, log]);

  // Clear cache for a specific sport
  const clearSport = useCallback((sport: Sport) => {
    log(`Clearing cache for sport: ${sport}`);
    setCache(prev => {
      const newCache = { ...prev };
      delete newCache[sport];
      return newCache;
    });
  }, [log]);

  // Clear entire cache
  const clearCache = useCallback(() => {
    log('Clearing entire cache');
    setCache({});
  }, [log]);

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    const sports = Object.keys(cache);
    const staleSports = sports.filter(sport => isStale(sport as Sport)).length;
    const refreshingSports = sports.filter(sport => cache[sport].isRefreshing).length;
    
    return {
      totalSports: sports.length,
      staleSports,
      refreshingSports,
      cacheSize: JSON.stringify(cache).length,
    };
  }, [cache, isStale]);

  // Update cache when React Query data changes
  useEffect(() => {
    if (!activeSport || !userId) return;

    const cacheKey = getCacheKey(activeSport);
    const queryData = queryClient.getQueryData(cacheKey) as UserTeamScoresResult;
    
    if (queryData) {
      log(`Updating cache for active sport: ${activeSport}`);
      setCache(prev => ({
        ...prev,
        [activeSport]: {
          data: queryData,
          lastUpdated: new Date(),
          isRefreshing: false,
        },
      }));
    }
  }, [activeSport, userId, queryClient, getCacheKey, log]);

  // Track last active time for sports
  useEffect(() => {
    if (activeSport) {
      lastActiveTimeRef.current.set(activeSport, Date.now());
    }
  }, [activeSport]);

  // Manage cache size (LRU eviction)
  useEffect(() => {
    const sports = Object.keys(cache);
    if (sports.length <= maxCacheSize) return;

    log(`Cache size exceeded (${sports.length}/${maxCacheSize}), evicting oldest entries`);

    // Sort by last active time (oldest first)
    const sortedSports = sports.sort((a, b) => {
      const timeA = lastActiveTimeRef.current.get(a as Sport) || 0;
      const timeB = lastActiveTimeRef.current.get(b as Sport) || 0;
      return timeA - timeB;
    });

    // Remove oldest entries
    const sportsToRemove = sortedSports.slice(0, sports.length - maxCacheSize);
    
    setCache(prev => {
      const newCache = { ...prev };
      sportsToRemove.forEach(sport => {
        delete newCache[sport];
        lastActiveTimeRef.current.delete(sport as Sport);
      });
      return newCache;
    });

    log(`Evicted ${sportsToRemove.length} sports from cache:`, sportsToRemove);
  }, [cache, maxCacheSize, log]);

  // Background refresh for non-active sports
  useEffect(() => {
    if (!enableBackgroundRefresh || !userId) return;

    const startBackgroundRefresh = () => {
      backgroundRefreshTimerRef.current = setInterval(() => {
        const sports = Object.keys(cache);
        const nonActiveSports = sports.filter(sport => sport !== activeSport);
        
        // Refresh stale non-active sports
        nonActiveSports.forEach(sport => {
          if (isStale(sport as Sport) && !cache[sport].isRefreshing) {
            log(`Background refreshing stale sport: ${sport}`);
            refreshSport(sport as Sport);
          }
        });
      }, backgroundRefreshInterval);
    };

    startBackgroundRefresh();

    return () => {
      if (backgroundRefreshTimerRef.current) {
        clearInterval(backgroundRefreshTimerRef.current);
        backgroundRefreshTimerRef.current = null;
      }
    };
  }, [
    enableBackgroundRefresh,
    userId,
    cache,
    activeSport,
    backgroundRefreshInterval,
    isStale,
    refreshSport,
    log,
  ]);

  // Mark cached data as stale based on staleTime
  // Removed: explicit stale flag management to avoid inconsistency.

  return {
    cache,
    getCachedData,
    isCached,
    isStale,
    refreshSport,
    clearSport,
    clearCache,
    getCacheStats,
  };
}