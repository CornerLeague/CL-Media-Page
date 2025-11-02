import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'net';
import { registerRoutes } from '../../routes.js';

// Set up development environment
process.env.NODE_ENV = 'development';
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;

describe('User Team Scores API', () => {
  let server: any;
  let baseUrl: string;
  const devUid = 'test-user-123';

  const postJson = async (path: string, body: any) => {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-firebase-uid': devUid,
      },
      body: JSON.stringify(body),
    });
  };

  const getUserTeamScores = async (params: Record<string, string> = {}) => {
    const searchParams = new URLSearchParams(params);
    return fetch(`${baseUrl}/api/user-team-scores?${searchParams}`, {
      headers: {
        'x-dev-firebase-uid': devUid,
      },
    });
  };

  beforeAll(async () => {
    const app = express();
    app.use(cookieParser());
    app.use(express.json());
    registerRoutes(app);

    server = app.listen(0);
    const address = server.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;

    // Wait for server to be ready
    await new Promise((resolve) => {
      server.on('listening', resolve);
    });

    const now = Date.now();
    // Seed teams
    let r = await postJson('/api/dev/teams', { id: 'NBA_LAL', league: 'NBA', code: 'LAL', name: 'Los Angeles Lakers' });
    expect(r.status).toBe(201);
    r = await postJson('/api/dev/teams', { id: 'NBA_BOS', league: 'NBA', code: 'BOS', name: 'Boston Celtics' });
    expect(r.status).toBe(201);
    r = await postJson('/api/dev/teams', { id: 'NHL_NJD', league: 'NHL', code: 'NJD', name: 'New Jersey Devils' });
    expect(r.status).toBe(201);

    // Seed games with scores (recent games)
    r = await postJson('/api/dev/games', {
      id: 'GAME_1',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 108,
      awayPts: 102,
      status: 'final',
      startTime: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // -24h (yesterday)
    });
    expect(r.status).toBe(201);

    r = await postJson('/api/dev/games', {
      id: 'GAME_2',
      homeTeamId: 'NBA_BOS',
      awayTeamId: 'NBA_LAL',
      homePts: 95,
      awayPts: 110,
      status: 'final',
      startTime: new Date(now - 12 * 60 * 60 * 1000).toISOString(), // -12h
    });
    expect(r.status).toBe(201);

    // Seed a future game
    r = await postJson('/api/dev/games', {
      id: 'GAME_3',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 0,
      awayPts: 0,
      status: 'scheduled',
      startTime: new Date(now + 30 * 60 * 1000).toISOString(), // +30min
    });
    expect(r.status).toBe(201);

    // Seed NHL game (should be filtered out when requesting NBA)
    r = await postJson('/api/dev/games', {
      id: 'GAME_4',
      homeTeamId: 'NHL_NJD',
      awayTeamId: 'NHL_NJD', // dummy away team
      homePts: 3,
      awayPts: 2,
      status: 'final',
      startTime: new Date(now - 6 * 60 * 60 * 1000).toISOString(), // -6h
    });
    expect(r.status).toBe(201);

    // Create user profile with NBA favorites
    r = await postJson('/api/profile', {
      firebaseUid: devUid,
      favoriteSports: ['NBA'],
      favoriteTeams: ['NBA_LAL', 'NBA_BOS'],
    });
    expect(r.status).toBe(200);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('returns scores for user favorite teams', async () => {
    const res = await getUserTeamScores({ sport: 'NBA' });
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data).toHaveProperty('games');
    expect(Array.isArray(data.games)).toBe(true);
    expect(data.games.length).toBeGreaterThan(0);
    
    // Should include games involving NBA_LAL or NBA_BOS
    const gameIds = data.games.map((game: any) => game.id);
    expect(gameIds).toContain('GAME_1');
    expect(gameIds).toContain('GAME_2');
    expect(gameIds).toContain('GAME_3');
    
    // Should not include NHL games
    expect(gameIds).not.toContain('GAME_4');
  });

  it('respects limit parameter', async () => {
    const res = await getUserTeamScores({ sport: 'NBA', limit: '1' });
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.games).toHaveLength(1);
  });

  it('returns 400 for missing sport parameter', async () => {
    const res = await getUserTeamScores({});
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('returns 400 for invalid sport parameter', async () => {
    const res = await getUserTeamScores({ sport: 'INVALID' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data).toHaveProperty('error');
  });

  it('returns 401 for missing authentication', async () => {
    const res = await fetch(`${baseUrl}/api/user-team-scores?sport=NBA`);
    expect(res.status).toBe(401);
  });

  it('returns empty results when user has no favorite teams', async () => {
    // Create a user with no favorite teams
    const noFavoritesUid = 'no-favorites-user';
    let r = await postJson('/api/profile', {
      firebaseUid: noFavoritesUid,
      favoriteSports: ['NBA'],
      favoriteTeams: [],
    });
    expect(r.status).toBe(200);

    const res = await fetch(`${baseUrl}/api/user-team-scores?sport=NBA`, {
      headers: {
        'x-dev-firebase-uid': noFavoritesUid,
      },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.games).toHaveLength(0);
  });
});