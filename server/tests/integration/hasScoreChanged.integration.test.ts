import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storage } from '../../storage';
import type { InsertGame } from '@shared/schema';

describe('hasScoreChanged Integration Tests', () => {
  const testGameId = 'TEST_GAME_INTEGRATION_' + Date.now();
  
  beforeEach(async () => {
    // Create a test game for integration testing
    const testGame: InsertGame = {
      id: testGameId,
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 100,
      awayPts: 95,
      status: 'live',
      startTime: new Date(),
    };
    
    await storage.createGame(testGame);
  });

  afterEach(async () => {
    // Clean up test data
    try {
      // Note: We don't have a deleteGame method, so we'll leave the test data
      // In a real implementation, you might want to add cleanup
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Real Database Operations', () => {
    it('should return false when scores have not changed', async () => {
      const result = await storage.hasScoreChanged(testGameId, 100, 95);
      expect(result).toBe(false);
    });

    it('should return true when home score has changed', async () => {
      const result = await storage.hasScoreChanged(testGameId, 102, 95);
      expect(result).toBe(true);
    });

    it('should return true when away score has changed', async () => {
      const result = await storage.hasScoreChanged(testGameId, 100, 97);
      expect(result).toBe(true);
    });

    it('should return true when both scores have changed', async () => {
      const result = await storage.hasScoreChanged(testGameId, 105, 98);
      expect(result).toBe(true);
    });

    it('should return false for non-existent game', async () => {
      const result = await storage.hasScoreChanged('NONEXISTENT_GAME_ID', 100, 95);
      expect(result).toBe(false);
    });

    it('should handle edge case with zero scores', async () => {
      // Create a game with zero scores
      const zeroGameId = 'ZERO_GAME_' + Date.now();
      const zeroGame: InsertGame = {
        id: zeroGameId,
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 0,
        awayPts: 0,
        status: 'scheduled',
        startTime: new Date(),
      };
      
      await storage.createGame(zeroGame);
      
      // Should return false when checking same zero scores
      const result1 = await storage.hasScoreChanged(zeroGameId, 0, 0);
      expect(result1).toBe(false);
      
      // Should return true when scores change from zero
      const result2 = await storage.hasScoreChanged(zeroGameId, 7, 0);
      expect(result2).toBe(true);
    });
  });

  describe('Performance with Real Database', () => {
    it('should complete within reasonable time', async () => {
      const startTime = Date.now();
      
      await storage.hasScoreChanged(testGameId, 100, 95);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 1 second (generous for database operations)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent calls correctly', async () => {
      const promises = [
        storage.hasScoreChanged(testGameId, 100, 95),
        storage.hasScoreChanged(testGameId, 102, 95),
        storage.hasScoreChanged(testGameId, 100, 97),
        storage.hasScoreChanged(testGameId, 105, 98),
      ];

      const results = await Promise.all(promises);
      
      expect(results[0]).toBe(false); // No change
      expect(results[1]).toBe(true);  // Home score changed
      expect(results[2]).toBe(true);  // Away score changed
      expect(results[3]).toBe(true);  // Both scores changed
    });
  });

  describe('Error Handling with Real Database', () => {
    it('should reject invalid inputs', async () => {
      await expect(storage.hasScoreChanged('', 100, 95)).rejects.toThrow();
      await expect(storage.hasScoreChanged(testGameId, -1, 95)).rejects.toThrow();
      await expect(storage.hasScoreChanged(testGameId, 100, -5)).rejects.toThrow();
      await expect(storage.hasScoreChanged(testGameId, 100.5, 95)).rejects.toThrow();
    });
  });
});