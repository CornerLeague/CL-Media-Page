/**
 * Test Fixtures for User Team Scores
 * 
 * This file contains predefined test data for various user team scores scenarios.
 * These fixtures provide consistent, realistic data for testing different use cases.
 */

import type { 
  User, 
  UserProfile, 
  Team, 
  Game, 
  UserTeam 
} from '@shared/schema';
import type { 
  GameScore, 
  UserFavoriteTeam, 
  UserTeamScoresResult,
  UserTeamScoresOptions 
} from '../../agents/types';

// ============================================================================
// Sample Users and Profiles
// ============================================================================

export const sampleUsers: User[] = [
  {
    id: 'user-001',
    username: 'sportsfan_john',
    password: 'hashed_password_123'
  },
  {
    id: 'user-002', 
    username: 'basketball_lover',
    password: 'hashed_password_456'
  },
  {
    id: 'user-003',
    username: 'multi_sport_fan',
    password: 'hashed_password_789'
  }
];

export const sampleUserProfiles: UserProfile[] = [
  {
    firebaseUid: 'firebase-uid-001',
    firstName: 'John',
    lastName: 'Smith',
    favoriteSports: ['NBA', 'NFL'],
    favoriteTeams: ['NBA_LAL', 'NFL_KC'],
    onboardingCompleted: true
  },
  {
    firebaseUid: 'firebase-uid-002',
    firstName: 'Sarah',
    lastName: 'Johnson',
    favoriteSports: ['NBA'],
    favoriteTeams: ['NBA_BOS', 'NBA_GSW'],
    onboardingCompleted: true
  },
  {
    firebaseUid: 'firebase-uid-003',
    firstName: 'Mike',
    lastName: 'Wilson',
    favoriteSports: ['NBA', 'NFL', 'MLB'],
    favoriteTeams: ['NBA_CHI', 'NFL_GB', 'MLB_NYY'],
    onboardingCompleted: false
  }
];

// ============================================================================
// Sample Teams
// ============================================================================

export const sampleTeams: Team[] = [
  // NBA Teams
  {
    id: 'NBA_LAL',
    league: 'NBA',
    code: 'LAL',
    name: 'Los Angeles Lakers'
  },
  {
    id: 'NBA_BOS',
    league: 'NBA', 
    code: 'BOS',
    name: 'Boston Celtics'
  },
  {
    id: 'NBA_GSW',
    league: 'NBA',
    code: 'GSW',
    name: 'Golden State Warriors'
  },
  {
    id: 'NBA_CHI',
    league: 'NBA',
    code: 'CHI',
    name: 'Chicago Bulls'
  },
  {
    id: 'NBA_MIA',
    league: 'NBA',
    code: 'MIA',
    name: 'Miami Heat'
  },
  
  // NFL Teams
  {
    id: 'NFL_KC',
    league: 'NFL',
    code: 'KC',
    name: 'Kansas City Chiefs'
  },
  {
    id: 'NFL_GB',
    league: 'NFL',
    code: 'GB',
    name: 'Green Bay Packers'
  },
  {
    id: 'NFL_NE',
    league: 'NFL',
    code: 'NE',
    name: 'New England Patriots'
  },
  
  // MLB Teams
  {
    id: 'MLB_NYY',
    league: 'MLB',
    code: 'NYY',
    name: 'New York Yankees'
  },
  {
    id: 'MLB_LAD',
    league: 'MLB',
    code: 'LAD',
    name: 'Los Angeles Dodgers'
  }
];

// ============================================================================
// Sample Games
// ============================================================================

