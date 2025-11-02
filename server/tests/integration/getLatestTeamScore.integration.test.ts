import { describe, it, expect, beforeEach } from 'vitest';
import { PgStorage } from '../../pgStorage';
import { MemStorage } from '../../storage';
import type { InsertGame, InsertTeam, GameScoreData } from '@shared/schema';
import { measureTime, assertPerformance } from '../helpers/testUtils';

describe('getLatestTeamScore Integration Tests', () => {
  let storage: PgStorage | MemStorage;

  beforeEach(async () => {
    // Use MemStorage for faster integration tests
    storage = new MemStorage();
    
    // Create test teams
    const teams: InsertTeam[] = [
      { id: 'NBA_LAL', name: 'Los Angeles Lakers', code: 'LAL', league: 'NBA' },
      { id: 'NBA_BOS', name: 'Boston Celtics', code: 'BOS', league: 'NBA' },
      { id: 'NBA_GSW', name: 'Golden State Warriors', code: 'GSW', league: 'NBA' },
    ];

    for (const team of teams) {
      await storage.createTeam(team);
    }
  });

  it('should return the latest game score for a team as home team', async () => {
    const now = new Date();
    
    const games: InsertGame[] = [
      {
        id: 'GAME_1',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 100,
        awayPts: 95,
        status: 'final',
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // -24h (older)
      },
      {
        id: 'GAME_2',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_GSW',
        homePts: 115,
        awayPts: 110,
        status: 'final',
        startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000), // -12h (latest)
      },
    ];

    for (const game of games) {
      await storage.createGame(game);
    }

    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeDefined();
    expect(result!.gameId).toBe('GAME_2');
    expect(result!.homeTeam.id).toBe('NBA_LAL');
    expect(result!.homeTeam.score).toBe(115);
    expect(result!.awayTeam.score).toBe(110);
    expect(result!.isHomeGame).toBe(true);
    expect(result!.teamScore).toBe(115);
  });

  it('should return the latest game score for a team as away team', async () => {
    const now = new Date();
    
    const games: InsertGame[] = [
      {
        id: 'GAME_3',
        homeTeamId: 'NBA_BOS',
        awayTeamId: 'NBA_LAL',
        homePts: 95,
        awayPts: 100,
        status: 'final',
        startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000), // -12h (latest)
      },
      {
        id: 'GAME_4',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_LAL',
        homePts: 105,
        awayPts: 98,
        status: 'final',
        startTime: new Date(now.getTime() - 36 * 60 * 60 * 1000), // -36h (older)
      },
    ];

    for (const game of games) {
      await storage.createGame(game);
    }

    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeDefined();
    expect(result!.gameId).toBe('GAME_3');
    expect(result!.awayTeam.id).toBe('NBA_LAL');
    expect(result!.homeTeam.score).toBe(95);
    expect(result!.awayTeam.score).toBe(100);
    expect(result!.isHomeGame).toBe(false);
    expect(result!.teamScore).toBe(100);
  });

  it('should return undefined for team with no games', async () => {
    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeUndefined();
  });

  it('should return undefined for non-existent team', async () => {
    const result = await storage.getLatestTeamScore('INVALID_TEAM');
    expect(result).toBeUndefined();
  });

  it('should handle team with both home and away games correctly', async () => {
    const now = new Date();
    
    const games: InsertGame[] = [
      {
        id: 'GAME_HOME_OLD',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 100,
        awayPts: 95,
        status: 'final',
        startTime: new Date(now.getTime() - 48 * 60 * 60 * 1000), // -48h
      },
      {
        id: 'GAME_AWAY_LATEST',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_LAL',
        homePts: 110,
        awayPts: 115,
        status: 'final',
        startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000), // -12h (latest)
      },
      {
        id: 'GAME_HOME_MIDDLE',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_GSW',
        homePts: 105,
        awayPts: 102,
        status: 'final',
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000), // -24h
      },
    ];

    for (const game of games) {
      await storage.createGame(game);
    }

    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeDefined();
    expect(result!.gameId).toBe('GAME_AWAY_LATEST');
    expect(result!.awayTeam.id).toBe('NBA_LAL');
    expect(result!.isHomeGame).toBe(false);
    expect(result!.teamScore).toBe(115);
  });

  it('should handle games with same timestamp correctly', async () => {
    const now = new Date();
    const sameTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const games: InsertGame[] = [
      {
        id: 'GAME_SAME_TIME_1',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 100,
        awayPts: 95,
        status: 'final',
        startTime: sameTime,
      },
      {
        id: 'GAME_SAME_TIME_2',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_LAL',
        homePts: 110,
        awayPts: 115,
        status: 'final',
        startTime: sameTime,
      },
    ];

    for (const game of games) {
      await storage.createGame(game);
    }

    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeDefined();
    // Should return one of the games with the same timestamp
    expect(['GAME_SAME_TIME_1', 'GAME_SAME_TIME_2']).toContain(result!.gameId);
  });

  it('should perform within acceptable time limits', async () => {
    const now = new Date();
    
    // Create multiple games to test performance
    const games: InsertGame[] = [];
    for (let i = 0; i < 20; i++) {
      games.push({
        id: `PERF_GAME_${i}`,
        homeTeamId: i % 2 === 0 ? 'NBA_LAL' : 'NBA_BOS',
        awayTeamId: i % 2 === 0 ? 'NBA_BOS' : 'NBA_LAL',
        homePts: 100 + i,
        awayPts: 95 + i,
        status: 'final',
        startTime: new Date(now.getTime() - (20 - i) * 60 * 60 * 1000), // Spread over 20 hours
      });
    }

    for (const game of games) {
      await storage.createGame(game);
    }

    const { result, duration } = await measureTime(async () => {
      return await storage.getLatestTeamScore('NBA_LAL');
    });

    expect(result).toBeDefined();
    expect(result!.gameId).toBe('PERF_GAME_19'); // Latest game
    
    // Performance assertion: should complete within 50ms for MemStorage
    assertPerformance(duration, 50, 'getLatestTeamScore with multiple games');
  });

  it('should handle different game statuses correctly', async () => {
    const now = new Date();
    
    const games: InsertGame[] = [
      {
        id: 'GAME_FINAL',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_BOS',
        homePts: 100,
        awayPts: 95,
        status: 'final',
        startTime: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      },
      {
        id: 'GAME_LIVE',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_GSW',
        homePts: 85,
        awayPts: 82,
        status: 'live',
        period: '3rd',
        timeRemaining: '5:30',
        startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // -2h (latest)
      },
    ];

    for (const game of games) {
      await storage.createGame(game);
    }

    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeDefined();
    expect(result!.gameId).toBe('GAME_LIVE');
    expect(result!.status).toBe('live');
    expect(result!.period).toBe('3rd');
    expect(result!.timeRemaining).toBe('5:30');
  });

  it('should validate data consistency', async () => {
    const now = new Date();
    
    const game: InsertGame = {
      id: 'CONSISTENCY_GAME',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_BOS',
      homePts: 108,
      awayPts: 102,
      status: 'final',
      period: '4th',
      timeRemaining: '00:00',
      startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    };

    await storage.createGame(game);

    const result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result).toBeDefined();
    
    // Validate all GameScoreData fields are present and correct
    expect(result!.gameId).toBe('CONSISTENCY_GAME');
    expect(result!.homeTeam.id).toBe('NBA_LAL');
    expect(result!.homeTeam.name).toBe('Los Angeles Lakers');
    expect(result!.homeTeam.code).toBe('LAL');
    expect(result!.homeTeam.league).toBe('NBA');
    expect(result!.homeTeam.score).toBe(108);
    expect(result!.awayTeam.id).toBe('NBA_BOS');
    expect(result!.awayTeam.name).toBe('Boston Celtics');
    expect(result!.awayTeam.code).toBe('BOS');
    expect(result!.awayTeam.league).toBe('NBA');
    expect(result!.awayTeam.score).toBe(102);
    expect(result!.status).toBe('final');
    expect(result!.period).toBe('4th');
    expect(result!.timeRemaining).toBe('00:00');
    expect(result!.startTime).toEqual(game.startTime);
    expect(result!.isHomeGame).toBe(true);
    expect(result!.opponent.id).toBe('NBA_BOS');
    expect(result!.opponent.score).toBe(102);
    expect(result!.teamScore).toBe(108);
    expect(result!.cachedAt).toBeInstanceOf(Date);
  });

  it('should handle dynamic game additions', async () => {
    const now = new Date();
    
    // Add initial game
    const game1: InsertGame = {
      id: 'DYNAMIC_GAME_1',
      homeTeamId: 'NBA_BOS',
      awayTeamId: 'NBA_LAL',
      homePts: 95,
      awayPts: 100,
      status: 'final',
      startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    };

    await storage.createGame(game1);
    let result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result!.gameId).toBe('DYNAMIC_GAME_1');

    // Add newer game
    const game2: InsertGame = {
      id: 'DYNAMIC_GAME_2',
      homeTeamId: 'NBA_LAL',
      awayTeamId: 'NBA_GSW',
      homePts: 110,
      awayPts: 105,
      status: 'final',
      startTime: new Date(now.getTime() - 12 * 60 * 60 * 1000), // More recent
    };

    await storage.createGame(game2);
    result = await storage.getLatestTeamScore('NBA_LAL');
    expect(result!.gameId).toBe('DYNAMIC_GAME_2');
  });
});