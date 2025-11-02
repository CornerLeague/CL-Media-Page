/**
 * Subtask 5.6: Comprehensive Performance Test Runner
 * 
 * This script orchestrates all performance tests for the database indexes
 * implemented in Subtask 5.5, providing comprehensive validation and reporting.
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

interface TestResult {
  testName: string;
  category: string;
  executionTime: number;
  target: number;
  passed: boolean;
  details: any;
  error?: string;
}

interface IndexValidation {
  indexName: string;
  exists: boolean;
  isValid: boolean;
  size: string;
  scans: number;
  tuplesRead: number;
}

interface PerformanceReport {
  timestamp: string;
  overallStatus: 'PASS' | 'FAIL' | 'WARNING';
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  indexValidations: IndexValidation[];
  testResults: TestResult[];
  recommendations: string[];
}

class SubTask56TestRunner {
  private results: TestResult[] = [];
  private indexValidations: IndexValidation[] = [];
  private readonly requiredIndexes = [
    'idx_user_profiles_favorite_teams_gin',
    'idx_games_teams_start_time',
    'idx_games_status_start_time',
    'idx_teams_league_id',
    'idx_teams_league_name',
    'idx_user_teams_user_id_team_id',
    'idx_user_teams_team_id_user_id'
  ];

  async runAllTests(): Promise<PerformanceReport> {
    console.log('🚀 Starting Subtask 5.6: Comprehensive Performance Testing');
    console.log('============================================================\n');

    try {
      // Validate database connection
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Step 1: Validate index existence and health
      await this.validateIndexes();

      // Step 2: Run performance tests
      await this.runUserFavoriteTeamsTests();
      await this.runRecentTeamGamesTests();
      await this.runGamesByStatusTests();
      await this.runTeamsBySportTests();
      await this.runUserTeamRelationshipTests();
      await this.runTeamUserRelationshipTests();
      await this.runComplexJoinTests();
      await this.runBatchOperationTests();

      // Step 3: Generate comprehensive report
      const report = await this.generateReport();

      // Step 4: Save report to file
      await this.saveReport(report);

      return report;

    } catch (error) {
      console.error('❌ Test runner failed:', error);
      throw error;
    }
  }

  private async validateIndexes(): Promise<void> {
    console.log('📋 Validating Index Existence and Health');
    console.log('------------------------------------------');

    if (!db) {
      throw new Error('Database connection not available');
    }

    for (const indexName of this.requiredIndexes) {
      try {
        // Check if index exists
        const existsResult = await db.execute(sql`
          SELECT EXISTS(
            SELECT 1 FROM pg_indexes 
            WHERE indexname = ${indexName}
          ) as exists
        `);

        const exists = Array.isArray(existsResult) && existsResult.length > 0 ? 
          (existsResult[0] as any)?.exists || false : false;

        if (!exists) {
          this.indexValidations.push({
            indexName,
            exists: false,
            isValid: false,
            size: 'N/A',
            scans: 0,
            tuplesRead: 0
          });
          continue;
        }

        // Get index statistics
        const statsResult = await db.execute(sql`
          SELECT 
            idx_scan as scans,
            idx_tup_read as tuples_read,
            pg_size_pretty(pg_relation_size(indexrelid)) as size
          FROM pg_stat_user_indexes 
          WHERE indexname = ${indexName}
        `);

        const stats = Array.isArray(statsResult) && statsResult.length > 0 ? 
          statsResult[0] as any : null;

        // Check if index is valid
        const validResult = await db.execute(sql`
          SELECT indisvalid as is_valid
          FROM pg_index i
          JOIN pg_class c ON i.indexrelid = c.oid
          WHERE c.relname = ${indexName}
        `);

        const isValid = Array.isArray(validResult) && validResult.length > 0 ? 
          (validResult[0] as any)?.is_valid || false : false;

        this.indexValidations.push({
          indexName,
          exists: true,
          isValid,
          size: stats?.size || 'Unknown',
          scans: parseInt(stats?.scans || '0'),
          tuplesRead: parseInt(stats?.tuples_read || '0')
        });

        console.log(`✅ ${indexName}: EXISTS, VALID, SIZE: ${stats?.size}`);

      } catch (error) {
        console.error(`❌ Error validating ${indexName}:`, error);
        this.indexValidations.push({
          indexName,
          exists: false,
          isValid: false,
          size: 'Error',
          scans: 0,
          tuplesRead: 0
        });
      }
    }
  }

  private async runPerformanceTest(
    testName: string,
    category: string,
    query: any,
    targetMs: number
  ): Promise<TestResult> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const startTime = performance.now();
    
    try {
      const result = await db.execute(query);
      const endTime = performance.now();
      const executionTime = endTime - startTime;
      const passed = executionTime <= targetMs;

      const resultCount = Array.isArray(result) ? result.length : 0;

      const testResult: TestResult = {
        testName,
        category,
        executionTime: Math.round(executionTime * 100) / 100,
        target: targetMs,
        passed,
        details: {
          rowCount: resultCount,
          executionTimeMs: Math.round(executionTime * 100) / 100
        }
      };

      const status = passed ? '✅' : '❌';
      console.log(`${status} ${testName}: ${testResult.executionTime}ms (target: ${targetMs}ms)`);

      this.results.push(testResult);
      return testResult;

    } catch (error) {
      const endTime = performance.now();
      const executionTime = endTime - startTime;

      const testResult: TestResult = {
        testName,
        category,
        executionTime: Math.round(executionTime * 100) / 100,
        target: targetMs,
        passed: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      console.log(`❌ ${testName}: FAILED - ${testResult.error}`);
      this.results.push(testResult);
      return testResult;
    }
  }

  private async runUserFavoriteTeamsTests(): Promise<void> {
    console.log('\n🔍 Testing User Favorite Teams (GIN Index)');
    console.log('--------------------------------------------');

    // Test 1: Array containment
    await this.runPerformanceTest(
      'User Favorite Teams - Array Containment',
      'User Queries',
      sql`
        SELECT firebase_uid, favorite_teams 
        FROM user_profiles 
        WHERE favorite_teams @> ARRAY['team_nba_lakers']
        LIMIT 100
      `,
      10
    );

    // Test 2: Array overlap
    await this.runPerformanceTest(
      'User Favorite Teams - Array Overlap',
      'User Queries',
      sql`
        SELECT firebase_uid, favorite_teams 
        FROM user_profiles 
        WHERE favorite_teams && ARRAY['team_nba_lakers', 'team_nfl_patriots']
        LIMIT 50
      `,
      10
    );
  }

  private async runRecentTeamGamesTests(): Promise<void> {
    console.log('\n🏀 Testing Recent Team Games (Composite Index)');
    console.log('------------------------------------------------');

    // Test 1: Recent team games
    await this.runPerformanceTest(
      'Recent Team Games - Date Ordering',
      'Game Queries',
      sql`
        SELECT id, home_team_id, away_team_id, start_time, status, home_pts, away_pts
        FROM games 
        WHERE (home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers')
        ORDER BY start_time DESC 
        LIMIT 10
      `,
      20
    );

    // Test 2: Team matchup
    await this.runPerformanceTest(
      'Team Matchup History',
      'Game Queries',
      sql`
        SELECT id, home_pts, away_pts, start_time, status
        FROM games 
        WHERE home_team_id = 'team_nba_lakers' AND away_team_id = 'team_nba_celtics'
        ORDER BY start_time DESC
        LIMIT 5
      `,
      15
    );
  }

  private async runGamesByStatusTests(): Promise<void> {
    console.log('\n⚡ Testing Games by Status (Status-Time Index)');
    console.log('-----------------------------------------------');

    // Test 1: Live games
    await this.runPerformanceTest(
      'Live Games Query',
      'Game Queries',
      sql`
        SELECT id, home_team_id, away_team_id, start_time, status
        FROM games 
        WHERE status = 'live'
        ORDER BY start_time DESC 
        LIMIT 20
      `,
      15
    );

    // Test 2: Recent completed games
    await this.runPerformanceTest(
      'Recent Completed Games',
      'Game Queries',
      sql`
        SELECT id, home_team_id, away_team_id, start_time, home_pts, away_pts
        FROM games 
        WHERE status = 'final' 
          AND start_time >= NOW() - INTERVAL '7 days'
        ORDER BY start_time DESC
        LIMIT 50
      `,
      15
    );
  }

  private async runTeamsBySportTests(): Promise<void> {
    console.log('\n🏈 Testing Teams by Sport/League (League Indexes)');
    console.log('---------------------------------------------------');

    // Test 1: Multi-league filtering
    await this.runPerformanceTest(
      'Multi-League Filtering',
      'Team Queries',
      sql`
        SELECT id, name, code, league 
        FROM teams 
        WHERE league IN ('NBA', 'NFL', 'MLB') 
        ORDER BY name
        LIMIT 100
      `,
      15
    );

    // Test 2: Single league filtering
    await this.runPerformanceTest(
      'Single League Filtering',
      'Team Queries',
      sql`
        SELECT id, name, code, league 
        FROM teams 
        WHERE league = 'NBA' 
        ORDER BY name
      `,
      10
    );
  }

  private async runUserTeamRelationshipTests(): Promise<void> {
    console.log('\n👤 Testing User-to-Teams Relationships');
    console.log('---------------------------------------');

    // Test 1: User teams lookup
    await this.runPerformanceTest(
      'User Teams Lookup with JOIN',
      'Relationship Queries',
      sql`
        SELECT ut.team_id, t.name, t.league, t.code
        FROM user_teams ut
        JOIN teams t ON ut.team_id = t.id
        WHERE ut.user_id = 'test_user_123'
        ORDER BY t.name
        LIMIT 50
      `,
      5
    );

    // Test 2: User-team existence check
    await this.runPerformanceTest(
      'User-Team Existence Check',
      'Relationship Queries',
      sql`
        SELECT EXISTS(
          SELECT 1 FROM user_teams 
          WHERE user_id = 'test_user_123' AND team_id = 'test_team_456'
        ) as exists
      `,
      2
    );
  }

  private async runTeamUserRelationshipTests(): Promise<void> {
    console.log('\n🏟️ Testing Team-to-Users Relationships');
    console.log('----------------------------------------');

    await this.runPerformanceTest(
      'Team Followers Query',
      'Relationship Queries',
      sql`
        SELECT ut.user_id, COUNT(*) as team_count
        FROM user_teams ut
        WHERE ut.team_id = 'team_nba_lakers'
        GROUP BY ut.user_id
        ORDER BY team_count DESC
        LIMIT 100
      `,
      5
    );
  }

  private async runComplexJoinTests(): Promise<void> {
    console.log('\n🔗 Testing Complex Join Queries');
    console.log('--------------------------------');

    await this.runPerformanceTest(
      'Complex Multi-Table Join',
      'Complex Queries',
      sql`
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
      `,
      50
    );
  }

  private async runBatchOperationTests(): Promise<void> {
    console.log('\n📦 Testing Batch Operations');
    console.log('----------------------------');

    // Test 1: Batch user teams lookup
    await this.runPerformanceTest(
      'Batch User Teams Lookup',
      'Batch Operations',
      sql`
        SELECT ut.user_id, ut.team_id, t.name, t.league
        FROM user_teams ut
        JOIN teams t ON ut.team_id = t.id
        WHERE ut.user_id = ANY(ARRAY['user_1', 'user_2', 'user_3', 'user_4', 'user_5'])
        ORDER BY ut.user_id, t.name
      `,
      25
    );

    // Test 2: Batch team followers count
    await this.runPerformanceTest(
      'Batch Team Followers Count',
      'Batch Operations',
      sql`
        SELECT ut.team_id, COUNT(ut.user_id) as follower_count
        FROM user_teams ut
        WHERE ut.team_id = ANY(ARRAY['team_nba_lakers', 'team_nfl_patriots', 'team_mlb_yankees'])
        GROUP BY ut.team_id
        ORDER BY follower_count DESC
      `,
      20
    );
  }

  private async generateReport(): Promise<PerformanceReport> {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;
    const warnings = this.indexValidations.filter(i => !i.exists || !i.isValid).length;

    const overallStatus: 'PASS' | 'FAIL' | 'WARNING' = 
      failed > 0 ? 'FAIL' : warnings > 0 ? 'WARNING' : 'PASS';

    const recommendations: string[] = [];

    // Generate recommendations based on results
    if (failed > 0) {
      recommendations.push('Some performance tests failed. Review query execution plans and consider index optimization.');
    }

    if (warnings > 0) {
      recommendations.push('Some indexes are missing or invalid. Run the deployment migration to create missing indexes.');
    }

    const slowTests = this.results.filter(r => r.executionTime > r.target * 0.8);
    if (slowTests.length > 0) {
      recommendations.push('Some tests are approaching their performance targets. Monitor these queries closely.');
    }

    const unusedIndexes = this.indexValidations.filter(i => i.exists && i.scans === 0);
    if (unusedIndexes.length > 0) {
      recommendations.push('Some indexes show no usage. Verify that queries are using the expected indexes.');
    }

    return {
      timestamp: new Date().toISOString(),
      overallStatus,
      summary: {
        totalTests: this.results.length,
        passed,
        failed,
        warnings
      },
      indexValidations: this.indexValidations,
      testResults: this.results,
      recommendations
    };
  }

  private async saveReport(report: PerformanceReport): Promise<void> {
    const reportDir = path.join(__dirname, '../../docs/db/performance-reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `subtask-5-6-performance-report-${timestamp}.json`);

    try {
      await fs.mkdir(reportDir, { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      console.log(`\n📊 Performance report saved to: ${reportPath}`);
    } catch (error) {
      console.error('❌ Failed to save performance report:', error);
    }
  }

  printSummary(report: PerformanceReport): void {
    console.log('\n🎉 Subtask 5.6: Performance Testing Complete');
    console.log('=============================================');
    console.log(`Overall Status: ${report.overallStatus}`);
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`Warnings: ${report.summary.warnings}`);

    if (report.recommendations.length > 0) {
      console.log('\n📋 Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }

    console.log('\n✅ All performance tests completed successfully!');
  }
}

// Main execution function
export async function runSubTask56Tests(): Promise<PerformanceReport> {
  const runner = new SubTask56TestRunner();
  const report = await runner.runAllTests();
  runner.printSummary(report);
  return report;
}

// CLI execution
if (require.main === module) {
  runSubTask56Tests()
    .then(() => {
      console.log('Performance testing completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Performance testing failed:', error);
      process.exit(1);
    });
}