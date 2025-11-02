import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import type { InsertTeam, InsertGame } from '@shared/schema';
import { measureTime } from '../helpers/testUtils';

describe('getLatestTeamScore Performance Tests', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  const createTestTeams = async (count: number): Promise<string[]> => {
    const teamIds: string[] = [];
    const leagues = ['NBA', 'NFL', 'NHL', 'MLB'];
    
    for (let i = 0; i < count; i++) {
      const league = leagues[i % leagues.length];
      const teamId = `${league}_TEAM_${i}`;
      
      await storage.createTeam({
        id: teamId,
        name: `Team ${i}`,
        code: `T${i}`,
        league: league === 'NBA' ? 'basketball' : league === 'NFL' ? 'football' : league === 'NHL' ? 'hockey' : 'baseball',
      });
      
      teamIds.push(teamId);
    }
    
    return teamIds;
  };

  const createTestGames = async (teamIds: string[], gamesPerTeam: number): Promise<void> => {
    const now = new Date();
    let gameCounter = 0;
    
    for (let i = 0; i < teamIds.length; i++) {
      const teamId = teamIds[i];
      
      for (let j = 0; j < gamesPerTeam; j++) {
        const opponentIndex = (i + j + 1) % teamIds.length;
        const opponentId = teamIds[opponentIndex];
        
        if (teamId !== opponentId) {
          const gameId = `GAME_${gameCounter++}`;
          const isHome = j % 2 === 0;
          const gameTime = new Date(now.getTime() - (j * 24 * 60 * 60 * 1000)); // Games spread over days
          
          const game: InsertGame = {
            id: gameId,
            homeTeamId: isHome ? teamId : opponentId,
            awayTeamId: isHome ? opponentId : teamId,
            homePts: Math.floor(Math.random() * 50) + 80, // 80-130 points
            awayPts: Math.floor(Math.random() * 50) + 80,
            status: j === 0 ? 'final' : 'scheduled', // Latest game is final
            period: j === 0 ? '4' : null,
            timeRemaining: j === 0 ? '00:00' : null,
            startTime: gameTime,
          };
          
          await storage.createGame(game);
        }
      }
    }
  };

  it('should perform well with small dataset (10 teams, 5 games each)', async () => {
    const teamIds = await createTestTeams(10);
    await createTestGames(teamIds, 5);
    
    const { duration } = await measureTime(async () => {
      for (const teamId of teamIds) {
        await storage.getLatestTeamScore(teamId);
      }
    });
    
    // Should complete all queries in under 20ms
    expect(duration).toBeLessThan(20);
    console.log(`Small dataset performance: ${duration}ms for ${teamIds.length} teams`);
  });

  it('should perform well with medium dataset (50 teams, 20 games each)', async () => {
    const teamIds = await createTestTeams(50);
    await createTestGames(teamIds, 20);
    
    const { duration } = await measureTime(async () => {
      for (const teamId of teamIds) {
        await storage.getLatestTeamScore(teamId);
      }
    });
    
    // Should complete all queries in under 100ms
    expect(duration).toBeLessThan(100);
    console.log(`Medium dataset performance: ${duration}ms for ${teamIds.length} teams`);
  });

  it('should perform well with large dataset (200 teams, 50 games each)', async () => {
    const teamIds = await createTestTeams(200);
    await createTestGames(teamIds, 50);
    
    const { duration } = await measureTime(async () => {
      for (const teamId of teamIds) {
        await storage.getLatestTeamScore(teamId);
      }
    });
    
    // Should complete all queries in under 500ms
    expect(duration).toBeLessThan(500);
    console.log(`Large dataset performance: ${duration}ms for ${teamIds.length} teams`);
  });

  it('should scale well with increasing game history', async () => {
    const teamIds = await createTestTeams(20);
    const results: { gameCount: number; duration: number }[] = [];
    
    for (const gameCount of [5, 25, 100, 500]) {
      // Reset storage and recreate teams
      storage = new MemStorage();
      await createTestTeams(20);
      await createTestGames(teamIds, gameCount);
      
      const { duration } = await measureTime(async () => {
        for (const teamId of teamIds) {
          await storage.getLatestTeamScore(teamId);
        }
      });
      
      results.push({ gameCount, duration });
      console.log(`${gameCount} games per team: ${duration}ms`);
    }
    
    // Performance should not degrade exponentially with game history
    const firstResult = results[0];
    const lastResult = results[results.length - 1];
    const scalingFactor = lastResult.duration / firstResult.duration;
    const dataScalingFactor = lastResult.gameCount / firstResult.gameCount;
    
    // Performance degradation should be less than 3x the data scaling factor
    expect(scalingFactor).toBeLessThan(dataScalingFactor * 3);
  });

  it('should handle concurrent requests efficiently', async () => {
    const teamIds = await createTestTeams(30);
    await createTestGames(teamIds, 20);
    
    const { duration } = await measureTime(async () => {
      const promises = teamIds.map(teamId => 
        storage.getLatestTeamScore(teamId)
      );
      await Promise.all(promises);
    });
    
    // Concurrent requests should be faster than sequential
    expect(duration).toBeLessThan(100);
    console.log(`Concurrent requests performance: ${duration}ms for ${teamIds.length} teams`);
  });

  it('should perform well with teams having many games', async () => {
    const teamIds = await createTestTeams(5);
    await createTestGames(teamIds, 1000); // Many games per team
    
    const { duration } = await measureTime(async () => {
      for (const teamId of teamIds) {
        await storage.getLatestTeamScore(teamId);
      }
    });
    
    // Should handle teams with extensive game history efficiently
    expect(duration).toBeLessThan(200);
    console.log(`Heavy game history performance: ${duration}ms for ${teamIds.length} teams with 1000 games each`);
  });

  it('should benchmark different game statuses performance', async () => {
    const teamIds = await createTestTeams(20);
    const statuses = ['scheduled', 'live', 'final', 'postponed'];
    const statusResults: { status: string; duration: number }[] = [];
    
    for (const status of statuses) {
      // Reset and create games with specific status
      storage = new MemStorage();
      await createTestTeams(20);
      
      // Create games with specific status
      const now = new Date();
      for (let i = 0; i < teamIds.length; i++) {
        const teamId = teamIds[i];
        const opponentId = teamIds[(i + 1) % teamIds.length];
        
        const game: InsertGame = {
          id: `GAME_${status}_${i}`,
          homeTeamId: teamId,
          awayTeamId: opponentId,
          homePts: status === 'scheduled' ? 0 : Math.floor(Math.random() * 50) + 80,
          awayPts: status === 'scheduled' ? 0 : Math.floor(Math.random() * 50) + 80,
          status,
          period: status === 'final' ? '4' : status === 'live' ? '3' : null,
          timeRemaining: status === 'live' ? '05:30' : status === 'final' ? '00:00' : null,
          startTime: now,
        };
        
        await storage.createGame(game);
      }
      
      const { duration } = await measureTime(async () => {
        for (const teamId of teamIds) {
          await storage.getLatestTeamScore(teamId);
        }
      });
      
      statusResults.push({ status, duration });
      console.log(`${status} games performance: ${duration}ms`);
    }
    
    // All statuses should perform similarly
    const maxDuration = Math.max(...statusResults.map(r => r.duration));
    const minDuration = Math.min(...statusResults.map(r => r.duration));
    const performanceVariance = (maxDuration - minDuration) / minDuration;
    
    // Performance variance between statuses should be less than 100%
    expect(performanceVariance).toBeLessThan(1.0);
  });

  it('should measure memory usage patterns', async () => {
    const teamIds = await createTestTeams(100);
    await createTestGames(teamIds, 100);
    
    const initialMemory = process.memoryUsage();
    
    // Perform many queries
    for (let i = 0; i < 10; i++) {
      for (const teamId of teamIds) {
        await storage.getLatestTeamScore(teamId);
      }
    }
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    
    // Memory increase should be reasonable (less than 100MB)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
  });

  it('should handle edge cases efficiently', async () => {
    const teamIds = await createTestTeams(10);
    
    // Test with no games
    const { duration: noGamesDuration } = await measureTime(async () => {
      for (const teamId of teamIds) {
        const result = await storage.getLatestTeamScore(teamId);
        expect(result).toBeUndefined();
      }
    });
    
    // Test with non-existent teams
    const { duration: nonExistentDuration } = await measureTime(async () => {
      for (let i = 0; i < 10; i++) {
        const result = await storage.getLatestTeamScore(`NONEXISTENT_${i}`);
        expect(result).toBeUndefined();
      }
    });
    
    // Edge cases should be very fast
    expect(noGamesDuration).toBeLessThan(10);
    expect(nonExistentDuration).toBeLessThan(10);
    
    console.log(`No games performance: ${noGamesDuration}ms`);
    console.log(`Non-existent teams performance: ${nonExistentDuration}ms`);
  });
});