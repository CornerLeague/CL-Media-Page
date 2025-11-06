import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { ScoresWidget, GameScore, RecentResult } from './ScoresWidget';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useSport } from '@/contexts/SportContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useUserTeamScores } from '@/hooks/useUserTeamScores';
import type { UserProfile } from '@shared/schema';
import { TEAMS_BY_SPORT, sportHasTeams } from '@/data/sportsTeams';
import { cn } from '@/lib/utils';
import { 
  LoadingCard, 
  SportTransitionLoading, 
  LoadingOverlay 
} from '@/components/ui/loading-states';
import { 
  ErrorCard, 
  ConnectionError, 
  SportError 
} from '@/components/ui/error-states';
import { StateManager } from '@/components/ui/state-manager';
import { LoadingErrorBoundary } from '@/components/LoadingErrorBoundary';

export interface TeamDashboard {
  team: {
    id: string;
    name: string;
  };
  summary?: {
    text: string;
  };
  latestScore?: GameScore;
  recentResults?: RecentResult[];
}

interface AISummarySectionProps {
  teamDashboard?: TeamDashboard;
  isLoading?: boolean;
  error?: Error | null;
}

// AI Summary Skeleton Component - now using reusable LoadingCard
const AISummarySkeleton = () => (
  <section className="flex-1 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8" data-testid="section-ai-summary">
    <div className="max-w-2xl w-full">
      <LoadingCard 
        title="Loading team data..."
        description="Getting the latest scores and updates"
        showSpinner={true}
        className="max-w-sm mx-auto"
      />
    </div>
  </section>
);

// AI Summary Error Component - now using reusable ErrorCard
const AISummaryError = ({ error, onRetry, isWebSocketConnected }: { 
  error: Error; 
  onRetry: () => void;
  isWebSocketConnected: boolean;
}) => (
  <section className="flex-1 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12 py-8" data-testid="section-ai-summary">
    <div className="max-w-2xl w-full">
      {!isWebSocketConnected ? (
        <ConnectionError 
          onRetry={onRetry}
          className="max-w-sm mx-auto"
        />
      ) : (
        <ErrorCard
          title="Unable to load team data"
          message={error.message}
          variant="destructive"
          onRetry={onRetry}
          retryLabel="Try Again"
          className="max-w-sm mx-auto"
        />
      )}
    </div>
  </section>
);

