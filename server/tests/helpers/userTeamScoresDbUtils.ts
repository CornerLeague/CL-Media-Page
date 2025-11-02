import { MemStorage } from '../../storage';
import type { IStorage } from '../../storage';
import type { 
  User, 
  UserProfile, 
  Team, 
  Game, 
  UserTeam,
  InsertUser,
  InsertUserProfile,
  InsertTeam,
  InsertGame,
  InsertUserTeam
} from '../../../shared/schema';
import { 
  createMockUser,
  createMockInsertUser,
  createMockUserProfile,
  createMockInsertUserProfile,
  createMockTeam,
  createMockInsertTeam,
  createMockGame,
  createMockInsertGame,
  createMockUserTeam,
  createMockInsertUserTeam
} from './userTeamScoresMocks';

/**
 * Database test utilities for user team scores functionality
 */
export class UserTeamScoresDbTestUtils {
  private storage: IStorage;
  private createdUsers: string[] = [];
  private createdUserProfiles: string[] = [];
  private createdTeams: string[] = [];
  private createdGames: string[] = [];
  private createdUserTeams: Array<{ userId: string; teamId: string }> = [];

  constructor(storage?: IStorage) {
    this.storage = storage || new MemStorage();
  }

  /**
   * Get the storage instance
   */
  getStorage(): IStorage {
    return this.storage;
  }

  /**
   * Set up test database with sample data
   */
  async setupTestData(): Promise<{
    users: User[];
    userProfiles: UserProfile[];
    teams: Team[];
    games: Game[];
    userTeams: UserTeam[];
  }> {
    // Create test users
    const users: User[] = [];
    for (let i = 0; i < 3; i++) {
      const userData = createMockInsertUser({
        username: `testuser${i + 1}`,
        password: `password${i + 1}`
      });
      const user = await this.storage.createUser(userData);
      users.push(user);
      this.createdUsers.push(user.id);
    }

    // Create test user profiles
    const userProfiles: UserProfile[] = [];
    for (let i = 0; i < users.length; i++) {
      const profileData = createMockInsertUserProfile({
        firebaseUid: `firebase-uid-${i + 1}`,
        favoriteTeams: i === 0 ? ['NBA_LAL', 'NFL_NE'] : i === 1 ? ['NBA_GSW'] : []
      });
      const profile = await this.storage.createUserProfile(profileData);
      userProfiles.push(profile);
      this.createdUserProfiles.push(profile.firebaseUid);
    }

    // Create test teams
    const teams: Team[] = [];
    const teamData = [
      { id: 'NBA_LAL', name: 'Los Angeles Lakers', league: 'NBA' },
      { id: 'NBA_GSW', name: 'Golden State Warriors', league: 'NBA' },
      { id: 'NFL_NE', name: 'New England Patriots', league: 'NFL' },
      { id: 'MLB_NYY', name: 'New York Yankees', league: 'MLB' }
    ];

    for (const data of teamData) {
      const teamInsertData = createMockInsertTeam(data);
      const team = await this.storage.createTeam(teamInsertData);
      teams.push(team);
      this.createdTeams.push(team.id);
    }

    // Create test games
    const games: Game[] = [];
    const gameData = [
      { homeTeamId: 'NBA_LAL', awayTeamId: 'NBA_GSW', homePts: 110, awayPts: 105 },
      { homeTeamId: 'NFL_NE', awayTeamId: 'NFL_BUF', homePts: 24, awayPts: 17 },
      { homeTeamId: 'MLB_NYY', awayTeamId: 'MLB_BOS', homePts: 8, awayPts: 3 }
    ];

    for (const data of gameData) {
      const gameInsertData = createMockInsertGame(data);
      const game = await this.storage.createGame(gameInsertData);
      games.push(game);
      this.createdGames.push(game.id);
    }

    // Create test user teams
    const userTeams: UserTeam[] = [];
    const userTeamData = [
      { userId: users[0].id, teamId: 'NBA_LAL' },
      { userId: users[0].id, teamId: 'NFL_NE' },
      { userId: users[1].id, teamId: 'NBA_GSW' }
    ];

    for (const data of userTeamData) {
      const userTeamInsertData = createMockInsertUserTeam(data);
      const userTeam = await this.storage.createUserTeam(userTeamInsertData);
      userTeams.push(userTeam);
      this.createdUserTeams.push({ userId: data.userId, teamId: data.teamId });
    }

    return {
      users,
      userProfiles,
      teams,
      games,
      userTeams
    };
  }

  /**
   * Create a single test user with profile
   */
  async createTestUser(overrides: {
    userId?: string;
    firebaseUid?: string;
    username?: string;
    email?: string;
    favoriteTeams?: string[];
  } = {}): Promise<{ user: User; profile: UserProfile }> {
    const userId = overrides.userId || `test-user-${Date.now()}`;
    const firebaseUid = overrides.firebaseUid || `firebase-uid-${Date.now()}`;

    const userData = createMockInsertUser({
      username: overrides.username || `testuser-${Date.now()}`,
      password: `password-${Date.now()}`
    });

    const user = await this.storage.createUser(userData);
    this.createdUsers.push(user.id);

    const profileData = createMockInsertUserProfile({
      firebaseUid,
      favoriteTeams: overrides.favoriteTeams || []
    });

    const profile = await this.storage.createUserProfile(profileData);
    this.createdUserProfiles.push(profile.firebaseUid);

    return { user, profile };
  }

