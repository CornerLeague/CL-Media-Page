/**
 * Mock Factories for User Team Scores Testing
 * 
 * This file provides mock data generators for all types related to user team scores functionality.
 * These mocks are designed to be realistic and flexible for comprehensive testing scenarios.
 */

import { randomUUID } from 'crypto';
import type { 
  User, 
  UserProfile, 
  Team, 
  Game, 
  InsertUser,
  InsertUserProfile,
  InsertTeam,
  InsertGame,
  UserTeam,
  InsertUserTeam
} from '../../../shared/schema';
import type { 
  GameScore, 
  UserFavoriteTeam, 
  UserTeamScoresResult,
  UserTeamScoresOptions 
} from '../../agents/types';

// ============================================================================
// User and Profile Mock Factories
// ============================================================================

/**
 * Create a mock User with realistic data
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
    username: `testuser_${Date.now()}`,
    password: 'hashed_password_123',
    ...overrides
  };
}

/**
 * Create a mock UserProfile with realistic data
 */
export function createMockUserProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    firebaseUid: `firebase_${randomUUID()}`,
    firstName: 'John',
    lastName: 'Doe',
    favoriteSports: ['NBA', 'NFL'],
    favoriteTeams: ['NBA_LAL', 'NFL_KC'],
    onboardingCompleted: true,
    ...overrides
  };
}

/**
 * Create a mock InsertUser for database operations
 */
export function createMockInsertUser(overrides: Partial<InsertUser> = {}): InsertUser {
  return {
    username: `testuser_${Date.now()}`,
    password: 'hashed_password_123',
    ...overrides
  };
}

/**
 * Create a mock InsertUserProfile for database operations
 */
export function createMockInsertUserProfile(overrides: Partial<InsertUserProfile> = {}): InsertUserProfile {
  return {
    firebaseUid: `firebase_${randomUUID()}`,
    firstName: 'Jane',
    lastName: 'Smith',
    favoriteSports: ['NBA'],
    favoriteTeams: ['NBA_BOS'],
    onboardingCompleted: true,
    ...overrides
  };
}

// ============================================================================
// Team Mock Factories
// ============================================================================

/**
 * Create a mock Team with realistic data
 */
export function createMockTeam(overrides: Partial<Team> = {}): Team {
  const leagues = ['NBA', 'NFL', 'MLB', 'NHL'];
  const league = overrides.league || leagues[Math.floor(Math.random() * leagues.length)];
  const teamNames = {
    NBA: ['Lakers', 'Celtics', 'Warriors', 'Bulls'],
    NFL: ['Chiefs', 'Patriots', 'Cowboys', 'Packers'],
    MLB: ['Yankees', 'Dodgers', 'Red Sox', 'Giants'],
    NHL: ['Rangers', 'Bruins', 'Kings', 'Blackhawks']
  };
  
  const names = teamNames[league as keyof typeof teamNames] || ['Test Team'];
  const name = names[Math.floor(Math.random() * names.length)];
  
  return {
    id: `${league}_${name.substring(0, 3).toUpperCase()}`,
    league,
    code: name.substring(0, 3).toUpperCase(),
    name: `Test ${name}`,
    ...overrides
  };
}

/**
 * Create a mock InsertTeam for database operations
 */
export function createMockInsertTeam(overrides: Partial<InsertTeam> = {}): InsertTeam {
  const team = createMockTeam(overrides);
  return {
    id: team.id,
    league: team.league,
    code: team.code,
    name: team.name,
    ...overrides
  };
}

// ============================================================================
// Game and GameScore Mock Factories
// ============================================================================

/**
 * Create a mock Game with realistic data
 */
export function createMockGame(overrides: Partial<Game> = {}): Game {
  const now = new Date();
  return {
    id: `game_${randomUUID()}`,
    homeTeamId: 'NBA_LAL',
    awayTeamId: 'NBA_BOS',
    homePts: Math.floor(Math.random() * 50) + 80, // 80-130 points
    awayPts: Math.floor(Math.random() * 50) + 80,
    status: 'final',
    period: '4',
    timeRemaining: null,
    startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
    cachedAt: now,
    ...overrides
  };
}

