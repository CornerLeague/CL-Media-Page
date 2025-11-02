import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ScoresAgent } from '../../agents/scoresAgent';
import { MemStorage } from '../../storage';
import { UserTeamScoresError } from '../../agents/types';
import type { IScoreSource, UserTeamScoresOptions } from '../../agents/types';
import type { Game } from '@shared/schema';

// Mock Redis client
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  connect: vi.fn(),
  status: 'ready'
};

// Mock Redis functions
vi.mock('../../jobs/redis', () => ({
  createRedis: () => mockRedisClient,
  connectRedis: vi.fn().mockResolvedValue(undefined),
  closeRedis: vi.fn().mockResolvedValue(undefined)
}));

// Mock config to enable Redis
vi.mock('../../config', () => ({
  config: {
    redisUrl: 'redis://localhost:6379',
    jobsEnabled: true,
    useMemStorage: true,
    databaseUrl: null
  }
}));

describe('ScoresAgent - User Team Scores Caching', () => {
  let agent: ScoresAgent;
  let mockSource: IScoreSource;
  let storage: MemStorage;

  const mockGames: Game[] = [
    {
      id: 'GAME_1',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 108,
      awayPts: 102,
      status: 'final',
      startTime: new Date('2025-10-31T20:00:00Z'),
      period: null,
      timeRemaining: null,
      cachedAt: new Date()
    },
    {
      id: 'GAME_2',
      homeTeamId: 'NBA_BOS',
      awayTeamId: 'NBA_LAL',
      homePts: 95,
      awayPts: 110,
      status: 'final',
      startTime: new Date('2025-10-30T19:00:00Z'),
      period: null,
      timeRemaining: null,
      cachedAt: new Date()
    }
  ];

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset Redis client mocks
    mockRedisClient.get.mockReset();
    mockRedisClient.set.mockReset();
    
    // Set default Redis mock behavior
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.get.mockResolvedValue(null);
    
    storage = new MemStorage();
    
    mockSource = {
      fetchRecentGames: vi.fn().mockResolvedValue([]),
      fetchLive: vi.fn().mockResolvedValue([]),
      fetchSchedule: vi.fn().mockResolvedValue([]),
      fetchFeaturedGames: vi.fn().mockResolvedValue([])
    };
    
    agent = new ScoresAgent(mockSource, storage);

    // Create test user profile
    await storage.createUserProfile({
      firebaseUid: 'test-user-123',
      firstName: 'Test',
      lastName: 'User',
      favoriteSports: ['NBA'],
      favoriteTeams: ['NBA_LAL', 'NBA_BOS'],
      onboardingCompleted: true
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys', async () => {
      // Test the private method through public interface
      const key1 = (agent as any).makeUserTeamCacheKey('user123', 'NBA', 'live');
      const key2 = (agent as any).makeUserTeamCacheKey('user123', 'NBA', 'live');
      const key3 = (agent as any).makeUserTeamCacheKey('user123', 'NFL', 'live');
      
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key1).toContain('user123');
      expect(key1).toContain('NBA');
      expect(key1).toContain('live');
    });

    it('should handle undefined sport and mode', async () => {
      const key1 = (agent as any).makeUserTeamCacheKey('user123', undefined, undefined);
      const key2 = (agent as any).makeUserTeamCacheKey('user123', undefined, undefined);
      
      expect(key1).toBe(key2);
      expect(key1).toContain('user123');
    });
  });

  describe('Cache Operations', () => {
    it('should cache and retrieve user team scores', async () => {
      const firebaseUid = 'test-user-123';
      const sport = 'NBA';
      const mode = 'live';

      // First call should cache the games
      await agent.cacheUserTeamScores(firebaseUid, sport, mode, mockGames);
      
      // Verify Redis set was called
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('user_team_scores:test-user-123:NBA:live'),
        JSON.stringify(mockGames),
        'EX',
        60
      );

      // Mock Redis get to return cached data for retrieval
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockGames));

      // Retrieve from cache
      const cachedGames = await agent.getCachedUserTeamScores(firebaseUid, sport, mode);

      expect(cachedGames).not.toBeNull();
      expect(cachedGames).toHaveLength(2);
      expect(cachedGames![0].id).toBe('GAME_1');
      expect(cachedGames![1].id).toBe('GAME_2');
      
      // Verify dates are properly deserialized
      expect(cachedGames![0].startTime).toBeInstanceOf(Date);
      expect(cachedGames![0].cachedAt).toBeInstanceOf(Date);
      
      // Verify Redis get was called
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining('user_team_scores:test-user-123:NBA:live')
      );
    });

    it('should return null for cache miss', async () => {
      // Mock Redis get to return null (cache miss)
      mockRedisClient.get.mockResolvedValueOnce(null);
      
      const cachedGames = await agent.getCachedUserTeamScores('nonexistent-user', 'NBA', 'live');
      expect(cachedGames).toBeNull();
    });

    it('should handle different modes with different TTLs', async () => {
      const firebaseUid = 'test-user-123';
      const sport = 'NBA';

      // Cache for live mode (60 seconds TTL)
      await agent.cacheUserTeamScores(firebaseUid, sport, 'live', mockGames);
      
      // Cache for featured mode (300 seconds TTL)  
      await agent.cacheUserTeamScores(firebaseUid, sport, 'featured', mockGames);

      // Mock Redis get to return cached data for both calls
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockGames));
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockGames));

      // Both should be retrievable
      const liveGames = await agent.getCachedUserTeamScores(firebaseUid, sport, 'live');
      const featuredGames = await agent.getCachedUserTeamScores(firebaseUid, sport, 'featured');

      expect(liveGames).not.toBeNull();
      expect(featuredGames).not.toBeNull();
      expect(liveGames).toHaveLength(2);
      expect(featuredGames).toHaveLength(2);
      
      // Verify TTLs were set correctly
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('live'),
        JSON.stringify(mockGames),
        'EX',
        60
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('featured'),
        JSON.stringify(mockGames),
        'EX',
        300
      );
    });
  });

  describe('End-to-End User Team Scores Flow', () => {
    it('should fetch user team scores with cache miss', async () => {
      // Mock the source to return games
      vi.mocked(mockSource.fetchLive!).mockResolvedValue([
        {
          gameId: 'GAME_1',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          homePts: 108,
          awayPts: 102,
          status: 'final',
          startTime: new Date('2025-10-31T20:00:00Z')
        }
      ]);

      const options: UserTeamScoresOptions = {
        firebaseUid: 'test-user-123',
        sport: 'NBA',
        mode: 'live',
        limit: 10
      };

      const result = await agent.fetchUserTeamScores(options);

      expect(result.userProfile).toBeDefined();
      expect(result.userProfile?.firebaseUid).toBe('test-user-123');
      expect(result.favoriteTeams).toHaveLength(2);
      expect(result.favoriteTeams[0]?.sport).toBe('NBA');
      expect(result.cacheHit).toBe(false);
      expect(result.games).toBeDefined();
      expect(result.source).toBe('live');
    });

    it('should handle sport filtering correctly', async () => {
      // Add NFL teams to user profile
      const profile = await storage.getUserProfile('test-user-123');
      if (profile && profile.favoriteTeams && profile.favoriteSports) {
        profile.favoriteTeams.push('NFL_NE', 'NFL_DAL');
        profile.favoriteSports.push('NFL');
        await storage.updateUserProfile(profile.firebaseUid, profile);
      }

      const options: UserTeamScoresOptions = {
        firebaseUid: 'test-user-123',
        sport: 'NBA', // Only NBA
        mode: 'live',
        limit: 10
      };

      const result = await agent.fetchUserTeamScores(options);

      // Should only return NBA teams
      expect(result.favoriteTeams).toHaveLength(2);
      expect(result.favoriteTeams.every(team => team.sport === 'NBA')).toBe(true);
    });

    it('should handle user with no favorite teams', async () => {
      // Create user with no favorite teams
      await storage.createUserProfile({
        firebaseUid: 'empty-user',
        firstName: 'Empty',
        lastName: 'User',
        favoriteSports: [],
        favoriteTeams: [],
        onboardingCompleted: true
      });

      const options: UserTeamScoresOptions = {
        firebaseUid: 'empty-user',
        sport: 'NBA',
        mode: 'live'
      };

      await expect(agent.fetchUserTeamScores(options))
        .rejects.toThrow(UserTeamScoresError);
    });

    it('should handle non-existent user', async () => {
      const options: UserTeamScoresOptions = {
        firebaseUid: 'nonexistent-user',
        sport: 'NBA',
        mode: 'live'
      };

      await expect(agent.fetchUserTeamScores(options))
        .rejects.toThrow(UserTeamScoresError);
    });
  });

  describe('Error Handling', () => {
    it('should throw UserTeamScoresError with correct error codes', async () => {
      const options: UserTeamScoresOptions = {
        firebaseUid: 'nonexistent-user',
        sport: 'NBA',
        mode: 'live'
      };

      try {
        await agent.fetchUserTeamScores(options);
        expect.fail('Should have thrown UserTeamScoresError');
      } catch (error) {
        expect(error).toBeInstanceOf(UserTeamScoresError);
        expect((error as UserTeamScoresError).code).toBe('USER_NOT_FOUND');
        expect((error as UserTeamScoresError).firebaseUid).toBe('nonexistent-user');
        expect((error as UserTeamScoresError).sport).toBe('NBA');
      }
    });

    it('should handle fetch failures gracefully', async () => {
      // Mock source to throw error
      vi.mocked(mockSource.fetchLive!).mockRejectedValue(new Error('API failure'));

      const options: UserTeamScoresOptions = {
        firebaseUid: 'test-user-123',
        sport: 'NBA',
        mode: 'live'
      };

      // The agent should handle the error gracefully and return empty results
      const result = await agent.fetchUserTeamScores(options);
      
      expect(result.games).toEqual([]);
      expect(result.userProfile).toBeDefined();
      expect(result.favoriteTeams).toBeDefined();
      expect(result.cacheHit).toBe(false);
      expect(result.source).toBe('live');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large number of favorite teams', async () => {
      // Create user with many favorite teams
      const manyTeams = Array.from({ length: 20 }, (_, i) => `NBA_TEAM_${i}`);
      await storage.createUserProfile({
        firebaseUid: 'power-user',
        firstName: 'Power',
        lastName: 'User',
        favoriteSports: ['NBA'],
        favoriteTeams: manyTeams,
        onboardingCompleted: true
      });

      const favoriteTeams = await agent.getUserFavoriteTeams('power-user', 'NBA');
      expect(favoriteTeams).toHaveLength(20);
    });

    it('should handle empty sport parameter', async () => {
      const favoriteTeams = await agent.getUserFavoriteTeams('test-user-123');
      expect(favoriteTeams).toHaveLength(2); // All teams regardless of sport
    });

    it('should handle schedule mode (no caching)', async () => {
      vi.mocked(mockSource.fetchSchedule!).mockResolvedValue([
        {
          gameId: 'FUTURE_GAME',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          startTime: new Date('2025-11-01T20:00:00Z'),
          status: 'scheduled'
        }
      ]);

      const options: UserTeamScoresOptions = {
        firebaseUid: 'test-user-123',
        sport: 'NBA',
        mode: 'schedule',
        startDate: '2025-11-01',
        endDate: '2025-11-02'
      };

      const result = await agent.fetchUserTeamScores(options);
      
      expect(result.cacheHit).toBe(false);
      expect(result.games).toBeDefined();
      expect(mockSource.fetchSchedule).toHaveBeenCalled();
    });
  });
});