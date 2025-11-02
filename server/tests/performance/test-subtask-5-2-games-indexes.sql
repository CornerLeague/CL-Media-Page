-- Subtask 5.2: Games Team-Date Composite Index Performance Tests
-- Tests for idx_games_teams_start_time and idx_games_status_start_time

-- Test 1: Verify indexes exist
SELECT 
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'games' 
AND indexname IN ('idx_games_teams_start_time', 'idx_games_status_start_time')
ORDER BY indexname;

-- Test 2: Query plan for team-based game lookup with date ordering
-- This should use idx_games_teams_start_time
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, home_team_id, away_team_id, start_time, status
FROM games 
WHERE home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers'
ORDER BY start_time DESC 
LIMIT 10;

-- Test 3: Query plan for specific team matchup
-- This should use idx_games_teams_start_time efficiently
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, home_pts, away_pts, start_time, status
FROM games 
WHERE home_team_id = 'team_nba_lakers' AND away_team_id = 'team_nba_celtics'
ORDER BY start_time DESC;

-- Test 4: Query plan for status-based filtering with date ordering
-- This should use idx_games_status_start_time
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, home_team_id, away_team_id, start_time
FROM games 
WHERE status = 'live'
ORDER BY start_time DESC 
LIMIT 5;

-- Test 5: Query plan for status filtering with team
-- This might use multiple indexes or a combination
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, home_team_id, away_team_id, home_pts, away_pts, start_time
FROM games 
WHERE status IN ('live', 'final') 
AND (home_team_id = 'team_nfl_patriots' OR away_team_id = 'team_nfl_patriots')
ORDER BY start_time DESC 
LIMIT 20;

-- Test 6: Performance benchmark - Team games lookup
-- Measure execution time for common team-based queries
\timing on

-- Benchmark: Recent games for a team
SELECT COUNT(*) as total_games
FROM games 
WHERE home_team_id = 'team_nba_lakers' OR away_team_id = 'team_nba_lakers';

-- Benchmark: Live games
SELECT COUNT(*) as live_games
FROM games 
WHERE status = 'live';

-- Benchmark: Recent completed games
SELECT COUNT(*) as recent_games
FROM games 
WHERE status = 'final' 
AND start_time >= NOW() - INTERVAL '7 days'
ORDER BY start_time DESC;

\timing off

-- Test 7: Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE tablename = 'games'
AND indexname IN ('idx_games_teams_start_time', 'idx_games_status_start_time')
ORDER BY indexname;

-- Test 8: Index sizes
SELECT 
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes 
WHERE tablename = 'games'
AND indexname IN ('idx_games_teams_start_time', 'idx_games_status_start_time')
ORDER BY indexname;

-- Test 9: Table and index size comparison
SELECT 
    'games_table' as object_name,
    pg_size_pretty(pg_relation_size('games')) as size
UNION ALL
SELECT 
    indexname as object_name,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as size
FROM pg_indexes 
WHERE tablename = 'games'
ORDER BY object_name;

-- Test 10: Composite index effectiveness test
-- Test if the composite index can handle complex queries efficiently
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT 
    g.id,
    g.home_team_id,
    g.away_team_id,
    g.home_pts,
    g.away_pts,
    g.status,
    g.start_time
FROM games g
WHERE (g.home_team_id IN ('team_nba_lakers', 'team_nba_celtics') 
       OR g.away_team_id IN ('team_nba_lakers', 'team_nba_celtics'))
AND g.start_time >= NOW() - INTERVAL '30 days'
ORDER BY g.start_time DESC
LIMIT 50;