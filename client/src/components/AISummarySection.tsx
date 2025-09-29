import { ScoresWidget, GameScore, RecentResult } from './ScoresWidget';
import { Skeleton } from '@/components/ui/skeleton';

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
    <section className="flex-1 flex items-center justify-center px-4 sm:px-6 md:px-8 lg:px-12 py-8" data-testid="section-ai-summary">
      <div className="max-w-2xl text-center space-y-4 w-full">
        {/* Team Name */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-32 mx-auto" />
            <Skeleton className="h-16 w-48 mx-auto" />
          </div>
        ) : (
          <h1 className="font-display font-bold text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-foreground leading-tight">
            <span className="block text-secondary dark:text-foreground mt-2 text-6xl sm:text-7xl md:text-8xl lg:text-9xl xl:text-[10rem] font-bold" data-testid="text-team-name">
              {teamDashboard?.team.name?.toUpperCase() || 'TEAM'}
            </span>
          </h1>
        )}

        {/* AI Summary */}
        {teamDashboard?.summary && (
          <div className="mt-8 mb-8 px-4">
            <p className="font-body text-muted-foreground text-sm leading-relaxed" data-testid="text-ai-summary">
              {teamDashboard.summary.text}
            </p>
          </div>
        )}

        {/* Scores Widget */}
        <div className="max-w-sm sm:max-w-md mx-auto w-full mt-8 sm:mt-14">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <ScoresWidget
              latestScore={teamDashboard?.latestScore}
              recentResults={teamDashboard?.recentResults || []}
              teamName={teamDashboard?.team.name}
            />
          )}
        </div>
      </div>
    </section>
  );
};
