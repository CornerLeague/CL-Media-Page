import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemStorage } from '../../storage';
import type { InsertTeam, InsertUserProfile } from '@shared/schema';
import { assertPerformance, measureTime } from '../helpers/testUtils';

describe('getUserFavoriteTeamBySport Integration Tests', () => {
  let storage: MemStorage;
  const testUserId = 'TEST_USER_INTEGRATION_' + Date.now();

  beforeEach(async () => {
    storage = new MemStorage();
    
    // Setup test teams
    const testTeams: InsertTeam[] = [
      { id: 'NBA_LAL', league: 'NBA', code: 'LAL', name: 'Los Angeles Lakers' },
      { id: 'NBA_BOS', league: 'NBA', code: 'BOS', name: 'Boston Celtics' },
      { id: 'NFL_NE', league: 'NFL', code: 'NE', name: 'New England Patriots' },
      { id: 'NHL_BOS', league: 'NHL', code: 'BOS', name: 'Boston Bruins' },
      { id: 'MLB_BOS', league: 'MLB', code: 'BOS', name: 'Boston Red Sox' },
    ];

    for (const team of testTeams) {
      await storage.createTeam(team);
    }
  });

  afterEach(async () => {
    // Clean up test data - in MemStorage, this is handled by creating new instances
  });

  it('should return favorite teams for a specific sport', async () => {
    // Create user profile with favorite teams from multiple sports
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId,
      firstName: 'Test',
      lastName: 'User',
      favoriteTeams: ['NBA_LAL', 'NBA_BOS', 'NFL_NE', 'NHL_BOS'],
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    // Test Basketball teams
    const basketballTeams = await storage.getUserFavoriteTeamBySport(testUserId, 'Basketball');
    expect(basketballTeams).toHaveLength(2);
    expect(basketballTeams.map(t => t.teamId)).toEqual(expect.arrayContaining(['NBA_LAL', 'NBA_BOS']));
    expect(basketballTeams.every(t => t.sport === 'Basketball')).toBe(true);

    // Test Football teams
    const footballTeams = await storage.getUserFavoriteTeamBySport(testUserId, 'Football');
    expect(footballTeams).toHaveLength(1);
    expect(footballTeams[0].teamId).toBe('NFL_NE');
    expect(footballTeams[0].sport).toBe('Football');

    // Test Hockey teams
    const hockeyTeams = await storage.getUserFavoriteTeamBySport(testUserId, 'Hockey');
    expect(hockeyTeams).toHaveLength(1);
    expect(hockeyTeams[0].teamId).toBe('NHL_BOS');
    expect(hockeyTeams[0].sport).toBe('Hockey');
  });

  it('should return empty array for non-existent user', async () => {
    const result = await storage.getUserFavoriteTeamBySport('non-existent-user', 'Basketball');
    expect(result).toEqual([]);
  });

  it('should return empty array for user with no favorite teams', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_no_teams',
      firstName: 'No',
      lastName: 'Teams',
      favoriteTeams: [],
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    const result = await storage.getUserFavoriteTeamBySport(testUserId + '_no_teams', 'Basketball');
    expect(result).toEqual([]);
  });

  it('should return empty array for sport with no matching teams', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_soccer',
      firstName: 'Soccer',
      lastName: 'Fan',
      favoriteTeams: ['NBA_LAL', 'NFL_NE'], // No soccer teams
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    const result = await storage.getUserFavoriteTeamBySport(testUserId + '_soccer', 'Soccer');
    expect(result).toEqual([]);
  });

  it('should handle multiple teams from the same sport', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_multi_nba',
      firstName: 'Multi',
      lastName: 'NBA',
      favoriteTeams: ['NBA_LAL', 'NBA_BOS'], // Multiple NBA teams
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    const result = await storage.getUserFavoriteTeamBySport(testUserId + '_multi_nba', 'Basketball');
    expect(result).toHaveLength(2);
    expect(result.map(t => t.teamId).sort()).toEqual(['NBA_BOS', 'NBA_LAL']);
    expect(result.every(t => t.sport === 'Basketball')).toBe(true);
  });

  it('should handle invalid team IDs gracefully', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_invalid',
      firstName: 'Invalid',
      lastName: 'Teams',
      favoriteTeams: ['NBA_LAL', 'INVALID_TEAM', 'NBA_BOS'],
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    const result = await storage.getUserFavoriteTeamBySport(testUserId + '_invalid', 'Basketball');
    // Should only return valid teams
    expect(result).toHaveLength(2);
    expect(result.map(t => t.teamId).sort()).toEqual(['NBA_BOS', 'NBA_LAL']);
  });

  it('should perform within acceptable time limits', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_perf',
      firstName: 'Performance',
      lastName: 'Test',
      favoriteTeams: ['NBA_LAL', 'NBA_BOS', 'NFL_NE', 'NHL_BOS', 'MLB_BOS'],
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    const { result, duration } = await measureTime(async () => {
      return await storage.getUserFavoriteTeamBySport(testUserId + '_perf', 'Basketball');
    });

    expect(result).toHaveLength(2);
    // Performance assertion: should complete within 100ms for MemStorage
    assertPerformance(duration, 100, 'getUserFavoriteTeamBySport');
  });

  it('should maintain data consistency across multiple calls', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_consistency',
      firstName: 'Consistency',
      lastName: 'Test',
      favoriteTeams: ['NBA_LAL', 'NFL_NE'],
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    // Make multiple calls and verify consistency
    const call1 = await storage.getUserFavoriteTeamBySport(testUserId + '_consistency', 'Basketball');
    const call2 = await storage.getUserFavoriteTeamBySport(testUserId + '_consistency', 'Basketball');
    const call3 = await storage.getUserFavoriteTeamBySport(testUserId + '_consistency', 'Basketball');

    expect(call1).toEqual(call2);
    expect(call2).toEqual(call3);
    expect(call1).toHaveLength(1);
    expect(call1[0].teamId).toBe('NBA_LAL');
  });

  it('should handle user profile updates correctly', async () => {
    const userProfile: InsertUserProfile = {
      firebaseUid: testUserId + '_update',
      firstName: 'Update',
      lastName: 'Test',
      favoriteTeams: ['NBA_LAL'],
      onboardingCompleted: true,
    };

    await storage.createUserProfile(userProfile);

    // Initial state
    let result = await storage.getUserFavoriteTeamBySport(testUserId + '_update', 'Basketball');
    expect(result).toHaveLength(1);
    expect(result[0].teamId).toBe('NBA_LAL');

    // Update favorite teams
    await storage.updateUserProfile(testUserId + '_update', {
      favoriteTeams: ['NBA_BOS', 'NFL_NE'],
    });

    // Verify updated state
    result = await storage.getUserFavoriteTeamBySport(testUserId + '_update', 'Basketball');
    expect(result).toHaveLength(1);
    expect(result[0].teamId).toBe('NBA_BOS');

    // Verify other sport
    const footballResult = await storage.getUserFavoriteTeamBySport(testUserId + '_update', 'Football');
    expect(footballResult).toHaveLength(1);
    expect(footballResult[0].teamId).toBe('NFL_NE');
  });
});