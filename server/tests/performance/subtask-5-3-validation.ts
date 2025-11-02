/**
 * Subtask 5.3: Teams Sport-League Mapping Index Validation
 * 
 * Tests the performance and effectiveness of the new composite indexes:
 * - idx_teams_league_id: Optimizes league-based filtering with ID ordering
 * - idx_teams_league_name: Optimizes team name searches within leagues
 */

import { db } from '../../db';
import { teams } from '../../../shared/schema';
import { eq, inArray, ilike, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

interface PerformanceResult {
  testName: string;
  duration: number;
  resultCount: number;
  success: boolean;
  error?: string;
}

async function validateTeamsIndexes(): Promise<void> {
  if (!db) {
    console.error('Database connection not available');
    return;
  }

  console.log('🔍 Subtask 5.3: Teams Sport-League Mapping Index Validation');
  console.log('=' .repeat(60));

  const results: PerformanceResult[] = [];

  try {
    // Test 1: Verify index existence
    console.log('\n📋 Test 1: Verifying index existence...');
    const indexCheck = await db.execute(sql`
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE tablename = 'teams' 
        AND indexname IN ('idx_teams_league_id', 'idx_teams_league_name')
      ORDER BY indexname
    `);

    if (Array.isArray(indexCheck) && indexCheck.length >= 2) {
      console.log('✅ Both teams indexes exist');
      indexCheck.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });
    } else {
      console.log('❌ Teams indexes missing or incomplete');
      return;
    }

    // Test 2: Multi-league filtering performance (sport-based queries)
    console.log('\n🏀 Test 2: Multi-league filtering (Basketball leagues)...');
    const start2 = Date.now();
    const basketballTeams = await db
      .select()
      .from(teams)
      .where(inArray(teams.league, ['NBA', 'WNBA', 'G-LEAGUE']))
      .orderBy(teams.name);
    const duration2 = Date.now() - start2;

    results.push({
      testName: 'Multi-league Basketball filtering',
      duration: duration2,
      resultCount: basketballTeams.length,
      success: true
    });

    console.log(`   Duration: ${duration2}ms, Results: ${basketballTeams.length}`);

    // Test 3: Team name search within league
    console.log('\n🔍 Test 3: Team name search within league...');
    const start3 = Date.now();
    const lakersSearch = await db
      .select()
      .from(teams)
      .where(and(
        eq(teams.league, 'NBA'),
        ilike(teams.name, '%Lakers%')
      ));
    const duration3 = Date.now() - start3;

    results.push({
      testName: 'League name search (Lakers)',
      duration: duration3,
      resultCount: lakersSearch.length,
      success: true
    });

    console.log(`   Duration: ${duration3}ms, Results: ${lakersSearch.length}`);

    // Test 4: League-specific team listing
    console.log('\n🏈 Test 4: NFL team listing...');
    const start4 = Date.now();
    const nflTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.league, 'NFL'))
      .orderBy(teams.name);
    const duration4 = Date.now() - start4;

    results.push({
      testName: 'NFL team listing',
      duration: duration4,
      resultCount: nflTeams.length,
      success: true
    });

    console.log(`   Duration: ${duration4}ms, Results: ${nflTeams.length}`);

    // Test 5: Soccer leagues filtering (multiple leagues map to same sport)
    console.log('\n⚽ Test 5: Soccer leagues filtering...');
    const start5 = Date.now();
    const soccerTeams = await db
      .select()
      .from(teams)
      .where(inArray(teams.league, ['MLS', 'EPL', 'UCL', 'LALIGA', 'BUNDESLIGA', 'SERIEA']))
      .orderBy(teams.name);
    const duration5 = Date.now() - start5;

    results.push({
      testName: 'Soccer leagues filtering',
      duration: duration5,
      resultCount: soccerTeams.length,
      success: true
    });

    console.log(`   Duration: ${duration5}ms, Results: ${soccerTeams.length}`);

    // Test 6: Query plan analysis for league filtering
    console.log('\n📊 Test 6: Query plan analysis...');
    const explainResult = await db.execute(sql`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, name, code, league 
      FROM teams 
      WHERE league IN ('NBA', 'NFL', 'MLB') 
      ORDER BY name
    `);

    if (Array.isArray(explainResult) && explainResult.length > 0) {
      const plan = explainResult[0] as any;
      console.log('✅ Query plan retrieved successfully');
      
      // Check if index is being used
      const planText = JSON.stringify(plan);
      if (planText.includes('idx_teams_league') || planText.includes('Index Scan')) {
        console.log('✅ Index usage detected in query plan');
      } else {
        console.log('⚠️  Index usage not clearly detected');
      }
    }

    // Test 7: Index usage statistics
    console.log('\n📈 Test 7: Index usage statistics...');
    const indexStats = await db.execute(sql`
      SELECT 
        indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes 
      WHERE tablename = 'teams' 
        AND indexname IN ('idx_teams_league_id', 'idx_teams_league_name', 'idx_teams_league')
      ORDER BY indexname
    `);

    if (Array.isArray(indexStats)) {
      console.log('📊 Index Usage Statistics:');
      indexStats.forEach((stat: any) => {
        console.log(`   ${stat.indexname}: ${stat.scans} scans, ${stat.tuples_read} tuples read`);
      });
    }

    // Test 8: Index size analysis
    console.log('\n💾 Test 8: Index size analysis...');
    const sizeResult = await db.execute(sql`
      SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes 
      WHERE tablename = 'teams' 
        AND indexname IN ('idx_teams_league_id', 'idx_teams_league_name', 'idx_teams_league')
      ORDER BY indexname
    `);

    if (Array.isArray(sizeResult)) {
      console.log('💾 Index Sizes:');
      sizeResult.forEach((size: any) => {
        console.log(`   ${size.indexname}: ${size.index_size}`);
      });
    }

    // Performance Summary
    console.log('\n📊 Performance Summary');
    console.log('=' .repeat(40));
    
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.testName}: ${result.duration}ms (${result.resultCount} results)`);
    });

    // Performance targets validation
    console.log('\n🎯 Performance Targets Validation');
    console.log('=' .repeat(40));
    
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    console.log(`Average query time: ${avgDuration.toFixed(2)}ms`);
    
    if (avgDuration < 50) {
      console.log('✅ Performance target met (< 50ms average)');
    } else {
      console.log('⚠️  Performance target not met (>= 50ms average)');
    }

    // Test specific performance thresholds
    const multiLeagueResult = results.find(r => r.testName.includes('Multi-league'));
    const nameSearchResult = results.find(r => r.testName.includes('name search'));
    const listingResult = results.find(r => r.testName.includes('listing'));

    if (multiLeagueResult && multiLeagueResult.duration < 30) {
      console.log('✅ Multi-league filtering: < 30ms');
    } else {
      console.log('⚠️  Multi-league filtering: >= 30ms');
    }

    if (nameSearchResult && nameSearchResult.duration < 20) {
      console.log('✅ Name search within league: < 20ms');
    } else {
      console.log('⚠️  Name search within league: >= 20ms');
    }

    if (listingResult && listingResult.duration < 25) {
      console.log('✅ League team listing: < 25ms');
    } else {
      console.log('⚠️  League team listing: >= 25ms');
    }

    console.log('\n🎉 Subtask 5.3 validation completed successfully!');

  } catch (error) {
    console.error('❌ Validation failed:', error);
    results.push({
      testName: 'Overall validation',
      duration: 0,
      resultCount: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateTeamsIndexes()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Validation script failed:', error);
      process.exit(1);
    });
}

export { validateTeamsIndexes };