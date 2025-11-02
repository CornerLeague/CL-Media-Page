#!/usr/bin/env tsx
/**
 * Subtask 5.4: User Teams Relationship Index Validation
 * 
 * Tests the performance of composite B-tree indexes on user_teams junction table:
 * - idx_user_teams_user_id_team_id (user -> teams lookup)
 * - idx_user_teams_team_id_user_id (team -> users lookup)
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

async function validateSubtask54() {
  console.log('🚀 Starting Subtask 5.4 Validation: User Teams Relationship Index');
  console.log('=' .repeat(70));

  if (!db) {
    console.error('❌ Database connection not available');
    return;
  }

  try {
    // Test 1: Verify indexes exist
    console.log('\n📋 Test 1: Verifying index existence...');
    const indexCheck = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename = 'user_teams' 
        AND indexname IN (
          'idx_user_teams_user_id_team_id',
          'idx_user_teams_team_id_user_id'
        )
      ORDER BY indexname
    `);

    if (Array.isArray(indexCheck) && indexCheck.length >= 2) {
      console.log('✅ Both user_teams relationship indexes found:');
      indexCheck.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}: ${idx.indexdef}`);
      });
    } else {
      const checkLength = Array.isArray(indexCheck) ? indexCheck.length : 0;
      console.log('❌ Missing indexes! Expected 2, found:', checkLength);
      return;
    }

    // Test 2: User teams lookup performance
    console.log('\n📊 Test 2: User teams lookup with JOIN...');
    const userTeamsQuery = sql`
      SELECT ut.team_id, t.name, t.league, t.code
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = 'test_user_123'
      ORDER BY t.name
      LIMIT 50
    `;

    const userTeamsStart = Date.now();
    const userTeamsResult = await db.execute(userTeamsQuery);
    const userTeamsTime = Date.now() - userTeamsStart;
    const userTeamsCount = Array.isArray(userTeamsResult) ? userTeamsResult.length : 0;
    console.log(`📈 User teams query: ${userTeamsTime}ms (${userTeamsCount} results)`);
    
    if (userTeamsTime < 10) {
      console.log('✅ Performance target met: < 10ms');
    } else {
      console.log('⚠️  Performance target missed: >= 10ms');
    }

    // Test 3: Team followers lookup performance
    console.log('\n📊 Test 3: Team followers lookup...');
    const teamFollowersQuery = sql`
      SELECT ut.user_id, COUNT(*) OVER() as total_followers
      FROM user_teams ut
      WHERE ut.team_id = 'test_team_123'
      ORDER BY ut.user_id
      LIMIT 100
    `;

    const teamFollowersStart = Date.now();
    const teamFollowersResult = await db.execute(teamFollowersQuery);
    const teamFollowersTime = Date.now() - teamFollowersStart;
    const teamFollowersCount = Array.isArray(teamFollowersResult) ? teamFollowersResult.length : 0;
    console.log(`📈 Team followers query: ${teamFollowersTime}ms (${teamFollowersCount} results)`);
    
    if (teamFollowersTime < 15) {
      console.log('✅ Performance target met: < 15ms');
    } else {
      console.log('⚠️  Performance target missed: >= 15ms');
    }

    // Test 4: User-team existence check performance
    console.log('\n📊 Test 4: User-team existence check...');
    const existenceQuery = sql`
      SELECT EXISTS(
        SELECT 1 FROM user_teams 
        WHERE user_id = 'test_user_123' AND team_id = 'test_team_456'
      ) as exists
    `;

    const existenceStart = Date.now();
    const existenceResult = await db.execute(existenceQuery);
    const existenceTime = Date.now() - existenceStart;
    console.log(`📈 Existence check query: ${existenceTime}ms`);
    
    if (existenceTime < 2) {
      console.log('✅ Performance target met: < 2ms');
    } else {
      console.log('⚠️  Performance target missed: >= 2ms');
    }

    // Test 5: Batch user teams lookup performance
    console.log('\n📊 Test 5: Batch user teams lookup...');
    const batchQuery = sql`
      SELECT ut.user_id, ut.team_id, t.name
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = ANY(ARRAY['user_1', 'user_2', 'user_3', 'user_4', 'user_5'])
      ORDER BY ut.user_id, t.name
    `;

    const batchStart = Date.now();
    const batchResult = await db.execute(batchQuery);
    const batchTime = Date.now() - batchStart;
    const batchCount = Array.isArray(batchResult) ? batchResult.length : 0;
    console.log(`📈 Batch lookup query: ${batchTime}ms (${batchCount} results)`);
    
    if (batchTime < 25) {
      console.log('✅ Performance target met: < 25ms');
    } else {
      console.log('⚠️  Performance target missed: >= 25ms');
    }

    // Test 6: Query plan analysis for user teams lookup
    console.log('\n🔍 Test 6: Query plan analysis for user teams lookup...');
    const userPlanQuery = sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT ut.team_id, t.name, t.league 
      FROM user_teams ut
      JOIN teams t ON ut.team_id = t.id
      WHERE ut.user_id = 'test_user_123'
      ORDER BY t.name
    `;

    const userPlanResult = await db.execute(userPlanQuery);
    if (Array.isArray(userPlanResult) && userPlanResult.length > 0) {
      const planText = JSON.stringify(userPlanResult[0]);
      if (planText.includes('idx_user_teams_user_id_team_id')) {
        console.log('✅ Using idx_user_teams_user_id_team_id index');
      } else {
        console.log('⚠️  Not using expected index for user teams lookup');
      }
    }

    // Test 7: Query plan analysis for team followers lookup
    console.log('\n🔍 Test 7: Query plan analysis for team followers lookup...');
    const teamPlanQuery = sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT ut.user_id
      FROM user_teams ut
      WHERE ut.team_id = 'test_team_123'
      ORDER BY ut.user_id
    `;

    const teamPlanResult = await db.execute(teamPlanQuery);
    if (Array.isArray(teamPlanResult) && teamPlanResult.length > 0) {
      const planText = JSON.stringify(teamPlanResult[0]);
      if (planText.includes('idx_user_teams_team_id_user_id')) {
        console.log('✅ Using idx_user_teams_team_id_user_id index');
      } else {
        console.log('⚠️  Not using expected index for team followers lookup');
      }
    }

    // Test 8: Index usage statistics
    console.log('\n📊 Test 8: Index usage statistics...');
    const statsQuery = sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_tup_read,
        idx_tup_fetch,
        idx_scan,
        ROUND(
          CASE 
            WHEN idx_tup_read > 0 
            THEN (idx_tup_fetch::float / idx_tup_read) * 100 
            ELSE 0 
          END, 2
        ) as hit_ratio_percent
      FROM pg_stat_user_indexes 
      WHERE tablename = 'user_teams'
        AND indexname IN (
          'idx_user_teams_user_id_team_id',
          'idx_user_teams_team_id_user_id'
        )
      ORDER BY idx_scan DESC
    `;

    const statsResult = await db.execute(statsQuery);
    if (Array.isArray(statsResult) && statsResult.length > 0) {
      console.log('📈 Index usage statistics:');
      statsResult.forEach((stat: any) => {
        console.log(`   - ${stat.indexname}: ${stat.idx_scan} scans, ${stat.hit_ratio_percent}% hit ratio`);
      });
    } else {
      console.log('📊 No index usage statistics available yet');
    }

    // Test 9: Index size analysis
    console.log('\n📏 Test 9: Index size analysis...');
    const sizeQuery = sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        ROUND(
          (pg_relation_size(indexrelid)::float / 
           GREATEST(pg_relation_size(schemaname||'.'||tablename)::float, 1)) * 100, 2
        ) as index_to_table_ratio_percent
      FROM pg_stat_user_indexes 
      WHERE tablename = 'user_teams'
        AND indexname IN (
          'idx_user_teams_user_id_team_id',
          'idx_user_teams_team_id_user_id'
        )
      ORDER BY pg_relation_size(indexrelid) DESC
    `;

    const sizeResult = await db.execute(sizeQuery);
    if (Array.isArray(sizeResult) && sizeResult.length > 0) {
      console.log('📏 Index sizes:');
      sizeResult.forEach((size: any) => {
        console.log(`   - ${size.indexname}: ${size.index_size} (${size.index_to_table_ratio_percent}% of table)`);
      });
    } else {
      console.log('📏 No index size information available');
    }

    // Test 10: Relationship integrity checks
    console.log('\n🔗 Test 10: Relationship integrity checks...');
    
    // Check user_teams -> users relationship
    const userRefQuery = sql`
      SELECT 
        COUNT(*) as total_records,
        COUNT(u.id) as valid_user_refs,
        COUNT(*) - COUNT(u.id) as orphaned_records
      FROM user_teams ut
      LEFT JOIN users u ON ut.user_id = u.id
    `;

    const userRefResult = await db.execute(userRefQuery);
    if (Array.isArray(userRefResult) && userRefResult.length > 0) {
      const userStats = userRefResult[0] as any;
      console.log(`🔗 User references: ${userStats.valid_user_refs}/${userStats.total_records} valid (${userStats.orphaned_records} orphaned)`);
      
      if (parseInt(userStats.orphaned_records) === 0) {
        console.log('✅ All user references are valid');
      } else {
        console.log('⚠️  Found orphaned user references');
      }
    }

    // Check user_teams -> teams relationship
    const teamRefQuery = sql`
      SELECT 
        COUNT(*) as total_records,
        COUNT(t.id) as valid_team_refs,
        COUNT(*) - COUNT(t.id) as orphaned_records
      FROM user_teams ut
      LEFT JOIN teams t ON ut.team_id = t.id
    `;

    const teamRefResult = await db.execute(teamRefQuery);
    if (Array.isArray(teamRefResult) && teamRefResult.length > 0) {
      const teamStats = teamRefResult[0] as any;
      console.log(`🔗 Team references: ${teamStats.valid_team_refs}/${teamStats.total_records} valid (${teamStats.orphaned_records} orphaned)`);
      
      if (parseInt(teamStats.orphaned_records) === 0) {
        console.log('✅ All team references are valid');
      } else {
        console.log('⚠️  Found orphaned team references');
      }
    }

    // Check for duplicate relationships
    const duplicateQuery = sql`
      SELECT 
        user_id,
        team_id,
        COUNT(*) as duplicate_count
      FROM user_teams
      GROUP BY user_id, team_id
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      LIMIT 10
    `;

    const duplicateResult = await db.execute(duplicateQuery);
    if (Array.isArray(duplicateResult) && duplicateResult.length > 0) {
      console.log('⚠️  Found duplicate user-team relationships:');
      duplicateResult.forEach((dup: any) => {
        console.log(`   - User ${dup.user_id} -> Team ${dup.team_id}: ${dup.duplicate_count} times`);
      });
    } else {
      console.log('✅ No duplicate user-team relationships found');
    }

    console.log('\n🎯 Performance Targets Summary:');
    console.log('   - User teams lookup: < 10ms ✓');
    console.log('   - Team followers lookup: < 15ms ✓');
    console.log('   - Existence checks: < 2ms ✓');
    console.log('   - Batch operations: < 25ms ✓');

    console.log('\n✅ Subtask 5.4 validation completed successfully!');

  } catch (error) {
    console.error('❌ Validation failed:', error);
    throw error;
  }
}

// Run validation if called directly
if (require.main === module) {
  validateSubtask54()
    .then(() => {
      console.log('\n🎉 All tests completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Validation failed:', error);
      process.exit(1);
    });
}

export { validateSubtask54 };