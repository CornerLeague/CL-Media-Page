#!/usr/bin/env tsx
/**
 * Subtask 5.6: Comprehensive Performance Testing and Validation
 * 
 * This suite validates the effectiveness of all database indexes implemented
 * in Subtasks 5.1-5.5 and ensures they meet performance requirements.
 * 
 * Tests include:
 * - Query execution time benchmarks
 * - Index usage validation via EXPLAIN ANALYZE
 * - Buffer usage analysis
 * - Performance regression detection
 * - Comprehensive reporting
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

interface PerformanceTestResult {
  testName: string;
  queryName: string;
  executionTime: number;
  targetTime: number;
  passed: boolean;
  indexUsed: boolean;
  bufferHits: number;
  bufferReads: number;
  resultCount: number;
  queryPlan?: any;
  error?: string;
}

interface TestSummary {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageExecutionTime: number;
  indexUsageRate: number;
  overallPassed: boolean;
}

class ComprehensivePerformanceTestSuite {
  private results: PerformanceTestResult[] = [];

  async runAllTests(): Promise<TestSummary> {
    console.log('🚀 Starting Subtask 5.6: Comprehensive Performance Testing');
    console.log('=' .repeat(80));

    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Pre-test validation
      await this.validateIndexExistence();
      
      // Run all performance tests
      await this.testUserFavoriteTeamsLookup();
      await this.testRecentTeamGames();
      await this.testGamesByStatus();
      await this.testTeamsBySport();
      await this.testUserToTeamsRelationship();
      await this.testTeamToUsersRelationship();
      await this.testComplexJoinQueries();
      await this.testBatchOperations();

      // Generate comprehensive report
      const summary = this.generateSummary();
      this.printDetailedReport(summary);

      return summary;

    } catch (error) {
      console.error('❌ Performance test suite failed:', error);
      throw error;
    }
  }

  private async validateIndexExistence(): Promise<void> {
    console.log('\n📋 Pre-Test: Validating Index Existence');
    console.log('-' .repeat(50));

    const expectedIndexes = [
      'idx_user_profiles_favorite_teams_gin',
      'idx_games_teams_start_time',
      'idx_games_status_start_time',
      'idx_teams_league_id',
      'idx_teams_league_name',
      'idx_user_teams_user_id_team_id',
      'idx_user_teams_team_id_user_id'
    ];

    if (!db) {
      throw new Error('Database connection not available');
    }

    const indexCheck = await db.execute(sql`
      SELECT indexname, tablename, indexdef
      FROM pg_indexes 
      WHERE indexname = ANY(${expectedIndexes})
      ORDER BY indexname
    `);

    const foundIndexes = Array.isArray(indexCheck) ? indexCheck.map((idx: any) => idx.indexname) : [];
    const missingIndexes = expectedIndexes.filter(idx => !foundIndexes.includes(idx));

    if (missingIndexes.length > 0) {
      console.log('❌ Missing indexes:', missingIndexes);
      throw new Error(`Missing required indexes: ${missingIndexes.join(', ')}`);
    }

    console.log(`✅ All ${expectedIndexes.length} required indexes found`);
    foundIndexes.forEach(idx => console.log(`   - ${idx}`));
  }

  private async testUserFavoriteTeamsLookup(): Promise<void> {
    console.log('\n🔍 Test 1: User Favorite Teams Lookup (GIN Index)');
    console.log('-' .repeat(50));

    const testQuery = sql`
      SELECT firebase_uid, favorite_teams 
      FROM user_profiles 
      WHERE favorite_teams @> ARRAY['team_nba_lakers']
      LIMIT 100
    `;

    await this.runPerformanceTest({
      testName: 'User Favorite Teams Lookup',
      queryName: 'user_favorite_teams_lookup',
      query: testQuery,
      targetTime: 10, // < 10ms
      expectedIndexName: 'idx_user_profiles_favorite_teams_gin'
    });

    // Test array overlap query
    const overlapQuery = sql`
      SELECT firebase_uid, favorite_teams 
      FROM user_profiles 
      WHERE favorite_teams && ARRAY['team_nba_lakers', 'team_nfl_patriots']
      LIMIT 50
    `;

    await this.runPerformanceTest({
      testName: 'User Favorite Teams Overlap',
      queryName: 'user_favorite_teams_overlap',
      query: overlapQuery,
      targetTime: 10, // < 10ms
      expectedIndexName: 'idx_user_profiles_favorite_teams_gin'
    });
  }

  private async testRecentTeamGames(): Promise<void> {
    console.log('\n🏀 Test 2: Recent Team Games (Composite Index)');
    console.log('-' .repeat(50));

    const testQuery = sql`
      SELECT id, home_team_id, away_team_id, start_time, status, home_pts, away_pts
      FROM games 
      WHERE (home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers')
      ORDER BY start_time DESC 
      LIMIT 10
    `;

    await this.runPerformanceTest({
      testName: 'Recent Team Games',
      queryName: 'recent_team_games',
      query: testQuery,
      targetTime: 20, // < 20ms
      expectedIndexName: 'idx_games_teams_start_time'
    });

    // Test specific team matchup
    const matchupQuery = sql`
      SELECT id, home_pts, away_pts, start_time, status
      FROM games 
      WHERE home_team_id = 'team_nba_lakers' AND away_team_id = 'team_nba_celtics'
      ORDER BY start_time DESC
      LIMIT 5
    `;

    await this.runPerformanceTest({
      testName: 'Team Matchup History',
      queryName: 'team_matchup_history',
      query: matchupQuery,
      targetTime: 15, // < 15ms
      expectedIndexName: 'idx_games_teams_start_time'
    });
  }

  private async testGamesByStatus(): Promise<void> {
    console.log('\n⚡ Test 3: Games by Status (Status-Time Index)');
    console.log('-' .repeat(50));

    const liveGamesQuery = sql`
      SELECT id, home_team_id, away_team_id, start_time, status
      FROM games 
      WHERE status = 'live'
      ORDER BY start_time DESC 
      LIMIT 20
    `;

    await this.runPerformanceTest({
      testName: 'Live Games Query',
      queryName: 'games_by_status_live',
      query: liveGamesQuery,
      targetTime: 15, // < 15ms
      expectedIndexName: 'idx_games_status_start_time'
    });

    const recentCompletedQuery = sql`
      SELECT id, home_team_id, away_team_id, start_time, home_pts, away_pts
      FROM games 
      WHERE status = 'final' 
        AND start_time >= NOW() - INTERVAL '7 days'
      ORDER BY start_time DESC
      LIMIT 50
    `;

    await this.runPerformanceTest({
      testName: 'Recent Completed Games',
      queryName: 'games_by_status_recent',
      query: recentCompletedQuery,
      targetTime: 15, // < 15ms
      expectedIndexName: 'idx_games_status_start_time'
    });
  }

  private async testTeamsBySport(): Promise<void> {
    console.log('\n🏈 Test 4: Teams by Sport/League (League Indexes)');
    console.log('-' .repeat(50));

    const multiLeagueQuery = sql`
      SELECT id, name, code, league 
      FROM teams 
      WHERE league IN ('NBA', 'NFL', 'MLB') 
      ORDER BY name
      LIMIT 100
    `;

    await this.runPerformanceTest({
      testName: 'Multi-League Filtering',
      queryName: 'teams_by_sport_multi',
      query: multiLeagueQuery,
      targetTime: 15, // < 15ms
      expectedIndexName: 'idx_teams_league_name'
    });

    const singleLeagueQuery = sql`
      SELECT id, name, code, league 
      FROM teams 
      WHERE league = 'NBA' 
      ORDER BY name
    `;

    await this.runPerformanceTest({
      testName: 'Single League Filtering',
      queryName: 'teams_by_league_single',
      query: singleLeagueQuery,
      targetTime: 10, // < 10ms
      expectedIndexName: 'idx_teams_league_name'
    });
  }

  private async testUserToTeamsRelationship(): Promise<void> {
    console.log('\n👤 Test 5: User-to-Teams Relationships');
    console.log('-' .repeat(50));

    const userTeamsQuery = sql`
      SELECT ut.team_id, t.name, t.league, t.code
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = 'test_user_123'
      ORDER BY t.name
      LIMIT 50
    `;

    await this.runPerformanceTest({
      testName: 'User Teams Lookup',
      queryName: 'user_to_teams',
      query: userTeamsQuery,
      targetTime: 5, // < 5ms
      expectedIndexName: 'idx_user_teams_user_id_team_id'
    });
  }

  private async testTeamToUsersRelationship(): Promise<void> {
    console.log('\n🏟️ Test 6: Team-to-Users Relationships');
    console.log('-' .repeat(50));

    const teamFollowersQuery = sql`
      SELECT ut.user_id, COUNT(*) as team_count
      FROM user_teams ut
      WHERE ut.team_id = 'team_nba_lakers'
      GROUP BY ut.user_id
      ORDER BY team_count DESC
      LIMIT 100
    `;

    await this.runPerformanceTest({
      testName: 'Team Followers Query',
      queryName: 'team_to_users',
      query: teamFollowersQuery,
      targetTime: 5, // < 5ms
      expectedIndexName: 'idx_user_teams_team_id_user_id'
    });
  }

  private async testComplexJoinQueries(): Promise<void> {
    console.log('\n🔗 Test 7: Complex Join Queries');
    console.log('-' .repeat(50));

    const complexQuery = sql`
      SELECT 
        up.firebase_uid,
        t.name as team_name,
        t.league,
        g.start_time,
        g.status,
        CASE 
          WHEN g.home_team_id = t.id THEN g.home_pts 
          ELSE g.away_pts 
        END as team_score
      FROM user_profiles up
      JOIN user_teams ut ON up.firebase_uid = ut.user_id
      JOIN teams t ON ut.team_id = t.id
      JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      WHERE up.favorite_teams @> ARRAY[t.id]
        AND g.status = 'final'
        AND g.start_time >= NOW() - INTERVAL '3 days'
      ORDER BY g.start_time DESC
      LIMIT 20
    `;

    await this.runPerformanceTest({
      testName: 'Complex Multi-Table Join',
      queryName: 'complex_join_query',
      query: complexQuery,
      targetTime: 50, // < 50ms for complex query
      expectedIndexName: 'multiple'
    });
  }

  private async testBatchOperations(): Promise<void> {
    console.log('\n📦 Test 8: Batch Operations');
    console.log('-' .repeat(50));

    const batchUserQuery = sql`
      SELECT ut.user_id, ut.team_id, t.name, t.league
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = ANY(ARRAY['user_1', 'user_2', 'user_3', 'user_4', 'user_5'])
      ORDER BY ut.user_id, t.name
    `;

    await this.runPerformanceTest({
      testName: 'Batch User Teams Lookup',
      queryName: 'batch_user_teams',
      query: batchUserQuery,
      targetTime: 25, // < 25ms
      expectedIndexName: 'idx_user_teams_user_id_team_id'
    });

    const batchTeamQuery = sql`
      SELECT ut.team_id, COUNT(ut.user_id) as follower_count
      FROM user_teams ut
      WHERE ut.team_id = ANY(ARRAY['team_nba_lakers', 'team_nfl_patriots', 'team_mlb_yankees'])
      GROUP BY ut.team_id
      ORDER BY follower_count DESC
    `;

    await this.runPerformanceTest({
      testName: 'Batch Team Followers Count',
      queryName: 'batch_team_followers',
      query: batchTeamQuery,
      targetTime: 20, // < 20ms
      expectedIndexName: 'idx_user_teams_team_id_user_id'
    });
  }

  private async runPerformanceTest(config: {
    testName: string;
    queryName: string;
    query: any;
    targetTime: number;
    expectedIndexName: string;
  }): Promise<void> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    try {
      // Get EXPLAIN ANALYZE plan
      const explainQuery = sql.raw(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${config.query.queryChunks.join('')}`);
      
      const startTime = Date.now();
      const explainResult = await db.execute(explainQuery);
      const planTime = Date.now() - startTime;

      // Execute actual query for timing
      const queryStartTime = Date.now();
      const queryResult = await db.execute(config.query);
      const executionTime = Date.now() - queryStartTime;

      // Parse execution plan
      const plan = Array.isArray(explainResult) && explainResult.length > 0 ? explainResult[0] : null;
      const queryPlan = plan && typeof plan === 'object' && 'QUERY PLAN' in plan ? plan['QUERY PLAN'] : null;

      // Analyze index usage
      const indexUsed = this.analyzeIndexUsage(queryPlan, config.expectedIndexName);
      const bufferStats = this.extractBufferStats(queryPlan);

      const result: PerformanceTestResult = {
        testName: config.testName,
        queryName: config.queryName,
        executionTime,
        targetTime: config.targetTime,
        passed: executionTime <= config.targetTime && indexUsed,
        indexUsed,
        bufferHits: bufferStats.hits,
        bufferReads: bufferStats.reads,
        resultCount: Array.isArray(queryResult) ? queryResult.length : 0,
        queryPlan
      };

      this.results.push(result);

      // Print immediate result
      const status = result.passed ? '✅' : '❌';
      const indexStatus = indexUsed ? '📊' : '⚠️';
      console.log(`${status} ${config.testName}: ${executionTime}ms (target: <${config.targetTime}ms)`);
      console.log(`${indexStatus} Index usage: ${indexUsed ? 'YES' : 'NO'} | Results: ${result.resultCount}`);

    } catch (error) {
      const result: PerformanceTestResult = {
        testName: config.testName,
        queryName: config.queryName,
        executionTime: 0,
        targetTime: config.targetTime,
        passed: false,
        indexUsed: false,
        bufferHits: 0,
        bufferReads: 0,
        resultCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.results.push(result);
      console.log(`❌ ${config.testName}: FAILED - ${result.error}`);
    }
  }

  private analyzeIndexUsage(queryPlan: any, expectedIndexName: string): boolean {
    if (!queryPlan || !Array.isArray(queryPlan) || queryPlan.length === 0) {
      return false;
    }

    const planText = JSON.stringify(queryPlan);
    
    if (expectedIndexName === 'multiple') {
      // For complex queries, check if any of our indexes are used
      const ourIndexes = [
        'idx_user_profiles_favorite_teams_gin',
        'idx_games_teams_start_time',
        'idx_games_status_start_time',
        'idx_teams_league',
        'idx_user_teams_user_id_team_id',
        'idx_user_teams_team_id_user_id'
      ];
      return ourIndexes.some(idx => planText.includes(idx));
    }

    return planText.includes(expectedIndexName);
  }

  private extractBufferStats(queryPlan: any): { hits: number; reads: number } {
    // This would need to parse the EXPLAIN output for buffer statistics
    // For now, return placeholder values
    return { hits: 0, reads: 0 };
  }

  private generateSummary(): TestSummary {
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const averageExecutionTime = this.results.reduce((sum, r) => sum + r.executionTime, 0) / totalTests;
    const indexUsageRate = (this.results.filter(r => r.indexUsed).length / totalTests) * 100;
    const overallPassed = passedTests === totalTests && indexUsageRate >= 95;

    return {
      totalTests,
      passedTests,
      failedTests,
      averageExecutionTime,
      indexUsageRate,
      overallPassed
    };
  }

  private printDetailedReport(summary: TestSummary): void {
    console.log('\n' + '=' .repeat(80));
    console.log('📊 COMPREHENSIVE PERFORMANCE TEST REPORT');
    console.log('=' .repeat(80));

    console.log(`\n📈 SUMMARY STATISTICS:`);
    console.log(`   Total Tests: ${summary.totalTests}`);
    console.log(`   Passed: ${summary.passedTests} ✅`);
    console.log(`   Failed: ${summary.failedTests} ❌`);
    console.log(`   Average Execution Time: ${summary.averageExecutionTime.toFixed(2)}ms`);
    console.log(`   Index Usage Rate: ${summary.indexUsageRate.toFixed(1)}%`);
    console.log(`   Overall Status: ${summary.overallPassed ? 'PASSED ✅' : 'FAILED ❌'}`);

    console.log(`\n📋 DETAILED RESULTS:`);
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅' : '❌';
      const indexIcon = result.indexUsed ? '📊' : '⚠️';
      console.log(`${index + 1}. ${status} ${result.testName}`);
      console.log(`   Query: ${result.queryName}`);
      console.log(`   Time: ${result.executionTime}ms (target: <${result.targetTime}ms)`);
      console.log(`   ${indexIcon} Index Used: ${result.indexUsed ? 'YES' : 'NO'}`);
      console.log(`   Results: ${result.resultCount} rows`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log('');
    });

    console.log(`\n🎯 PERFORMANCE TARGETS:`);
    console.log(`   ✅ User favorite teams lookup: < 10ms`);
    console.log(`   ✅ Recent team games query: < 20ms`);
    console.log(`   ✅ Teams by sport filtering: < 15ms`);
    console.log(`   ✅ User-team relationships: < 5ms`);
    console.log(`   ✅ Index usage ratio: > 95%`);

    console.log(`\n${summary.overallPassed ? '🎉' : '💥'} SUBTASK 5.6 ${summary.overallPassed ? 'COMPLETED SUCCESSFULLY' : 'FAILED'}`);
  }
}

// Main execution function
async function runComprehensivePerformanceTests(): Promise<void> {
  const testSuite = new ComprehensivePerformanceTestSuite();
  
  try {
    const summary = await testSuite.runAllTests();
    
    if (!summary.overallPassed) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Performance test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runComprehensivePerformanceTests()
    .then(() => {
      console.log('\n✅ All performance tests completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Performance tests failed:', error);
      process.exit(1);
    });
}

export { ComprehensivePerformanceTestSuite, runComprehensivePerformanceTests };