-- Subtask 5.4: User Teams Relationship Index Performance Tests
-- Test composite B-tree indexes on user_teams junction table

-- ============================================================================
-- INDEX EXISTENCE VERIFICATION
-- ============================================================================

-- Check if user_teams relationship indexes exist
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
ORDER BY indexname;

-- ============================================================================
-- QUERY PLAN ANALYSIS
-- ============================================================================

-- Test 1: User -> Teams lookup (primary direction)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT ut.team_id, t.name, t.league 
FROM user_teams ut
JOIN teams t ON ut.team_id = t.id
WHERE ut.user_id = 'test_user_123'
ORDER BY t.name;

-- Test 2: Team -> Users lookup (reverse direction)  
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT ut.user_id, up.firebase_uid
FROM user_teams ut
LEFT JOIN user_profiles up ON ut.user_id = up.firebase_uid
WHERE ut.team_id = 'team_123'
ORDER BY ut.user_id;

-- Test 3: User-Team existence check (common for permissions)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT EXISTS(
    SELECT 1 FROM user_teams 
    WHERE user_id = 'test_user_123' 
    AND team_id = 'team_456'
);

-- Test 4: Count teams per user (aggregation)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT user_id, COUNT(*) as team_count
FROM user_teams
WHERE user_id IN ('user_1', 'user_2', 'user_3')
GROUP BY user_id;

-- Test 5: Count users per team (reverse aggregation)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT team_id, COUNT(*) as user_count
FROM user_teams
WHERE team_id IN ('team_1', 'team_2', 'team_3')
GROUP BY team_id;

-- ============================================================================
-- PERFORMANCE BENCHMARKS
-- ============================================================================

-- Benchmark 1: User teams lookup with JOIN (should use idx_user_teams_user_id_team_id)
\timing on
SELECT ut.team_id, t.name, t.league, t.code
FROM user_teams ut
JOIN teams t ON ut.team_id = t.id
WHERE ut.user_id = 'benchmark_user'
ORDER BY t.name
LIMIT 50;
\timing off

-- Benchmark 2: Team followers lookup (should use idx_user_teams_team_id_user_id)
\timing on
SELECT ut.user_id, COUNT(*) OVER() as total_followers
FROM user_teams ut
WHERE ut.team_id = 'benchmark_team'
ORDER BY ut.user_id
LIMIT 100;
\timing off

-- Benchmark 3: Multiple user teams batch lookup
\timing on
SELECT ut.user_id, ut.team_id, t.name
FROM user_teams ut
JOIN teams t ON ut.team_id = t.id
WHERE ut.user_id = ANY(ARRAY['user_1', 'user_2', 'user_3', 'user_4', 'user_5'])
ORDER BY ut.user_id, t.name;
\timing off

-- Benchmark 4: Team popularity analysis (users per team)
\timing on
SELECT t.name, t.league, COUNT(ut.user_id) as follower_count
FROM teams t
LEFT JOIN user_teams ut ON t.id = ut.team_id
WHERE t.league IN ('NBA', 'NFL', 'MLB')
GROUP BY t.id, t.name, t.league
ORDER BY follower_count DESC
LIMIT 20;
\timing off

-- ============================================================================
-- INDEX USAGE STATISTICS
-- ============================================================================

-- Check index usage statistics for user_teams indexes
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
ORDER BY idx_scan DESC;

-- ============================================================================
-- INDEX SIZE ANALYSIS
-- ============================================================================

-- Check index sizes for user_teams table
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    ROUND(
        (pg_relation_size(indexrelid)::float / 
         pg_relation_size(schemaname||'.'||tablename)::float) * 100, 2
    ) as index_to_table_ratio_percent
FROM pg_stat_user_indexes 
WHERE tablename = 'user_teams'
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- RELATIONSHIP INTEGRITY CHECKS
-- ============================================================================

-- Verify foreign key relationships are maintained
SELECT 
    'user_teams -> users' as relationship,
    COUNT(*) as total_records,
    COUNT(u.id) as valid_user_refs,
    COUNT(*) - COUNT(u.id) as orphaned_records
FROM user_teams ut
LEFT JOIN users u ON ut.user_id = u.id

UNION ALL

SELECT 
    'user_teams -> teams' as relationship,
    COUNT(*) as total_records,
    COUNT(t.id) as valid_team_refs,
    COUNT(*) - COUNT(t.id) as orphaned_records
FROM user_teams ut
LEFT JOIN teams t ON ut.team_id = t.id;

-- Check for duplicate user-team relationships
SELECT 
    user_id,
    team_id,
    COUNT(*) as duplicate_count
FROM user_teams
GROUP BY user_id, team_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 10;

-- ============================================================================
-- PERFORMANCE TARGET VALIDATION
-- ============================================================================

-- Expected performance targets:
-- - User teams lookup: < 10ms for up to 50 teams per user
-- - Team followers lookup: < 15ms for up to 1000 users per team  
-- - Existence checks: < 2ms
-- - Batch operations: < 25ms for 5 users or teams

SELECT 
    'Performance Targets' as metric_type,
    'User teams lookup: < 10ms' as target_1,
    'Team followers: < 15ms' as target_2,
    'Existence checks: < 2ms' as target_3,
    'Batch operations: < 25ms' as target_4;