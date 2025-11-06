import type { UserTeamScoreUpdate } from '@/hooks/useWebSocket';
import type { Sport } from '@/data/sportsTeams';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface ScoreComparison {
  /** Whether the scores have changed */
  hasChanged: boolean;
  /** Whether this is a significant change worth updating UI */
  isSignificant: boolean;
  /** The type of change detected */
  changeType: ScoreChangeType;
  /** Previous scores */
  previousScores: GameScores;
  /** Current scores */
  currentScores: GameScores;
  /** Score differences */
  scoreDifference: ScoreDifference;
  /** Additional metadata about the change */
  metadata: ChangeMetadata;
}

export interface GameScores {
  homeScore: number;
  awayScore: number;
  status: string;
  period?: string;
  timeRemaining?: string;
}

export interface ScoreDifference {
  homeDifference: number;
  awayDifference: number;
  totalDifference: number;
}

export interface ChangeMetadata {
  /** Timestamp of the comparison */
  timestamp: number;
  /** Game ID being compared */
  gameId: string;
  /** Sport type */
  sport: Sport;
  /** Whether this involves the user's team */
  isUserTeam: boolean;
  /** Previous game status */
  previousStatus?: string;
  /** Status change detected */
  statusChanged: boolean;
  /** Period change detected */
  periodChanged: boolean;
  /** Time change detected */
  timeChanged: boolean;
}

export type ScoreChangeType = 
  | 'no-change'
  | 'score-increase'
  | 'score-decrease'
  | 'status-change'
  | 'period-change'
  | 'time-update'
  | 'significant-score-change'
  | 'game-start'
  | 'game-end'
  | 'halftime'
  | 'overtime';

export interface ScoreComparisonConfig {
  /** Minimum score difference to consider significant */
  minSignificantDifference?: number;
  /** Whether to consider status changes as significant */
  considerStatusChanges?: boolean;
  /** Whether to consider period changes as significant */
  considerPeriodChanges?: boolean;
  /** Whether to consider time updates as significant */
  considerTimeUpdates?: boolean;
  /** Sport-specific significance rules */
  sportSpecificRules?: Partial<Record<Sport, SportSpecificConfig>>;
}

export interface SportSpecificConfig {
  /** Minimum score difference for this sport */
  minScoreDifference: number;
  /** Important status transitions */
  significantStatuses: string[];
  /** Important periods */
  significantPeriods: string[];
  /** Whether small score changes are significant */
  treatAllScoreChangesAsSignificant: boolean;
}

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

const DEFAULT_CONFIG: Required<ScoreComparisonConfig> = {
  minSignificantDifference: 1,
  considerStatusChanges: true,
  considerPeriodChanges: true,
  considerTimeUpdates: false,
  sportSpecificRules: {
    'NFL': {
      minScoreDifference: 3, // Field goals are common
      significantStatuses: ['live', 'final', 'halftime'],
      significantPeriods: ['1st', '2nd', '3rd', '4th', 'OT'],
      treatAllScoreChangesAsSignificant: true,
    },
    'NBA': {
      minScoreDifference: 2, // Frequent scoring
      significantStatuses: ['live', 'final', 'halftime'],
      significantPeriods: ['1st', '2nd', '3rd', '4th', 'OT'],
      treatAllScoreChangesAsSignificant: false,
    },
    'MLB': {
      minScoreDifference: 1, // Every run matters
      significantStatuses: ['live', 'final', 'rain-delay'],
      significantPeriods: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'],
      treatAllScoreChangesAsSignificant: true,
    },
    'NHL': {
      minScoreDifference: 1, // Goals are less frequent
      significantStatuses: ['live', 'final', 'intermission'],
      significantPeriods: ['1st', '2nd', '3rd', 'OT', 'SO'],
      treatAllScoreChangesAsSignificant: true,
    },
    'Soccer': {
      minScoreDifference: 1, // Goals are rare and important
      significantStatuses: ['live', 'final', 'halftime'],
      significantPeriods: ['1st', '2nd', 'ET1', 'ET2', 'PK'],
      treatAllScoreChangesAsSignificant: true,
    },
  },
};

// ============================================================================
// SCORE COMPARISON SERVICE
// ============================================================================

export class ScoreComparisonService {
  private config: Required<ScoreComparisonConfig>;
  private gameStates: Map<string, GameScores> = new Map();