  /**
   * Create a single test team
   */
  async createTestTeam(overrides: {
    id?: string;
    name?: string;
    league?: string;
  } = {}): Promise<Team> {
    const teamData = createMockInsertTeam({
      id: overrides.id || `TEST_TEAM_${Date.now()}`,
      name: overrides.name || `Test Team ${Date.now()}`,
      league: overrides.league || 'TEST'
    });

    const team = await this.storage.createTeam(teamData);
    this.createdTeams.push(team.id);
    return team;
  }

  /**
   * Create a single test game
   */
  async createTestGame(overrides: {
    homeTeamId?: string;
    awayTeamId?: string;
    homePts?: number;
    awayPts?: number;
  } = {}): Promise<Game> {
    const gameData = createMockInsertGame({
      homeTeamId: overrides.homeTeamId || 'HOME_TEAM',
      awayTeamId: overrides.awayTeamId || 'AWAY_TEAM',
      homePts: overrides.homePts || 100,
      awayPts: overrides.awayPts || 95
    });

    const game = await this.storage.createGame(gameData);
    this.createdGames.push(game.id);
    return game;
  }

  /**
   * Create a user team relationship
   */
  async createTestUserTeam(userId: string, teamId: string): Promise<UserTeam> {
    const userTeamData = createMockInsertUserTeam({ userId, teamId });
    const userTeam = await this.storage.createUserTeam(userTeamData);
    this.createdUserTeams.push({ userId, teamId });
    return userTeam;
  }

  /**
   * Clean up all test data created by this utility
   */
  async cleanup(): Promise<void> {
    try {
      // Clean up user teams
      for (const { userId, teamId } of this.createdUserTeams) {
        try {
          await this.storage.deleteUserTeam(userId, teamId);
        } catch (error) {
          // Ignore errors if already deleted
        }
      }

      // Clean up games
      for (const gameId of this.createdGames) {
        try {
          // Note: MemStorage doesn't have deleteGame, so we skip for now
          // In a real database implementation, you would delete the game
        } catch (error) {
          // Ignore errors if already deleted
        }
      }

      // Clean up teams
      for (const teamId of this.createdTeams) {
        try {
          // Note: MemStorage doesn't have deleteTeam, so we skip for now
          // In a real database implementation, you would delete the team
        } catch (error) {
          // Ignore errors if already deleted
        }
      }

      // Clean up user profiles
      for (const firebaseUid of this.createdUserProfiles) {
        try {
          // Note: MemStorage doesn't have deleteUserProfile, so we skip for now
          // In a real database implementation, you would delete the profile
        } catch (error) {
          // Ignore errors if already deleted
        }
      }

      // Clean up users
      for (const userId of this.createdUsers) {
        try {
          // Note: MemStorage doesn't have deleteUser, so we skip for now
          // In a real database implementation, you would delete the user
        } catch (error) {
          // Ignore errors if already deleted
        }
      }

      // Reset tracking arrays
      this.createdUsers = [];
      this.createdUserProfiles = [];
      this.createdTeams = [];
      this.createdGames = [];
      this.createdUserTeams = [];
    } catch (error) {
      console.error('Error during test cleanup:', error);
    }
  }

  /**
   * Reset storage to clean state (for MemStorage)
   */
  async reset(): Promise<void> {
    if (this.storage instanceof MemStorage) {
      // Create a new MemStorage instance to reset all data
      this.storage = new MemStorage();
      this.createdUsers = [];
      this.createdUserProfiles = [];
      this.createdTeams = [];
      this.createdGames = [];
      this.createdUserTeams = [];
    } else {
      // For real database, use cleanup method
      await this.cleanup();
    }
  }

  /**
   * Verify test data integrity
   */
  async verifyTestData(): Promise<{
    usersExist: boolean;
    profilesExist: boolean;
    teamsExist: boolean;
    gamesExist: boolean;
    userTeamsExist: boolean;
  }> {
    const results = {
      usersExist: true,
      profilesExist: true,
      teamsExist: true,
      gamesExist: true,
      userTeamsExist: true
    };

    try {
      // Check users
      for (const userId of this.createdUsers) {
        const user = await this.storage.getUser(userId);
        if (!user) {
          results.usersExist = false;
          break;
        }
      }

      // Check profiles
      for (const firebaseUid of this.createdUserProfiles) {
        const profile = await this.storage.getUserProfile(firebaseUid);
        if (!profile) {
          results.profilesExist = false;
          break;
        }
      }

      // Check teams
      for (const teamId of this.createdTeams) {
        const team = await this.storage.getTeam(teamId);
        if (!team) {
          results.teamsExist = false;
          break;
        }
      }

      // Check games
      for (const gameId of this.createdGames) {
        const game = await this.storage.getGame(gameId);
        if (!game) {
          results.gamesExist = false;
          break;
        }
      }

      // Check user teams
      for (const { userId } of this.createdUserTeams) {
        const userTeams = await this.storage.getUserTeams(userId);
        if (userTeams.length === 0) {
          results.userTeamsExist = false;
          break;
        }
      }
    } catch (error) {
      console.error('Error verifying test data:', error);
      return {
        usersExist: false,
        profilesExist: false,
        teamsExist: false,
        gamesExist: false,
        userTeamsExist: false
      };
    }

    return results;
  }
}

/**
 * Create a new database test utility instance
 */
export function createDbTestUtils(storage?: IStorage): UserTeamScoresDbTestUtils {
  return new UserTeamScoresDbTestUtils(storage);
}

/**
 * Helper function to set up a clean test environment
 */
export async function setupCleanTestEnvironment(): Promise<UserTeamScoresDbTestUtils> {
  const dbUtils = createDbTestUtils();
  await dbUtils.reset();
  return dbUtils;
}