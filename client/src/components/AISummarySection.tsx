import { ScoresWidget, GameScore, RecentResult } from './ScoresWidget';
import { Skeleton } from '@/components/ui/skeleton';
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

  // Fetch user profile to get favorite teams
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/profile", user?.uid],
    enabled: !!user?.uid,
  });

  // Get the user's favorite team for the selected sport
  const getFavoriteTeamForSport = () => {
    if (!selectedSport || !profile?.favoriteTeams) {
      return null;
    }

    // Get all teams for the selected sport
    const sportTeams = TEAMS_BY_SPORT[selectedSport];
    if (!sportTeams) {
      return null;
    }

    // Flatten all teams in the sport
    const allSportTeams = Object.values(sportTeams).flat();

    // Find the first favorite team that matches this sport
    const favoriteTeam = profile.favoriteTeams.find(team => 
      allSportTeams.includes(team)
    );

    return favoriteTeam || null;
  };

  const fullTeamName = getFavoriteTeamForSport() || teamDashboard?.team.name || 'TEAM';
  
  // Extract just the team name (last word) without the city
  const displayTeamName = fullTeamName.split(' ').pop() || fullTeamName;

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
          <h1 className="font-display font-bold text-xl sm:text-2xl md:text-3xl lg:text-4xl text-foreground leading-tight">
            <span className="block text-secondary dark:text-foreground mt-2 text-7xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-9xl font-bold" data-testid="text-team-name">
              {displayTeamName.toUpperCase()}
            </span>
          </h1>
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
