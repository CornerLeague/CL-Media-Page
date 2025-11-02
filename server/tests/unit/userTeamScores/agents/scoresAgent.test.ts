/**
 * Unit Tests for ScoresAgent Methods - Subtask 7.3
 * 
 * Tests for the new ScoresAgent methods that handle user-specific score fetching:
 * - fetchUserTeamScores(options)
 * - getUserFavoriteTeams(firebaseUid, sport)
 * - getUserFavoriteTeamBySport(firebaseUid, sport)
 * - cacheUserTeamScores(firebaseUid, sport, mode, games)
 * - getCachedUserTeamScores(firebaseUid, sport, mode)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScoresAgent } from '../../../../agents/scoresAgent';
import { MemStorage } from '../../../../storage';
import { UserTeamScoresError } from '../../../../agents/types';
import type { 
  IScoreSource, 
  UserTeamScoresOptions, 
  UserFavoriteTeam,
  UserTeamScoresResult,
  GameScore,
  ScheduleGame 
} from '../../../../agents/types';
import type { Game, UserProfile } from '@shared/schema';
import { 
  createMockUserProfile,
  createMockGame,
  createMockUserTeamScoresOptions,
  createMockGamesForTeam,
  userTeamScoresMocks
} from '../../../helpers/userTeamScoresMocks';

// Mock Redis client
const mockRedisClient = {
  get: vi.fn(),
  set: vi.fn(),
  connect: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  status: 'ready'
};

// Mock Redis functions
vi.mock('../../../../jobs/redis', () => ({
  createRedis: () => mockRedisClient,
  connectRedis: vi.fn().mockResolvedValue(undefined),
  closeRedis: vi.fn().mockResolvedValue(undefined)
}));

// Mock the getCacheClient function used in ScoresAgent
vi.mock('../../../../agents/scoresAgent', async () => {
  const actual = await vi.importActual('../../../../agents/scoresAgent');
  return {
    ...actual,
    getCacheClient: vi.fn(() => Promise.resolve(mockRedisClient))
  };
});

// Mock config to enable Redis
vi.mock('../../../../config', () => ({
  config: {
    redisUrl: 'redis://localhost:6379',
    jobsEnabled: true,
    useMemStorage: true,
    databaseUrl: null
  }
}));

// Mock the websocket broadcast functions
vi.mock('../../../ws', () => ({
  broadcast: vi.fn(),
  broadcastUserTeamUpdate: vi.fn(),
  broadcastUserTeamStatusChange: vi.fn()
}));

// Mock the logger
vi.mock('../../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  withSource: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('ScoresAgent - User Team Scores Methods', () => {
  let agent: ScoresAgent;
  let mockSource: IScoreSource;
  let storage: MemStorage;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.REDIS_URL = 'redis://127.0.0.1:6379';
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create fresh storage instance
    storage = new MemStorage();
    
    // Create mock source with all required methods
    mockSource = {
      fetchRecentGames: vi.fn().mockResolvedValue([]),
      fetchLive: vi.fn().mockResolvedValue([]),
      fetchSchedule: vi.fn().mockResolvedValue([]),
      fetchFeaturedGames: vi.fn().mockResolvedValue([])
    };
    
    // Create agent instance
    agent = new ScoresAgent(mockSource, storage);
    
    // Setup default Redis mock behavior
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.del.mockResolvedValue(1);
    mockRedisClient.exists.mockResolvedValue(0);
    mockRedisClient.expire.mockResolvedValue(1);
    mockRedisClient.ttl.mockResolvedValue(-1);
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('fetchUserTeamScores', () => {
    const testFirebaseUid = 'test-user-123';
    const testSport = 'NBA';
    
    beforeEach(async () => {
      // Create test user profile with favorite teams
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: testFirebaseUid,
        firstName: 'Test',
        lastName: 'User',
        favoriteSports: ['NBA', 'NFL'],
        favoriteTeams: ['NBA_LAL', 'NBA_BOS', 'NFL_KC'],
        onboardingCompleted: true
      }));
    });

    it('should fetch scores for user favorite team', async () => {
      const mockGameScores: GameScore[] = [
        {
          gameId: 'game_123',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          homePts: 110,
          awayPts: 105,
          status: 'final',
          period: '4',
          timeRemaining: null,
          startTime: new Date(),
          source: 'test',
        },
      ];
      vi.mocked(mockSource.fetchLive!).mockResolvedValue(mockGameScores);

      const options: UserTeamScoresOptions = {
        firebaseUid: testFirebaseUid,
        sport: testSport,
        limit: 10,
        mode: 'live'
      };

      const result = await agent.fetchUserTeamScores(options);

      expect(result).toMatchObject({
        games: expect.any(Array),
        userProfile: expect.objectContaining({
          firebaseUid: testFirebaseUid
        }),
        favoriteTeams: expect.arrayContaining([
          expect.objectContaining({
            teamId: 'NBA_LAL',
            sport: 'NBA'
          }),
          expect.objectContaining({
            teamId: 'NBA_BOS',
            sport: 'NBA'
          })
        ]),
        cacheHit: false,
        source: 'live'
      });

      expect(result.favoriteTeams).toHaveLength(2); // Only NBA teams
      expect(mockSource.fetchLive).toHaveBeenCalledWith(['BOS', 'LAL']);
    });

    it('should handle user with no favorite team for sport', async () => {
      // Create user with no NBA teams
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: 'user-no-nba',
        favoriteTeams: ['NFL_KC', 'MLB_NYY'], // No NBA teams
        onboardingCompleted: true
      }));

      const options: UserTeamScoresOptions = {
        firebaseUid: 'user-no-nba',
        sport: 'NBA',
        mode: 'live'
      };

      await expect(agent.fetchUserTeamScores(options)).rejects.toThrow(UserTeamScoresError);
      await expect(agent.fetchUserTeamScores(options)).rejects.toThrow('No favorite teams found for sport: NBA');
    });

    it('should handle non-existent user', async () => {
      const options: UserTeamScoresOptions = {
        firebaseUid: 'nonexistent-user',
        sport: testSport,
        mode: 'live'
      };

      await expect(agent.fetchUserTeamScores(options)).rejects.toThrow(UserTeamScoresError);
      await expect(agent.fetchUserTeamScores(options)).rejects.toThrow('User profile not found');
    });

    it('should cache results after successful fetch', async () => {
      const mockGameScores: GameScore[] = [
        {
          gameId: 'game_456',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          homePts: 95,
          awayPts: 88,
          status: 'final',
          period: '4',
          timeRemaining: null,
          startTime: new Date(),
          source: 'test',
        },
        {
          gameId: 'game_789',
          homeTeamId: 'NBA_GSW',
          awayTeamId: 'NBA_LAL',
          homePts: 102,
          awayPts: 99,
          status: 'final',
          period: '4',
          timeRemaining: null,
          startTime: new Date(),
          source: 'test',
        },
      ];
      vi.mocked(mockSource.fetchLive!).mockResolvedValue(mockGameScores);

      const options: UserTeamScoresOptions = {
        firebaseUid: testFirebaseUid,
        sport: testSport,
        mode: 'live'
      };

      await agent.fetchUserTeamScores(options);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `user_team_scores:${testFirebaseUid}:${testSport}:live`,
        expect.any(String),
        'EX',
        60 // TTL for live mode
      );
    });

    it('should return cached results when available', async () => {
      const cachedGames = createMockGamesForTeam('NBA_LAL', 2);
      const cachedData = JSON.stringify(cachedGames);
      mockRedisClient.get.mockResolvedValue(cachedData);

      const options: UserTeamScoresOptions = {
        firebaseUid: testFirebaseUid,
        sport: testSport,
        mode: 'live'
      };

      const result = await agent.fetchUserTeamScores(options);

      expect(result.cacheHit).toBe(true);
      expect(result.source).toBe('cache');
      expect(result.games).toHaveLength(2);
      expect(mockSource.fetchLive).not.toHaveBeenCalled();
    });

    it('should skip cache for schedule mode', async () => {
      const mockScheduleGames: ScheduleGame[] = [
        {
          gameId: 'schedule_game_1',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          startTime: new Date(),
          status: 'scheduled',
          source: 'test',
        },
        {
          gameId: 'schedule_game_2',
          homeTeamId: 'NBA_GSW',
          awayTeamId: 'NBA_LAL',
          startTime: new Date(),
          status: 'scheduled',
          source: 'test',
        },
        {
          gameId: 'schedule_game_3',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_MIA',
          startTime: new Date(),
          status: 'scheduled',
          source: 'test',
        },
      ];
      vi.mocked(mockSource.fetchSchedule!).mockResolvedValue(mockScheduleGames);

      const options: UserTeamScoresOptions = {
        firebaseUid: testFirebaseUid,
        sport: testSport,
        mode: 'schedule'
      };

      const result = await agent.fetchUserTeamScores(options);

      expect(result.cacheHit).toBe(false);
      expect(result.source).toBe('live');
      expect(mockRedisClient.get).not.toHaveBeenCalled();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should handle source fetch errors gracefully', async () => {
      vi.mocked(mockSource.fetchLive!).mockRejectedValue(new Error('External API unavailable'));

      const options: UserTeamScoresOptions = {
        firebaseUid: testFirebaseUid,
        sport: testSport,
        mode: 'live'
      };

      const result = await agent.fetchUserTeamScores(options);
      
      expect(result).toBeDefined();
      expect(result.games).toEqual([]);
      expect(result.cacheHit).toBe(false);
      expect(result.source).toBe('live');
      expect(result.userProfile).toBeDefined();
      expect(result.favoriteTeams).toBeDefined();
    });
  });

  describe('getUserFavoriteTeams', () => {
    const testFirebaseUid = 'test-user-456';

    beforeEach(async () => {
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: testFirebaseUid,
        favoriteTeams: ['NBA_LAL', 'NBA_BOS', 'NFL_KC', 'NHL_BOS'],
        onboardingCompleted: true
      }));
    });

    it('should return all favorite teams when no sport filter', async () => {
      const favoriteTeams = await agent.getUserFavoriteTeams(testFirebaseUid);

      expect(favoriteTeams).toHaveLength(4);
      expect(favoriteTeams).toEqual(
        expect.arrayContaining([
          { teamId: 'NBA_LAL', sport: 'NBA' },
          { teamId: 'NBA_BOS', sport: 'NBA' },
          { teamId: 'NFL_KC', sport: 'NFL' },
          { teamId: 'NHL_BOS', sport: 'NHL' }
        ])
      );
    });

    it('should filter teams by sport when specified', async () => {
      const nbaTeams = await agent.getUserFavoriteTeams(testFirebaseUid, 'NBA');

      expect(nbaTeams).toHaveLength(2);
      expect(nbaTeams).toEqual([
        { teamId: 'NBA_LAL', sport: 'NBA' },
        { teamId: 'NBA_BOS', sport: 'NBA' }
      ]);
    });

    it('should handle case-insensitive sport filtering', async () => {
      const nbaTeams = await agent.getUserFavoriteTeams(testFirebaseUid, 'nba');

      expect(nbaTeams).toHaveLength(2);
      expect(nbaTeams).toEqual([
        { teamId: 'NBA_LAL', sport: 'NBA' },
        { teamId: 'NBA_BOS', sport: 'NBA' }
      ]);
    });

    it('should throw error when no teams found for sport', async () => {
      await expect(agent.getUserFavoriteTeams(testFirebaseUid, 'MLB')).rejects.toThrow(UserTeamScoresError);
      await expect(agent.getUserFavoriteTeams(testFirebaseUid, 'MLB')).rejects.toThrow('No favorite teams found for sport: MLB');
    });

    it('should throw error when user not found', async () => {
      await expect(agent.getUserFavoriteTeams('nonexistent-user')).rejects.toThrow(UserTeamScoresError);
      await expect(agent.getUserFavoriteTeams('nonexistent-user')).rejects.toThrow('User profile not found');
    });

    it('should throw error when user has no favorite teams', async () => {
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: 'user-no-teams',
        favoriteTeams: [],
        onboardingCompleted: true
      }));

      await expect(agent.getUserFavoriteTeams('user-no-teams')).rejects.toThrow(UserTeamScoresError);
      await expect(agent.getUserFavoriteTeams('user-no-teams')).rejects.toThrow('No favorite teams configured');
    });
  });

  describe('getUserFavoriteTeamBySport', () => {
    const testFirebaseUid = 'test-user-789';

    beforeEach(async () => {
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: testFirebaseUid,
        favoriteTeams: ['NBA_LAL', 'NBA_BOS', 'NFL_KC'],
        onboardingCompleted: true
      }));
    });

    it('should return teams for specified sport', async () => {
      const nbaTeams = await agent.getUserFavoriteTeamBySport(testFirebaseUid, 'NBA');

      expect(nbaTeams).toHaveLength(2);
      expect(nbaTeams).toEqual([
        { teamId: 'NBA_LAL', sport: 'NBA' },
        { teamId: 'NBA_BOS', sport: 'NBA' }
      ]);
    });

    it('should throw error when no teams for sport', async () => {
      await expect(agent.getUserFavoriteTeamBySport(testFirebaseUid, 'MLB')).rejects.toThrow(UserTeamScoresError);
    });

    it('should throw error when user not found', async () => {
      await expect(agent.getUserFavoriteTeamBySport('nonexistent', 'NBA')).rejects.toThrow(UserTeamScoresError);
    });
  });

  describe('cacheUserTeamScores', () => {
    const testFirebaseUid = 'cache-test-user';
    const testSport = 'NBA';
    const testMode = 'live';

    it('should cache data with correct key and TTL for live mode', async () => {
      const games = createMockGamesForTeam('NBA_LAL', 3);

      await agent.cacheUserTeamScores(testFirebaseUid, testSport, testMode, games);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `user_team_scores:${testFirebaseUid}:${testSport}:${testMode}`,
        JSON.stringify(games),
        'EX',
        60 // Live mode TTL
      );
    });

    it('should cache data with longer TTL for non-live modes', async () => {
      const games = createMockGamesForTeam('NBA_LAL', 2);

      await agent.cacheUserTeamScores(testFirebaseUid, testSport, 'featured', games);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `user_team_scores:${testFirebaseUid}:${testSport}:featured`,
        JSON.stringify(games),
        'EX',
        300 // Non-live mode TTL
      );
    });

    it('should handle empty games array gracefully', async () => {
      await agent.cacheUserTeamScores(testFirebaseUid, testSport, testMode, []);

      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should handle cache errors without throwing', async () => {
      const games = createMockGamesForTeam('NBA_LAL', 1);
      mockRedisClient.set.mockRejectedValue(new Error('Cache unavailable'));

      // Should not throw
      await expect(
        agent.cacheUserTeamScores(testFirebaseUid, testSport, testMode, games)
      ).resolves.not.toThrow();
    });

    it('should handle missing Redis client gracefully', async () => {
      // Mock config to return no Redis URL
      vi.doMock('../../../config', () => ({
        config: {
          redisUrl: null
        }
      }));

      const games = createMockGamesForTeam('NBA_LAL', 1);

      // Should not throw and should not attempt to cache
      await expect(
        agent.cacheUserTeamScores(testFirebaseUid, testSport, testMode, games)
      ).resolves.not.toThrow();
    });
  });

  describe('getCachedUserTeamScores', () => {
    const testFirebaseUid = 'cache-get-user';
    const testSport = 'NBA';
    const testMode = 'live';

    it('should return cached games when available', async () => {
      const cachedGames: GameScore[] = [
        {
          gameId: 'game_NBA_LAL_0',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          homePts: 108,
          awayPts: 102,
          status: 'final',
          startTime: new Date('2025-10-31T20:00:00Z'),
          period: null,
          timeRemaining: null,
          source: 'test'
        },
        {
          gameId: 'game_NBA_LAL_1',
          homeTeamId: 'NBA_GSW',
          awayTeamId: 'NBA_LAL',
          homePts: 95,
          awayPts: 110,
          status: 'final',
          startTime: new Date('2025-10-31T22:00:00Z'),
          period: null,
          timeRemaining: null,
          source: 'test'
        }
      ];
      const cachedData = JSON.stringify(cachedGames);
      mockRedisClient.get.mockResolvedValue(cachedData);

      const result = await agent.getCachedUserTeamScores(testFirebaseUid, testSport, testMode);

      expect(result).toHaveLength(2);
      expect(result![0]).toMatchObject({
        gameId: expect.any(String),
        homeTeamId: expect.any(String),
        awayTeamId: expect.any(String),
        startTime: expect.any(Date)
      });
      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `user_team_scores:${testFirebaseUid}:${testSport}:${testMode}`
      );
    });

    it('should return null when no cache available', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await agent.getCachedUserTeamScores(testFirebaseUid, testSport, testMode);

      expect(result).toBeNull();
    });

    it('should handle cache errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Cache read error'));

      const result = await agent.getCachedUserTeamScores(testFirebaseUid, testSport, testMode);

      expect(result).toBeNull();
    });

    it('should handle invalid JSON in cache gracefully', async () => {
      mockRedisClient.get.mockResolvedValue('invalid-json');

      const result = await agent.getCachedUserTeamScores(testFirebaseUid, testSport, testMode);

      expect(result).toBeNull();
    });

    it('should handle missing Redis client gracefully', async () => {
      // Mock config to return no Redis URL
      vi.doMock('../../../config', () => ({
        config: {
          redisUrl: null
        }
      }));

      const result = await agent.getCachedUserTeamScores(testFirebaseUid, testSport, testMode);

      expect(result).toBeNull();
    });

    it('should properly parse cached date fields', async () => {
      const originalGame = createMockGame({
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        startTime: new Date('2024-01-15T20:00:00Z')
      });
      
      const cachedData = JSON.stringify([originalGame]);
      mockRedisClient.get.mockResolvedValue(cachedData);

      const result = await agent.getCachedUserTeamScores(testFirebaseUid, testSport, testMode);

      expect(result).toHaveLength(1);
      expect(result![0].startTime).toBeInstanceOf(Date);
      expect(result![0].startTime.toISOString()).toBe('2024-01-15T20:00:00.000Z');
    });
  });

  describe('Integration Tests', () => {
    it('should work end-to-end with cache flow', async () => {
      const testFirebaseUid = 'integration-user';
      
      // Setup user
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: testFirebaseUid,
        favoriteTeams: ['NBA_LAL'],
        onboardingCompleted: true
      }));

      const mockGameScores: GameScore[] = [
        {
          gameId: 'game_1',
          homeTeamId: 'NBA_LAL',
          awayTeamId: 'NBA_BOS',
          homePts: 110,
          awayPts: 105,
          status: 'final',
          period: '4',
          timeRemaining: null,
          startTime: new Date(),
          source: 'test',
        },
        {
          gameId: 'game_2',
          homeTeamId: 'NBA_GSW',
          awayTeamId: 'NBA_LAL',
          homePts: 98,
          awayPts: 102,
          status: 'final',
          period: '4',
          timeRemaining: null,
          startTime: new Date(),
          source: 'test',
        },
      ];
      vi.mocked(mockSource.fetchLive!).mockResolvedValue(mockGameScores);

      const options: UserTeamScoresOptions = {
        firebaseUid: testFirebaseUid,
        sport: 'NBA',
        mode: 'live'
      };

      // First call - should fetch and cache
      const firstResult = await agent.fetchUserTeamScores(options);
      expect(firstResult.cacheHit).toBe(false);
      expect(firstResult.source).toBe('live');
      expect(mockRedisClient.set).toHaveBeenCalled();

      // Setup cache for second call
      const cachedData = JSON.stringify(mockGameScores);
      mockRedisClient.get.mockResolvedValue(cachedData);

      // Second call - should use cache
      const secondResult = await agent.fetchUserTeamScores(options);
      expect(secondResult.cacheHit).toBe(true);
      expect(secondResult.source).toBe('cache');
    });

    it('should handle multiple sports correctly', async () => {
      const testFirebaseUid = 'multi-sport-user';
      
      await storage.createUserProfile(createMockUserProfile({
        firebaseUid: testFirebaseUid,
        favoriteTeams: ['NBA_LAL', 'NFL_KC', 'MLB_NYY'],
        onboardingCompleted: true
      }));

      // Test NBA teams
      const nbaTeams = await agent.getUserFavoriteTeams(testFirebaseUid, 'NBA');
      expect(nbaTeams).toHaveLength(1);
      expect(nbaTeams[0].teamId).toBe('NBA_LAL');

      // Test NFL teams
      const nflTeams = await agent.getUserFavoriteTeams(testFirebaseUid, 'NFL');
      expect(nflTeams).toHaveLength(1);
      expect(nflTeams[0].teamId).toBe('NFL_KC');

      // Test all teams
      const allTeams = await agent.getUserFavoriteTeams(testFirebaseUid);
      expect(allTeams).toHaveLength(3);
    });
  });
});