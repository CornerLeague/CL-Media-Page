import { DepthChartEntry } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';

interface DepthChartSectionProps {
  depthChart: DepthChartEntry[];
  teamName?: string;
  isLoading?: boolean;
  error?: Error | null;
}

export const DepthChartSection = ({ depthChart, teamName, isLoading, error }: DepthChartSectionProps) => {
  // Group players by position
  const groupedByPosition = depthChart.reduce((acc, player) => {
    if (!acc[player.position]) {
      acc[player.position] = [];
    }
    acc[player.position].push(player);
    return acc;
  }, {} as Record<string, DepthChartEntry[]>);

  // Sort players within each position by depth order
  Object.keys(groupedByPosition).forEach(position => {
    groupedByPosition[position].sort((a, b) => a.depth_order - b.depth_order);
  });

  if (error) {
    return (
      <section className="w-full px-4 sm:px-6 md:px-8 lg:px-12 py-8">
        <div className="text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400 p-4 rounded-lg border">
          <p className="text-sm">Unable to load depth chart</p>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full px-4 sm:px-6 md:px-8 lg:px-12 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-display font-semibold text-lg text-foreground">
            Depth Chart
            {teamName && <span className="text-muted-foreground"> - {teamName}</span>}
          </h2>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-6 w-20" />
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, playerIndex) => (
                    <Skeleton key={playerIndex} className="h-12 w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Depth Chart Grid */}
        {!isLoading && !error && (
          <div className="space-y-6">
            {Object.keys(groupedByPosition).length > 0 ? (
              Object.entries(groupedByPosition).map(([position, players]) => (
                <div key={position} className="space-y-3">
                  {/* Position Header */}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-medium">
                      {position}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {players.length} player{players.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Players Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {players.map((player, index) => (
                      <div
                        key={`${player.position}-${player.depth_order}`}
                        className="bg-card rounded-lg border border-border/20 p-3 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={index === 0 ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {index === 0 ? 'Starter' : `${index + 1}${index === 1 ? 'st' : index === 2 ? 'nd' : index === 3 ? 'rd' : 'th'}`}
                            </Badge>
                            {player.jersey_number && (
                              <span className="text-xs text-muted-foreground">
                                #{player.jersey_number}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="font-medium text-sm text-foreground">
                            {player.player_name}
                          </p>
                          {player.experience && (
                            <p className="text-xs text-muted-foreground">
                              {player.experience}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 bg-card/50 rounded-lg border border-border/20">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No depth chart data available
                  {teamName && ` for ${teamName}`}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};