export const AISummarySection = memo(({ teamDashboard, isLoading, error }: AISummarySectionProps) => {
  const { selectedSport, isTransitioning, lastSportChange } = useSport();
  const { user } = useAuth();
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [previousSport, setPreviousSport] = useState(selectedSport);

  // Fetch user profile to get favorite teams
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile", String(user?.id ?? "")],
    enabled: !!user,
  });

  // Get all the user's favorite teams for the selected sport - memoized
  const favoriteTeams = useMemo(() => {
    if (!selectedSport || !profile?.favoriteTeams) {
      return [];
    }

    const sportTeams = TEAMS_BY_SPORT[selectedSport as keyof typeof TEAMS_BY_SPORT];
    if (!sportTeams) {
      return [];
    }

    const allSportTeams = Object.values(sportTeams).flat();
    const favoriteTeams = profile.favoriteTeams.filter(team => 
      allSportTeams.includes(team)
    );

    return favoriteTeams;
  }, [selectedSport, profile?.favoriteTeams]);

  const currentTeam = useMemo(() => favoriteTeams[currentTeamIndex], [favoriteTeams, currentTeamIndex]);

  // Use the useUserTeamScores hook for real-time data
  const {
    data: userTeamScores,
    isLoading: scoresLoading,
    error: scoresError,
    isWebSocketConnected,
    webSocketState,
    refetch: refetchScores,
    // Utility functions
    hasLiveGames,
    hasScheduledGames,
    getGamesByStatus,
    getUserTeamGames,
    subscribeToRealTimeUpdates,
  } = useUserTeamScores({
    sport: selectedSport as any, // Type assertion to handle undefined
    limit: 10,
    enableRealTimeUpdates: true,
    refetchInterval: 30000, // 30 seconds fallback
  });

  // Reset index when sport changes or teams change
  useEffect(() => {
    setCurrentTeamIndex(0);
  }, [selectedSport, favoriteTeams.length]);

  // Track sport changes for smooth transitions
  useEffect(() => {
    if (selectedSport !== previousSport) {
      setPreviousSport(selectedSport);
    }
  }, [selectedSport, previousSport]);

  // Generate AI summary based on user team scores
  const generateAISummary = () => {
    if (!userTeamScores?.games?.length || !currentTeam) {
      return null;
    }

    const teamGames = getUserTeamGames();
    const liveGames = getGamesByStatus('live');
    const recentGames = getGamesByStatus('final').slice(0, 3);

    let summaryText = '';

    if (liveGames.length > 0) {
      const liveGame = liveGames.find(game => 
        game.homeTeam === currentTeam || game.awayTeam === currentTeam
      );
      if (liveGame) {
        summaryText = `${currentTeam} is currently playing live! `;
        if (liveGame.homeScore !== undefined && liveGame.awayScore !== undefined) {
          const isHome = liveGame.homeTeam === currentTeam;
          const teamScore = isHome ? liveGame.homeScore : liveGame.awayScore;
          const opponentScore = isHome ? liveGame.awayScore : liveGame.homeScore;
          const opponent = isHome ? liveGame.awayTeam : liveGame.homeTeam;
          
          if (teamScore > opponentScore) {
            summaryText += `Leading ${teamScore}-${opponentScore} against ${opponent}.`;
          } else if (teamScore < opponentScore) {
            summaryText += `Trailing ${opponentScore}-${teamScore} to ${opponent}.`;
          } else {
            summaryText += `Tied ${teamScore}-${teamScore} with ${opponent}.`;
          }
        }
      }
    } else if (recentGames.length > 0) {
      const recentGame = recentGames.find(game => 
        game.homeTeam === currentTeam || game.awayTeam === currentTeam
      );
      if (recentGame) {
        const isHome = recentGame.homeTeam === currentTeam;
        const teamScore = isHome ? recentGame.homeScore : recentGame.awayScore;
        const opponentScore = isHome ? recentGame.awayScore : recentGame.homeScore;
        const opponent = isHome ? recentGame.awayTeam : recentGame.homeTeam;
        
        if (teamScore !== undefined && opponentScore !== undefined) {
          if (teamScore > opponentScore) {
            summaryText = `${currentTeam} won their last game ${teamScore}-${opponentScore} against ${opponent}.`;
          } else {
            summaryText = `${currentTeam} lost their last game ${opponentScore}-${teamScore} to ${opponent}.`;
          }
        }
      }
    }

    const upcomingGames = getGamesByStatus('scheduled').slice(0, 1);
    if (upcomingGames.length > 0) {
      const nextGame = upcomingGames.find(game => 
        game.homeTeam === currentTeam || game.awayTeam === currentTeam
      );
      if (nextGame) {
        const isHome = nextGame.homeTeam === currentTeam;
        const opponent = isHome ? nextGame.awayTeam : nextGame.homeTeam;
        const gameTime = nextGame.startTime ? new Date(nextGame.startTime).toLocaleDateString() : 'soon';
        summaryText += ` Next up: ${isHome ? 'vs' : '@'} ${opponent} on ${gameTime}.`;
      }
    }

    return summaryText || `Stay updated with ${currentTeam}'s latest scores and upcoming games.`;
  };

  // Determine what to display
  let displayTeamName = 'TEAM';
  
  if (selectedSport && !sportHasTeams(selectedSport)) {
    displayTeamName = selectedSport;
  } else {
    const currentFullTeamName = currentTeam || selectedSport || teamDashboard?.team.name || 'TEAM';
    displayTeamName = currentFullTeamName.split(' ').pop() || currentFullTeamName;
  }

  const hasMultipleTeams = favoriteTeams.length > 1;

  const handlePreviousTeam = useCallback(() => {
    setCurrentTeamIndex((prev) => 
      prev === 0 ? favoriteTeams.length - 1 : prev - 1
    );
  }, [favoriteTeams.length]);

  const handleNextTeam = useCallback(() => {
    setCurrentTeamIndex((prev) => 
      prev === favoriteTeams.length - 1 ? 0 : prev + 1
    );
  }, [favoriteTeams.length]);

  const handleRetry = useCallback(() => {
    refetchScores();
  }, [refetchScores]);

  // Combine loading states - include transition state
  const combinedLoading = isLoading || scoresLoading || isTransitioning;
  const combinedError = error || (scoresError ? new Error(scoresError.message) : null);

  // Generate personalized summary
  const aiSummary = useMemo(() => generateAISummary() || teamDashboard?.summary?.text, [currentTeam, teamDashboard?.summary?.text]);

  // Convert user team scores to ScoresWidget format
  const currentTeamGames = useMemo(() => currentTeam ? getUserTeamGames() : [], [currentTeam, getUserTeamGames]);
  const latestGame = useMemo(() => currentTeamGames[0], [currentTeamGames]);
  const recentResults: RecentResult[] = useMemo(() => currentTeamGames.slice(1, 4).map((game, index) => {
    const isHome = game.homeTeam === currentTeam;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const opponentScore = isHome ? game.awayScore : game.homeScore;
    const opponent = isHome ? game.awayTeam : game.homeTeam;
    
    return {
      gameId: game.gameId,
      opponent,
      result: (teamScore ?? 0) > (opponentScore ?? 0) ? 'W' as const : 'L' as const,
      diff: Math.abs((teamScore ?? 0) - (opponentScore ?? 0)),
      date: game.startTime,
    };
  }), [currentTeamGames, currentTeam]);

  const latestScore: GameScore | undefined = useMemo(() => latestGame ? {
    status: latestGame.status,
    period: latestGame.period,
    timeRemaining: latestGame.timeRemaining,
    home: {
      id: latestGame.homeTeam,
      name: latestGame.homeTeam,
      pts: latestGame.homeScore,
    },
    away: {
      id: latestGame.awayTeam,
      name: latestGame.awayTeam,
      pts: latestGame.awayScore,
    },
  } : teamDashboard?.latestScore, [latestGame, teamDashboard?.latestScore]);

  // Get last updated time from the data
  const lastUpdated = userTeamScores?.lastUpdated ? new Date(userTeamScores.lastUpdated) : null;

  return (
    <section className="flex-1 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8" data-testid="section-ai-summary">
      <LoadingErrorBoundary
        loading={{ isLoading: combinedLoading, loadingMessage: "Loading team data..." }}
        error={{ hasError: !!combinedError, error: combinedError ?? undefined, retryable: true }}
        connection={{
          isConnected: !!isWebSocketConnected,
          isConnecting: webSocketState === 'connecting',
          connectionState: webSocketState ?? (isWebSocketConnected ? 'connected' : 'disconnected'),
        }}
        onRetry={handleRetry}
        onReconnect={subscribeToRealTimeUpdates}
      >
      <div 
        className={cn(
          "max-w-2xl text-center space-y-3 sm:space-y-4 w-full transition-all duration-300 ease-in-out",
          isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
        )}
      >
        {/* WebSocket Connection Status */}
        {currentTeam && (
          <div className="flex items-center justify-center gap-2 mb-2">
            {isTransitioning ? (
              <SportTransitionLoading 
                sportName={selectedSport || undefined}
                className="text-xs"
              />
            ) : isWebSocketConnected ? (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Wifi className="h-3 w-3" />
                <span>Live Updates</span>
                {hasLiveGames && (
                  <span className="animate-pulse bg-red-500 text-white px-1 py-0.5 rounded text-xs font-bold ml-1">
                    LIVE
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <WifiOff className="h-3 w-3" />
                <span>Offline</span>
              </div>
            )}
            {lastUpdated && !isTransitioning && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {/* Team Name */}
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          {hasMultipleTeams && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePreviousTeam}
              className="h-10 w-10 sm:h-12 sm:w-12"
              data-testid="button-previous-team"
            >
              <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8" />
            </Button>
          )}
          
          <h1 className="font-display font-bold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-foreground leading-tight">
            <span 
              className={cn(
                "block mt-2 text-7xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-9xl font-bold",
                currentTeam ? "text-primary dark:text-primary" : "text-secondary dark:text-foreground"
              )}
              data-testid="text-team-name"
            >
              {String(displayTeamName || 'TEAM').toUpperCase()}
            </span>
            {currentTeam && (
              <span className="block text-xs text-primary/70 dark:text-primary/70 mt-1 font-normal">
                Your Team
              </span>
            )}
          </h1>

          {hasMultipleTeams && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextTeam}
              className="h-10 w-10 sm:h-12 sm:w-12"
              data-testid="button-next-team"
            >
              <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8" />
            </Button>
          )}
        </div>

        {/* AI Summary */}
        {aiSummary && (
          <div className="mt-4 sm:mt-6 mb-4 sm:mb-6 px-2 sm:px-4">
            <p className="font-body text-muted-foreground text-xs sm:text-sm leading-relaxed" data-testid="text-ai-summary">
              {aiSummary}
            </p>
          </div>
        )}

        {/* Scores Widget */}
        <div className="max-w-sm sm:max-w-md mx-auto w-full mt-4 sm:mt-8">
          <ScoresWidget
            latestScore={latestScore}
            recentResults={recentResults}
            teamName={displayTeamName}
            isUserTeam={!!currentTeam}
            isLoading={false}
            error={null}
            isWebSocketConnected={isWebSocketConnected}
            onRetry={handleRetry}
            lastUpdated={lastUpdated}
          />
        </div>
      </div>
      </LoadingErrorBoundary>
    </section>
  );
});
