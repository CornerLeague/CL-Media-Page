import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScoresAgent } from '../../agents/scoresAgent';
import { MemStorage } from '../../storage';
import { UserTeamScoresError } from '../../agents/types';
import type { IScoreSource, UserTeamScoresOptions } from '../../agents/types';

describe('ScoresAgent - User Team Scores', () => {
  let agent: ScoresAgent;
  let mockSource: IScoreSource;
  let storage: MemStorage;

  beforeEach(async () => {
    storage = new MemStorage();
    
    mockSource = {
      fetchRecentGames: vi.fn().mockResolvedValue([]),
      fetchLive: vi.fn().mockResolvedValue([]),
      fetchSchedule: vi.fn().mockResolvedValue([]),
      fetchFeaturedGames: vi.fn().mockResolvedValue([])
    };
    
    agent = new ScoresAgent(mockSource, storage);
  });

  describe('getUserFavoriteTeams', () => {
    it('should retrieve favorite teams for a user', async () => {
      // Create a user profile with favorite teams
      await storage.createUserProfile({
        firebaseUid: 'user123',
        firstName: 'John',
        lastName: 'Doe',
        favoriteSports: ['NBA', 'NFL'],
        favoriteTeams: ['NBA_BOS', 'NBA_LAL', 'NFL_NE'],
        onboardingCompleted: true
      });

      const favoriteTeams = await agent.getUserFavoriteTeams('user123', 'NBA');
      
      expect(favoriteTeams).toHaveLength(2);
      expect(favoriteTeams).toEqual([
        { teamId: 'NBA_BOS', sport: 'NBA' },
        { teamId: 'NBA_LAL', sport: 'NBA' }
      ]);
    });

    it('should handle user with no favorite teams', async () => {
      await storage.createUserProfile({
        firebaseUid: 'user456',
        firstName: 'Jane',
        lastName: 'Smith',
        favoriteSports: [],
        favoriteTeams: [],
        onboardingCompleted: true
      });

      await expect(agent.getUserFavoriteTeams('user456')).rejects.toThrow(UserTeamScoresError);
    });

    it('should handle non-existent user', async () => {
      await expect(agent.getUserFavoriteTeams('nonexistent')).rejects.toThrow(UserTeamScoresError);
    });
  });

  describe('getUserFavoriteTeamBySport', () => {
    it('should retrieve favorite teams for a specific sport', async () => {
      // Create a user profile with favorite teams across multiple sports
      await storage.createUserProfile({
        firebaseUid: 'user789',
        firstName: 'Alice',
        lastName: 'Johnson',
        favoriteSports: ['NBA', 'NFL', 'NHL'],
        favoriteTeams: ['NBA_BOS', 'NBA_LAL', 'NFL_NE', 'NHL_BOS'],
        onboardingCompleted: true
      });

      const nbaTeams = await agent.getUserFavoriteTeamBySport('user789', 'NBA');
      
      expect(nbaTeams).toHaveLength(2);
      expect(nbaTeams).toEqual([
        { teamId: 'NBA_BOS', sport: 'NBA' },
        { teamId: 'NBA_LAL', sport: 'NBA' }
      ]);
    });

    it('should handle user with no teams for specified sport', async () => {
      await storage.createUserProfile({
        firebaseUid: 'user101',
        firstName: 'Bob',
        lastName: 'Wilson',
        favoriteSports: ['NBA'],
        favoriteTeams: ['NBA_BOS', 'NBA_LAL'],
        onboardingCompleted: true
      });

      await expect(agent.getUserFavoriteTeamBySport('user101', 'NFL')).rejects.toThrow(UserTeamScoresError);
    });

    it('should handle non-existent user', async () => {
      await expect(agent.getUserFavoriteTeamBySport('nonexistent', 'NBA')).rejects.toThrow(UserTeamScoresError);
    });
  });

  describe('fetchUserTeamScores', () => {
    it('should fetch user team scores successfully', async () => {
      // Create user profile
      await storage.createUserProfile({
        firebaseUid: 'user123',
        firstName: 'John',
        lastName: 'Doe',
        favoriteSports: ['NBA'],
        favoriteTeams: ['NBA_BOS', 'NBA_LAL'],
        onboardingCompleted: true
      });

      const options: UserTeamScoresOptions = {
        firebaseUid: 'user123',
        sport: 'NBA',
        limit: 10,
        mode: 'live'
      };

      const result = await agent.fetchUserTeamScores(options);
      
      expect(result.userProfile).toBeDefined();
      expect(result.favoriteTeams).toHaveLength(2);
      expect(result.games).toBeDefined();
      expect(result.cacheHit).toBe(false);
    });

    it('should handle user not found', async () => {
      const options: UserTeamScoresOptions = {
        firebaseUid: 'nonexistent',
        sport: 'NBA',
        mode: 'live'
      };

      await expect(agent.fetchUserTeamScores(options)).rejects.toThrow(UserTeamScoresError);
    });
  });
});