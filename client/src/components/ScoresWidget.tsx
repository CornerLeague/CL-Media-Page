import React, { memo, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Wifi, WifiOff, RefreshCw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSport } from '@/contexts/SportContext';
import { LoadingCard } from '@/components/ui/loading-states';
import { ErrorCard } from '@/components/ui/error-states';
import LoadingIndicator from '@/components/LoadingIndicator';
import { ScoresSkeleton as ComprehensiveScoresSkeleton, ScoreCardSkeleton } from '@/components/ScoresSkeleton';

export interface GameScore {
  status: string;
  period?: string;
  timeRemaining?: string;
  home: {
    id: string;
    name?: string;
    pts: number;
  };
  away: {
    id: string;
    name?: string;
    pts: number;
  };
}

export interface RecentResult {
  gameId: string;
  result: 'W' | 'L' | 'T';
  opponent?: string;
  diff: number;
  date: string;
}

interface ScoresWidgetProps {
  latestScore?: GameScore;
  recentResults: RecentResult[];
  teamName?: string;
  isUserTeam?: boolean;
  isLoading?: boolean;
  error?: Error | null;
  isWebSocketConnected?: boolean;
  onRetry?: () => void;
  lastUpdated?: Date | null;
}

// Loading component for scores using comprehensive skeletons
const ScoresSkeleton = memo(() => (
  <div className="space-y-4" data-testid="scores-skeleton">
    <ComprehensiveScoresSkeleton count={3} showHeader animation="pulse" />
  </div>
));

ScoresSkeleton.displayName = 'ScoresSkeleton';

// Error component for scores using reusable ErrorCard
const ScoresError = memo(({ error, onRetry, teamName }: { 
  error: Error; 
  onRetry?: () => void; 
  teamName?: string; 
}) => (
  <ErrorCard
    title="Unable to load scores"
    message={error.message || `Failed to load game data${teamName ? ` for ${teamName}` : ''}`}
    variant="destructive"
    onRetry={onRetry}
    retryLabel="Try Again"
    className={cn("bg-card/50", "data-[testid='scores-error']")}
  />
));

ScoresError.displayName = 'ScoresError';

