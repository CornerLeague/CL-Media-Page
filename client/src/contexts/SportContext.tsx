import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from './AuthContext';
import { useWebSocket, UserTeamScoreUpdate, UserTeamStatusChange } from '@/hooks/useWebSocket';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/hooks/use-toast';
import { useScrollPosition } from '@/hooks/useScrollPosition';
import { useSportScoreCache } from '@/hooks/useSportScoreCache';
import { useLoadingState } from '@/hooks/useLoadingState';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import type { UserProfile } from '@shared/schema';
import type { UserTeamScoresResult } from '@/hooks/useUserTeamScores';
import { userTeamScoresCacheUtils } from '@/hooks/useUserTeamScores';
import { SPORTS, type Sport } from '@/data/sportsTeams';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ScoreData {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  quarter?: string;
  timeRemaining?: string;
  lastUpdated: string;
}

export interface ScoreState {
  scores: Record<string, ScoreData>; // gameId -> ScoreData
  lastRefresh: string | null;
  isRefreshing: boolean;
  error: string | null;
}

interface SportContextType {
  selectedSport: Sport | null;
  setSelectedSport: (sport: Sport | null, immediate?: boolean) => void;
  availableSports: Sport[];
  scores: ScoreState;
  refreshScores: () => Promise<void>;
  getScoreForGame: (gameId: string) => ScoreData | undefined;
  getScoresForTeam: (teamId: string) => ScoreData[];
  subscribeToTeam: (teamId: string) => void;
  unsubscribeFromTeam: (teamId: string) => void;
  subscribeToSport: (sport: Sport) => void;
  unsubscribeFromSport: (sport: Sport) => void;
  isTransitioning: boolean;
  lastSportChange: Date | null;
  savedScrollPosition: number;
  // Cross-sport data management
  getCachedScores: (sport: Sport) => UserTeamScoresResult | null;
  refreshSportCache: (sport: Sport) => Promise<void>;
  clearSportCache: (sport?: Sport) => void;
  getCacheStatus: (sport: Sport) => { isStale: boolean; lastUpdated: Date | null };
  
  // Loading states
  loadingState: {
    isLoading: boolean;
    progress?: number;
    message?: string;
    error?: Error | null;
  };
  startLoading: (id?: string, message?: string) => string;
  stopLoading: (id?: string) => void;
  updateProgress: (progress: number, id?: string, message?: string) => void;
  setLoadingError: (error: Error, id?: string) => void;

  // Error handling
  errorHandler: {
    handleError: (error: Error, context?: Record<string, any>) => Promise<string>;
    retry: () => Promise<boolean>;
    clearError: () => void;
    reportError: (error?: Error) => void;
    error: Error | null;
    errorId: string | null;
    isRetrying: boolean;
    retryCount: number;
    hasRecovered: boolean;
  };
}

// ============================================================================
// CONTEXT CREATION
// ============================================================================