export const sampleGames: Game[] = [
  // Lakers vs Celtics - Final game
  {
    id: 'game-001',
    homeTeamId: 'NBA_LAL',
    awayTeamId: 'NBA_BOS',
    homePts: 108,
    awayPts: 102,
    status: 'final',
    period: '4',
    timeRemaining: null,
    startTime: new Date('2024-01-15T20:00:00Z'),
    cachedAt: new Date('2024-01-15T23:30:00Z')
  },
  
  // Warriors vs Bulls - Live game
  {
    id: 'game-002',
    homeTeamId: 'NBA_GSW',
    awayTeamId: 'NBA_CHI',
    homePts: 85,
    awayPts: 78,
    status: 'in_progress',
    period: '3',
    timeRemaining: '7:23',
    startTime: new Date('2024-01-16T22:00:00Z'),
    cachedAt: new Date('2024-01-16T23:45:00Z')
  },
  
  // Heat vs Lakers - Scheduled game
  {
    id: 'game-003',
    homeTeamId: 'NBA_MIA',
    awayTeamId: 'NBA_LAL',
    homePts: 0,
    awayPts: 0,
    status: 'scheduled',
    period: null,
    timeRemaining: null,
    startTime: new Date('2024-01-17T20:30:00Z'),
    cachedAt: new Date('2024-01-16T12:00:00Z')
  },
  
  // Chiefs vs Packers - NFL Final
  {
    id: 'game-004',
    homeTeamId: 'NFL_KC',
    awayTeamId: 'NFL_GB',
    homePts: 28,
    awayPts: 21,
    status: 'final',
    period: '4',
    timeRemaining: null,
    startTime: new Date('2024-01-14T18:00:00Z'),
    cachedAt: new Date('2024-01-14T21:30:00Z')
  },
  
  // Yankees vs Dodgers - MLB Final
  {
    id: 'game-005',
    homeTeamId: 'MLB_NYY',
    awayTeamId: 'MLB_LAD',
    homePts: 7,
    awayPts: 4,
    status: 'final',
    period: '9',
    timeRemaining: null,
    startTime: new Date('2024-01-15T19:00:00Z'),
    cachedAt: new Date('2024-01-15T22:15:00Z')
  }
];

// ============================================================================
// Sample GameScores (Agent Format)
// ============================================================================

export const sampleGameScores: GameScore[] = [
  {
    gameId: 'game-001',
    homeTeamId: 'NBA_LAL',
    awayTeamId: 'NBA_BOS',
    homePts: 108,
    awayPts: 102,
    status: 'final',
    period: '4',
    timeRemaining: null,
    startTime: new Date('2024-01-15T20:00:00Z'),
    source: 'live'
  },
  {
    gameId: 'game-002',
    homeTeamId: 'NBA_GSW',
    awayTeamId: 'NBA_CHI',
    homePts: 85,
    awayPts: 78,
    status: 'in_progress',
    period: '3',
    timeRemaining: '7:23',
    startTime: new Date('2024-01-16T22:00:00Z'),
    source: 'live'
  }
];

// ============================================================================
// Sample User Team Relationships
// ============================================================================

export const sampleUserTeams: UserTeam[] = [
  {
    id: 'ut-001',
    userId: 'user-001',
    teamId: 'NBA_LAL'
  },
  {
    id: 'ut-002',
    userId: 'user-001',
    teamId: 'NFL_KC'
  },
  {
    id: 'ut-003',
    userId: 'user-002',
    teamId: 'NBA_BOS'
  },
  {
    id: 'ut-004',
    userId: 'user-002',
    teamId: 'NBA_GSW'
  },
  {
    id: 'ut-005',
    userId: 'user-003',
    teamId: 'NBA_CHI'
  },
  {
    id: 'ut-006',
    userId: 'user-003',
    teamId: 'NFL_GB'
  },
  {
    id: 'ut-007',
    userId: 'user-003',
    teamId: 'MLB_NYY'
  }
];

// ============================================================================
// Sample User Favorite Teams (Agent Format)
// ============================================================================

export const sampleUserFavoriteTeams: UserFavoriteTeam[] = [
  {
    teamId: 'NBA_LAL',
    sport: 'NBA'
  },
  {
    teamId: 'NFL_KC',
    sport: 'NFL'
  },
  {
    teamId: 'NBA_BOS',
    sport: 'NBA'
  },
  {
    teamId: 'NBA_GSW',
    sport: 'NBA'
  },
  {
    teamId: 'NBA_CHI',
    sport: 'NBA'
  },
  {
    teamId: 'NFL_GB',
    sport: 'NFL'
  },
  {
    teamId: 'MLB_NYY',
    sport: 'MLB'
  }
];

