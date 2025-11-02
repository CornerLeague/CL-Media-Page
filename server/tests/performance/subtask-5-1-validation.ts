/**
 * Subtask 5.1 Validation: User Profiles Favorite Teams GIN Index
 * 
 * This script validates that the GIN index on user_profiles.favorite_teams
 * is working correctly and provides the expected performance improvements.
 */

import { db } from "../../db";
import { userProfiles } from "../../../shared/schema";
import { sql } from "drizzle-orm";

interface IndexValidationResult {
  indexExists: boolean;
  queryUsesIndex: boolean;
  executionTime: number;
  bufferHits: number;
  bufferReads: number;
}

export async function validateSubtask51(): Promise<IndexValidationResult> {
  if (!db) {
    throw new Error("Database connection not available");
  }

  console.log("🔍 Validating Subtask 5.1: User Profiles Favorite Teams GIN Index");

  // Test 1: Verify index exists
  const indexCheck = await db.execute(sql`
    SELECT indexname, indexdef 
    FROM pg_indexes 
    WHERE tablename = 'user_profiles' 
      AND indexname = 'idx_user_profiles_favorite_teams_gin'
  `);

  const indexExists = Array.isArray(indexCheck) && indexCheck.length > 0;
  console.log(`✅ Index exists: ${indexExists}`);

  if (!indexExists) {
    console.log("❌ GIN index not found. Please run the migration first.");
    return {
      indexExists: false,
      queryUsesIndex: false,
      executionTime: 0,
      bufferHits: 0,
      bufferReads: 0
    };
  }

  // Test 2: Check query performance with EXPLAIN ANALYZE
  const startTime = Date.now();
  
  const explainResult = await db.execute(sql`
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 
    SELECT firebase_uid, favorite_teams 
    FROM user_profiles 
    WHERE favorite_teams @> ARRAY['team_nba_lakers']
  `);

  const executionTime = Date.now() - startTime;
  
  // Parse the execution plan
  const plan = Array.isArray(explainResult) && explainResult.length > 0 ? explainResult[0] : null;
  if (!plan || typeof plan !== 'object' || !('QUERY PLAN' in plan)) {
    throw new Error("Invalid EXPLAIN result format");
  }
  
  const executionPlan = (plan as any)["QUERY PLAN"][0];
  
  // Check if index is being used
  const planText = JSON.stringify(executionPlan);
  const queryUsesIndex = planText.includes("idx_user_profiles_favorite_teams_gin");
  
  console.log(`✅ Query uses GIN index: ${queryUsesIndex}`);
  console.log(`⏱️  Execution time: ${executionTime}ms`);
  console.log(`📊 Actual execution time: ${executionPlan["Execution Time"]}ms`);

  // Test 3: Performance benchmark
  console.log("\n🚀 Running performance benchmarks...");

  // Benchmark 1: Array containment (@>)
  const bench1Start = Date.now();
  const result1 = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM user_profiles 
    WHERE favorite_teams @> ARRAY['team_nba_lakers']
  `);
  const bench1Time = Date.now() - bench1Start;
  const count1 = Array.isArray(result1) && result1.length > 0 ? (result1[0] as any)?.count || 0 : 0;
  console.log(`📈 Array containment query: ${bench1Time}ms (${count1} results)`);

  // Benchmark 2: Array overlap (&&)
  const bench2Start = Date.now();
  const result2 = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM user_profiles 
    WHERE favorite_teams && ARRAY['team_nba_lakers', 'team_nfl_patriots']
  `);
  const bench2Time = Date.now() - bench2Start;
  const count2 = Array.isArray(result2) && result2.length > 0 ? (result2[0] as any)?.count || 0 : 0;
  console.log(`📈 Array overlap query: ${bench2Time}ms (${count2} results)`);

  // Test 4: Index usage statistics
  const indexStats = await db.execute(sql`
    SELECT 
      idx_tup_read,
      idx_tup_fetch,
      idx_scan
    FROM pg_stat_user_indexes 
    WHERE indexname = 'idx_user_profiles_favorite_teams_gin'
  `);

  if (Array.isArray(indexStats) && indexStats.length > 0) {
    const stats = indexStats[0] as any;
    console.log(`📊 Index scans: ${stats.idx_scan}`);
    console.log(`📊 Index tuples read: ${stats.idx_tup_read}`);
    console.log(`📊 Index tuples fetched: ${stats.idx_tup_fetch}`);
  }

  // Test 5: Index size
  const sizeResult = await db.execute(sql`
    SELECT 
      pg_size_pretty(pg_relation_size('idx_user_profiles_favorite_teams_gin')) as index_size,
      pg_size_pretty(pg_relation_size('user_profiles')) as table_size
  `);

  if (Array.isArray(sizeResult) && sizeResult.length > 0) {
    const sizes = sizeResult[0] as any;
    console.log(`💾 Index size: ${sizes.index_size}`);
    console.log(`💾 Table size: ${sizes.table_size}`);
  }

  // Validation criteria
  const isValid = indexExists && queryUsesIndex && executionTime < 50; // 50ms threshold for test environment

  console.log(`\n${isValid ? '✅' : '❌'} Subtask 5.1 Validation: ${isValid ? 'PASSED' : 'FAILED'}`);

  return {
    indexExists,
    queryUsesIndex,
    executionTime,
    bufferHits: 0, // Would need to parse from EXPLAIN output
    bufferReads: 0  // Would need to parse from EXPLAIN output
  };
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateSubtask51()
    .then((result) => {
      console.log("\n📋 Validation Summary:");
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.indexExists && result.queryUsesIndex ? 0 : 1);
    })
    .catch((error) => {
      console.error("❌ Validation failed:", error);
      process.exit(1);
    });
}