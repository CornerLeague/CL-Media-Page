-- Phase 2 Priority 4: Performance Indexes
-- Safe, additive indexes to improve common query paths

-- Games: team-scoped retrieval ordered by start_time
CREATE INDEX IF NOT EXISTS idx_games_home_team_start_time ON games (home_team_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_games_away_team_start_time ON games (away_team_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_games_start_time ON games (start_time DESC);

-- Teams: league filtering
CREATE INDEX IF NOT EXISTS idx_teams_league ON teams (league);

-- Sessions: expiry cleanup
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- Summaries: latest-by-team
CREATE INDEX IF NOT EXISTS idx_summaries_team_generated_at ON summaries (team_id, generated_at DESC);

-- Updates: common filters and sort
CREATE INDEX IF NOT EXISTS idx_updates_team_timestamp ON updates (team_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_updates_team_category_timestamp ON updates (team_id, category, timestamp DESC);