export const ScoresWidget = memo(({ 
  latestScore, 
  recentResults, 
  teamName, 
  isUserTeam = false,
  isLoading = false,
  error = null,
  isWebSocketConnected = false,
  onRetry,
  lastUpdated
}: ScoresWidgetProps) => {
  const { isTransitioning, loadingState, refreshScores, errorHandler } = useSport();
  
  // Use SportContext loading state if available, fallback to prop
  const isActuallyLoading = loadingState?.isLoading || isLoading;
  const loadingProgress = loadingState?.progress;
  const loadingMessage = loadingState?.message;
  const loadingError = loadingState?.error || error;

  // Derived operation-specific loading flags
  const isInitialLoading = (isActuallyLoading || isTransitioning) && !latestScore && recentResults.length === 0;
  const isRefreshing = !!(loadingMessage && loadingMessage.toLowerCase().includes('refresh'));
  const isSportChanging = !!isTransitioning;

  // Enhanced error handling with retry functionality
  const handleRetry = useCallback(async () => {
    if (errorHandler.error) {
      // Try to retry the last error first
      const success = await errorHandler.retry();
      if (!success && onRetry) {
        // Fallback to component-specific retry
        onRetry();
      }
    } else if (onRetry) {
      onRetry();
    } else {
      // Default to refreshing scores
      await refreshScores();
    }
  }, [errorHandler, onRetry, refreshScores]);
  
  // Memoize utility functions
  const getStatusDisplay = useCallback((status: string, period?: string, timeRemaining?: string) => {
    switch (status) {
      case 'FINAL':
        return 'FINAL';
      case 'LIVE':
        return timeRemaining ? `${period} ${timeRemaining}` : 'LIVE';
      case 'SCHEDULED':
        return 'SCHEDULED';
      default:
        return status;
    }
  }, []);

  const getResultIcon = useCallback((result: 'W' | 'L' | 'T') => {
    if (result === 'W') {
      return <TrendingUp className="w-3 h-3 text-green-600" />;
    } else if (result === 'L') {
      return <TrendingDown className="w-3 h-3 text-red-600" />;
    }
    return null;
  }, []);

  const getResultColor = useCallback((result: 'W' | 'L' | 'T') => {
    switch (result) {
      case 'W':
        return 'text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400';
      case 'L':
        return 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400';
      case 'T':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400';
      default:
        return 'text-muted-foreground';
    }
  }, []);

  // Memoize computed values
  const statusDisplay = useMemo(() => {
    if (!latestScore) return null;
    return getStatusDisplay(latestScore.status, latestScore.period, latestScore.timeRemaining);
  }, [latestScore, getStatusDisplay]);

  const processedResults = useMemo(() => {
    return recentResults.map(result => ({
      ...result,
      icon: getResultIcon(result.result),
      colorClass: getResultColor(result.result),
    }));
  }, [recentResults, getResultIcon, getResultColor]);

  // User team styling classes
  const userTeamClasses = useMemo(() => {
    if (!isUserTeam) return '';
    return 'ring-2 ring-primary/20 bg-primary/5 border-primary/30';
  }, [isUserTeam]);

  // Show initial loading state or sport-change transition with comprehensive skeleton
  if (isInitialLoading) {
    return (
      <div className="space-y-4" data-testid="scores-skeleton" aria-busy="true" aria-live="polite">
        <ScoresSkeleton />
        <LoadingIndicator
          variant={loadingProgress !== undefined ? 'linear' : 'spinner'}
          progress={loadingProgress}
          message={loadingMessage || (isSportChanging ? 'Switching sport and loading scores...' : 'Loading latest scores...')}
          operation={isSportChanging ? 'sport-change' : 'initial'}
          className="mt-2"
        />
      </div>
    );
  }

  // Show error state
  if (loadingError || errorHandler.error) {
    const displayError = loadingError || errorHandler.error;
    if (displayError) {
      return (
        <ScoresError 
          error={displayError} 
          onRetry={handleRetry} 
          teamName={teamName} 
        />
      );
    }
  }

  return (
    <div 
      className={cn(
        "space-y-4 transition-all duration-300 ease-in-out",
        isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
      )}
      aria-busy={isActuallyLoading || isTransitioning}
      aria-live="polite"
      data-testid="scores-widget"
    >
      {/* Inline operation indicators for refresh and sport-change */}
      {(isRefreshing || isSportChanging) && (
        <LoadingIndicator
          variant={loadingProgress !== undefined ? 'linear' : 'spinner'}
          progress={loadingProgress}
          message={isSportChanging ? 'Switching sport and loading scores...' : (loadingMessage || 'Refreshing scores...')}
          operation={isSportChanging ? 'sport-change' : 'refresh'}
          className="bg-card/50 p-3 rounded-md"
        />
      )}
      {/* Connection Status Indicator */}
      {isUserTeam && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            {isWebSocketConnected ? (
              <>
                <Wifi className="w-3 h-3 text-green-600" />
                <span>Live updates active</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-orange-600" />
                <span>Live updates unavailable</span>
              </>
            )}
          </div>
          {lastUpdated && (
            <span>
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* Latest Score or partial skeleton */}
      {(latestScore ? true : processedResults.length > 0) && (
        <div className={cn(
          "bg-card/50 rounded-lg p-3 sm:p-4 border border-border/20 transition-all duration-200",
          userTeamClasses
        )}>
          {latestScore ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-semibold text-sm text-foreground">Latest Game</h3>
                  {isUserTeam && (
                    <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                      Your Team
                    </Badge>
                  )}
                </div>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    latestScore.status === 'LIVE' && "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800 animate-pulse"
                  )} 
                  data-testid="status-badge"
                >
                  {statusDisplay}
                </Badge>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                  <span className="font-display font-medium text-foreground text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
                    {latestScore.away.name || latestScore.away.id}
                  </span>
                  <span className="font-display font-bold text-foreground text-base sm:text-lg" data-testid="away-score">
                    {latestScore.away.pts}
                  </span>
                </div>

                <div className="text-xs text-muted-foreground px-2">vs</div>

                <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end sm:justify-start">
                  <span className="font-display font-bold text-foreground text-base sm:text-lg" data-testid="home-score">
                    {latestScore.home.pts}
                  </span>
                  <span className="font-display font-medium text-foreground text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none">
                    {latestScore.home.name || latestScore.home.id}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <ScoreCardSkeleton animation="pulse" />
          )}
        </div>
      )}

      {/* Recent Results (with partial loading support) */}
      {recentResults.length > 0 && (
        <div className={cn(
          "bg-card/50 rounded-lg p-3 sm:p-4 border border-border/20 transition-all duration-200",
          userTeamClasses
        )}>
          <h3 className="font-display font-semibold text-sm text-foreground mb-3">Recent Results</h3>

          <div className="space-y-2">
            {processedResults.slice(0, 5).map((result) => (
              <div key={result.gameId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2" data-testid={`result-${result.gameId}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {result.icon}
                  <Badge variant="outline" className={`text-xs ${result.colorClass}`}>
                    {result.result}
                  </Badge>
                  {result.opponent && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-none">vs {result.opponent}</span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {result.diff > 0 ? `+${result.diff}` : result.diff}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(result.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No data state */}
      {!latestScore && recentResults.length === 0 && (
        <div className={cn(
          "bg-card/50 rounded-lg p-4 border border-border/20 text-center",
          userTeamClasses
        )}>
          {isActuallyLoading ? (
            <div className="space-y-2" aria-busy="true">
              <LoadingCard title="Loading recent results..." showSpinner className="bg-card/50" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                No recent game data available
                {teamName && ` for ${teamName}`}
              </p>
              {onRetry && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onRetry}
                  className="mt-2 gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});

ScoresWidget.displayName = 'ScoresWidget';
