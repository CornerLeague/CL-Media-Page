import { describe, it, expect } from 'vitest';

// Test imports from fixtures
import {
  sampleUsers,
  sampleUserProfiles,
  sampleTeams,
  sampleGames,
  sampleUserTeams,
  sampleUserFavoriteTeams,
  testScenarios,
  errorScenarios,
  performanceTestData,
  getGamesForTeam,
  getTeamsForSport,
  getUserProfileByUid,
  getFavoriteTeamsForUser,
  createCompleteUserDataset,
  userTeamScoresTestData
} from './fixtures/userTeamScoresData';

// Test imports from mocks
import {
  createMockUser,
  createMockUserProfile,
  createMockTeam,
  createMockGame,
  createMockUserTeam,
  createMockUserFavoriteTeam,
  createMockUserTeamScoresOptions,
  createMockUserTeamScoresResult,
  createMockInsertUser,
  createMockInsertUserProfile,
  createMockInsertTeam,
  createMockInsertGame,
  createMockInsertUserTeam,
  userTeamScoresMocks
} from './helpers/userTeamScoresMocks';

// Test imports from database utilities
import {
  UserTeamScoresDbTestUtils,
  createDbTestUtils,
  setupCleanTestEnvironment
} from './helpers/userTeamScoresDbUtils';

