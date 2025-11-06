import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ScoreComparisonService, 
  getScoreComparisonService, 
  resetScoreComparisonService,
  type ScoreComparison,
  type ScoreComparisonConfig 
} from '../scoreComparisonService';
import type { UserTeamScoreUpdate } from '@/hooks/useWebSocket';
import type { Sport } from '@/data/sportsTeams';

describe('ScoreComparisonService', () => {
  let service: ScoreComparisonService;

  beforeEach(() => {
    resetScoreComparisonService();
    service = new ScoreComparisonService();
  });

  describe('Basic Score Comparison', () => {
    it('should detect no change when scores are identical', () => {
      const update = createMockUpdate('game1', 'NFL', 14, 7, 'live');
      
      // First update establishes baseline
      const firstComparison = service.compareScores(update);
      expect(firstComparison.changeType).toBe('game-start');
      
      // Second identical update should show no change
      const secondComparison = service.compareScores(update);
      expect(secondComparison.hasChanged).toBe(false);
      expect(secondComparison.changeType).toBe('no-change');
      expect(secondComparison.isSignificant).toBe(false);
    });

    it('should detect score increases', () => {
      const initialUpdate = createMockUpdate('game1', 'NFL', 14, 7, 'live');
      const updatedScore = createMockUpdate('game1', 'NFL', 17, 7, 'live');
      
      service.compareScores(initialUpdate);
      const comparison = service.compareScores(updatedScore);
      
      expect(comparison.hasChanged).toBe(true);
      expect(comparison.changeType).toBe('significant-score-change');
      expect(comparison.isSignificant).toBe(true);
      expect(comparison.scoreDifference.homeDifference).toBe(3);
      expect(comparison.scoreDifference.awayDifference).toBe(0);
      expect(comparison.scoreDifference.totalDifference).toBe(3);
    });

    it('should detect score decreases (corrections)', () => {
      const initialUpdate = createMockUpdate('game1', 'NFL', 14, 7, 'live');
      const correctedScore = createMockUpdate('game1', 'NFL', 7, 7, 'live');
      
      service.compareScores(initialUpdate);
      const comparison = service.compareScores(correctedScore);
      
      expect(comparison.hasChanged).toBe(true);
      // The implementation treats score corrections as significant changes
      expect(comparison.changeType).toBe('significant-score-change');
      expect(comparison.scoreDifference.homeDifference).toBe(-7);
      expect(comparison.scoreDifference.totalDifference).toBe(7);
    });
  });

  describe('Status Change Detection', () => {
    it('should detect game start', () => {
      const update = createMockUpdate('game1', 'NFL', 0, 0, 'live');
      const comparison = service.compareScores(update);
      
      expect(comparison.changeType).toBe('game-start');
      expect(comparison.isSignificant).toBe(true);
    });

    it('should detect game end', () => {
      const liveUpdate = createMockUpdate('game1', 'NFL', 21, 14, 'live');
      const finalUpdate = createMockUpdate('game1', 'NFL', 21, 14, 'final');
      
      service.compareScores(liveUpdate);
      const comparison = service.compareScores(finalUpdate);
      
      expect(comparison.changeType).toBe('game-end');
      expect(comparison.isSignificant).toBe(true);
      expect(comparison.metadata.statusChanged).toBe(true);
    });

    it('should detect halftime', () => {
      const liveUpdate = createMockUpdate('game1', 'NFL', 14, 7, 'live');
      const halftimeUpdate = createMockUpdate('game1', 'NFL', 14, 7, 'halftime');
      
      service.compareScores(liveUpdate);
      const comparison = service.compareScores(halftimeUpdate);
      
      expect(comparison.changeType).toBe('halftime');
      expect(comparison.isSignificant).toBe(true);
    });

    it('should detect overtime', () => {
      const liveUpdate = createMockUpdate('game1', 'NFL', 21, 21, 'live');
      const overtimeUpdate = createMockUpdate('game1', 'NFL', 21, 21, 'overtime');
      
      service.compareScores(liveUpdate);
      const comparison = service.compareScores(overtimeUpdate);
      
      expect(comparison.changeType).toBe('overtime');
      expect(comparison.isSignificant).toBe(true);
    });
  });

  describe('Sport-Specific Rules', () => {
    it('should apply NFL-specific minimum score difference', () => {
      const config: ScoreComparisonConfig = {
        sportSpecificRules: {
          'NFL': {
            minScoreDifference: 3,
            significantStatuses: ['live', 'final'],
            significantPeriods: ['1st', '2nd', '3rd', '4th'],
            treatAllScoreChangesAsSignificant: true,
          }
        }
      };
      
      const nflService = new ScoreComparisonService(config);
      const initialUpdate = createMockUpdate('game1', 'NFL', 7, 0, 'live');
      const smallChange = createMockUpdate('game1', 'NFL', 8, 0, 'live'); // 1 point change
      const significantChange = createMockUpdate('game1', 'NFL', 10, 0, 'live'); // 3 point change
      
      nflService.compareScores(initialUpdate);
      
      // Small change should still be significant for NFL due to treatAllScoreChangesAsSignificant
      const smallComparison = nflService.compareScores(smallChange);
      expect(smallComparison.isSignificant).toBe(true);
      
      // Reset and test significant change
      nflService.compareScores(initialUpdate);
      const significantComparison = nflService.compareScores(significantChange);
      expect(significantComparison.isSignificant).toBe(true);
    });

    it('should apply NBA-specific rules', () => {
      const config: ScoreComparisonConfig = {
        sportSpecificRules: {
          'NBA': {
            minScoreDifference: 2,
            significantStatuses: ['live', 'final'],
            significantPeriods: ['1st', '2nd', '3rd', '4th'],
            treatAllScoreChangesAsSignificant: false,
          }
        }
      };
      
      const nbaService = new ScoreComparisonService(config);
      const initialUpdate = createMockUpdate('game1', 'NBA', 50, 48, 'live');
      const smallChange = createMockUpdate('game1', 'NBA', 51, 48, 'live'); // 1 point change
      const significantChange = createMockUpdate('game1', 'NBA', 52, 48, 'live'); // 2 point change
      
      nbaService.compareScores(initialUpdate);
      
      // Small change should not be significant for NBA
      const smallComparison = nbaService.compareScores(smallChange);
      expect(smallComparison.isSignificant).toBe(false);
      
      // Reset and test significant change
      nbaService.compareScores(initialUpdate);
      const significantComparison = nbaService.compareScores(significantChange);
      expect(significantComparison.isSignificant).toBe(true);
    });
  });

  describe('Period and Time Changes', () => {
    it('should detect period changes', () => {
      const firstQuarter = createMockUpdateWithPeriod('game1', 'NFL', 7, 0, 'live', '1st');
      const secondQuarter = createMockUpdateWithPeriod('game1', 'NFL', 7, 0, 'live', '2nd');
      
      service.compareScores(firstQuarter);
      const comparison = service.compareScores(secondQuarter);
      
      expect(comparison.changeType).toBe('period-change');
      expect(comparison.metadata.periodChanged).toBe(true);
    });

    it('should detect time remaining changes', () => {
      const earlyTime = createMockUpdateWithTime('game1', 'NFL', 7, 0, 'live', '15:00');
      const laterTime = createMockUpdateWithTime('game1', 'NFL', 7, 0, 'live', '14:30');
      
      service.compareScores(earlyTime);
      const comparison = service.compareScores(laterTime);
      
      expect(comparison.changeType).toBe('time-update');
      expect(comparison.metadata.timeChanged).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null/undefined previous scores', () => {
      const update = createMockUpdate('new-game', 'NFL', 0, 0, 'scheduled');
      const comparison = service.compareScores(update);
      
      expect(comparison.changeType).toBe('game-start');
      expect(comparison.previousScores.homeScore).toBe(0);
      expect(comparison.previousScores.awayScore).toBe(0);
      expect(comparison.previousScores.status).toBe('scheduled');
    });

    it('should handle missing properties gracefully', () => {
      const updateWithMissingData: UserTeamScoreUpdate['payload'] = {
        userId: 'user1',
        teamId: 'team1',
        teamName: 'Test Team',
        sport: 'NFL',
        gameData: {
          gameId: 'game1',
          homeTeam: 'Home Team',
          awayTeam: 'Away Team',
          homeScore: 10,
          awayScore: 7,
          status: 'live',
          // Missing quarter and timeRemaining
        },
        timestamp: new Date().toISOString(),
        isUserTeam: true,
      };
      
      expect(() => {
        service.compareScores(updateWithMissingData);
      }).not.toThrow();
    });

    it('should handle rapid successive updates', () => {
      const gameId = 'rapid-game';
      const updates = [
        createMockUpdate(gameId, 'NBA', 10, 8, 'live'),
        createMockUpdate(gameId, 'NBA', 12, 8, 'live'),
        createMockUpdate(gameId, 'NBA', 12, 10, 'live'),
        createMockUpdate(gameId, 'NBA', 14, 10, 'live'),
      ];
      
      let previousComparison: ScoreComparison | null = null;
      
      updates.forEach((update, index) => {
        const comparison = service.compareScores(update);
        
        if (index === 0) {
          expect(comparison.changeType).toBe('game-start');
        } else {
          expect(comparison.hasChanged).toBe(true);
          expect(comparison.previousScores).toEqual(previousComparison?.currentScores);
        }
        
        previousComparison = comparison;
      });
    });
  });

  describe('Performance and State Management', () => {
    it('should maintain separate state for different games', () => {
      const game1Update = createMockUpdate('game1', 'NFL', 7, 0, 'live');
      const game2Update = createMockUpdate('game2', 'NFL', 14, 3, 'live');
      
      const game1Comparison = service.compareScores(game1Update);
      const game2Comparison = service.compareScores(game2Update);
      
      expect(game1Comparison.metadata.gameId).toBe('game1');
      expect(game2Comparison.metadata.gameId).toBe('game2');
      expect(service.getGameState('game1')).toBeDefined();
      expect(service.getGameState('game2')).toBeDefined();
    });

    it('should clear game state correctly', () => {
      const update = createMockUpdate('game1', 'NFL', 7, 0, 'live');
      service.compareScores(update);
      
      expect(service.getGameState('game1')).toBeDefined();
      service.clearGameState('game1');
      expect(service.getGameState('game1')).toBeUndefined();
    });

    it('should clear all states correctly', () => {
      const updates = [
        createMockUpdate('game1', 'NFL', 7, 0, 'live'),
        createMockUpdate('game2', 'NBA', 50, 48, 'live'),
        createMockUpdate('game3', 'MLB', 3, 2, 'live'),
      ];
      
      updates.forEach(update => service.compareScores(update));
      
      expect(service.getGameState('game1')).toBeDefined();
      expect(service.getGameState('game2')).toBeDefined();
      expect(service.getGameState('game3')).toBeDefined();
      
      service.clearAllStates();
      
      expect(service.getGameState('game1')).toBeUndefined();
      expect(service.getGameState('game2')).toBeUndefined();
      expect(service.getGameState('game3')).toBeUndefined();
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration correctly', () => {
      const initialConfig: ScoreComparisonConfig = {
        minSignificantDifference: 1,
        considerTimeUpdates: false,
      };
      
      const configService = new ScoreComparisonService(initialConfig);
      
      const newConfig: Partial<ScoreComparisonConfig> = {
        minSignificantDifference: 3,
        considerTimeUpdates: true,
      };
      
      configService.updateConfig(newConfig);
      
      // Test that the new configuration is applied
      const update1 = createMockUpdateWithTime('game1', 'NFL', 7, 0, 'live', '15:00');
      const update2 = createMockUpdateWithTime('game1', 'NFL', 7, 0, 'live', '14:30');
      
      configService.compareScores(update1);
      const comparison = configService.compareScores(update2);
      
      // Time updates should now be considered significant
      expect(comparison.changeType).toBe('time-update');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getScoreComparisonService();
      const instance2 = getScoreComparisonService();
      
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton correctly', () => {
      const instance1 = getScoreComparisonService();
      resetScoreComparisonService();
      const instance2 = getScoreComparisonService();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});

// Helper functions for creating mock data
const createMockUpdate = (
  gameId: string,
  sport: Sport,
  homeScore: number,
  awayScore: number,
  status: string = 'In Progress',
  quarter?: string,
  timeRemaining?: string
): UserTeamScoreUpdate['payload'] => ({
  userId: 'user1',
  teamId: 'team1',
  teamName: 'Test Team',
  sport,
  gameData: {
    gameId,
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    homeScore,
    awayScore,
    status,
    quarter: quarter || '1st',
    timeRemaining: timeRemaining || '15:00'
  },
  timestamp: new Date().toISOString(),
  isUserTeam: true
});

const createMockUpdateWithPeriod = (
  gameId: string,
  sport: Sport,
  homeScore: number,
  awayScore: number,
  status: string,
  quarter: string
): UserTeamScoreUpdate['payload'] => ({
  userId: 'user1',
  teamId: 'team1',
  teamName: 'Test Team',
  sport,
  gameData: {
    gameId,
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    homeScore,
    awayScore,
    status,
    quarter,
    timeRemaining: '15:00'
  },
  timestamp: new Date().toISOString(),
  isUserTeam: true
});

const createMockUpdateWithTime = (
  gameId: string,
  sport: Sport,
  homeScore: number,
  awayScore: number,
  status: string,
  timeRemaining: string
): UserTeamScoreUpdate['payload'] => ({
  userId: 'user1',
  teamId: 'team1',
  teamName: 'Test Team',
  sport,
  gameData: {
    gameId,
    homeTeam: 'Home Team',
    awayTeam: 'Away Team',
    homeScore,
    awayScore,
    status,
    quarter: '1st',
    timeRemaining
  },
  timestamp: new Date().toISOString(),
  isUserTeam: true
});