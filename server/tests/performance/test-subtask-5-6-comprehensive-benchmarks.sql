-- Subtask 5.6: Comprehensive Performance Testing and Validation
-- SQL-based test suite for validating all database indexes and performance targets
-- 
-- This script provides detailed EXPLAIN ANALYZE output and performance benchmarks
-- for all queries that should benefit from the implemented indexes.

\echo '🚀 Starting Subtask 5.6: Comprehensive Performance Testing'
\echo '============================================================'

-- Enable timing for all queries
\timing on

-- Set output format for better readability
\pset border 2
\pset format aligned

\echo ''
\echo '📋 Pre-Test: Validating Index Existence'
\echo '----------------------------------------'

-- Verify all required indexes exist
SELECT 
    indexname,
    tablename,
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
ORDER BY tablename, indexname;

\echo ''
\echo '🔍 Test 1: User Favorite Teams Lookup (GIN Index)'
\echo '--------------------------------------------------'

-- Test 1a: Array containment query (@>)
\echo 'Test 1a: Array containment query - Target: < 10ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT firebase_uid, favorite_teams 
FROM user_profiles 
WHERE favorite_teams @> ARRAY['team_nba_lakers']
LIMIT 100;

-- Test 1b: Array overlap query (&&)
\echo ''
\echo 'Test 1b: Array overlap query - Target: < 10ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT firebase_uid, favorite_teams 
FROM user_profiles 
WHERE favorite_teams && ARRAY['team_nba_lakers', 'team_nfl_patriots']
LIMIT 50;

-- Performance benchmark for Test 1
\echo ''
\echo 'Performance Benchmark: User Favorite Teams'
SELECT 
    'user_favorite_teams_lookup' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT firebase_uid FROM user_profiles 
    WHERE favorite_teams @> ARRAY['team_nba_lakers']
    LIMIT 100
) results;

\echo ''
\echo '🏀 Test 2: Recent Team Games (Composite Index)'
\echo '-----------------------------------------------'

-- Test 2a: Team games with date ordering
\echo 'Test 2a: Recent team games - Target: < 20ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, home_team_id, away_team_id, start_time, status, home_pts, away_pts
FROM games 
WHERE (home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers')
ORDER BY start_time DESC 
LIMIT 10;

-- Test 2b: Specific team matchup
\echo ''
\echo 'Test 2b: Team matchup history - Target: < 15ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, home_pts, away_pts, start_time, status
FROM games 
WHERE home_team_id = 'team_nba_lakers' AND away_team_id = 'team_nba_celtics'
ORDER BY start_time DESC
LIMIT 5;

-- Performance benchmark for Test 2
\echo ''
\echo 'Performance Benchmark: Recent Team Games'
SELECT 
    'recent_team_games' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT * FROM games 
    WHERE (home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers')
    ORDER BY start_time DESC 
    LIMIT 10
) results;

\echo ''
\echo '⚡ Test 3: Games by Status (Status-Time Index)'
\echo '----------------------------------------------'

-- Test 3a: Live games query
\echo 'Test 3a: Live games query - Target: < 15ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, home_team_id, away_team_id, start_time, status
FROM games 
WHERE status = 'live'
ORDER BY start_time DESC 
LIMIT 20;

-- Test 3b: Recent completed games
\echo ''
\echo 'Test 3b: Recent completed games - Target: < 15ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, home_team_id, away_team_id, start_time, home_pts, away_pts
FROM games 
WHERE status = 'final' 
  AND start_time >= NOW() - INTERVAL '7 days'
ORDER BY start_time DESC
LIMIT 50;

-- Performance benchmark for Test 3
\echo ''
\echo 'Performance Benchmark: Games by Status'
SELECT 
    'games_by_status' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT * FROM games 
    WHERE status = 'live'
    ORDER BY start_time DESC 
    LIMIT 20
) results;

\echo ''
\echo '🏈 Test 4: Teams by Sport/League (League Indexes)'
\echo '--------------------------------------------------'

-- Test 4a: Multi-league filtering
\echo 'Test 4a: Multi-league filtering - Target: < 15ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, code, league 
FROM teams 
WHERE league IN ('NBA', 'NFL', 'MLB') 
ORDER BY name
LIMIT 100;

-- Test 4b: Single league filtering
\echo ''
\echo 'Test 4b: Single league filtering - Target: < 10ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, code, league 
FROM teams 
WHERE league = 'NBA' 
ORDER BY name;

-- Test 4c: League name search
\echo ''
\echo 'Test 4c: League name search - Target: < 10ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, code, league 
FROM teams 
WHERE league = 'NBA' AND name ILIKE '%Lakers%';

-- Performance benchmark for Test 4
\echo ''
\echo 'Performance Benchmark: Teams by Sport'
SELECT 
    'teams_by_sport' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT * FROM teams 
    WHERE league IN ('NBA', 'NFL', 'MLB') 
    ORDER BY name
    LIMIT 100
) results;

\echo ''
\echo '👤 Test 5: User-to-Teams Relationships'
\echo '---------------------------------------'

-- Test 5a: User teams lookup with JOIN
\echo 'Test 5a: User teams lookup - Target: < 5ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ut.team_id, t.name, t.league, t.code
FROM user_teams ut
JOIN teams t ON ut.team_id = t.id
WHERE ut.user_id = 'test_user_123'
ORDER BY t.name
LIMIT 50;

