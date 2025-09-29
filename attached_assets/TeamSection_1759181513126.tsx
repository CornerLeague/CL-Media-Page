/**
 * TeamSection Component
 *
 * Displays user's selected teams from onboarding with team-specific content
 * and navigation. Shows team cards with recent results, upcoming games, and quick actions.
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, TrendingUp, TrendingDown, Calendar, Star } from "lucide-react";
import { type TeamDashboard } from "@/lib/api-client";
import { type UserPreferences } from "@/hooks/useAuth";

interface TeamSectionProps {
  teams: UserPreferences['teams'];
  teamDashboards?: TeamDashboard[];
  isLoading?: boolean;
  error?: Error | null;
  onTeamClick?: (teamId: string) => void;
}

export function TeamSection({
  teams,
  teamDashboards = [],
  isLoading = false,
  error = null,
  onTeamClick
}: TeamSectionProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const handleTeamClick = (teamId: string) => {
    setSelectedTeamId(teamId);
    onTeamClick?.(teamId);
  };

  // Don't render if no teams selected
  if (!isLoading && teams.length === 0) {
    return null;
  }

  return (
    <section className="w-full">
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display font-semibold text-xl text-foreground">
            Your Teams
          </h2>
          <Badge variant="secondary" className="font-body text-xs">
            {teams.length} {teams.length === 1 ? 'team' : 'teams'}
          </Badge>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {Array.from({ length: Math.min(teams.length, 3) }).map((_, index) => (
              <Card key={index} className="h-40">
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-32 mb-3" />
                  <Skeleton className="h-4 w-24 mb-4" />
                  <Skeleton className="h-8 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8">
            <p className="text-sm text-red-700 dark:text-red-400">
              Unable to load team information
            </p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-1">{error.message}</p>
          </div>
        )}

        {/* Teams Grid */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {teams.map((team) => {
              const dashboard = teamDashboards.find(d => d.team.id === team.teamId);
              return (
                <TeamCard
                  key={team.teamId}
                  team={team}
                  dashboard={dashboard}
                  isSelected={selectedTeamId === team.teamId}
                  onClick={() => handleTeamClick(team.teamId)}
                />
              );
            })}
          </div>
        )}

        {/* Quick Actions */}
        {!isLoading && !error && teams.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="font-body">
              <Calendar className="w-4 h-4 mr-2" />
              View All Games
            </Button>
            <Button variant="outline" size="sm" className="font-body">
              <Star className="w-4 h-4 mr-2" />
              Manage Teams
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

interface TeamCardProps {
  team: UserPreferences['teams'][0];
  dashboard?: TeamDashboard;
  isSelected: boolean;
  onClick: () => void;
}

function TeamCard({ team, dashboard, isSelected, onClick }: TeamCardProps) {
  // Calculate recent performance
  const recentResults = dashboard?.recentResults?.slice(0, 3) || [];
  const wins = recentResults.filter(r => r.result === 'W').length;
  const losses = recentResults.filter(r => r.result === 'L').length;

  // Get latest score if available
  const latestScore = dashboard?.latestScore;
  const isLive = latestScore?.status === 'LIVE';
  const isUpcoming = latestScore?.status === 'SCHEDULED';

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 hover:shadow-md
        ${isSelected ? 'ring-2 ring-primary border-primary' : 'border-border/20'}
        ${dashboard ? 'hover:border-primary/30' : ''}
      `}
      onClick={onClick}
    >
      <CardContent className="p-6">
        {/* Team Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="font-display font-semibold text-base text-foreground mb-1">
              {dashboard?.team?.name || team.name}
            </h3>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-body">
                {team.league}
              </Badge>
              <span className="text-xs text-muted-foreground font-body">
                Affinity: {Math.round(team.affinityScore * 100)}%
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>

        {/* Team Status */}
        {dashboard && (
          <div className="space-y-3">
            {/* Latest Game */}
            {latestScore && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-body">
                    {isLive ? 'Live' : isUpcoming ? 'Next' : 'Latest'}
                  </span>
                  {isLive && (
                    <Badge variant="destructive" className="text-xs animate-pulse">
                      LIVE
                    </Badge>
                  )}
                </div>
                <div className="text-sm font-medium font-body">
                  {latestScore.home.name} {latestScore.home.pts} - {latestScore.away.pts} {latestScore.away.name}
                </div>
                {latestScore.period && (
                  <div className="text-xs text-muted-foreground font-body">
                    {latestScore.period} {latestScore.timeRemaining && `• ${latestScore.timeRemaining}`}
                  </div>
                )}
              </div>
            )}

            {/* Recent Form */}
            {recentResults.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground font-body">Recent Form</div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {recentResults.map((result, index) => (
                      <div
                        key={index}
                        className={`
                          w-6 h-6 rounded-sm flex items-center justify-center text-xs font-bold
                          ${result.result === 'W'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          }
                        `}
                      >
                        {result.result}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                    {wins > losses ? (
                      <TrendingUp className="w-3 h-3 text-green-600" />
                    ) : losses > wins ? (
                      <TrendingDown className="w-3 h-3 text-red-600" />
                    ) : null}
                    {wins}-{losses}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Data State */}
        {!dashboard && (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground font-body">
              Team data loading...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TeamSection;