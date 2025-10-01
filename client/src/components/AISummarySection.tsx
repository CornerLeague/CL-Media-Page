import { useState, useEffect } from 'react';
import { ScoresWidget, GameScore, RecentResult } from './ScoresWidget';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSport } from '@/contexts/SportContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import type { UserProfile } from '@shared/schema';
import { TEAMS_BY_SPORT } from '@/data/sportsTeams';

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

export const AISummarySection = ({ teamDashboard, isLoading, error }: AISummarySectionProps) => {
  const { selectedSport } = useSport();
  const { user } = useAuth();
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);

  // Fetch user profile to get favorite teams
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile", user?.uid],
    enabled: !!user?.uid,
  });

  // Get all the user's favorite teams for the selected sport
  const getFavoriteTeamsForSport = () => {
    if (!selectedSport || !profile?.favoriteTeams) {
      return [];
    }

    // Get all teams for the selected sport (only team-based sports have teams)
    const sportTeams = TEAMS_BY_SPORT[selectedSport as keyof typeof TEAMS_BY_SPORT];
    if (!sportTeams) {
      return [];
    }

    // Flatten all teams in the sport
    const allSportTeams = Object.values(sportTeams).flat();

    // Find all favorite teams that match this sport
    const favoriteTeams = profile.favoriteTeams.filter(team => 
      allSportTeams.includes(team)
    );

    return favoriteTeams;
  };

  const favoriteTeams = getFavoriteTeamsForSport();
  
  // Reset index when sport changes or teams change
  useEffect(() => {
    setCurrentTeamIndex(0);
  }, [selectedSport, favoriteTeams.length]);

  const currentFullTeamName = favoriteTeams[currentTeamIndex] || teamDashboard?.team.name || selectedSport || 'TEAM';
  
  // Extract just the team name (last word) without the city
  const displayTeamName = currentFullTeamName.split(' ').pop() || currentFullTeamName;

  const hasMultipleTeams = favoriteTeams.length > 1;

  const handlePreviousTeam = () => {
    setCurrentTeamIndex((prev) => 
      prev === 0 ? favoriteTeams.length - 1 : prev - 1
    );
  };

  const handleNextTeam = () => {
    setCurrentTeamIndex((prev) => 
      prev === favoriteTeams.length - 1 ? 0 : prev + 1
    );
  };

  if (error) {
    return (
      <section className="flex-1 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12 py-8" data-testid="section-ai-summary">
        <div className="max-w-2xl text-center space-y-4 w-full">
          <div className="text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 p-4 rounded-lg border">
            <p className="text-sm">Unable to load team data</p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex-1 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8" data-testid="section-ai-summary">
      <div className="max-w-2xl text-center space-y-3 sm:space-y-4 w-full">
        {/* Team Name */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-32 mx-auto" />
            <Skeleton className="h-16 w-48 mx-auto" />
          </div>
        ) : (
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
              <span className="block text-secondary dark:text-foreground mt-2 text-7xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-9xl font-bold" data-testid="text-team-name">
                {displayTeamName.toUpperCase()}
              </span>
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
        )}

        {/* AI Summary */}
        {teamDashboard?.summary && (
          <div className="mt-4 sm:mt-6 mb-4 sm:mb-6 px-2 sm:px-4">
            <p className="font-body text-muted-foreground text-xs sm:text-sm leading-relaxed" data-testid="text-ai-summary">
              {teamDashboard.summary.text}
            </p>
          </div>
        )}

        {/* Scores Widget */}
        <div className="max-w-sm sm:max-w-md mx-auto w-full mt-4 sm:mt-8">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <ScoresWidget
              latestScore={teamDashboard?.latestScore}
              recentResults={teamDashboard?.recentResults || []}
              teamName={displayTeamName}
            />
          )}
        </div>
      </div>
    </section>
  );
};
