import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';

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
}

export const ScoresWidget = ({ latestScore, recentResults, teamName }: ScoresWidgetProps) => {
  const getStatusDisplay = (status: string, period?: string, timeRemaining?: string) => {
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
  };

  const getResultIcon = (result: 'W' | 'L' | 'T') => {
    if (result === 'W') {
      return <TrendingUp className="w-3 h-3 text-green-600" />;
    } else if (result === 'L') {
      return <TrendingDown className="w-3 h-3 text-red-600" />;
    }
    return null;
  };

  const getResultColor = (result: 'W' | 'L' | 'T') => {
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
  };

  return (
    <div className="space-y-4" data-testid="scores-widget">
      {/* Latest Score */}
      {latestScore && (
        <div className="bg-card/50 rounded-lg p-3 sm:p-4 border border-border/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-sm text-foreground">Latest Game</h3>
            <Badge variant="outline" className="text-xs" data-testid="status-badge">
              {getStatusDisplay(latestScore.status, latestScore.period, latestScore.timeRemaining)}
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
        </div>
      )}

      {/* Recent Results */}
      {recentResults.length > 0 && (
        <div className="bg-card/50 rounded-lg p-3 sm:p-4 border border-border/20">
          <h3 className="font-display font-semibold text-sm text-foreground mb-3">Recent Results</h3>

          <div className="space-y-2">
            {recentResults.slice(0, 5).map((result) => (
              <div key={result.gameId} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-2" data-testid={`result-${result.gameId}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {getResultIcon(result.result)}
                  <Badge variant="outline" className={`text-xs ${getResultColor(result.result)}`}>
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
        <div className="bg-card/50 rounded-lg p-4 border border-border/20 text-center">
          <p className="text-sm text-muted-foreground">
            No recent game data available
            {teamName && ` for ${teamName}`}
          </p>
        </div>
      )}
    </div>
  );
};