/**
 * Create a mock InsertGame for database operations
 */
export function createMockInsertGame(overrides: Partial<InsertGame> = {}): InsertGame {
  const game = createMockGame(overrides);
  return {
    id: game.id,
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homePts: game.homePts,
    awayPts: game.awayPts,
    status: game.status,
    period: game.period,
    timeRemaining: game.timeRemaining,
    startTime: game.startTime,
    ...overrides
  };
}

/**
 * Create a mock GameScore (agent type) with realistic data
 */
export function createMockGameScore(overrides: Partial<GameScore> = {}): GameScore {
  const now = new Date();
  return {
    gameId: `game_${randomUUID()}`,
    homeTeamId: 'NBA_LAL',
    awayTeamId: 'NBA_BOS',
    homePts: Math.floor(Math.random() * 50) + 80,
    awayPts: Math.floor(Math.random() * 50) + 80,
    status: 'final',
    period: '4',
    timeRemaining: null,
    startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    source: 'test',
    ...overrides
  };
}

// ============================================================================
// User Team Relationship Mock Factories
// ============================================================================

/**
 * Create a mock UserTeam relationship
 */
export function createMockUserTeam(overrides: Partial<UserTeam> = {}): UserTeam {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    teamId: 'NBA_LAL',
    ...overrides
  };
}

/**
 * Create a mock InsertUserTeam for database operations
 */
export function createMockInsertUserTeam(overrides: Partial<InsertUserTeam> = {}): InsertUserTeam {
  return {
    userId: randomUUID(),
    teamId: 'NBA_LAL',
    ...overrides
  };
}

/**
 * Create a mock UserFavoriteTeam (agent type)
 */
export function createMockUserFavoriteTeam(overrides: Partial<UserFavoriteTeam> = {}): UserFavoriteTeam {
  return {
    teamId: 'NBA_LAL',
    sport: 'NBA',
    ...overrides
  };
}

// ============================================================================
// User Team Scores Result Mock Factories
// ============================================================================

/**
 * Create a mock UserTeamScoresOptions
 */
export function createMockUserTeamScoresOptions(overrides: Partial<UserTeamScoresOptions> = {}): UserTeamScoresOptions {
  return {
    firebaseUid: `firebase_${randomUUID()}`,
    sport: 'NBA',
    limit: 10,
    mode: 'live',
    ...overrides
  };
}

/**
 * Create a mock UserTeamScoresResult
 */
export function createMockUserTeamScoresResult(overrides: Partial<UserTeamScoresResult> = {}): UserTeamScoresResult {
  const userProfile = createMockUserProfile();
  const favoriteTeams = [createMockUserFavoriteTeam()];
  const games = [createMockGame()];
  
  return {
    games,
    userProfile,
    favoriteTeams,
    cacheHit: false,
    source: 'live',
    ...overrides
  };
}

// ============================================================================
// Batch Mock Generators
// ============================================================================

/**
 * Create multiple mock games for a specific team
 */
export function createMockGamesForTeam(teamId: string, count: number = 5): Game[] {
  const games: Game[] = [];
  const now = new Date();
  
  for (let i = 0; i < count; i++) {
    const isHome = Math.random() > 0.5;
    const game = createMockGame({
      id: `game_${teamId}_${i}`,
      homeTeamId: isHome ? teamId : `OTHER_TEAM_${i}`,
      awayTeamId: isHome ? `OTHER_TEAM_${i}` : teamId,
      startTime: new Date(now.getTime() - (i + 1) * 24 * 60 * 60 * 1000), // i+1 days ago
      status: i === 0 ? 'live' : 'final' // Most recent game is live
    });
    games.push(game);
  }
  
  return games;
}

/**
 * Create multiple mock teams for different sports
 */
