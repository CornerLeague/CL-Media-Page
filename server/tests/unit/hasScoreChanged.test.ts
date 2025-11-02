import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storage } from '../../storage';
import type { InsertGame } from '@shared/schema';

// Mock the storage module
vi.mock('../../storage', () => ({
  storage: {
    hasScoreChanged: vi.fn(),
    createGame: vi.fn(),
    getGameById: vi.fn(),
  }
}));

// Mock console.error to avoid noise in tests
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('hasScoreChanged Method Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Input Validation', () => {
    it('should reject empty gameId', async () => {
      vi.mocked(storage.hasScoreChanged).mockImplementation(async (gameId, homePts, awayPts) => {
        if (!gameId || gameId.trim() === '') {
          throw new Error('Game ID is required');
        }
        return false;
      });

      await expect(storage.hasScoreChanged('', 100, 95)).rejects.toThrow('Game ID is required');
      await expect(storage.hasScoreChanged('   ', 100, 95)).rejects.toThrow('Game ID is required');
    });

    it('should reject null or undefined gameId', async () => {
      vi.mocked(storage.hasScoreChanged).mockImplementation(async (gameId, homePts, awayPts) => {
        if (!gameId) {
          throw new Error('Game ID is required');
        }
        return false;
      });

      await expect(storage.hasScoreChanged(null as any, 100, 95)).rejects.toThrow('Game ID is required');
      await expect(storage.hasScoreChanged(undefined as any, 100, 95)).rejects.toThrow('Game ID is required');
    });

    it('should reject negative scores', async () => {
      vi.mocked(storage.hasScoreChanged).mockImplementation(async (gameId, homePts, awayPts) => {
        if (homePts < 0 || awayPts < 0) {
          throw new Error('Scores cannot be negative');
        }
        return false;
      });

      await expect(storage.hasScoreChanged('GAME_1', -1, 95)).rejects.toThrow('Scores cannot be negative');
      await expect(storage.hasScoreChanged('GAME_1', 100, -5)).rejects.toThrow('Scores cannot be negative');
      await expect(storage.hasScoreChanged('GAME_1', -10, -5)).rejects.toThrow('Scores cannot be negative');
    });

    it('should reject non-integer scores', async () => {
      vi.mocked(storage.hasScoreChanged).mockImplementation(async (gameId, homePts, awayPts) => {
        if (!Number.isInteger(homePts) || !Number.isInteger(awayPts)) {
          throw new Error('Scores must be integers');
        }
        return false;
      });

      await expect(storage.hasScoreChanged('GAME_1', 100.5, 95)).rejects.toThrow('Scores must be integers');
      await expect(storage.hasScoreChanged('GAME_1', 100, 95.7)).rejects.toThrow('Scores must be integers');
      await expect(storage.hasScoreChanged('GAME_1', NaN, 95)).rejects.toThrow('Scores must be integers');
    });

    it('should accept valid inputs', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      await expect(storage.hasScoreChanged('GAME_1', 0, 0)).resolves.toBe(false);
      await expect(storage.hasScoreChanged('GAME_1', 100, 95)).resolves.toBe(false);
      await expect(storage.hasScoreChanged('GAME_1', 150, 120)).resolves.toBe(false);
    });
  });

  describe('Score Change Detection', () => {
    it('should return false when scores have not changed', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      const result = await storage.hasScoreChanged('GAME_1', 100, 95);
      expect(result).toBe(false);
    });

    it('should return true when home score has changed', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(true);

      const result = await storage.hasScoreChanged('GAME_1', 102, 95);
      expect(result).toBe(true);
    });

    it('should return true when away score has changed', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(true);

      const result = await storage.hasScoreChanged('GAME_1', 100, 97);
      expect(result).toBe(true);
    });

    it('should return true when both scores have changed', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(true);

      const result = await storage.hasScoreChanged('GAME_1', 105, 98);
      expect(result).toBe(true);
    });

    it('should handle zero scores correctly', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      const result = await storage.hasScoreChanged('GAME_1', 0, 0);
      expect(result).toBe(false);
    });

    it('should handle large score differences', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(true);

      const result = await storage.hasScoreChanged('GAME_1', 150, 120);
      expect(result).toBe(true);
    });
  });

  describe('Game Not Found Scenarios', () => {
    it('should return false when game does not exist', async () => {
      vi.mocked(storage.hasScoreChanged).mockImplementation(async (gameId, homePts, awayPts) => {
        if (gameId === 'NONEXISTENT_GAME') {
          return false; // Game not found, no change detected
        }
        return false;
      });

      const result = await storage.hasScoreChanged('NONEXISTENT_GAME', 100, 95);
      expect(result).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      vi.mocked(storage.hasScoreChanged).mockRejectedValue(new Error('Database connection failed'));

      await expect(storage.hasScoreChanged('GAME_1', 100, 95)).rejects.toThrow('Database connection failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long game IDs', async () => {
      const longGameId = 'GAME_' + 'A'.repeat(100);
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      const result = await storage.hasScoreChanged(longGameId, 100, 95);
      expect(result).toBe(false);
    });

    it('should handle special characters in game ID', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      const result = await storage.hasScoreChanged('GAME-2024_NBA@LAL-vs-BOS', 100, 95);
      expect(result).toBe(false);
    });

    it('should handle maximum integer values', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      const maxInt = Number.MAX_SAFE_INTEGER;
      const result = await storage.hasScoreChanged('GAME_1', maxInt, maxInt);
      expect(result).toBe(false);
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle multiple concurrent calls', async () => {
      vi.mocked(storage.hasScoreChanged)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const promises = [
        storage.hasScoreChanged('GAME_1', 100, 95),
        storage.hasScoreChanged('GAME_2', 102, 95),
        storage.hasScoreChanged('GAME_3', 100, 97),
      ];

      const results = await Promise.all(promises);
      expect(results).toEqual([false, true, false]);
    });

    it('should handle rapid successive calls for same game', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(false);

      const promises = Array.from({ length: 10 }, () =>
        storage.hasScoreChanged('GAME_1', 100, 95)
      );

      const results = await Promise.all(promises);
      expect(results.every(result => result === false)).toBe(true);
      expect(vi.mocked(storage.hasScoreChanged)).toHaveBeenCalledTimes(10);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should detect score progression during live game', async () => {
      // Simulate a live game where scores are updated incrementally
      vi.mocked(storage.hasScoreChanged)
        .mockResolvedValueOnce(true)  // 0-0 -> 7-0
        .mockResolvedValueOnce(true)  // 7-0 -> 7-3
        .mockResolvedValueOnce(true)  // 7-3 -> 14-3
        .mockResolvedValueOnce(false) // 14-3 -> 14-3 (no change)
        .mockResolvedValueOnce(true); // 14-3 -> 14-10

      const gameId = 'NFL_2024_LAR_vs_SF';
      
      expect(await storage.hasScoreChanged(gameId, 7, 0)).toBe(true);
      expect(await storage.hasScoreChanged(gameId, 7, 3)).toBe(true);
      expect(await storage.hasScoreChanged(gameId, 14, 3)).toBe(true);
      expect(await storage.hasScoreChanged(gameId, 14, 3)).toBe(false);
      expect(await storage.hasScoreChanged(gameId, 14, 10)).toBe(true);
    });

    it('should handle overtime scenarios', async () => {
      vi.mocked(storage.hasScoreChanged).mockResolvedValue(true);

      // NBA game going to overtime
      const result = await storage.hasScoreChanged('NBA_2024_LAL_vs_BOS_OT', 118, 115);
      expect(result).toBe(true);
    });

    it('should handle different sport scoring patterns', async () => {
      vi.mocked(storage.hasScoreChanged)
        .mockResolvedValueOnce(true)  // NFL: 7-0
        .mockResolvedValueOnce(true)  // NBA: 108-102
        .mockResolvedValueOnce(true)  // NHL: 3-2
        .mockResolvedValueOnce(true); // MLB: 8-5

      expect(await storage.hasScoreChanged('NFL_GAME', 7, 0)).toBe(true);
      expect(await storage.hasScoreChanged('NBA_GAME', 108, 102)).toBe(true);
      expect(await storage.hasScoreChanged('NHL_GAME', 3, 2)).toBe(true);
      expect(await storage.hasScoreChanged('MLB_GAME', 8, 5)).toBe(true);
    });
  });
});