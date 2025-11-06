import { useEffect, useCallback, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import type { Sport } from '@/data/sportsTeams';
import {
  getSportChangeDetectionService,
  detectSportFromPath,
  detectSportFromQuery,
  type SportChangeEvent,
  type SportChangeDetectionConfig,
  type SportChangeCallbacks,
  type SportChangeSource,
} from '@/lib/sportChangeDetectionService';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface UseSportChangeDetectionOptions {
  /** Configuration for the sport change detection service */
  config?: SportChangeDetectionConfig;
  /** Whether to automatically detect sport changes from route changes */
  autoDetectFromRoute?: boolean;
  /** Whether to automatically detect sport changes from query parameters */
  autoDetectFromQuery?: boolean;
  /** Default sport to use when no sport is detected */
  defaultSport?: Sport;
  /** Whether to invalidate React Query caches on sport change */
  invalidateQueriesOnChange?: boolean;
  /** Custom cleanup functions to run on sport change */
  customCleanupTasks?: Record<Sport, (() => void)[]>;
  /** Custom callbacks */
  callbacks?: Partial<SportChangeCallbacks>;
}

export interface UseSportChangeDetectionReturn {
  /** Current sport */
  currentSport: Sport | null;
  /** Previous sport */
  previousSport: Sport | null;
  /** Whether a sport change is in progress (debouncing) */
  isChanging: boolean;
  /** Sport change history */
  changeHistory: Array<{
    event: SportChangeEvent;
    duration?: number;
  }>;
  /** Manually trigger sport change */
  changeSport: (sport: Sport, source?: SportChangeSource) => void;
  /** Force immediate sport change (bypasses debouncing) */
  forceChangeSport: (sport: Sport, source?: SportChangeSource) => void;
  /** Register cleanup task for a sport */
  registerCleanupTask: (sport: Sport, cleanupFn: () => void) => void;
  /** Unregister cleanup task for a sport */
  unregisterCleanupTask: (sport: Sport, cleanupFn: () => void) => void;
  /** Get detected sport from current route */
  getDetectedSportFromRoute: () => Sport | null;
  /** Get detected sport from query parameters */
  getDetectedSportFromQuery: () => Sport | null;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useSportChangeDetection(
  options: UseSportChangeDetectionOptions = {}
): UseSportChangeDetectionReturn {
  const {
    config = {},
    autoDetectFromRoute = true,
    autoDetectFromQuery = true,
    defaultSport,
    invalidateQueriesOnChange = true,
    customCleanupTasks = {},
    callbacks = {},
  } = options;

  const [location] = useLocation();
  const queryClient = useQueryClient();
  const serviceRef = useRef<ReturnType<typeof getSportChangeDetectionService> | null>(null);
  
  // State for tracking changes
  const [currentSport, setCurrentSport] = useState<Sport | null>(null);
  const [previousSport, setPreviousSport] = useState<Sport | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [changeHistory, setChangeHistory] = useState<Array<{
    event: SportChangeEvent;
    duration?: number;
  }>>([]);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize service
  useEffect(() => {
    const serviceCallbacks: SportChangeCallbacks = {
      onSportChange: (event) => {
        setCurrentSport(event.currentSport);
        setPreviousSport(event.previousSport);
        setIsChanging(false);
        
        // Invalidate queries if enabled
        if (invalidateQueriesOnChange) {
          // Invalidate sport-specific queries
          queryClient.invalidateQueries({
            predicate: (query) => {
              const queryKey = query.queryKey;
              return Array.isArray(queryKey) && 
                     (queryKey.includes(event.previousSport) || 
                      queryKey.includes('userTeamScores') ||
                      queryKey.includes('scores'));
            },
          });
        }

        // Call custom callback
        callbacks.onSportChange?.(event);
      },
      
      onBeforeCleanup: (sport) => {
        callbacks.onBeforeCleanup?.(sport);
      },
      
      onAfterCleanup: (sport) => {
        callbacks.onAfterCleanup?.(sport);
      },
      
      onSportChangeDebounced: (event) => {
        setIsChanging(true);
        callbacks.onSportChangeDebounced?.(event);
      },
    };

    serviceRef.current = getSportChangeDetectionService(config, serviceCallbacks);

    // Register custom cleanup tasks
    Object.entries(customCleanupTasks).forEach(([sport, tasks]) => {
      (tasks as (() => void)[]).forEach((task: () => void) => {
        serviceRef.current?.registerCleanupTask(sport as Sport, task);
      });
    });

    // Initialize current sport
    const initialSport = serviceRef.current.getCurrentSport();
    if (initialSport) {
      setCurrentSport(initialSport);
    }

    return () => {
      // Cleanup on unmount
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Auto-detect sport from route changes
  useEffect(() => {
    if (!autoDetectFromRoute || !serviceRef.current) return;

    const detectedSport = detectSportFromPath(location);
    if (detectedSport) {
      serviceRef.current.detectSportChange(detectedSport, 'route-change');
    } else if (defaultSport && !serviceRef.current.getCurrentSport()) {
      serviceRef.current.detectSportChange(defaultSport, 'default-fallback');
    }
  }, [location, autoDetectFromRoute, defaultSport]);

  // Auto-detect sport from query parameters
  useEffect(() => {
    if (!autoDetectFromQuery || !serviceRef.current) return;

    const searchParams = new URLSearchParams(location.split('?')[1] || '');
    const detectedSport = detectSportFromQuery(searchParams);
    if (detectedSport) {
      serviceRef.current.detectSportChange(detectedSport, 'query-param');
    }
  }, [location, autoDetectFromQuery]);

  // Update change history when service history changes
  useEffect(() => {
    if (!serviceRef.current) return;

    const updateHistory = () => {
      setChangeHistory(serviceRef.current?.getChangeHistory() || []);
    };

    // Update history periodically (could be optimized with events)
    const interval = setInterval(updateHistory, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Callback functions
  const changeSport = useCallback((sport: Sport, source: SportChangeSource = 'user-selection') => {
    if (!serviceRef.current) return;
    
    setIsChanging(true);
    serviceRef.current.detectSportChange(sport, source);
  }, []);

  const forceChangeSport = useCallback((sport: Sport, source: SportChangeSource = 'user-selection') => {
    if (!serviceRef.current) return;
    
    serviceRef.current.forceSportChange(sport, source);
  }, []);

  const registerCleanupTask = useCallback((sport: Sport, cleanupFn: () => void) => {
    serviceRef.current?.registerCleanupTask(sport, cleanupFn);
  }, []);

  const unregisterCleanupTask = useCallback((sport: Sport, cleanupFn: () => void) => {
    serviceRef.current?.unregisterCleanupTask(sport, cleanupFn);
  }, []);

  const getDetectedSportFromRoute = useCallback(() => {
    return detectSportFromPath(location);
  }, [location]);

  const getDetectedSportFromQuery = useCallback(() => {
    const searchParams = new URLSearchParams(location.split('?')[1] || '');
    return detectSportFromQuery(searchParams);
  }, [location]);

  return {
    currentSport,
    previousSport,
    isChanging,
    changeHistory,
    changeSport,
    forceChangeSport,
    registerCleanupTask,
    unregisterCleanupTask,
    getDetectedSportFromRoute,
    getDetectedSportFromQuery,
  };
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

/**
 * Simple hook to get current sport without full change detection
 */
export function useCurrentSport(): Sport | null {
  const service = getSportChangeDetectionService();
  const [currentSport, setCurrentSport] = useState<Sport | null>(service.getCurrentSport());

  useEffect(() => {
    const checkSport = () => {
      const sport = service.getCurrentSport();
      setCurrentSport(sport);
    };

    const interval = setInterval(checkSport, 500);
    return () => clearInterval(interval);
  }, [service]);

  return currentSport;
}

/**
 * Hook to register cleanup tasks for the current component
 */
export function useSportCleanup(sport: Sport, cleanupFn: () => void) {
  const service = getSportChangeDetectionService();

  useEffect(() => {
    service.registerCleanupTask(sport, cleanupFn);
    
    return () => {
      service.unregisterCleanupTask(sport, cleanupFn);
    };
  }, [service, sport, cleanupFn]);
}