export function createMockTeamsForSports(sports: string[]): Team[] {
  const teams: Team[] = [];
  
  sports.forEach((sport, sportIndex) => {
    for (let i = 0; i < 3; i++) { // 3 teams per sport
      const team = createMockTeam({
        id: `${sport}_TEAM_${i}`,
        league: sport,
        code: `T${sportIndex}${i}`,
        name: `${sport} Team ${i + 1}`
      });
      teams.push(team);
    }
  });
  
  return teams;
}

/**
 * Create a complete mock user with profile and favorite teams
 */
export function createMockUserWithTeams(sports: string[] = ['NBA', 'NFL']): {
  user: User;
  profile: UserProfile;
  teams: Team[];
  favoriteTeams: UserFavoriteTeam[];
} {
  const user = createMockUser();
  const teams = createMockTeamsForSports(sports);
  const favoriteTeamIds = teams.slice(0, 2).map(t => t.id); // First 2 teams as favorites
  
  const profile = createMockUserProfile({
    firebaseUid: user.id,
    favoriteSports: sports,
    favoriteTeams: favoriteTeamIds
  });
  
  const favoriteTeams = favoriteTeamIds.map(teamId => {
    const team = teams.find(t => t.id === teamId)!;
    return createMockUserFavoriteTeam({
      teamId,
      sport: team.league
    });
  });
  
  return { user, profile, teams, favoriteTeams };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate realistic team IDs for different sports
 */
export function generateTeamIds(sport: string, count: number = 3): string[] {
  const teamCodes = {
    NBA: ['LAL', 'BOS', 'GSW', 'CHI', 'MIA'],
    NFL: ['KC', 'NE', 'DAL', 'GB', 'SF'],
    MLB: ['NYY', 'LAD', 'BOS', 'SF', 'HOU'],
    NHL: ['NYR', 'BOS', 'LAK', 'CHI', 'TBL']
  };
  
  const codes = teamCodes[sport as keyof typeof teamCodes] || ['T1', 'T2', 'T3'];
  return codes.slice(0, count).map(code => `${sport}_${code}`);
}

/**
 * Create realistic game statuses for testing different scenarios
 */
export function createGameStatuses(): Array<'scheduled' | 'in_progress' | 'final'> {
  return ['scheduled', 'in_progress', 'final'];
}

/**
 * Create time-based game scenarios (past, current, future)
 */
export function createTimeBasedGames(teamId: string): Game[] {
  const now = new Date();
  
  return [
    // Past game (final)
    createMockGame({
      id: 'past_game',
      homeTeamId: teamId,
      awayTeamId: 'OTHER_TEAM',
      status: 'final',
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000) // 1 day ago
    }),
    
    // Current game (in progress)
    createMockGame({
      id: 'current_game',
      homeTeamId: 'OTHER_TEAM',
      awayTeamId: teamId,
      status: 'in_progress',
      period: '3',
      timeRemaining: '5:23',
      startTime: new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago
    }),
    
    // Future game (scheduled)
    createMockGame({
      id: 'future_game',
      homeTeamId: teamId,
      awayTeamId: 'FUTURE_OPPONENT',
      status: 'scheduled',
      homePts: 0,
      awayPts: 0,
      period: null,
      timeRemaining: null,
      startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000) // 1 day from now
    })
  ];
}

// ============================================================================
// Export All Mock Factories
// ============================================================================

export const userTeamScoresMocks = {
  // User mocks
  createMockUser,
  createMockInsertUser,
  createMockUserProfile,
  createMockInsertUserProfile,
  
  // Team mocks
  createMockTeam,
  createMockInsertTeam,
  
  // Game mocks
  createMockGame,
  createMockInsertGame,
  createMockGameScore,
  
  // Relationship mocks
  createMockUserTeam,
  createMockInsertUserTeam,
  createMockUserFavoriteTeam,
  
  // Result mocks
  createMockUserTeamScoresOptions,
  createMockUserTeamScoresResult,
  
  // Batch generators
  createMockGamesForTeam,
  createMockTeamsForSports,
  createMockUserWithTeams,
  
  // Utilities
  generateTeamIds,
  createGameStatuses,
  createTimeBasedGames
};

export default userTeamScoresMocks;