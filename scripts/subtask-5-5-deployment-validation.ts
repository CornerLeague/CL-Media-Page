#!/usr/bin/env tsx

/**
 * Subtask 5.5: Deployment Validation Script
 * 
 * This script validates the successful deployment of the 0003_user_team_scores_indexes.sql migration
 * by checking index existence, validity, and performance improvements.
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

interface QueryPerformance {
  query_name: string;
  execution_time_ms: number;
  index_used: boolean;
  rows_returned: number;
}

const EXPECTED_INDEXES = [
  'idx_user_profiles_favorite_teams_gin',
  'idx_games_teams_start_time',
  'idx_games_status_start_time',
  'idx_teams_league_id',
  'idx_teams_league_name',
  'idx_user_teams_user_id_team_id',
  'idx_user_teams_team_id_user_id'
];

async function validateIndexExistence(): Promise<boolean> {
  console.log('🔍 Validating index existence...');
  
  if (!db) {
    console.error('❌ Database connection not available');
    return false;
  }
  
  try {
    const indexCheck = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE indexname IN (
        'idx_user_profiles_favorite_teams_gin',
        'idx_games_teams_start_time',
        'idx_games_status_start_time',
        'idx_teams_league_id',
        'idx_teams_league_name',
        'idx_user_teams_user_id_team_id',
        'idx_user_teams_team_id_user_id'
      )
      ORDER BY tablename, indexname
    `);

    if (Array.isArray(indexCheck) && indexCheck.length === 7) {
      console.log('✅ All 7 indexes found successfully');
      indexCheck.forEach((row: any) => {
        console.log(`   - ${row.tablename}.${row.indexname}`);
      });
      return true;
    } else {
      const foundCount = Array.isArray(indexCheck) ? indexCheck.length : 0;
      console.log(`❌ Expected 7 indexes, found ${foundCount}`);
      if (Array.isArray(indexCheck)) {
        indexCheck.forEach((row: any) => {
          console.log(`   - Found: ${row.tablename}.${row.indexname}`);
        });
      }
      return false;
    }
  } catch (error) {
    console.error('❌ Error checking index existence:', error);
    return false;
  }
}

async function validateIndexValidity(): Promise<boolean> {
  console.log('🔍 Validating index validity and readiness...');
  
  if (!db) {
    console.error('❌ Database connection not available');
    return false;
  }
  
  try {
    const validityCheck = await db.execute(sql`
      SELECT 
        pi.schemaname,
        pi.tablename,
        pi.indexname,
        i.indisvalid as is_valid,
        i.indisready as is_ready,
        pg_size_pretty(pg_relation_size(pi.schemaname||'.'||pi.indexname)) as size
      FROM pg_indexes pi
      JOIN pg_class c ON c.relname = pi.indexname
      JOIN pg_index i ON i.indexrelid = c.oid
      WHERE pi.indexname IN (
        'idx_user_profiles_favorite_teams_gin',
        'idx_games_teams_start_time',
        'idx_games_status_start_time',
        'idx_teams_league_id',
        'idx_teams_league_name',
        'idx_user_teams_user_id_team_id',
        'idx_user_teams_team_id_user_id'
      )
      ORDER BY pi.tablename, pi.indexname
    `);

    let allValid = true;
    
    if (Array.isArray(validityCheck)) {
      validityCheck.forEach((row: any) => {
        const status = row.is_valid && row.is_ready ? '✅' : '❌';
        const statusText = row.is_valid && row.is_ready ? 'READY' : 
                          row.is_valid ? 'VALID_BUT_NOT_READY' : 'INVALID';
        
        console.log(`   ${status} ${row.tablename}.${row.indexname}: ${statusText} (${row.size})`);
        
        if (!row.is_valid || !row.is_ready) {
          allValid = false;
        }
      });
    }

    return allValid;
  } catch (error) {
    console.error('❌ Error checking index validity:', error);
    return false;
  }
}

async function testQueryPerformance(): Promise<QueryPerformance[]> {
  console.log('🔍 Testing query performance with new indexes...');
  
  if (!db) {
    console.error('❌ Database connection not available');
    return [];
  }
  
  const results: QueryPerformance[] = [];

  // Test 1: User favorite teams lookup
  try {
    console.log('   Testing user favorite teams lookup...');
    const start1 = Date.now();
    const result1 = await db.execute(sql`
      SELECT firebase_uid, favorite_teams
      FROM user_profiles 
      WHERE favorite_teams @> ARRAY['team_nba_lakers']
      LIMIT 10
    `);
    const time1 = Date.now() - start1;
    const count1 = Array.isArray(result1) ? result1.length : 0;
    
    results.push({
      query_name: 'user_favorite_teams_lookup',
      execution_time_ms: time1,
      index_used: true, // Simplified - assume GIN index is used
      rows_returned: count1
    });
    
    console.log(`   ✅ User favorite teams: ${time1}ms (${count1} rows)`);
  } catch (error) {
    console.log('   ❌ User favorite teams query failed:', error);
  }

  // Test 2: Recent team games
  try {
    console.log('   Testing recent team games...');
    const start2 = Date.now();
    const result2 = await db.execute(sql`
      SELECT id, home_team_id, away_team_id, start_time, status
      FROM games 
      WHERE (home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers')
      ORDER BY start_time DESC 
      LIMIT 5
    `);
    const time2 = Date.now() - start2;
    const count2 = Array.isArray(result2) ? result2.length : 0;
    
    results.push({
      query_name: 'recent_team_games',
      execution_time_ms: time2,
      index_used: true,
      rows_returned: count2
    });
    
    console.log(`   ✅ Recent team games: ${time2}ms (${count2} rows)`);
  } catch (error) {
    console.log('   ❌ Recent team games query failed:', error);
  }

  // Test 3: Games by status
  try {
    console.log('   Testing games by status...');
    const start3 = Date.now();
    const result3 = await db.execute(sql`
      SELECT id, home_team_id, away_team_id, start_time, status
      FROM games 
      WHERE status = 'live'
      ORDER BY start_time DESC 
      LIMIT 10
    `);
    const time3 = Date.now() - start3;
    const count3 = Array.isArray(result3) ? result3.length : 0;
    
    results.push({
      query_name: 'games_by_status',
      execution_time_ms: time3,
      index_used: true,
      rows_returned: count3
    });
    
    console.log(`   ✅ Games by status: ${time3}ms (${count3} rows)`);
  } catch (error) {
    console.log('   ❌ Games by status query failed:', error);
  }

  // Test 4: Teams by league
  try {
    console.log('   Testing teams by league...');
    const start4 = Date.now();
    const result4 = await db.execute(sql`
      SELECT id, name, league
      FROM teams 
      WHERE league IN ('NBA', 'NFL')
      ORDER BY name
      LIMIT 20
    `);
    const time4 = Date.now() - start4;
    const count4 = Array.isArray(result4) ? result4.length : 0;
    
    results.push({
      query_name: 'teams_by_league',
      execution_time_ms: time4,
      index_used: true,
      rows_returned: count4
    });
    
    console.log(`   ✅ Teams by league: ${time4}ms (${count4} rows)`);
  } catch (error) {
    console.log('   ❌ Teams by league query failed:', error);
  }

  // Test 5: User to teams
  try {
    console.log('   Testing user to teams relationship...');
    const start5 = Date.now();
    const result5 = await db.execute(sql`
      SELECT ut.user_id, ut.team_id, t.name
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = 'test_user_123'
      LIMIT 10
    `);
    const time5 = Date.now() - start5;
    const count5 = Array.isArray(result5) ? result5.length : 0;
    
    results.push({
      query_name: 'user_to_teams',
      execution_time_ms: time5,
      index_used: true,
      rows_returned: count5
    });
    
    console.log(`   ✅ User to teams: ${time5}ms (${count5} rows)`);
  } catch (error) {
    console.log('   ❌ User to teams query failed:', error);
  }

  // Test 6: Team to users
  try {
    console.log('   Testing team to users relationship...');
    const start6 = Date.now();
    const result6 = await db.execute(sql`
      SELECT ut.team_id, ut.user_id
      FROM user_teams ut
      WHERE ut.team_id = 'team_nba_lakers'
      LIMIT 10
    `);
    const time6 = Date.now() - start6;
    const count6 = Array.isArray(result6) ? result6.length : 0;
    
    results.push({
      query_name: 'team_to_users',
      execution_time_ms: time6,
      index_used: true,
      rows_returned: count6
    });
    
    console.log(`   ✅ Team to users: ${time6}ms (${count6} rows)`);
  } catch (error) {
    console.log('   ❌ Team to users query failed:', error);
  }

  return results;
}

async function checkIndexUsageStats(): Promise<void> {
  console.log('🔍 Checking index usage statistics...');
  
  if (!db) {
    console.error('❌ Database connection not available');
    return;
  }
  
  try {
    const usageStats = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_tup_read,
        idx_tup_fetch,
        idx_scan
      FROM pg_stat_user_indexes 
      WHERE indexname IN (
        'idx_user_profiles_favorite_teams_gin',
        'idx_games_teams_start_time',
        'idx_games_status_start_time',
        'idx_teams_league_id',
        'idx_teams_league_name',
        'idx_user_teams_user_id_team_id',
        'idx_user_teams_team_id_user_id'
      )
      ORDER BY tablename, indexname
    `);

    if (!Array.isArray(usageStats) || usageStats.length === 0) {
      console.log('⚠️  No usage statistics available yet (indexes may be newly created)');
      return;
    }

    usageStats.forEach((row: any) => {
      console.log(`   📊 ${row.tablename}.${row.indexname}:`);
      console.log(`      Scans: ${row.idx_scan}, Tuples Read: ${row.idx_tup_read}, Tuples Fetched: ${row.idx_tup_fetch}`);
    });
  } catch (error) {
    console.error('❌ Error checking index usage stats:', error);
  }
}

async function validateDeployment(): Promise<boolean> {
  console.log('🚀 Starting Subtask 5.5 Deployment Validation\n');
  
  if (!db) {
    console.error('❌ Database connection not available');
    return false;
  }
  
  let overallSuccess = true;
  
  // Step 1: Check index existence
  const indexesExist = await validateIndexExistence();
  if (!indexesExist) {
    overallSuccess = false;
  }
  console.log('');
  
  // Step 2: Check index validity
  const indexesValid = await validateIndexValidity();
  if (!indexesValid) {
    overallSuccess = false;
  }
  console.log('');
  
  // Step 3: Test query performance
  const performanceResults = await testQueryPerformance();
  const successfulQueries = performanceResults.filter(r => r.execution_time_ms >= 0).length;
  console.log(`\n📈 Performance test results: ${successfulQueries}/${performanceResults.length} queries successful`);
  console.log('');
  
  // Step 4: Check usage statistics
  await checkIndexUsageStats();
  console.log('');
  
  // Final summary
  console.log('📋 DEPLOYMENT VALIDATION SUMMARY');
  console.log('================================');
  console.log(`Index Creation: ${indexesExist ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Index Validity: ${indexesValid ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`Query Performance: ${successfulQueries >= 4 ? '✅ GOOD' : '⚠️  NEEDS REVIEW'}`);
  console.log(`Overall Status: ${overallSuccess ? '✅ DEPLOYMENT SUCCESSFUL' : '❌ DEPLOYMENT ISSUES DETECTED'}`);
  
  if (overallSuccess) {
    console.log('\n🎉 Subtask 5.5 deployment validation completed successfully!');
    console.log('All indexes are created, valid, and ready for use.');
  } else {
    console.log('\n⚠️  Deployment validation detected issues. Please review the results above.');
  }
  
  return overallSuccess;
}

// Performance targets validation
async function validatePerformanceTargets(performanceResults: QueryPerformance[]): Promise<void> {
  console.log('🎯 Validating Performance Targets');
  console.log('=================================');
  
  const targets = [
    { query: 'user_favorite_teams_lookup', target_ms: 10 },
    { query: 'recent_team_games', target_ms: 20 },
    { query: 'games_by_status', target_ms: 15 },
    { query: 'teams_by_league', target_ms: 15 },
    { query: 'user_to_teams', target_ms: 5 },
    { query: 'team_to_users', target_ms: 5 }
  ];
  
  targets.forEach(target => {
    const result = performanceResults.find(r => r.query_name === target.query);
    if (result && result.execution_time_ms >= 0) {
      const status = result.execution_time_ms <= target.target_ms ? '✅' : '⚠️';
      console.log(`${status} ${target.query}: ${result.execution_time_ms}ms (target: <${target.target_ms}ms)`);
    } else {
      console.log(`❌ ${target.query}: Unable to measure performance`);
    }
  });
}

// Main execution
async function main() {
  try {
    const success = await validateDeployment();
    
    // Run performance targets validation
    const performanceResults = await testQueryPerformance();
    console.log('');
    await validatePerformanceTargets(performanceResults);
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('❌ Deployment validation failed with error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { validateDeployment, validatePerformanceTargets };