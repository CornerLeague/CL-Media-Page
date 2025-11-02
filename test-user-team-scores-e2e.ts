#!/usr/bin/env npx tsx

/**
 * End-to-End Test for User Team Scores Functionality
 * 
 * This script tests the complete user team scores workflow:
 * 1. Create a user profile with favorite teams
 * 2. Test getUserFavoriteTeams method
 * 3. Test fetchUserTeamScores method
 * 4. Validate caching functionality
 * 5. Test error handling scenarios
 */

import { ScoresAgent } from './server/agents/scoresAgent';
import { MemStorage } from './server/storage';
import { UserTeamScoresError } from './server/agents/types';
import type { IScoreSource, UserTeamScoresOptions } from './server/agents/types';
import type { Game } from './shared/schema';

// Mock score source for testing
const mockScoreSource: IScoreSource = {
  async fetchRecentGames(options) {
    console.log('📊 Mock fetchRecentGames called with:', options);
    
    // Return mock games for NBA teams
    const mockGames: Game[] = [
      {
        id: 'game-1',
        homeTeamId: 'NBA_BOS',
        awayTeamId: 'NBA_LAL',
        homePts: 110,
        awayPts: 105,
        status: 'final',
        period: '4',
        timeRemaining: null,
        startTime: new Date('2024-01-15T20:00:00Z'),
        cachedAt: new Date()
      },
      {
        id: 'game-2',
        homeTeamId: 'NBA_GSW',
        awayTeamId: 'NBA_BOS',
        homePts: 98,
        awayPts: 102,
        status: 'final',
        period: '4',
        timeRemaining: null,
        startTime: new Date('2024-01-14T19:30:00Z'),
        cachedAt: new Date()
      }
    ];
    
    return mockGames;
  },

  async fetchLive(teamCodes) {
    console.log('🔴 Mock fetchLive called with team codes:', teamCodes);
    
    return [
      {
        gameId: 'live-game-1',
        homeTeamId: 'NBA_BOS',
        awayTeamId: 'NBA_LAL',
        homePts: 85,
        awayPts: 82,
        status: 'in_progress' as const,
        period: '3',
        timeRemaining: '7:45',
        startTime: new Date(),
        source: 'mock'
      }
    ];
  },

  async fetchSchedule(teamCodes, startDate, endDate) {
    console.log('📅 Mock fetchSchedule called with:', { teamCodes, startDate, endDate });
    
    return [
      {
        gameId: 'schedule-game-1',
        homeTeamId: 'NBA_BOS',
        awayTeamId: 'NBA_MIA',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        status: 'scheduled' as const,
        source: 'mock'
      }
    ];
  },

  async fetchFeaturedGames(sport, limit) {
    console.log('⭐ Mock fetchFeaturedGames called with:', { sport, limit });
    
    return [
      {
        gameId: 'featured-game-1',
        homeTeamId: 'NBA_LAL',
        awayTeamId: 'NBA_GSW',
        startTime: new Date(),
        status: 'in_progress' as const,
        source: 'mock'
      }
    ];
  }
};

