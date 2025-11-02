import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import type { InsertTeam, InsertGame, InsertUser, InsertUserProfile } from '@shared/schema';

describe('User Team Scores - Storage Layer', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  it('should retrieve games for user favorite teams', async () => {
    const now = new Date();
    
    // Create teams
    const team1: InsertTeam = {
      id: 'NBA_LAL',
      league: 'NBA',
      code: 'LAL',
      name: 'Los Angeles Lakers',
    };
    const team2: InsertTeam = {
      id: 'NBA_BOS',
      league: 'NBA',
      code: 'BOS',
      name: 'Boston Celtics',
    };
    const team3: InsertTeam = {
      id: 'NHL_NJD',
      league: 'NHL',
      code: 'NJD',
      name: 'New Jersey Devils',
    };

    await storage.createTeam(team1);
    await storage.createTeam(team2);
    await storage.createTeam(team3);

    // Create user (InsertUser doesn't include id - it's auto-generated)
    const user: InsertUser = {
      username: 'testuser',
      password: 'hashedpassword',
    };
    await storage.createUser(user);

    // Create user profile with favorite teams
    const userProfile: InsertUserProfile = {
      firebaseUid: 'firebase-123',
      firstName: 'Test',
      lastName: 'User',
      favoriteSports: ['NBA'],
      favoriteTeams: ['NBA_LAL', 'NBA_BOS'],
      onboardingCompleted: true,
    };
    await storage.createUserProfile(userProfile);

    // Create games
    const game1: InsertGame = {
      id: 'GAME_1',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 108,
      awayPts: 102,
      status: 'final',
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // -24h
    };
    const game2: InsertGame = {
      id: 'GAME_2',
      homeTeamId: 'NBA_BOS',
      awayTeamId: 'NBA_LAL',
      homePts: 95,
      awayPts: 110,
      status: 'final',
      startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000), // -12h
    };
    const game3: InsertGame = {
      id: 'GAME_3',
      homeTeamId: 'NHL_NJD',
      awayTeamId: 'NHL_NJD', // dummy
      homePts: 3,
      awayPts: 2,
      status: 'final',
      startTime: new Date(now.getTime() - 6 * 60 * 60 * 1000), // -6h
    };

    await storage.createGame(game1);
    await storage.createGame(game2);
    await storage.createGame(game3);

    // Test: Get user profile
    const profile = await storage.getUserProfile('firebase-123');
    expect(profile).toBeDefined();
    expect(profile!.favoriteTeams).toEqual(['NBA_LAL', 'NBA_BOS']);

    // Test: Get games by team IDs
    const games = await storage.getGamesByTeamIds(['NBA_LAL', 'NBA_BOS']);
    expect(games).toHaveLength(2);
    expect(games.map(g => g.id).sort()).toEqual(['GAME_1', 'GAME_2']);

    // Test: Games should not include NHL games
    const allGames = await storage.getGamesByTeamIds(['NBA_LAL', 'NBA_BOS', 'NHL_NJD']);
    expect(allGames).toHaveLength(3);
    expect(allGames.map(g => g.id).sort()).toEqual(['GAME_1', 'GAME_2', 'GAME_3']);
  });

  it('should handle user with no favorite teams', async () => {
    // Create user profile with no favorite teams
    const userProfile: InsertUserProfile = {
      firebaseUid: 'firebase-no-favorites',
      firstName: 'No',
      lastName: 'Favorites',
      favoriteSports: ['NBA'],
      favoriteTeams: [],
      onboardingCompleted: true,
    };
    await storage.createUserProfile(userProfile);

    const profile = await storage.getUserProfile('firebase-no-favorites');
    expect(profile).toBeDefined();
    expect(profile!.favoriteTeams).toEqual([]);

    // Should return empty array when no team IDs provided
    const games = await storage.getGamesByTeamIds([]);
    expect(games).toHaveLength(0);
  });

  it('should handle non-existent user', async () => {
    const profile = await storage.getUserProfile('non-existent');
    expect(profile).toBeUndefined();
  });
});