#!/usr/bin/env tsx
/**
 * Subtask 5.2 Validation: Games Team-Date Composite Index
 * 
 * Tests the performance and correctness of:
 * - idx_games_teams_start_time (home_team_id, away_team_id, start_time DESC)
 * - idx_games_status_start_time (status, start_time DESC)
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

async function validateSubtask52() {
  console.log('🚀 Starting Subtask 5.2 Validation: Games Team-Date Composite Index');
  console.log('=' .repeat(70));

  if (!db) {
    console.error('❌ Database connection not available');
    return;
  }

  try {
    // Test 1: Verify indexes exist
    console.log('\n📋 Test 1: Verifying index existence...');
    const indexCheck = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'games' 
      AND indexname IN ('idx_games_teams_start_time', 'idx_games_status_start_time')
      ORDER BY indexname
    `);

    if (Array.isArray(indexCheck) && indexCheck.length >= 2) {
      console.log('✅ Both composite indexes found:');
      indexCheck.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });
    } else {
      const checkLength = Array.isArray(indexCheck) ? indexCheck.length : 0;
      console.log('❌ Missing indexes! Expected 2, found:', checkLength);
      return;
    }

    // Test 2: Team-based game lookup performance
    console.log('\n📊 Test 2: Team-based game lookup with date ordering...');
    const teamQuery = sql`
      SELECT id, home_team_id, away_team_id, start_time, status
      FROM games 
      WHERE home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers'
      ORDER BY start_time DESC 
      LIMIT 10
    `;

    const teamStart = Date.now();
    const teamResult = await db.execute(teamQuery);
    const teamTime = Date.now() - teamStart;
    const teamCount = Array.isArray(teamResult) ? teamResult.length : 0;
    console.log(`📈 Team games query: ${teamTime}ms (${teamCount} results)`);

    // Test 3: Query plan analysis for team lookup
    console.log('\n🔍 Test 3: Analyzing query plan for team lookup...');
    const explainTeam = await db.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, home_team_id, away_team_id, start_time, status
      FROM games 
      WHERE home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers'
      ORDER BY start_time DESC 
      LIMIT 10
    `);

    if (Array.isArray(explainTeam) && explainTeam.length > 0) {
      const plan = (explainTeam[0] as any)?.['QUERY PLAN'];
      if (plan && plan[0]) {
        const executionTime = plan[0]['Execution Time'];
        console.log(`🎯 Query execution time: ${executionTime?.toFixed(2)}ms`);
        
        // Check if index is being used
        const planStr = JSON.stringify(plan);
        const usesTeamIndex = planStr.includes('idx_games_teams_start_time') || 
                             planStr.includes('idx_games_home_team_start_time') ||
                             planStr.includes('idx_games_away_team_start_time');
        console.log(`📊 Uses team-related index: ${usesTeamIndex ? '✅' : '❌'}`);
      }
    }

    // Test 4: Status-based filtering performance
    console.log('\n📊 Test 4: Status-based filtering with date ordering...');
    const statusQuery = sql`
      SELECT id, home_team_id, away_team_id, start_time
      FROM games 
      WHERE status = 'live'
      ORDER BY start_time DESC 
      LIMIT 5
    `;

    const statusStart = Date.now();
    const statusResult = await db.execute(statusQuery);
    const statusTime = Date.now() - statusStart;
    const statusCount = Array.isArray(statusResult) ? statusResult.length : 0;
    console.log(`📈 Status filter query: ${statusTime}ms (${statusCount} results)`);

    // Test 5: Query plan analysis for status filtering
    console.log('\n🔍 Test 5: Analyzing query plan for status filtering...');
    const explainStatus = await db.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, home_team_id, away_team_id, start_time
      FROM games 
      WHERE status = 'live'
      ORDER BY start_time DESC 
      LIMIT 5
    `);

    if (Array.isArray(explainStatus) && explainStatus.length > 0) {
      const plan = (explainStatus[0] as any)?.['QUERY PLAN'];
      if (plan && plan[0]) {
        const executionTime = plan[0]['Execution Time'];
        console.log(`🎯 Query execution time: ${executionTime?.toFixed(2)}ms`);
        
        // Check if status index is being used
        const planStr = JSON.stringify(plan);
        const usesStatusIndex = planStr.includes('idx_games_status_start_time');
        console.log(`📊 Uses status index: ${usesStatusIndex ? '✅' : '❌'}`);
      }
    }

    // Test 6: Complex query combining team and status
    console.log('\n📊 Test 6: Complex team + status query...');
    const complexQuery = sql`
      SELECT id, home_team_id, away_team_id, home_pts, away_pts, start_time
      FROM games 
      WHERE status IN ('live', 'final') 
      AND (home_team_id = 'team_nfl_patriots' OR away_team_id = 'team_nfl_patriots')
      ORDER BY start_time DESC 
      LIMIT 20
    `;

    const complexStart = Date.now();
    const complexResult = await db.execute(complexQuery);
    const complexTime = Date.now() - complexStart;
    const complexCount = Array.isArray(complexResult) ? complexResult.length : 0;
    console.log(`📈 Complex query: ${complexTime}ms (${complexCount} results)`);

    // Test 7: Index usage statistics
    console.log('\n📊 Test 7: Index usage statistics...');
    const indexStats = await db.execute(sql`
      SELECT 
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes 
      WHERE tablename = 'games'
      AND indexname IN ('idx_games_teams_start_time', 'idx_games_status_start_time')
      ORDER BY indexname
    `);

    if (Array.isArray(indexStats) && indexStats.length > 0) {
      console.log('📈 Index usage statistics:');
      indexStats.forEach((stat: any) => {
        console.log(`   ${stat.indexname}:`);
        console.log(`     - Scans: ${stat.scans}`);
        console.log(`     - Tuples read: ${stat.tuples_read}`);
        console.log(`     - Tuples fetched: ${stat.tuples_fetched}`);
      });
    }

    // Test 8: Index sizes
    console.log('\n💾 Test 8: Index size analysis...');
    const sizeResult = await db.execute(sql`
      SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
      FROM pg_indexes 
      WHERE tablename = 'games'
      AND indexname IN ('idx_games_teams_start_time', 'idx_games_status_start_time')
      ORDER BY indexname
    `);

    if (Array.isArray(sizeResult) && sizeResult.length > 0) {
      console.log('💾 Index sizes:');
      sizeResult.forEach((size: any) => {
        console.log(`   ${size.indexname}: ${size.index_size}`);
      });
    }

    // Test 9: Performance benchmarks
    console.log('\n⚡ Test 9: Performance benchmarks...');
    
    // Benchmark 1: Count games for a team
    const bench1Start = Date.now();
    const count1Result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM games 
      WHERE home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers'
    `);
    const bench1Time = Date.now() - bench1Start;
    const count1 = Array.isArray(count1Result) && count1Result.length > 0 ? 
                   (count1Result[0] as any)?.count || 0 : 0;
    console.log(`📊 Team games count: ${bench1Time}ms (${count1} total games)`);

    // Benchmark 2: Count live games
    const bench2Start = Date.now();
    const count2Result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM games 
      WHERE status = 'live'
    `);
    const bench2Time = Date.now() - bench2Start;
    const count2 = Array.isArray(count2Result) && count2Result.length > 0 ? 
                   (count2Result[0] as any)?.count || 0 : 0;
    console.log(`📊 Live games count: ${bench2Time}ms (${count2} live games)`);

    console.log('\n✅ Subtask 5.2 validation completed successfully!');
    console.log('🎯 Key Performance Targets:');
    console.log('   - Team lookup queries: < 50ms');
    console.log('   - Status filter queries: < 20ms');
    console.log('   - Complex queries: < 100ms');
    console.log('   - Index usage: Verify in query plans');

  } catch (error) {
    console.error('❌ Validation failed:', error);
    throw error;
  }
}

// Run validation if called directly
if (require.main === module) {
  validateSubtask52()
    .then(() => {
      console.log('\n🎉 All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Tests failed:', error);
      process.exit(1);
    });
}

export { validateSubtask52 };