describe('UserTeamScores Testing Utilities Verification', () => {
  describe('Test Fixtures (userTeamScoresData.ts)', () => {
    it('should export sample data arrays', () => {
      expect(sampleUsers).toBeDefined();
      expect(Array.isArray(sampleUsers)).toBe(true);
      expect(sampleUsers.length).toBeGreaterThan(0);
      
      expect(sampleUserProfiles).toBeDefined();
      expect(Array.isArray(sampleUserProfiles)).toBe(true);
      expect(sampleUserProfiles.length).toBeGreaterThan(0);
      
      expect(sampleTeams).toBeDefined();
      expect(Array.isArray(sampleTeams)).toBe(true);
      expect(sampleTeams.length).toBeGreaterThan(0);
      
      expect(sampleGames).toBeDefined();
      expect(Array.isArray(sampleGames)).toBe(true);
      expect(sampleGames.length).toBeGreaterThan(0);
      
      expect(sampleUserTeams).toBeDefined();
      expect(Array.isArray(sampleUserTeams)).toBe(true);
      expect(sampleUserTeams.length).toBeGreaterThan(0);
      
      expect(sampleUserFavoriteTeams).toBeDefined();
      expect(Array.isArray(sampleUserFavoriteTeams)).toBe(true);
      expect(sampleUserFavoriteTeams.length).toBeGreaterThan(0);
    });

    it('should export test scenarios', () => {
      expect(testScenarios).toBeDefined();
      expect(testScenarios.userWithMultipleSports).toBeDefined();
      expect(testScenarios.nbaOnlyUser).toBeDefined();
      expect(testScenarios.userWithNoRecentGames).toBeDefined();
      expect(testScenarios.incompleteOnboardingUser).toBeDefined();
    });

    it('should export error scenarios', () => {
      expect(errorScenarios).toBeDefined();
      expect(errorScenarios.nonExistentUser).toBeDefined();
      expect(errorScenarios.userWithNoTeams).toBeDefined();
      expect(errorScenarios.invalidSport).toBeDefined();
      expect(errorScenarios.invalidLimit).toBeDefined();
    });

    it('should export performance test data', () => {
      expect(performanceTestData).toBeDefined();
      expect(performanceTestData.manyUsers).toBeDefined();
      expect(performanceTestData.manyTeams).toBeDefined();
      expect(performanceTestData.manyGames).toBeDefined();
    });

    it('should export utility functions', () => {
      expect(typeof getGamesForTeam).toBe('function');
      expect(typeof getTeamsForSport).toBe('function');
      expect(typeof getUserProfileByUid).toBe('function');
      expect(typeof getFavoriteTeamsForUser).toBe('function');
      expect(typeof createCompleteUserDataset).toBe('function');
    });

    it('should export consolidated test data object', () => {
      expect(userTeamScoresTestData).toBeDefined();
      expect(userTeamScoresTestData.users).toBeDefined();
      expect(userTeamScoresTestData.profiles).toBeDefined();
      expect(userTeamScoresTestData.teams).toBeDefined();
      expect(userTeamScoresTestData.games).toBeDefined();
      expect(userTeamScoresTestData.scenarios).toBeDefined();
      expect(userTeamScoresTestData.errors).toBeDefined();
      expect(userTeamScoresTestData.performance).toBeDefined();
      expect(userTeamScoresTestData.utils).toBeDefined();
    });
  });

  describe('Mock Factories (userTeamScoresMocks.ts)', () => {
    it('should export individual mock creation functions', () => {
      expect(typeof createMockUser).toBe('function');
      expect(typeof createMockUserProfile).toBe('function');
      expect(typeof createMockTeam).toBe('function');
      expect(typeof createMockGame).toBe('function');
      expect(typeof createMockUserTeam).toBe('function');
      expect(typeof createMockUserFavoriteTeam).toBe('function');
      expect(typeof createMockUserTeamScoresOptions).toBe('function');
      expect(typeof createMockUserTeamScoresResult).toBe('function');
    });

    it('should export Insert type mock functions', () => {
      expect(typeof createMockInsertUser).toBe('function');
      expect(typeof createMockInsertUserProfile).toBe('function');
      expect(typeof createMockInsertTeam).toBe('function');
      expect(typeof createMockInsertGame).toBe('function');
      expect(typeof createMockInsertUserTeam).toBe('function');
    });

    it('should export consolidated mocks object', () => {
      expect(userTeamScoresMocks).toBeDefined();
      expect(userTeamScoresMocks.createMockUser).toBeDefined();
      expect(userTeamScoresMocks.createMockUserProfile).toBeDefined();
      expect(userTeamScoresMocks.createMockTeam).toBeDefined();
      expect(userTeamScoresMocks.createMockGame).toBeDefined();
      expect(userTeamScoresMocks.createMockInsertUser).toBeDefined();
      expect(userTeamScoresMocks.createMockInsertUserProfile).toBeDefined();
      expect(userTeamScoresMocks.createMockInsertTeam).toBeDefined();
      expect(userTeamScoresMocks.createMockInsertGame).toBeDefined();
      expect(userTeamScoresMocks.createMockInsertUserTeam).toBeDefined();
    });

    it('should create valid mock objects', () => {
      const mockUser = createMockUser();
      expect(mockUser).toHaveProperty('id');
      expect(mockUser).toHaveProperty('username');
      expect(mockUser).toHaveProperty('password');

      const mockProfile = createMockUserProfile();
      expect(mockProfile).toHaveProperty('firebaseUid');
      expect(mockProfile).toHaveProperty('firstName');
      expect(mockProfile).toHaveProperty('lastName');

      const mockTeam = createMockTeam();
      expect(mockTeam).toHaveProperty('id');
      expect(mockTeam).toHaveProperty('league');
      expect(mockTeam).toHaveProperty('code');
      expect(mockTeam).toHaveProperty('name');

      const mockGame = createMockGame();
      expect(mockGame).toHaveProperty('id');
      expect(mockGame).toHaveProperty('homeTeamId');
      expect(mockGame).toHaveProperty('awayTeamId');
      expect(mockGame).toHaveProperty('status');
    });
  });

  describe('Database Test Utilities (userTeamScoresDbUtils.ts)', () => {
    it('should export UserTeamScoresDbTestUtils class', () => {
      expect(UserTeamScoresDbTestUtils).toBeDefined();
      expect(typeof UserTeamScoresDbTestUtils).toBe('function'); // constructor
    });

    it('should export utility functions', () => {
      expect(typeof createDbTestUtils).toBe('function');
      expect(typeof setupCleanTestEnvironment).toBe('function');
    });

    it('should create UserTeamScoresDbTestUtils instance', () => {
      const dbUtils = new UserTeamScoresDbTestUtils();
      expect(dbUtils).toBeDefined();
      expect(typeof dbUtils.setupTestData).toBe('function');
      expect(typeof dbUtils.cleanup).toBe('function');
      expect(typeof dbUtils.createTestUser).toBe('function');
      expect(typeof dbUtils.createTestTeam).toBe('function');
      expect(typeof dbUtils.createTestGame).toBe('function');
      expect(typeof dbUtils.createTestUserTeam).toBe('function');
      expect(typeof dbUtils.reset).toBe('function');
      expect(typeof dbUtils.verifyTestData).toBe('function');
    });

    it('should setup and cleanup test environment', async () => {
      const dbUtils = new UserTeamScoresDbTestUtils();
      await dbUtils.setupTestData();
      
      // Verify setup worked
      expect(dbUtils).toBeDefined();
      
      // Cleanup
      await dbUtils.cleanup();
    })
  });

  describe('Integration Tests', () => {
    it('should work together - fixtures and mocks', () => {
      // Use fixture data
      const fixtureUser = sampleUsers[0];
      expect(fixtureUser).toBeDefined();

      // Create mock data with similar structure
      const mockUser = createMockUser({
        username: fixtureUser.username
      });
      expect(mockUser.username).toBe(fixtureUser.username);
      expect(mockUser).toHaveProperty('id');
      expect(mockUser).toHaveProperty('password');
    });

    it('should work together - mocks and database utilities', () => {
      const dbUtils = new UserTeamScoresDbTestUtils();
      
      // Create mock data
      const mockUserData = createMockInsertUser({ username: 'integration_test_user' });
      const mockProfileData = createMockInsertUserProfile({ firstName: 'Integration' });
      
      // Verify the data can be used with db utils
      expect(mockUserData).toHaveProperty('username');
      expect(mockUserData).toHaveProperty('password');
      expect(mockProfileData).toHaveProperty('firebaseUid');
      expect(mockProfileData).toHaveProperty('firstName');
      
      // Verify db utils can accept this data structure
      expect(typeof dbUtils.createTestUser).toBe('function');
      expect(typeof dbUtils.createTestTeam).toBe('function');
    });

    it('should work together - all three utility types', () => {
      // Get fixture data
      const scenario = testScenarios.userWithMultipleSports;
      expect(scenario).toBeDefined();
      expect(scenario.user).toBeDefined();
      expect(scenario.profile).toBeDefined();

      // Create similar mock data
      const mockUser = createMockUser({
        username: scenario.user.username
      });
      const mockProfile = createMockUserProfile({
        firstName: scenario.profile.firstName,
        favoriteSports: scenario.profile.favoriteSports
      });

      // Verify database utilities can work with this data
      const dbUtils = new UserTeamScoresDbTestUtils();
      expect(dbUtils).toBeDefined();
      
      // All utilities should be compatible
      expect(mockUser).toHaveProperty('username');
      expect(mockProfile).toHaveProperty('favoriteSports');
      expect(Array.isArray(mockProfile.favoriteSports)).toBe(true);
    });
  });
});