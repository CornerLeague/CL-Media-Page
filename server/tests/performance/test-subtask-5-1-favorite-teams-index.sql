-- Test Script for Subtask 5.1: User Profiles Favorite Teams GIN Index
-- Purpose: Validate that the GIN index optimizes array containment queries

-- Test 1: Verify index exists
SELECT 
    schemaname, 
    tablename, 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'user_profiles' 
    AND indexname = 'idx_user_profiles_favorite_teams_gin';

-- Test 2: Check index usage for array containment (@>)
-- This should use the GIN index
EXPLAIN (ANALYZE, BUFFERS) 
SELECT firebase_uid, favorite_teams 
FROM user_profiles 
WHERE favorite_teams @> ARRAY['team_nba_lakers'];

-- Test 3: Check index usage for array overlap (&&)
-- This should also use the GIN index
EXPLAIN (ANALYZE, BUFFERS) 
SELECT firebase_uid, favorite_teams 
FROM user_profiles 
WHERE favorite_teams && ARRAY['team_nba_lakers', 'team_nfl_patriots'];

-- Test 4: Performance benchmark - find users with specific team as favorite
-- Expected: < 10ms execution time with index
SELECT COUNT(*) as users_with_lakers
FROM user_profiles 
WHERE favorite_teams @> ARRAY['team_nba_lakers'];

-- Test 5: Performance benchmark - find users with any of multiple teams
-- Expected: < 10ms execution time with index
SELECT COUNT(*) as users_with_multiple_teams
FROM user_profiles 
WHERE favorite_teams && ARRAY['team_nba_lakers', 'team_nfl_patriots', 'team_mlb_yankees'];

-- Test 6: Index statistics and usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan
FROM pg_stat_user_indexes 
WHERE indexname = 'idx_user_profiles_favorite_teams_gin';

-- Test 7: Index size monitoring
SELECT 
    pg_size_pretty(pg_relation_size('idx_user_profiles_favorite_teams_gin')) as index_size,
    pg_size_pretty(pg_relation_size('user_profiles')) as table_size;