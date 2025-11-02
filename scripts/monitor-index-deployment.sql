-- Monitor Index Deployment Script
-- Purpose: Track progress and validate success of 0003_user_team_scores_indexes.sql migration
-- Usage: Run in separate session during deployment to monitor progress

-- =============================================================================
-- SECTION 1: PRE-DEPLOYMENT CHECKS
-- =============================================================================

\echo '=== PRE-DEPLOYMENT VALIDATION ==='

-- Check current database size and table sizes
\echo 'Current Database and Table Sizes:'
SELECT 
    'Database Total' as object_type,
    pg_size_pretty(pg_database_size(current_database())) as size
UNION ALL
SELECT 
    'user_profiles table' as object_type,
    pg_size_pretty(pg_total_relation_size('user_profiles')) as size
UNION ALL
SELECT 
    'games table' as object_type,
    pg_size_pretty(pg_total_relation_size('games')) as size
UNION ALL
SELECT 
    'teams table' as object_type,
    pg_size_pretty(pg_total_relation_size('teams')) as size
UNION ALL
SELECT 
    'user_teams table' as object_type,
    pg_size_pretty(pg_total_relation_size('user_teams')) as size;

-- Check for existing indexes with same names
\echo 'Checking for existing indexes:'
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS: No conflicting indexes found'
        ELSE 'WARNING: ' || COUNT(*) || ' conflicting indexes found'
    END as status
FROM pg_indexes 
WHERE indexname IN (
    'idx_user_profiles_favorite_teams_gin',
    'idx_games_teams_start_time',
    'idx_games_status_start_time',
    'idx_teams_league_id',
    'idx_teams_league_name',
    'idx_user_teams_user_id_team_id',
    'idx_user_teams_team_id_user_id'
);

-- Check for long-running transactions
\echo 'Checking for long-running transactions:'
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'PASS: No long-running transactions'
        ELSE 'WARNING: ' || COUNT(*) || ' transactions running > 5 minutes'
    END as status,
    COALESCE(MAX(now() - query_start), interval '0') as longest_transaction
FROM pg_stat_activity 
WHERE (now() - query_start) > interval '5 minutes'
AND state = 'active'
AND query NOT LIKE '%pg_stat_activity%';

-- =============================================================================
-- SECTION 2: DEPLOYMENT PROGRESS MONITORING
-- =============================================================================

\echo '=== INDEX CREATION PROGRESS ==='

-- Monitor active index creation progress
SELECT 
    p.pid,
    p.datname,
    p.command,
    p.phase,
    p.blocks_total,
    p.blocks_done,
    p.tuples_total,
    p.tuples_done,
    CASE 
        WHEN p.blocks_total > 0 THEN 
            round(100.0 * p.blocks_done / p.blocks_total, 2)
        ELSE 0 
    END AS blocks_percent_done,
    CASE 
        WHEN p.tuples_total > 0 THEN 
            round(100.0 * p.tuples_done / p.tuples_total, 2)
        ELSE 0 
    END AS tuples_percent_done,
    now() - a.query_start AS elapsed_time,
    a.query
FROM pg_stat_progress_create_index p
JOIN pg_stat_activity a ON p.pid = a.pid
ORDER BY p.pid;

-- Check for lock contention
\echo 'Checking for lock contention:'
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement,
    now() - blocked_activity.query_start AS blocked_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- =============================================================================
-- SECTION 3: POST-DEPLOYMENT VALIDATION
-- =============================================================================

\echo '=== POST-DEPLOYMENT VALIDATION ==='

-- Verify all indexes were created
\echo 'Verifying index creation:'
WITH expected_indexes AS (
    SELECT unnest(ARRAY[
        'idx_user_profiles_favorite_teams_gin',
        'idx_games_teams_start_time',
        'idx_games_status_start_time',
        'idx_teams_league_id',
        'idx_teams_league_name',
        'idx_user_teams_user_id_team_id',
        'idx_user_teams_team_id_user_id'
    ]) as expected_name
),
actual_indexes AS (
    SELECT indexname as actual_name
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
)
SELECT 
    e.expected_name,
    CASE 
        WHEN a.actual_name IS NOT NULL THEN 'CREATED'
        ELSE 'MISSING'
    END as status
