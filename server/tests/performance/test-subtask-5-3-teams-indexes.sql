-- Subtask 5.3: Teams Sport-League Mapping Index Performance Tests
-- Validates the effectiveness of league-based team filtering and name search indexes

-- Test 1: Verify index existence
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'teams' 
    AND indexname IN ('idx_teams_league_id', 'idx_teams_league_name')
ORDER BY indexname;

-- Test 2: Query plan for league-based team filtering (sport derived from league)
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name, code, league 
FROM teams 
WHERE league IN ('NBA', 'NFL', 'MLB') 
ORDER BY name;

-- Test 3: Query plan for team lookup by league and partial name match
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name, code, league 
FROM teams 
WHERE league = 'NBA' AND name ILIKE '%Lakers%';

-- Test 4: Query plan for specific league filtering with ID ordering
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, name, code, league 
FROM teams 
WHERE league = 'NFL' 
ORDER BY id;

-- Test 5: Performance benchmark - League-based filtering (multiple leagues)
-- Simulates sport-based queries where sport maps to multiple leagues
SELECT 
    'Multi-league filtering' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT * FROM teams 
    WHERE league IN ('NBA', 'WNBA', 'G-LEAGUE') 
    ORDER BY name
    LIMIT 100
) results;

-- Test 6: Performance benchmark - Team name search within league
SELECT 
    'League name search' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT * FROM teams 
    WHERE league = 'NBA' AND name ILIKE '%Lakers%'
) results;

-- Test 7: Performance benchmark - League-specific team listing
SELECT 
    'League team listing' as test_name,
    COUNT(*) as result_count,
    EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000 as duration_ms
FROM (
    SELECT clock_timestamp() as start_time
) timing,
(
    SELECT * FROM teams 
    WHERE league = 'NFL' 
    ORDER BY name
) results;

-- Test 8: Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE tablename = 'teams' 
    AND indexname IN ('idx_teams_league_id', 'idx_teams_league_name', 'idx_teams_league')
ORDER BY indexname;

-- Test 9: Index size analysis
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    pg_relation_size(indexrelid) as size_bytes
FROM pg_stat_user_indexes 
WHERE tablename = 'teams' 
    AND indexname IN ('idx_teams_league_id', 'idx_teams_league_name', 'idx_teams_league')
ORDER BY size_bytes DESC;

-- Test 10: Composite query - Teams by sport category (using league mapping)
-- This simulates the application logic where sport is derived from league
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
WITH sport_leagues AS (
    SELECT unnest(ARRAY['NBA', 'WNBA', 'G-LEAGUE']) as league
)
SELECT t.id, t.name, t.code, t.league
FROM teams t
JOIN sport_leagues sl ON t.league = sl.league
ORDER BY t.name;

-- Test 11: Performance summary
SELECT 
    'Teams Index Performance Summary' as summary,
    (SELECT COUNT(*) FROM teams) as total_teams,
    (SELECT COUNT(DISTINCT league) FROM teams) as total_leagues,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'teams') as total_indexes;