  constructor(config: ScoreComparisonConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Compare current score update with previous state
   */
  public compareScores(
    update: UserTeamScoreUpdate['payload'],
    gameId?: string
  ): ScoreComparison {
    const currentGameId = gameId || update.gameData.gameId;
    const previousState = this.gameStates.get(currentGameId);
    
    const currentScores: GameScores = {
      homeScore: update.gameData.homeScore,
      awayScore: update.gameData.awayScore,
      status: update.gameData.status,
      period: update.gameData.quarter,
      timeRemaining: update.gameData.timeRemaining,
    };

    // If no previous state, this is the first update
    if (!previousState) {
      this.gameStates.set(currentGameId, currentScores);
      return this.createComparison(
        { homeScore: 0, awayScore: 0, status: 'scheduled' },
        currentScores,
        'game-start',
        update,
        currentGameId
      );
    }

    // Calculate differences
    const scoreDifference: ScoreDifference = {
      homeDifference: currentScores.homeScore - previousState.homeScore,
      awayDifference: currentScores.awayScore - previousState.awayScore,
      totalDifference: Math.abs(currentScores.homeScore - previousState.homeScore) + 
                      Math.abs(currentScores.awayScore - previousState.awayScore),
    };

    // Determine change type and significance
    const changeType = this.determineChangeType(previousState, currentScores, scoreDifference, update.sport);
    const isSignificant = this.isSignificantChange(changeType, scoreDifference, update.sport, previousState, currentScores);

    // Update stored state
    this.gameStates.set(currentGameId, currentScores);

    return this.createComparison(
      previousState,
      currentScores,
      changeType,
      update,
      currentGameId,
      scoreDifference,
      isSignificant
    );
  }

  /**
   * Get current game state
   */
  public getGameState(gameId: string): GameScores | undefined {
    return this.gameStates.get(gameId);
  }

  /**
   * Clear game state (useful for cleanup)
   */
  public clearGameState(gameId: string): void {
    this.gameStates.delete(gameId);
  }

  /**
   * Clear all game states
   */
  public clearAllStates(): void {
    this.gameStates.clear();
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<ScoreComparisonConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private determineChangeType(
    previous: GameScores,
    current: GameScores,
    scoreDiff: ScoreDifference,
    sport: Sport
  ): ScoreChangeType {
    // Check for game state changes first
    if (previous.status !== current.status) {
      if (current.status === 'final') return 'game-end';
      if (current.status === 'live' && previous.status === 'scheduled') return 'game-start';
      if (current.status === 'halftime') return 'halftime';
      if (current.status.includes('OT') || current.status.includes('overtime')) return 'overtime';
      return 'status-change';
    }

    // Check for period changes
    if (previous.period !== current.period) {
      return 'period-change';
    }

    // Check for time updates
    if (previous.timeRemaining !== current.timeRemaining) {
      return 'time-update';
    }

    // Check for score changes
    if (scoreDiff.totalDifference > 0) {
      const sportConfig = this.config.sportSpecificRules[sport as keyof typeof this.config.sportSpecificRules];
      if (sportConfig?.treatAllScoreChangesAsSignificant || 
          scoreDiff.totalDifference >= (sportConfig?.minScoreDifference || this.config.minSignificantDifference)) {
        return 'significant-score-change';
      }
      return scoreDiff.homeDifference > 0 || scoreDiff.awayDifference > 0 ? 'score-increase' : 'score-decrease';
    }

    return 'no-change';
  }

  private isSignificantChange(
    changeType: ScoreChangeType,
    scoreDiff: ScoreDifference,
    sport: Sport,
    previous: GameScores,
    current: GameScores
  ): boolean {
    const sportConfig = this.config.sportSpecificRules[sport as keyof typeof this.config.sportSpecificRules];

    switch (changeType) {
      case 'no-change':
        return false;

      case 'significant-score-change':
      case 'game-start':
      case 'game-end':
      case 'overtime':
        return true;

      case 'score-increase':
      case 'score-decrease':
        if (sportConfig?.treatAllScoreChangesAsSignificant) return true;
        return scoreDiff.totalDifference >= (sportConfig?.minScoreDifference || this.config.minSignificantDifference);

      case 'status-change':
        if (!this.config.considerStatusChanges) return false;
        return sportConfig?.significantStatuses.includes(current.status) || false;

      case 'period-change':
        if (!this.config.considerPeriodChanges) return false;
        return sportConfig?.significantPeriods.includes(current.period || '') || false;

      case 'halftime':
        return true; // Halftime is always significant

      case 'time-update':
        return this.config.considerTimeUpdates;

      default:
        return false;
    }
  }

  private createComparison(
    previous: GameScores,
    current: GameScores,
    changeType: ScoreChangeType,
    update: UserTeamScoreUpdate['payload'],
    gameId: string,
    scoreDifference?: ScoreDifference,
    isSignificant?: boolean
  ): ScoreComparison {
    const diff = scoreDifference || {
      homeDifference: current.homeScore - previous.homeScore,
      awayDifference: current.awayScore - previous.awayScore,
      totalDifference: Math.abs(current.homeScore - previous.homeScore) + 
                      Math.abs(current.awayScore - previous.awayScore),
    };

    return {
      hasChanged: changeType !== 'no-change',
      isSignificant: isSignificant ?? (changeType !== 'no-change' && changeType !== 'time-update'),
      changeType,
      previousScores: previous,
      currentScores: current,
      scoreDifference: diff,
      metadata: {
        timestamp: Date.now(),
        gameId,
        sport: update.sport,
        isUserTeam: update.isUserTeam,
        previousStatus: previous.status,
        statusChanged: previous.status !== current.status,
        periodChanged: previous.period !== current.period,
        timeChanged: previous.timeRemaining !== current.timeRemaining,
      },
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let scoreComparisonServiceInstance: ScoreComparisonService | null = null;

/**
 * Get singleton instance of score comparison service
 */
export function getScoreComparisonService(config?: ScoreComparisonConfig): ScoreComparisonService {
  if (!scoreComparisonServiceInstance) {
    scoreComparisonServiceInstance = new ScoreComparisonService(config);
  }
  return scoreComparisonServiceInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetScoreComparisonService(): void {
  scoreComparisonServiceInstance = null;
}