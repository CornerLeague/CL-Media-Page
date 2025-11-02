export interface GameScore {
  gameId: string;
  homeTeamId: string; // e.g., "NBA_BOS"
  awayTeamId: string; // e.g., "NBA_LAL"
  homePts: number;
  awayPts: number;
  status: "scheduled" | "in_progress" | "final";
  period?: string | null;
  timeRemaining?: string | null;
  startTime: Date;
  source?: string; // e.g., "balldontlie" | "espn"
}

export interface ScheduleGame {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  startTime: Date;
  status: "scheduled" | "in_progress" | "final";
  source?: string;
}

export interface BoxScoreTeamTotals {
  pts: number;
}

export interface BoxScore {
  gameId: string;
  home: BoxScoreTeamTotals;
  away: BoxScoreTeamTotals;
  updatedAt: Date;
  source?: string;
}

export interface ValidatedScores {
  items: GameScore[];
  sourcesChecked: string[];
  accuracy?: number; // optional metric for validation accuracy
}

export interface IScoreSource {
  // Legacy method retained for backward compatibility with existing agent code
  fetchRecentGames(options: { teamIds?: string[]; limit?: number }): Promise<import("@shared/schema").InsertGame[]>;

  // New interface methods (optional for adapters to implement incrementally)
  fetchLive?(teamCodes: string[]): Promise<GameScore[]>; // Multiple teams
  fetchSchedule?(teamCodes: string[], startDate: Date, endDate: Date): Promise<ScheduleGame[]>;
  fetchBoxScore?(gameId: string): Promise<BoxScore>;
  fetchFeaturedGames?(sport: string, limit: number): Promise<ScheduleGame[]>; // For overview mode
}

// User-specific interfaces
export interface UserTeamScoresOptions {
  firebaseUid: string;
  sport?: string;
  limit?: number;
  mode?: 'schedule' | 'live' | 'featured';
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
}

export interface UserFavoriteTeam {
  teamId: string;
  sport: string;
}

export interface UserTeamScoresResult {
  games: import("@shared/schema").Game[];
  userProfile: import("@shared/schema").UserProfile;
  favoriteTeams: UserFavoriteTeam[];
  cacheHit: boolean;
  source: string;
}

// User-specific error class
export class UserTeamScoresError extends Error {
  constructor(
    message: string,
    public code: 'USER_NOT_FOUND' | 'NO_FAVORITE_TEAMS' | 'INVALID_SPORT' | 'FETCH_FAILED',
    public firebaseUid?: string,
    public sport?: string
  ) {
    super(message);
    this.name = 'UserTeamScoresError';
  }
}