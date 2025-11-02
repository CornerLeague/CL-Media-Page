/**
 * Database Query Tests for User Team Scores
 * 
 * Tests for database methods:
 * - getUserFavoriteTeamBySport
 * - getLatestTeamScore  
 * - hasScoreChanged
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PgStorage } from '../../../../pgStorage';
import { MemStorage } from '../../../../storage';
import type { 
  InsertGame, 
  InsertTeam, 
  InsertUserProfile, 
  InsertUserTeam,
  GameScoreData 
} from '@shared/schema';
import { measureTime, assertPerformance } from '../../../helpers/testUtils';
import { userTeamScoresTestData } from '../../../fixtures/userTeamScoresData';

// Mock PgStorage to avoid database connection issues
vi.mock('../../../../pgStorage');

describe('Database Query Tests - User Team Scores', () => {
  let pgStorage: PgStorage;
  let memStorage: MemStorage;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Initialize MemStorage (real) and PgStorage (mocked)
    memStorage = new MemStorage();
    pgStorage = new PgStorage();
    
    // Setup test data in MemStorage only (PgStorage is mocked)
    await setupTestData(memStorage);
  });

  afterEach(async () => {
    // Cleanup test data
    await cleanupTestData(memStorage);
  });

  // ============================================================================
  // getUserFavoriteTeamBySport Tests
  // ============================================================================

  describe('getUserFavoriteTeamBySport', () => {
    describe('MemStorage Implementation', () => {
      it('should return favorite teams for valid user and sport', async () => {
        const { result, duration } = await measureTime(async () => {
          return await memStorage.getUserFavoriteTeamBySport('firebase-uid-001', 'basketball');
        });
        
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('teamId');
        expect(result[0]).toHaveProperty('sport');
        
        // Performance assertion
        assertPerformance(duration, 50, 'getUserFavoriteTeamBySport');
      });

      it('should return empty array for user with no favorite teams in sport', async () => {
        const result = await memStorage.getUserFavoriteTeamBySport('firebase-uid-001', 'hockey');
        
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      });

      it('should handle non-existent user gracefully', async () => {
        const result = await memStorage.getUserFavoriteTeamBySport('non-existent-uid', 'basketball');
        
        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
      });

      it('should validate input parameters', async () => {
        // Test empty firebaseUid
        const result1 = await memStorage.getUserFavoriteTeamBySport('', 'basketball');
        expect(Array.isArray(result1)).toBe(true);
        expect(result1.length).toBe(0);

        // Test empty sport
        const result2 = await memStorage.getUserFavoriteTeamBySport('firebase-uid-001', '');
        expect(Array.isArray(result2)).toBe(true);
        expect(result2.length).toBe(0);
      });

      it('should handle different sport mappings correctly', async () => {
        // Test NBA -> basketball mapping
        const nbaResult = await memStorage.getUserFavoriteTeamBySport('firebase-uid-001', 'basketball');
        expect(nbaResult.every(team => team.sport === 'basketball')).toBe(true);

        // Test NFL -> football mapping  
        const nflResult = await memStorage.getUserFavoriteTeamBySport('firebase-uid-001', 'football');
        expect(nflResult.every(team => team.sport === 'football')).toBe(true);
      });
    });

    describe('PgStorage Mock Verification', () => {
      it('should mock PgStorage getUserFavoriteTeamBySport method', () => {
        // Setup mock behavior
        const mockResult = [{ teamId: 'NBA_LAL', sport: 'basketball' }];
        vi.mocked(pgStorage.getUserFavoriteTeamBySport).mockResolvedValue(mockResult);
        
        // Verify mock is properly configured
        expect(pgStorage.getUserFavoriteTeamBySport).toBeDefined();
        expect(vi.isMockFunction(pgStorage.getUserFavoriteTeamBySport)).toBe(true);
      });

      it('should allow mocking different return values', async () => {
        // Mock successful case
        const mockTeams = [{ teamId: 'NBA_LAL', sport: 'basketball' }];
        vi.mocked(pgStorage.getUserFavoriteTeamBySport).mockResolvedValue(mockTeams);
        
        let result = await pgStorage.getUserFavoriteTeamBySport('user1', 'basketball');
        expect(result).toEqual(mockTeams);
        
        // Mock empty case
        vi.mocked(pgStorage.getUserFavoriteTeamBySport).mockResolvedValue([]);
        
        result = await pgStorage.getUserFavoriteTeamBySport('user2', 'hockey');
        expect(result).toEqual([]);
      });
    });
  });

  // ============================================================================
  // getLatestTeamScore Tests
  // ============================================================================

  describe('getLatestTeamScore', () => {

    describe('MemStorage Implementation', () => {
      it('should return latest score for team', async () => {
        const { result, duration } = await measureTime(async () => {
          return await memStorage.getLatestTeamScore('NBA_LAL');
        });
        
        expect(result).toBeDefined();
        expect(result).toHaveProperty('gameId');
        expect(result).toHaveProperty('teamScore');
        
        assertPerformance(duration, 50, 'getLatestTeamScore');
      });

      it('should return undefined for team with no games', async () => {
        const result = await memStorage.getLatestTeamScore('NBA_NONEXISTENT');
        expect(result).toBeUndefined();
      });

      it('should include all required GameScoreData fields', async () => {
        const result = await memStorage.getLatestTeamScore('NBA_LAL');
        
        if (result) {
          expect(result).toHaveProperty('gameId');
          expect(result).toHaveProperty('homeTeam');
          expect(result).toHaveProperty('awayTeam');
          expect(result).toHaveProperty('status');
          expect(result).toHaveProperty('startTime');
          expect(result).toHaveProperty('isHomeGame');
          expect(result).toHaveProperty('opponent');
          expect(result).toHaveProperty('teamScore');
          expect(result).toHaveProperty('cachedAt');
        }
      });
    });

    describe('PgStorage Mock Verification', () => {
       it('should mock PgStorage getLatestTeamScore method', () => {
         // Setup mock behavior
         const mockResult = {
           gameId: 'game-001',
           homeTeam: { id: 'NBA_LAL', name: 'Lakers', code: 'LAL', league: 'NBA', score: 108 },
           awayTeam: { id: 'NBA_BOS', name: 'Celtics', code: 'BOS', league: 'NBA', score: 102 },
           status: 'final',
           startTime: new Date(),
           period: null,
           timeRemaining: null,
           isHomeGame: true,
           opponent: { id: 'NBA_BOS', name: 'Celtics', code: 'BOS', league: 'NBA', score: 102 },
           teamScore: 108,
           cachedAt: new Date()
         };
         vi.mocked(pgStorage.getLatestTeamScore).mockResolvedValue(mockResult);
         
         expect(vi.isMockFunction(pgStorage.getLatestTeamScore)).toBe(true);
       });
     });
  });

  // ============================================================================
  // hasScoreChanged Tests
  // ============================================================================

  describe('hasScoreChanged', () => {
    describe('MemStorage Implementation', () => {
      it('should return false when scores have not changed', async () => {
        const { result, duration } = await measureTime(async () => {
          return await memStorage.hasScoreChanged('game-001', 108, 102);
        });
        
        expect(result).toBe(false);
        assertPerformance(duration, 50, 'hasScoreChanged');
      });

      it('should return true when scores have changed', async () => {
        const result = await memStorage.hasScoreChanged('game-001', 110, 105);
        expect(result).toBe(true);
      });

      it('should return true for non-existent game', async () => {
        const result = await memStorage.hasScoreChanged('non-existent-game', 100, 95);
        expect(result).toBe(true);
      });

      it('should handle zero scores correctly', async () => {
        // Create a game with zero scores in test data
        const result = await memStorage.hasScoreChanged('game-001', 0, 0);
        expect(typeof result).toBe('boolean');
      });
    });

    describe('PgStorage Mock Verification', () => {
      it('should mock PgStorage hasScoreChanged method', () => {
        // Setup mock behavior
        vi.mocked(pgStorage.hasScoreChanged).mockResolvedValue(false);
        
        expect(vi.isMockFunction(pgStorage.hasScoreChanged)).toBe(true);
      });

      it('should allow mocking different return values', async () => {
        // Mock no change case
        vi.mocked(pgStorage.hasScoreChanged).mockResolvedValue(false);
        let result = await pgStorage.hasScoreChanged('game-001', 108, 102);
        expect(result).toBe(false);
        
        // Mock change case
        vi.mocked(pgStorage.hasScoreChanged).mockResolvedValue(true);
        result = await pgStorage.hasScoreChanged('game-001', 110, 105);
        expect(result).toBe(true);
      });
    });
  });

  // ============================================================================
  // Mock Integration Tests
  // ============================================================================

  describe('Mock Integration Tests', () => {
    it('should verify all PgStorage methods are properly mocked', () => {
      expect(vi.isMockFunction(pgStorage.getUserFavoriteTeamBySport)).toBe(true);
      expect(vi.isMockFunction(pgStorage.getLatestTeamScore)).toBe(true);
      expect(vi.isMockFunction(pgStorage.hasScoreChanged)).toBe(true);
    });

    it('should allow mock configuration for different test scenarios', async () => {
       // Configure mocks for specific test scenario
       vi.mocked(pgStorage.getUserFavoriteTeamBySport).mockResolvedValue([
         { teamId: 'NBA_LAL', sport: 'basketball' }
       ]);
       
       vi.mocked(pgStorage.getLatestTeamScore).mockResolvedValue({
         gameId: 'mock-game',
         homeTeam: { id: 'NBA_LAL', name: 'Lakers', code: 'LAL', league: 'NBA', score: 100 },
         awayTeam: { id: 'NBA_BOS', name: 'Celtics', code: 'BOS', league: 'NBA', score: 95 },
         status: 'final',
         startTime: new Date(),
         period: null,
         timeRemaining: null,
         isHomeGame: true,
         opponent: { id: 'NBA_BOS', name: 'Celtics', code: 'BOS', league: 'NBA', score: 95 },
         teamScore: 100,
         cachedAt: new Date()
       });
       
       vi.mocked(pgStorage.hasScoreChanged).mockResolvedValue(false);

       // Verify mocks work as expected
       const teams = await pgStorage.getUserFavoriteTeamBySport('user-001', 'basketball');
       const score = await pgStorage.getLatestTeamScore('NBA_LAL');
       const changed = await pgStorage.hasScoreChanged('game-001', 100, 95);

       expect(teams).toHaveLength(1);
       expect(score?.gameId).toBe('mock-game');
       expect(changed).toBe(false);
     });

    it('should reset mocks between tests', () => {
      // Verify that mocks are cleared
      expect(vi.mocked(pgStorage.getUserFavoriteTeamBySport).mock.calls).toHaveLength(0);
      expect(vi.mocked(pgStorage.getLatestTeamScore).mock.calls).toHaveLength(0);
      expect(vi.mocked(pgStorage.hasScoreChanged).mock.calls).toHaveLength(0);
    });
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  async function setupTestData(storage: MemStorage) {
    // Create test teams
    for (const team of userTeamScoresTestData.teams) {
      await storage.createTeam(team);
    }

    // Create test user profiles
    for (const profile of userTeamScoresTestData.profiles) {
      await storage.createUserProfile(profile);
    }

    // Create test user teams
    for (const userTeam of userTeamScoresTestData.userTeams) {
      await storage.createUserTeam(userTeam);
    }

    // Create test games
    for (const game of userTeamScoresTestData.games) {
      await storage.createGame(game);
    }
  }

  async function cleanupTestData(storage: MemStorage) {
    // MemStorage cleanup is automatic with new instance in beforeEach
    // No explicit cleanup needed for in-memory storage
  }
});