// ============================================================================
// Sample Request Options
// ============================================================================

export const sampleUserTeamScoresOptions: UserTeamScoresOptions[] = [
  {
    firebaseUid: 'firebase-uid-001',
    sport: 'NBA',
    limit: 10,
    mode: 'live'
  },
  {
    firebaseUid: 'firebase-uid-002',
    sport: 'NBA',
    limit: 5,
    mode: 'schedule'
  },
  {
    firebaseUid: 'firebase-uid-003',
    sport: 'NFL',
    limit: 20,
    mode: 'live'
  }
];

// ============================================================================
// Sample Complete Results
// ============================================================================

export const sampleUserTeamScoresResults: UserTeamScoresResult[] = [
  {
    games: [sampleGames[0], sampleGames[2]], // Lakers games
    userProfile: sampleUserProfiles[0],
    favoriteTeams: [sampleUserFavoriteTeams[0], sampleUserFavoriteTeams[1]],
    cacheHit: false,
    source: 'live'
  },
  {
    games: [sampleGames[1]], // Warriors vs Bulls
    userProfile: sampleUserProfiles[1],
    favoriteTeams: [sampleUserFavoriteTeams[2], sampleUserFavoriteTeams[3]],
    cacheHit: true,
    source: 'cached'
  },
  {
    games: [], // No games found
    userProfile: sampleUserProfiles[2],
    favoriteTeams: [sampleUserFavoriteTeams[4], sampleUserFavoriteTeams[5], sampleUserFavoriteTeams[6]],
    cacheHit: false,
    source: 'live'
  }
];

// ============================================================================
// Test Scenarios
// ============================================================================

/**
 * Predefined test scenarios for common use cases
 */
export const testScenarios = {
  // User with NBA and NFL teams, has recent games
  userWithMultipleSports: {
    user: sampleUsers[0],
    profile: sampleUserProfiles[0],
    teams: [sampleTeams[0], sampleTeams[5]], // Lakers, Chiefs
    games: [sampleGames[0], sampleGames[3]], // Lakers vs Celtics, Chiefs vs Packers
    favoriteTeams: [sampleUserFavoriteTeams[0], sampleUserFavoriteTeams[1]]
  },
  
  // User with only NBA teams, has live game
  nbaOnlyUser: {
    user: sampleUsers[1],
    profile: sampleUserProfiles[1],
    teams: [sampleTeams[1], sampleTeams[2]], // Celtics, Warriors
    games: [sampleGames[1]], // Warriors vs Bulls (live)
    favoriteTeams: [sampleUserFavoriteTeams[2], sampleUserFavoriteTeams[3]]
  },
  
  // User with teams but no recent games
  userWithNoRecentGames: {
    user: sampleUsers[2],
    profile: sampleUserProfiles[2],
    teams: [sampleTeams[3], sampleTeams[6], sampleTeams[8]], // Bulls, Packers, Yankees
    games: [], // No recent games
    favoriteTeams: [sampleUserFavoriteTeams[4], sampleUserFavoriteTeams[5], sampleUserFavoriteTeams[6]]
  },
  
  // User with incomplete onboarding
  incompleteOnboardingUser: {
    user: sampleUsers[2],
    profile: { ...sampleUserProfiles[2], onboardingCompleted: false },
    teams: [],
    games: [],
    favoriteTeams: []
  }
};

// ============================================================================
// Error Scenarios
// ============================================================================

export const errorScenarios = {
  // Non-existent user
  nonExistentUser: {
    firebaseUid: 'non-existent-uid',
    expectedError: 'User not found'
  },
  
  // User with no favorite teams
  userWithNoTeams: {
    firebaseUid: 'firebase-uid-no-teams',
    profile: {
      firebaseUid: 'firebase-uid-no-teams',
      firstName: 'Empty',
      lastName: 'User',
      favoriteSports: [],
      favoriteTeams: [],
      onboardingCompleted: true
    }
  },
  
  // Invalid sport parameter
  invalidSport: {
    firebaseUid: 'firebase-uid-001',
    sport: 'INVALID_SPORT',
    expectedError: 'Invalid sport parameter'
  },
  
  // Invalid limit parameter
  invalidLimit: {
    firebaseUid: 'firebase-uid-001',
    sport: 'NBA',
    limit: -1,
    expectedError: 'Invalid limit parameter'
  }
};