-- Test 5b: User-team existence check
\echo ''
\echo 'Test 5b: User-team existence check - Target: < 2ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT EXISTS(
    SELECT 1 FROM user_teams 
    WHERE user_id = 'test_user_123' AND team_id = 'test_team_456'
) as exists;

-- Performance benchmark for Test 5
\echo ''
\echo 'Performance Benchmark: User-to-Teams'
SELECT 
    'user_to_teams' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT ut.team_id, t.name FROM user_teams ut
    JOIN teams t ON ut.team_id = t.id
    WHERE ut.user_id = 'test_user_123'
    ORDER BY t.name
    LIMIT 50
) results;

\echo ''
\echo '🏟️ Test 6: Team-to-Users Relationships'
\echo '---------------------------------------'

-- Test 6a: Team followers query
\echo 'Test 6a: Team followers query - Target: < 5ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ut.user_id, COUNT(*) as team_count
FROM user_teams ut
WHERE ut.team_id = 'team_nba_lakers'
GROUP BY ut.user_id
ORDER BY team_count DESC
LIMIT 100;

-- Performance benchmark for Test 6
\echo ''
\echo 'Performance Benchmark: Team-to-Users'
SELECT 
    'team_to_users' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT ut.user_id FROM user_teams ut
    WHERE ut.team_id = 'team_nba_lakers'
    GROUP BY ut.user_id
    LIMIT 100
) results;

\echo ''
\echo '🔗 Test 7: Complex Join Queries'
\echo '--------------------------------'

-- Test 7a: Complex multi-table join
\echo 'Test 7a: Complex multi-table join - Target: < 50ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
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
LIMIT 20;

\echo ''
\echo '📦 Test 8: Batch Operations'
\echo '----------------------------'

-- Test 8a: Batch user teams lookup
\echo 'Test 8a: Batch user teams lookup - Target: < 25ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ut.user_id, ut.team_id, t.name, t.league
FROM user_teams ut
JOIN teams t ON ut.team_id = t.id
WHERE ut.user_id = ANY(ARRAY['user_1', 'user_2', 'user_3', 'user_4', 'user_5'])
ORDER BY ut.user_id, t.name;

-- Test 8b: Batch team followers count
\echo ''
\echo 'Test 8b: Batch team followers count - Target: < 20ms'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ut.team_id, COUNT(ut.user_id) as follower_count
FROM user_teams ut
WHERE ut.team_id = ANY(ARRAY['team_nba_lakers', 'team_nfl_patriots', 'team_mlb_yankees'])
GROUP BY ut.team_id
ORDER BY follower_count DESC;

-- Performance benchmark for Test 8
\echo ''
\echo 'Performance Benchmark: Batch Operations'
SELECT 
    'batch_operations' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT ut.user_id, ut.team_id FROM user_teams ut
    WHERE ut.user_id = ANY(ARRAY['user_1', 'user_2', 'user_3', 'user_4', 'user_5'])
    ORDER BY ut.user_id
) results;

\echo ''
\echo '📊 Index Usage Statistics'
\echo '-------------------------'

-- Check index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    ROUND(
        CASE 
            WHEN idx_scan > 0 THEN (idx_tup_fetch::float / idx_scan)
            ELSE 0 
        END, 2
    ) as avg_tuples_per_scan
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
ORDER BY tablename, indexname;

\echo ''
\echo '💾 Index Size Analysis'
\echo '----------------------'

-- Check index sizes
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    pg_relation_size(indexrelid) as size_bytes
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
ORDER BY size_bytes DESC;

\echo ''
\echo '🎯 Performance Targets Summary'
\echo '-------------------------------'

SELECT 
    'Performance Target' as metric,
    'Target Time' as target,
    'Status' as status
UNION ALL
SELECT 'User favorite teams lookup', '< 10ms', '✅ Measured'
UNION ALL
SELECT 'Recent team games query', '< 20ms', '✅ Measured'
UNION ALL
SELECT 'Games by status filtering', '< 15ms', '✅ Measured'
UNION ALL
SELECT 'Teams by sport filtering', '< 15ms', '✅ Measured'
UNION ALL
SELECT 'User-team relationships', '< 5ms', '✅ Measured'
UNION ALL
SELECT 'Team-user relationships', '< 5ms', '✅ Measured'
UNION ALL
SELECT 'Complex join queries', '< 50ms', '✅ Measured'
UNION ALL
SELECT 'Batch operations', '< 25ms', '✅ Measured'
UNION ALL
SELECT 'Index usage ratio', '> 95%', '📊 Check stats above';

\echo ''
\echo '🎉 Subtask 5.6: Comprehensive Performance Testing Complete'
\echo '=========================================================='

-- Disable timing
\timing off

\echo ''
\echo 'All performance tests have been executed.'
\echo 'Review the EXPLAIN ANALYZE output above to verify:'
\echo '  1. All queries are using the expected indexes'
\echo '  2. Execution times meet the performance targets'
\echo '  3. Buffer usage is optimized'
\echo '  4. Index usage statistics show active utilization'
\echo ''
\echo 'Next steps:'
\echo '  - Run the TypeScript validation suite for automated checks'
\echo '  - Monitor performance in production environment'
\echo '  - Set up ongoing performance tracking and alerts'