FROM expected_indexes e
LEFT JOIN actual_indexes a ON e.expected_name = a.actual_name
ORDER BY e.expected_name;

-- Check index validity and readiness
\echo 'Checking index validity:'
SELECT 
    pi.schemaname,
    pi.tablename,
    pi.indexname,
    i.indisvalid as is_valid,
    i.indisready as is_ready,
    CASE 
        WHEN i.indisvalid AND i.indisready THEN 'READY'
        WHEN i.indisvalid AND NOT i.indisready THEN 'VALID_BUT_NOT_READY'
        WHEN NOT i.indisvalid THEN 'INVALID'
        ELSE 'UNKNOWN'
    END as status
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
ORDER BY pi.tablename, pi.indexname;

-- Check index sizes
\echo 'Index sizes:'
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as index_size
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
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

-- =============================================================================
-- SECTION 4: PERFORMANCE VALIDATION QUERIES
-- =============================================================================

\echo '=== PERFORMANCE VALIDATION ==='

-- Test query 1: User favorite teams lookup
\echo 'Testing user favorite teams lookup:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) 
SELECT firebase_uid, favorite_teams
FROM user_profiles 
WHERE favorite_teams @> ARRAY['team_nba_lakers']
LIMIT 10;

-- Test query 2: Recent games for team
\echo 'Testing recent games for team:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, home_team_id, away_team_id, start_time, status
FROM games 
WHERE (home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers')
ORDER BY start_time DESC 
LIMIT 5;

-- Test query 3: Games by status
\echo 'Testing games by status:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, home_team_id, away_team_id, start_time, status
FROM games 
WHERE status = 'live'
ORDER BY start_time DESC 
LIMIT 10;

-- Test query 4: Teams by league
\echo 'Testing teams by league:'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, name, league
FROM teams 
WHERE league IN ('NBA', 'NFL') 
ORDER BY name
LIMIT 20;

-- Test query 5: User-team relationships (user to teams)
\echo 'Testing user-team relationships (user to teams):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ut.user_id, ut.team_id, t.name
FROM user_teams ut
JOIN teams t ON ut.team_id = t.id
WHERE ut.user_id = 'test_user_123'
LIMIT 10;

-- Test query 6: User-team relationships (team to users)
\echo 'Testing user-team relationships (team to users):'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT ut.team_id, ut.user_id, up.firebase_uid
FROM user_teams ut
JOIN user_profiles up ON ut.user_id = up.id
WHERE ut.team_id = 'team_nba_lakers'
LIMIT 10;

-- =============================================================================
-- SECTION 5: SYSTEM HEALTH CHECK
-- =============================================================================

\echo '=== SYSTEM HEALTH CHECK ==='

-- Check database connections
\echo 'Database connections:'
SELECT 
    state,
    COUNT(*) as connection_count
FROM pg_stat_activity 
WHERE datname = current_database()
GROUP BY state
ORDER BY connection_count DESC;

-- Check for any errors in recent log entries (if log_statement is enabled)
\echo 'Recent database activity summary:'
SELECT 
    COUNT(*) as total_queries,
    COUNT(*) FILTER (WHERE state = 'active') as active_queries,
    COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
    COUNT(*) FILTER (WHERE wait_event_type IS NOT NULL) as waiting_queries
FROM pg_stat_activity 
WHERE datname = current_database();

-- Final summary
\echo '=== DEPLOYMENT SUMMARY ==='
SELECT 
    'Migration Status' as check_type,
    CASE 
        WHEN (
            SELECT COUNT(*) 
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
        ) = 7 THEN 'SUCCESS: All 7 indexes created'
        ELSE 'INCOMPLETE: Some indexes missing'
    END as status;

\echo 'Deployment monitoring complete. Check results above for any issues.'