-- Rollback script: rollback_0003_indexes.sql
-- Purpose: Remove all indexes created by 0003_user_team_scores_indexes.sql
-- Strategy: CONCURRENT drops for zero downtime

BEGIN;

-- Drop all indexes created in 0003_user_team_scores_indexes.sql
-- Using CONCURRENTLY to avoid blocking operations

-- 1. User profiles favorite teams index
DROP INDEX CONCURRENTLY IF EXISTS idx_user_profiles_favorite_teams_gin;

-- 2. Games composite indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_games_teams_start_time;
DROP INDEX CONCURRENTLY IF EXISTS idx_games_status_start_time;

-- 3. Teams league-based filtering indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_teams_league_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_teams_league_name;

-- 4. User teams relationship indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_user_teams_user_id_team_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_user_teams_team_id_user_id;

COMMIT;

-- Verification queries to confirm indexes are dropped
-- Run these after executing the rollback:

-- Check that indexes no longer exist
SELECT 
    schemaname,
    tablename,
    indexname,
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

-- Should return no rows if rollback was successful