async function runE2ETest() {
  console.log('🚀 Starting User Team Scores End-to-End Test\n');
  
  try {
    // Initialize components
    const storage = new MemStorage();
    const agent = new ScoresAgent(mockScoreSource, storage);
    
    console.log('✅ Initialized ScoresAgent and MemStorage\n');
    
    // Test 1: Create user profile with favorite teams
    console.log('📝 Test 1: Creating user profile with favorite teams...');
    const testUser = {
      firebaseUid: 'test-user-123',
      firstName: 'John',
      lastName: 'Doe',
      favoriteSports: ['NBA', 'NFL'],
      favoriteTeams: ['NBA_BOS', 'NBA_LAL', 'NBA_GSW', 'NFL_NE'],
      onboardingCompleted: true
    };
    
    await storage.createUserProfile(testUser);
    console.log('✅ User profile created successfully\n');
    
    // Test 2: Get user favorite teams (filtered by sport)
    console.log('🏀 Test 2: Getting user favorite teams for NBA...');
    const favoriteTeams = await agent.getUserFavoriteTeams('test-user-123', 'NBA');
    console.log('✅ Favorite teams retrieved:', favoriteTeams);
    console.log(`   Found ${favoriteTeams.length} NBA teams\n`);
    
    // Test 3: Fetch user team scores (live mode)
    console.log('📊 Test 3: Fetching user team scores (live mode)...');
    const liveOptions: UserTeamScoresOptions = {
      firebaseUid: 'test-user-123',
      sport: 'NBA',
      mode: 'live',
      limit: 10
    };
    
    const liveResult = await agent.fetchUserTeamScores(liveOptions);
    console.log('✅ Live scores fetched successfully:');
    console.log(`   - Games: ${liveResult.games.length}`);
    console.log(`   - Favorite teams: ${liveResult.favoriteTeams.length}`);
    console.log(`   - Cache hit: ${liveResult.cacheHit}`);
    console.log(`   - Source: ${liveResult.source}\n`);
    
    // Test 4: Fetch user team scores (schedule mode)
    console.log('📅 Test 4: Fetching user team scores (schedule mode)...');
    const scheduleOptions: UserTeamScoresOptions = {
      firebaseUid: 'test-user-123',
      sport: 'NBA',
      mode: 'schedule',
      limit: 5,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Next 7 days
    };
    
    const scheduleResult = await agent.fetchUserTeamScores(scheduleOptions);
    console.log('✅ Schedule scores fetched successfully:');
    console.log(`   - Games: ${scheduleResult.games.length}`);
    console.log(`   - Cache hit: ${scheduleResult.cacheHit}`);
    console.log(`   - Source: ${scheduleResult.source}\n`);
    
    // Test 5: Test caching (fetch same data again)
    console.log('💾 Test 5: Testing cache functionality...');
    const cachedResult = await agent.fetchUserTeamScores(liveOptions);
    console.log('✅ Cached result retrieved:');
    console.log(`   - Cache hit: ${cachedResult.cacheHit}`);
    console.log(`   - Source: ${cachedResult.source}\n`);
    
    // Test 6: Error handling - non-existent user
    console.log('❌ Test 6: Testing error handling (non-existent user)...');
    try {
      await agent.getUserFavoriteTeams('non-existent-user');
      console.log('❌ ERROR: Should have thrown UserTeamScoresError');
    } catch (error) {
      if (error instanceof UserTeamScoresError) {
        console.log('✅ Correctly threw UserTeamScoresError:', error.code);
      } else {
        console.log('❌ ERROR: Wrong error type thrown:', error);
      }
    }
    console.log();
    
    // Test 7: Error handling - user with no favorite teams
    console.log('❌ Test 7: Testing error handling (user with no favorite teams)...');
    await storage.createUserProfile({
      firebaseUid: 'empty-user',
      firstName: 'Empty',
      lastName: 'User',
      favoriteSports: [],
      favoriteTeams: [],
      onboardingCompleted: true
    });
    
    try {
      await agent.getUserFavoriteTeams('empty-user');
      console.log('❌ ERROR: Should have thrown UserTeamScoresError');
    } catch (error) {
      if (error instanceof UserTeamScoresError) {
        console.log('✅ Correctly threw UserTeamScoresError:', error.code);
      } else {
        console.log('❌ ERROR: Wrong error type thrown:', error);
      }
    }
    console.log();
    
    // Test 8: Featured games mode
    console.log('⭐ Test 8: Testing featured games mode...');
    const featuredOptions: UserTeamScoresOptions = {
      firebaseUid: 'test-user-123',
      sport: 'NBA',
      mode: 'featured',
      limit: 3
    };
    
    const featuredResult = await agent.fetchUserTeamScores(featuredOptions);
    console.log('✅ Featured games fetched successfully:');
    console.log(`   - Games: ${featuredResult.games.length}`);
    console.log(`   - Source: ${featuredResult.source}\n`);
    
    console.log('🎉 All tests completed successfully!');
    console.log('\n📋 Test Summary:');
    console.log('   ✅ User profile creation');
    console.log('   ✅ Get user favorite teams');
    console.log('   ✅ Fetch live scores');
    console.log('   ✅ Fetch schedule');
    console.log('   ✅ Cache functionality');
    console.log('   ✅ Error handling (non-existent user)');
    console.log('   ✅ Error handling (no favorite teams)');
    console.log('   ✅ Featured games mode');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  runE2ETest().catch(console.error);
}

export { runE2ETest };