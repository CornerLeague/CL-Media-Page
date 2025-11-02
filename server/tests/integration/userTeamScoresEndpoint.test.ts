import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MemStorage } from '../../storage';
import type { InsertTeam, InsertGame, InsertUserProfile } from '@shared/schema';

// Mock the storage module
vi.mock('../../storage', () => {
  const { MemStorage } = vi.importActual('../../storage') as any;
  return {
    storage: new MemStorage(),
    MemStorage,
  };
});

describe('User Team Scores Endpoint', () => {
  let app: express.Application;
  let mockStorage: MemStorage;

  beforeEach(async () => {
    // Create a fresh storage instance for each test
    mockStorage = new MemStorage();
    
    // Mock the storage import
    vi.doMock('../../storage', () => ({
      storage: mockStorage,
    }));

    // Create Express app and register the route
    app = express();
    app.use(express.json());
    
    // Add the user team scores route
    app.get('/api/user-team-scores', async (req, res) => {
      try {
        const firebaseUid = req.headers['x-dev-firebase-uid'] as string;
        const sport = req.query.sport as string;
        const limit = parseInt(req.query.limit as string) || 10;

        if (!firebaseUid) {
          return res.status(403).json({ error: 'Authentication required' });
        }

        if (!sport) {
          return res.status(400).json({ error: 'Sport parameter is required' });
        }

        // Get user profile
        const userProfile = await mockStorage.getUserProfile(firebaseUid);
        if (!userProfile) {
          return res.status(404).json({ error: 'User profile not found' });
        }

        // Filter favorite teams by sport
        const favoriteTeams = userProfile.favoriteTeams?.filter(teamId => 
          teamId.startsWith(sport.toUpperCase() + '_')
        ) || [];

        if (favoriteTeams.length === 0) {
          return res.json([]);
        }

        // Get games for favorite teams
        const games = await mockStorage.getGamesByTeamIds(favoriteTeams, limit);
        
        return res.json(games);
      } catch (error) {
        console.error('Error in user team scores endpoint:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Set up test data
    await setupTestData();
  });

  async function setupTestData() {
    // Create teams
    const teams: InsertTeam[] = [
      { id: 'NBA_LAL', league: 'NBA', code: 'LAL', name: 'Los Angeles Lakers' },
      { id: 'NBA_BOS', league: 'NBA', code: 'BOS', name: 'Boston Celtics' },
      { id: 'NBA_GSW', league: 'NBA', code: 'GSW', name: 'Golden State Warriors' },
      { id: 'NHL_NJD', league: 'NHL', code: 'NJD', name: 'New Jersey Devils' },
    ];

    for (const team of teams) {
      await mockStorage.createTeam(team);
    }

    // Create games
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const games: InsertGame[] = [
      {
        id: 'game1',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 108,
        awayPts: 102,
        status: 'Final',
        startTime: yesterday,
      },
      {
        id: 'game2',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_LAL',
        homePts: 95,
        awayPts: 110,
        status: 'Final',
        startTime: yesterday,
      },
      {
        id: 'game3',
        homeTeamId: 'NHL_NJD',
        awayTeamId: 'NHL_NYR',
        homePts: 3,
        awayPts: 2,
        status: 'Final',
        startTime: yesterday,
      },
      {
        id: 'game4',
        homeTeamId: 'NBA_BOS',
        awayTeamId: 'NBA_GSW',
        homePts: 0,
        awayPts: 0,
        status: 'Scheduled',
        startTime: tomorrow,
      },
    ];

    for (const game of games) {
      await mockStorage.createGame(game);
    }

    // Create user profiles
    const userProfiles: InsertUserProfile[] = [
      {
        firebaseUid: 'user-with-nba-teams',
        firstName: 'NBA',
        lastName: 'Fan',
        favoriteSports: ['NBA'],
        favoriteTeams: ['NBA_LAL', 'NBA_BOS'],
        onboardingCompleted: true,
      },
      {
        firebaseUid: 'user-with-no-teams',
        firstName: 'No',
        lastName: 'Teams',
        favoriteSports: [],
        favoriteTeams: [],
        onboardingCompleted: true,
      },
    ];

    for (const profile of userProfiles) {
      await mockStorage.createUserProfile(profile);
    }
  }

  it('should return games for user favorite teams', async () => {
    const response = await request(app)
      .get('/api/user-team-scores?sport=NBA&limit=10')
      .set('x-dev-firebase-uid', 'user-with-nba-teams');

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    
    // Verify games are for the correct teams
    const gameTeamIds = response.body.flatMap((game: any) => [game.homeTeamId, game.awayTeamId]);
    expect(gameTeamIds.some((id: string) => id === 'NBA_LAL' || id === 'NBA_BOS')).toBe(true);
  });

  it('should respect the limit parameter', async () => {
    const response = await request(app)
      .get('/api/user-team-scores?sport=NBA&limit=1')
      .set('x-dev-firebase-uid', 'user-with-nba-teams');

    expect(response.status).toBe(200);
    expect(response.body.length).toBeLessThanOrEqual(1);
  });

  it('should return empty array for user with no favorite teams', async () => {
    const response = await request(app)
      .get('/api/user-team-scores?sport=NBA&limit=10')
      .set('x-dev-firebase-uid', 'user-with-no-teams');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('should return 400 for missing sport parameter', async () => {
    const response = await request(app)
      .get('/api/user-team-scores?limit=10')
      .set('x-dev-firebase-uid', 'user-with-nba-teams');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Sport parameter is required');
  });

  it('should return 403 for missing authentication', async () => {
    const response = await request(app)
      .get('/api/user-team-scores?sport=NBA&limit=10');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Authentication required');
  });

  it('should return 404 for non-existent user', async () => {
    const response = await request(app)
      .get('/api/user-team-scores?sport=NBA&limit=10')
      .set('x-dev-firebase-uid', 'non-existent-user');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('User profile not found');
  });

  it('should filter teams by sport correctly', async () => {
    // Create a user with both NBA and NHL teams
    await mockStorage.createUserProfile({
      firebaseUid: 'multi-sport-user',
      firstName: 'Multi',
      lastName: 'Sport',
      favoriteSports: ['NBA', 'NHL'],
      favoriteTeams: ['NBA_LAL', 'NHL_NJD'],
      onboardingCompleted: true,
    });

    // Request NBA games only
    const nbaResponse = await request(app)
      .get('/api/user-team-scores?sport=NBA&limit=10')
      .set('x-dev-firebase-uid', 'multi-sport-user');

    expect(nbaResponse.status).toBe(200);
    const nbaGameTeamIds = nbaResponse.body.flatMap((game: any) => [game.homeTeamId, game.awayTeamId]);
    expect(nbaGameTeamIds.every((id: string) => id.startsWith('NBA_') || !id.startsWith('NHL_'))).toBe(true);
  });
});