const SportContext = createContext<SportContextType | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export const SportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [selectedSport, setSelectedSportState] = useState<Sport | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lastSportChange, setLastSportChange] = useState<Date | null>(null);
  
  // Loading state management
  const {
    isLoading: loadingIsActive,
    progress: loadingProgress,
    message: loadingMessage,
    error: loadingError,
    startLoading,
    stopLoading,
    updateProgress,
    setError: setLoadingError,
  } = useLoadingState({
    operationType: 'sport-data',
    enableProgressEstimation: true,
    minLoadingTime: 300,
    maxLoadingTime: 30000,
  });

  // Error handling
  const errorHandler = useErrorHandler({
    autoRetry: true,
    maxRetries: 3,
    retryDelay: 1000,
    context: { component: 'SportContext' },
    onError: (error, errorId) => {
      console.error(`SportContext Error [${errorId}]:`, error);
      toast({
        title: "Error",
        description: "Something went wrong. We're trying to fix it.",
        variant: "destructive",
      });
    },
    onRecovery: (errorId, strategy) => {
      console.log(`SportContext recovered from error ${errorId} using ${strategy}`);
      toast({
        title: "Recovered",
        description: "The issue has been resolved.",
        variant: "default",
      });
    },
  });
  
  // Scroll position management during transitions
  const { saveScrollPosition, restoreScrollPosition, scrollPosition } = useScrollPosition({
    storageKey: 'sport-transition-scroll',
    scrollBehavior: 'smooth'
  });
  
  // Cross-sport data cache management
  const {
    getCachedData: getCachedScores,
    refreshSport: refreshSportCache,
    clearCache: clearSportCache,
    isStale,
    getCacheStats,
  } = useSportScoreCache({
    activeSport: selectedSport,
    backgroundRefreshInterval: 30000, // 30 seconds
    staleTime: 300000, // 5 minutes
    maxCacheSize: 5, // Keep data for 5 sports
  });
  
  // Create getCacheStatus function
  const getCacheStatus = useCallback((sport: Sport) => {
    const cached = getCachedScores(sport);
    return {
      isStale: isStale(sport),
      lastUpdated: cached?.lastUpdated ? new Date(cached.lastUpdated) : null,
    };
  }, [getCachedScores, isStale]);
  
  // Score state management
  const [scores, setScores] = useState<ScoreState>({
    scores: {},
    lastRefresh: null,
    isRefreshing: false,
    error: null,
  });

  // Handle real-time score updates
  const handleScoreUpdate = useCallback((update: UserTeamScoreUpdate) => {
    const { gameData } = update.payload;
    
    setScores(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [gameData.gameId]: {
          gameId: gameData.gameId,
          homeTeam: gameData.homeTeam,
          awayTeam: gameData.awayTeam,
          homeScore: gameData.homeScore,
          awayScore: gameData.awayScore,
          status: gameData.status,
          quarter: gameData.quarter,
          timeRemaining: gameData.timeRemaining,
          lastUpdated: update.payload.timestamp,
        },
      },
      error: null,
    }));

    // Invalidate related queries to trigger UI updates
    queryClient.invalidateQueries({ queryKey: ['userTeamScores'] });
    queryClient.invalidateQueries({ queryKey: ['gameScores', gameData.gameId] });
  }, [queryClient]);

  // Handle game status changes
  const handleStatusChange = useCallback((change: UserTeamStatusChange) => {
    const { gameId, newStatus } = change.payload;
    
    setScores(prev => ({
      ...prev,
      scores: {
        ...prev.scores,
        [gameId]: prev.scores[gameId] ? {
          ...prev.scores[gameId],
          status: newStatus,
          lastUpdated: change.payload.timestamp,
        } : prev.scores[gameId],
      },
    }));

    // Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['userTeamScores'] });
    queryClient.invalidateQueries({ queryKey: ['gameScores', gameId] });
  }, [queryClient]);

  // WebSocket connection for real-time updates
  const {
    isConnected: isConnectedToRealTime,
    subscribeToTeam,
    unsubscribeFromTeam,
    subscribeToUserTeams,
    unsubscribeFromUserTeams,
  } = useWebSocket({
    eventHandlers: {
      onScoreUpdate: handleScoreUpdate,
      onStatusChange: handleStatusChange,
      onError: (error) => {
        console.error('WebSocket error:', error);
        setScores(prev => ({
          ...prev,
          error: 'Real-time connection error',
        }));
      },
    },
  });

  // Enhanced sport change handler with transition state
  const setSelectedSportImmediate = useCallback(async (sport: Sport | null) => {
    if (sport === selectedSport) return;
    
    // Save current scroll position before transition
    saveScrollPosition();
    
    setIsTransitioning(true);
    const changeTime = new Date();
    setLastSportChange(changeTime);
    
    try {
      // Unsubscribe from previous sport if exists
      if (selectedSport) {
        unsubscribeFromUserTeams(selectedSport);
      }
      
      // Attempt to prefill with cached scores for the target sport
      let prefetchedScoresApplied = false;
      if (sport) {
        const cached = getCachedScores(sport);
        if (cached?.games?.length) {
          const mappedScores = cached.games.reduce((acc: Record<string, ScoreData>, game) => {
            acc[game.gameId] = {
              gameId: game.gameId,
              homeTeam: game.homeTeam,
              awayTeam: game.awayTeam,
              homeScore: game.homeScore,
              awayScore: game.awayScore,
              status: game.status,
              quarter: game.period,
              timeRemaining: game.timeRemaining,
              lastUpdated: cached.lastUpdated,
            };
            return acc;
          }, {});

          setScores(prev => ({
            ...prev,
            scores: mappedScores,
            lastRefresh: changeTime.toISOString(),
            error: null,
            isRefreshing: false,
          }));
          prefetchedScoresApplied = true;
        }
      }

      // If no cached data, clear existing scores for smooth transition
      if (!prefetchedScoresApplied) {
        setScores(prev => ({
          ...prev,
          scores: {},
          lastRefresh: changeTime.toISOString(),
          error: null,
          isRefreshing: false,
        }));
      }
      
      // Update selected sport
      setSelectedSportState(sport);
      
      // Subscribe to new sport if exists
      if (sport) {
        subscribeToUserTeams(sport);
        
        // Invalidate and refetch queries for the new sport
        await queryClient.invalidateQueries({
          queryKey: ['userTeamScores', sport],
        });
        
        // Also invalidate any previous sport queries to prevent stale data
        if (selectedSport) {
          await queryClient.invalidateQueries({
            queryKey: ['userTeamScores', selectedSport],
          });
        }
        
        await queryClient.invalidateQueries({
          queryKey: ['profile'],
        });
        
        // Clear any cached team-specific data
        await queryClient.invalidateQueries({
          queryKey: ['teamScores'],
        });
      } else {
        // If no sport selected, clear all sport-related queries
        await queryClient.invalidateQueries({
          queryKey: ['userTeamScores'],
        });
        
        await queryClient.invalidateQueries({
          queryKey: ['teamScores'],
        });
      }
      
      // Small delay to ensure smooth transition
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Error during sport transition:', error);
      
      // Set detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Failed to change sport category';
      setScores(prev => ({
        ...prev,
        error: errorMessage,
      }));
      
      // Revert to previous sport if the change failed
      if (selectedSport !== sport) {
        setSelectedSportState(selectedSport);
        
        // Re-subscribe to previous sport if it exists
        if (selectedSport) {
          try {
            subscribeToUserTeams(selectedSport);
          } catch (revertError) {
            console.error('Error reverting to previous sport:', revertError);
          }
        }
      }
      
      // Optionally, you could emit a toast notification here
       // This would require importing useToast or creating a notification system
       toast({
         title: 'Sport Change Failed',
         description: `Unable to switch to ${sport || 'selected sport'}. ${errorMessage}`,
         variant: 'destructive',
       });
      
    } finally {
      setIsTransitioning(false);
      
      // Restore scroll position after transition with a small delay
      setTimeout(() => {
        restoreScrollPosition();
      }, 100);
    }
  }, [selectedSport, unsubscribeFromUserTeams, subscribeToUserTeams, queryClient]);

  // Debounced sport change handler (300ms delay)
  const setSelectedSportDebounced = useDebounce(setSelectedSportImmediate, 300);

  // Main sport change handler - uses debounced version by default
  const setSelectedSport = useCallback((sport: Sport | null, immediate = false) => {
    if (immediate) {
      return setSelectedSportImmediate(sport);
    }
    return setSelectedSportDebounced(sport);
  }, [setSelectedSportImmediate, setSelectedSportDebounced]);

  // Fetch user profile to get favorite sports
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile", String(user?.id ?? "")],
    enabled: !!user,
  });

  const availableSports = (profile?.favoriteSports || []) as Sport[];

  // Set default sport to first favorite sport when profile loads
  // Use immediate setter to avoid debounced callback identity changes causing repeated effects
  useEffect(() => {
    if (availableSports.length > 0) {
      if (!selectedSport || !availableSports.includes(selectedSport)) {
        setSelectedSport(availableSports[0], true);
      }
    } else {
      setSelectedSport(null, true);
    }
  }, [availableSports, selectedSport, setSelectedSportImmediate]);

  // Prefetch user team scores for favorite sports to prime caches
  useEffect(() => {
    if (!availableSports.length) return;
    (async () => {
      try {
        await userTeamScoresCacheUtils.prefetchMultipleSports(
          queryClient,
          availableSports,
          {
            limit: 10,
            enableRealTimeUpdates: true,
            refetchInterval: 30000,
          }
        );
      } catch (e) {
        console.warn('Prefetch favorite sports failed:', e);
      }
    })();
  }, [availableSports, queryClient]);

  // Refresh scores manually
  const refreshScores = useCallback(async () => {
    if (!user?.id || !selectedSport) return;

    startLoading('refresh-scores', 'Refreshing scores...');
    setScores(prev => ({ ...prev, isRefreshing: true, error: null }));

    try {
      updateProgress(25, 'refresh-scores', 'Fetching latest scores...');
      
      const response = await apiRequest('POST', `/api/scores/refresh?sport=${selectedSport}`);

      updateProgress(75, 'refresh-scores', 'Processing scores...');
      const refreshedScores = await response.json();
      
      setScores(prev => ({
        ...prev,
        scores: {
          ...prev.scores,
          ...refreshedScores.reduce((acc: Record<string, ScoreData>, score: ScoreData) => {
            acc[score.gameId] = score;
            return acc;
          }, {}),
        },
        lastRefresh: new Date().toISOString(),
        isRefreshing: false,
        error: null,
      }));

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['userTeamScores'] });
      queryClient.invalidateQueries({ queryKey: ['gameScores'] });

      stopLoading('refresh-scores');

    } catch (error) {
      console.error('Failed to refresh scores:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh scores';
      
      // Use error handler for advanced error handling
      const errorId = await errorHandler.handleError(
        error instanceof Error ? error : new Error(errorMessage),
        {
          operation: 'refresh-scores',
          sport: selectedSport,
          userId: user?.id,
        }
      );
      
      setScores(prev => ({
        ...prev,
        isRefreshing: false,
        error: errorMessage,
      }));
      
      setLoadingError(error instanceof Error ? error : new Error(errorMessage), 'refresh-scores');
    }
  }, [user?.id, selectedSport, queryClient, startLoading, updateProgress, stopLoading, setLoadingError]);

  // Get score for a specific game
  const getScoreForGame = useCallback((gameId: string): ScoreData | undefined => {
    return scores.scores[gameId] || undefined;
  }, [scores.scores]);

  // Get all scores for a specific team
  const getScoresForTeam = useCallback((teamId: string): ScoreData[] => {
    return Object.values(scores.scores).filter(score => 
      score.homeTeam === teamId || score.awayTeam === teamId
    );
  }, [scores.scores]);

  // Subscribe to sport updates
  const subscribeToSport = useCallback((sport: Sport) => {
    subscribeToUserTeams(sport);
  }, [subscribeToUserTeams]);

  // Unsubscribe from sport updates
  const unsubscribeFromSport = useCallback((sport: Sport) => {
    unsubscribeFromUserTeams(sport);
  }, [unsubscribeFromUserTeams]);

  // Auto-subscribe to current sport when it changes
  useEffect(() => {
    if (isConnectedToRealTime && selectedSport) {
      subscribeToSport(selectedSport);
    }

    return () => {
      if (isConnectedToRealTime && selectedSport) {
        unsubscribeFromSport(selectedSport);
      }
    };
  }, [selectedSport, isConnectedToRealTime, subscribeToSport, unsubscribeFromSport]);

  // Enhanced cleanup effect for sport changes
  useEffect(() => {
    return () => {
      // Cleanup subscriptions on unmount or sport change
      if (selectedSport) {
        unsubscribeFromUserTeams(selectedSport);
      }
    };
  }, [selectedSport, unsubscribeFromUserTeams]);

  const contextValue: SportContextType = {
    selectedSport,
    setSelectedSport,
    availableSports,
    scores,
    refreshScores,
    getScoreForGame,
    getScoresForTeam,
    subscribeToTeam,
    unsubscribeFromTeam,
    subscribeToSport,
    unsubscribeFromSport,
    isTransitioning,
    lastSportChange,
    savedScrollPosition: scrollPosition,
    // Cross-sport data management
    getCachedScores,
    refreshSportCache,
    clearSportCache,
    getCacheStatus,
    // Loading states
    loadingState: {
      isLoading: loadingIsActive,
      progress: loadingProgress,
      message: loadingMessage,
      error: loadingError,
    },
    startLoading,
    stopLoading,
    updateProgress,
    setLoadingError,
    // Error handling
    errorHandler: {
      handleError: errorHandler.handleError,
      retry: errorHandler.retry,
      clearError: errorHandler.clearError,
      reportError: errorHandler.reportError,
      error: errorHandler.error,
      errorId: errorHandler.errorId,
      isRetrying: errorHandler.isRetrying,
      retryCount: errorHandler.retryCount,
      hasRecovered: errorHandler.hasRecovered,
    },
  };

  return (
    <SportContext.Provider value={contextValue}>
      {children}
    </SportContext.Provider>
  );
};

// ============================================================================
// HOOK
// ============================================================================

export function useSport() {
  const context = useContext(SportContext);
  if (context === undefined) {
    throw new Error('useSport must be used within a SportProvider');
  }
  return context;
}
