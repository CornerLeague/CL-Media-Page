import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'net';

// Ensure dev mode and no Firebase env so dev fallback is active
process.env.NODE_ENV = 'development';
delete process.env.FIREBASE_PROJECT_ID;
delete process.env.FIREBASE_CLIENT_EMAIL;
delete process.env.FIREBASE_PRIVATE_KEY;

describe('Schedule API', () => {
  let server: import('http').Server;
  let app: express.Express;
  let baseUrl = '';
  const devUid = 'test-uid-123';

  const postJson = async (path: string, body: any) => {
    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res;
  };

  const getSchedule = async (query: Record<string, string>) => {
    const url = new URL(baseUrl + '/api/schedule');
    Object.entries(query).forEach(([k, v]) => url.searchParams.append(k, v));
    return await fetch(url, {
      headers: { 'x-dev-firebase-uid': devUid },
    });
  };

  beforeAll(async () => {
    app = express();
    app.use(cookieParser());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    const routes = await import('../../routes');
    server = await routes.registerRoutes(app);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const now = Date.now();
    // Seed teams
    let r = await postJson('/api/dev/teams', { id: 'NBA_LAL', league: 'NBA', code: 'LAL', name: 'Los Angeles Lakers' });
    expect(r.status).toBe(201);
    r = await postJson('/api/dev/teams', { id: 'NBA_BOS', league: 'NBA', code: 'BOS', name: 'Boston Celtics' });
    expect(r.status).toBe(201);
    r = await postJson('/api/dev/teams', { id: 'NHL_NJD', league: 'NHL', code: 'NJD', name: 'New Jersey Devils' });
    expect(r.status).toBe(201);

    // Seed games within next 7 days
    r = await postJson('/api/dev/games', {
      id: 'GAME_1',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 0,
      awayPts: 0,
      status: 'scheduled',
      startTime: new Date(now + 60 * 60 * 1000).toISOString(), // +1h
    });
    expect(r.status).toBe(201);

    r = await postJson('/api/dev/games', {
      id: 'GAME_2',
      homeTeamId: 'NBA_BOS',
      awayTeamId: 'NBA_LAL',
      homePts: 0,
      awayPts: 0,
      status: 'scheduled',
      startTime: new Date(now + 2 * 60 * 60 * 1000).toISOString(), // +2h
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

  it('returns schedule for authorized NBA teams', async () => {
    const res = await getSchedule({ sport: 'NBA', teamIds: 'NBA_LAL,NBA_BOS' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeDefined();
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(10);
    expect(data.total).toBe(2);
    const items = data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    // Sorted by startTime ascending
    expect(new Date(items[0].startTime).getTime()).toBeLessThan(new Date(items[1].startTime).getTime());
    const teamsPresent = items.flatMap((g: any) => [g.homeTeamId, g.awayTeamId]);
    teamsPresent.forEach((tid: string) => {
      expect(['NBA_LAL', 'NBA_BOS']).toContain(tid);
    });
  });

  it('blocks unauthorized team requests', async () => {
    const res = await getSchedule({ sport: 'NBA', teamIds: 'NHL_NJD' });
    expect(res.status).toBe(403);
  });

  it('defaults to favorites when teamIds not provided', async () => {
    const res = await getSchedule({ sport: 'NBA' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.total).toBe(2);
    const items = data.items;
    const teamsPresent = items.flatMap((g: any) => [g.homeTeamId, g.awayTeamId]);
    teamsPresent.forEach((tid: string) => {
      expect(['NBA_LAL', 'NBA_BOS']).toContain(tid);
    });
  });
});