// ============================================================================
// Performance Test Data
// ============================================================================

export const performanceTestData = {
  // Large dataset for performance testing
  manyUsers: Array.from({ length: 100 }, (_, i) => ({
    id: `perf-user-${i}`,
    username: `perfuser_${i}`,
    password: 'hashed_password'
  })),
  
  manyTeams: Array.from({ length: 50 }, (_, i) => ({
    id: `PERF_TEAM_${i}`,
    league: i % 2 === 0 ? 'NBA' : 'NFL',
    code: `PT${i}`,
    name: `Performance Team ${i}`
  })),
  
  manyGames: Array.from({ length: 200 }, (_, i) => ({
    id: `perf-game-${i}`,
    homeTeamId: `PERF_TEAM_${i % 25}`,
    awayTeamId: `PERF_TEAM_${(i + 1) % 25}`,
    homePts: Math.floor(Math.random() * 50) + 80,
    awayPts: Math.floor(Math.random() * 50) + 80,
    status: 'final' as const,
    period: '4',
    timeRemaining: null,
    startTime: new Date(Date.now() - i * 24 * 60 * 60 * 1000), // i days ago
    cachedAt: new Date()
  }))
};

// ============================================================================
// Utility Functions for Test Data
// ============================================================================

/**
 * Get all games for a specific team
 */
export function getGamesForTeam(teamId: string): Game[] {
  return sampleGames.filter(game => 
    game.homeTeamId === teamId || game.awayTeamId === teamId
  );
}

/**
 * Get all teams for a specific sport
 */
export function getTeamsForSport(sport: string): Team[] {
  return sampleTeams.filter(team => team.league === sport);
}

/**
 * Get user profile by Firebase UID
 */
export function getUserProfileByUid(firebaseUid: string): UserProfile | undefined {
  return sampleUserProfiles.find(profile => profile.firebaseUid === firebaseUid);
}

/**
 * Get favorite teams for a user
 */
export function getFavoriteTeamsForUser(firebaseUid: string): UserFavoriteTeam[] {
  const profile = getUserProfileByUid(firebaseUid);
  if (!profile || !profile.favoriteTeams) return [];
  
  return profile.favoriteTeams.map(teamId => {
    const team = sampleTeams.find(t => t.id === teamId);
    return {
      teamId,
      sport: team?.league || 'NBA'
    };
  });
}

/**
 * Create a complete test dataset for a user
 */
export function createCompleteUserDataset(firebaseUid: string) {
  const profile = getUserProfileByUid(firebaseUid);
  if (!profile) return null;
  
  const favoriteTeams = getFavoriteTeamsForUser(firebaseUid);
  const games = favoriteTeams.flatMap(ft => getGamesForTeam(ft.teamId));
  
  return {
    profile,
    favoriteTeams,
    games,
    teams: favoriteTeams.map(ft => sampleTeams.find(t => t.id === ft.teamId)!).filter(Boolean)
  };
}

// ============================================================================
// Export All Test Data
// ============================================================================

export const userTeamScoresTestData = {
  users: sampleUsers,
  profiles: sampleUserProfiles,
  teams: sampleTeams,
  games: sampleGames,
  gameScores: sampleGameScores,
  userTeams: sampleUserTeams,
  favoriteTeams: sampleUserFavoriteTeams,
  options: sampleUserTeamScoresOptions,
  results: sampleUserTeamScoresResults,
  scenarios: testScenarios,
  errors: errorScenarios,
  performance: performanceTestData,
  utils: {
    getGamesForTeam,
    getTeamsForSport,
    getUserProfileByUid,
    getFavoriteTeamsForUser,
    createCompleteUserDataset
  }
};

export default userTeamScoresTestData;