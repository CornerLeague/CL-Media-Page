-- Migration: 0003_user_team_scores_indexes.sql
-- Purpose: Optimize queries for user team scores feature
-- Strategy: CONCURRENT index creation for zero downtime

BEGIN;

-- 1. User profiles favorite teams (GIN for array operations)
-- Subtask 5.1: Create GIN index for array containment queries on user_profiles.favorite_teams
-- This optimizes queries like: WHERE favorite_teams @> ARRAY['team_nba_lakers']
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_profiles_favorite_teams_gin 
ON user_profiles USING GIN(favorite_teams);

-- 2. Games composite index (team + date queries)
-- Subtask 5.2: Create composite B-tree indexes for games table optimization

-- Primary index for team-based queries with date ordering
-- This optimizes queries like: WHERE (home_team_id = ? OR away_team_id = ?) ORDER BY start_time DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_teams_start_time 
ON games (home_team_id, away_team_id, start_time DESC);

-- Additional index for status-based queries with date ordering
-- This optimizes queries like: WHERE status = 'live' ORDER BY start_time DESC
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_status_start_time 
ON games (status, start_time DESC);

-- 3. Teams league-based filtering
-- Subtask 5.3: Create composite B-tree indexes for teams table sport-league mapping

-- League-ID composite index for efficient team lookups within leagues
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_league_id 
ON teams (league, id);

-- League-Name covering index for team name searches within leagues  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_teams_league_name 
ON teams (league, name);

-- 4. User teams relationship optimization
-- Subtask 5.4: Create composite B-tree indexes for user_teams junction table

-- Primary direction: find teams for a user (user_id -> team_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_user_id_team_id 
ON user_teams (user_id, team_id);

-- Reverse direction: find users for a team (team_id -> user_id)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_teams_team_id_user_id 
ON user_teams (team_id, user_id);

COMMIT;