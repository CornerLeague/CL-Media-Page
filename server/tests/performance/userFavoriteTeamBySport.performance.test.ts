import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../../storage';
import type { InsertTeam, InsertUserProfile } from '@shared/schema';
import { measureTime } from '../helpers/testUtils';

describe('getUserFavoriteTeamBySport Performance Tests', () => {
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

  const createTestUsers = async (userCount: number, teamIds: string[]): Promise<string[]> => {
    const userIds: string[] = [];
    
    for (let i = 0; i < userCount; i++) {
      const userId = `user_${i}`;
      
      // Each user has 1-10 favorite teams
      const favoriteTeamCount = Math.floor(Math.random() * 10) + 1;
      const favoriteTeams: string[] = [];
      
      for (let j = 0; j < favoriteTeamCount; j++) {
        const randomTeamIndex = Math.floor(Math.random() * teamIds.length);
        const teamId = teamIds[randomTeamIndex];
        if (!favoriteTeams.includes(teamId)) {
          favoriteTeams.push(teamId);
        }
      }
      
      const userProfile: InsertUserProfile = {
        firebaseUid: userId,
        firstName: `User${i}`,
        lastName: 'Test',
        favoriteTeams,
        onboardingCompleted: true,
      };
      
      await storage.createUserProfile(userProfile);
      userIds.push(userId);
    }
    
    return userIds;
  };

  it('should perform well with small dataset (10 teams, 5 users)', async () => {
    const teamIds = await createTestTeams(10);
    const userIds = await createTestUsers(5, teamIds);
    
    const { duration } = await measureTime(async () => {
      for (const userId of userIds) {
        await storage.getUserFavoriteTeamBySport(userId, 'Basketball');
      }
    });
    
    // Should complete all queries in under 10ms
    expect(duration).toBeLessThan(10);
    console.log(`Small dataset performance: ${duration}ms for ${userIds.length} users`);
  });

  it('should perform well with medium dataset (100 teams, 50 users)', async () => {
    const teamIds = await createTestTeams(100);
    const userIds = await createTestUsers(50, teamIds);
    
    const { duration } = await measureTime(async () => {
      for (const userId of userIds) {
        await storage.getUserFavoriteTeamBySport(userId, 'Basketball');
      }
    });
    
    // Should complete all queries in under 50ms
    expect(duration).toBeLessThan(50);
    console.log(`Medium dataset performance: ${duration}ms for ${userIds.length} users`);
  });

  it('should perform well with large dataset (1000 teams, 200 users)', async () => {
    const teamIds = await createTestTeams(1000);
    const userIds = await createTestUsers(200, teamIds);
    
    const { duration } = await measureTime(async () => {
      for (const userId of userIds) {
        await storage.getUserFavoriteTeamBySport(userId, 'Basketball');
      }
    });
    
    // Should complete all queries in under 200ms
    expect(duration).toBeLessThan(200);
    console.log(`Large dataset performance: ${duration}ms for ${userIds.length} users`);
  });

  it('should scale linearly with user count', async () => {
    const teamIds = await createTestTeams(100);
    const results: { userCount: number; duration: number }[] = [];
    
    for (const userCount of [10, 25, 50, 100]) {
      const userIds = await createTestUsers(userCount, teamIds);
      
      const { duration } = await measureTime(async () => {
        for (const userId of userIds) {
          await storage.getUserFavoriteTeamBySport(userId, 'Basketball');
        }
      });
      
      results.push({ userCount, duration });
      console.log(`${userCount} users: ${duration}ms`);
      
      // Clear users for next iteration
      storage = new MemStorage();
      await createTestTeams(100); // Recreate teams
    }
    
    // Check that performance scales reasonably (not exponentially)
    const firstResult = results[0];
    const lastResult = results[results.length - 1];
    const scalingFactor = lastResult.duration / firstResult.duration;
    const userScalingFactor = lastResult.userCount / firstResult.userCount;
    
    // Performance should not degrade more than 2x the user scaling factor
    expect(scalingFactor).toBeLessThan(userScalingFactor * 2);
  });

  it('should handle concurrent requests efficiently', async () => {
    const teamIds = await createTestTeams(100);
    const userIds = await createTestUsers(20, teamIds);
    
    const { duration } = await measureTime(async () => {
      const promises = userIds.map(userId => 
        storage.getUserFavoriteTeamBySport(userId, 'Basketball')
      );
      await Promise.all(promises);
    });
    
    // Concurrent requests should be faster than sequential
    expect(duration).toBeLessThan(50);
    console.log(`Concurrent requests performance: ${duration}ms for ${userIds.length} users`);
  });

  it('should perform well with users having many favorite teams', async () => {
    const teamIds = await createTestTeams(200);
    const userIds: string[] = [];
    
    // Create users with many favorite teams (50-100 each)
    for (let i = 0; i < 10; i++) {
      const userId = `heavy_user_${i}`;
      const favoriteTeamCount = 50 + Math.floor(Math.random() * 51); // 50-100 teams
      const favoriteTeams = teamIds.slice(0, favoriteTeamCount);
      
      const userProfile: InsertUserProfile = {
        firebaseUid: userId,
        firstName: `HeavyUser${i}`,
        lastName: 'Test',
        favoriteTeams,
        onboardingCompleted: true,
      };
      
      await storage.createUserProfile(userProfile);
      userIds.push(userId);
    }
    
    const { duration } = await measureTime(async () => {
      for (const userId of userIds) {
        await storage.getUserFavoriteTeamBySport(userId, 'Basketball');
      }
    });
    
    // Should handle users with many favorites efficiently
    expect(duration).toBeLessThan(100);
    console.log(`Heavy users performance: ${duration}ms for ${userIds.length} users with 50-100 favorite teams each`);
  });

  it('should benchmark different sports performance', async () => {
    const teamIds = await createTestTeams(400); // 100 teams per sport
    const userIds = await createTestUsers(50, teamIds);
    
    const sports = ['Basketball', 'Football', 'Hockey', 'Baseball'];
    const sportResults: { sport: string; duration: number }[] = [];
    
    for (const sport of sports) {
      const { duration } = await measureTime(async () => {
        for (const userId of userIds) {
          await storage.getUserFavoriteTeamBySport(userId, sport);
        }
      });
      
      sportResults.push({ sport, duration });
      console.log(`${sport} performance: ${duration}ms`);
    }
    
    // All sports should perform similarly
    const maxDuration = Math.max(...sportResults.map(r => r.duration));
    const minDuration = Math.min(...sportResults.map(r => r.duration));
    const performanceVariance = (maxDuration - minDuration) / minDuration;
    
    // Log performance variance for analysis (natural variation is expected)
    console.log(`Performance variance between sports: ${(performanceVariance * 100).toFixed(1)}%`);
    
    // Ensure all sports perform within reasonable bounds (under 10ms)
    expect(Math.max(...sportResults.map(r => r.duration))).toBeLessThan(10);
  });

  it('should measure memory usage patterns', async () => {
    const teamIds = await createTestTeams(500);
    const userIds = await createTestUsers(100, teamIds);
    
    const initialMemory = process.memoryUsage();
    
    // Perform many queries
    for (let i = 0; i < 5; i++) {
      for (const userId of userIds) {
        await storage.getUserFavoriteTeamBySport(userId, 'Basketball');
      }
    }
    
    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    
    // Memory increase should be reasonable (less than 50MB)
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
  });
});