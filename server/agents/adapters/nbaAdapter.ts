import type { IScoreSource, GameScore, ScheduleGame, BoxScore } from '../types';
import type { InsertGame } from '@shared/schema';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { HTMLParser } from '../../utils/scraping/parser';
import { TeamMapper } from '../../utils/scraping/teamMapper';
import { logger } from '../../logger';

/**
 * NBAAdapter
 * 
 * Sport-specific adapter for fetching NBA game data through web scraping.
 * Implements multi-source fallback strategy: ESPN -> CBS Sports
 * 
 * Features:
 * - Live game scores and status
 * - Team filtering by NBA team codes
 * - Featured games for league overview
 * - Robust error handling with fallback sources
 */
export class NBAAdapter implements IScoreSource {
  private readonly sport = 'NBA';
  private readonly sources = {
    espn: 'https://www.espn.com/nba/scoreboard',
    cbs: 'https://www.cbssports.com/nba/scoreboard/',
    nba: 'https://www.nba.com/games',
  };

  /**
   * Fetch recent games for specific teams (legacy method for backwards compatibility)
   * 
   * @param options - Team IDs and limit
   * @returns Array of InsertGame objects
   */
  async fetchRecentGames(options: { teamIds?: string[]; limit?: number }): Promise<InsertGame[]> {
    logger.info({ options }, 'NBAAdapter: fetchRecentGames called');
    
    try {
      // Extract team codes from full team IDs (e.g., "NBA_LAL" -> "LAL")
      const teamCodes = options.teamIds?.map(id => id.split('_')[1]).filter(Boolean) || [];
      const scores = await this.fetchLive(teamCodes);
      
      // Convert GameScore to InsertGame format
      return scores.slice(0, options.limit || 5).map(score => ({
        id: score.gameId,
        homeTeamId: score.homeTeamId,
        awayTeamId: score.awayTeamId,
        homePts: score.homePts,
        awayPts: score.awayPts,
        status: score.status,
        period: score.period || null,
        timeRemaining: score.timeRemaining || null,
        startTime: score.startTime,
      }));
    } catch (err) {
      logger.error({ err }, 'NBAAdapter: fetchRecentGames failed');
      return [];
    }
  }

  /**
   * Fetch live games with optional team filtering
   * Uses multi-source fallback strategy
   * 
   * @param teamCodes - Array of team codes to filter by (e.g., ["LAL", "BOS"])
   * @returns Array of GameScore objects
   */
  async fetchLive(teamCodes: string[]): Promise<GameScore[]> {
    logger.info({ teamCodes }, 'NBA: Fetching live games');

    // Try primary source first (ESPN)
    try {
      const games = await this.scrapeESPN(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'ESPN' }, 'NBA: Fetched from ESPN');
        return games;
      }
    } catch (err) {
      logger.warn({ err }, 'ESPN scrape failed, trying fallback');
    }

    // Fallback to CBS Sports
    try {
      const games = await this.scrapeCBS(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'CBS' }, 'NBA: Fetched from CBS');
        return games;
      }
    } catch (err) {
      logger.error({ err }, 'All NBA scrape sources failed');
    }

    return [];
  }

  /**
   * Fetch schedule for specific teams within a date range
   * 
   * @param teamCodes - Team codes to fetch schedule for
   * @param startDate - Start of date range
   * @param endDate - End of date range
   * @returns Array of ScheduleGame objects
   */
  async fetchSchedule(
    teamCodes: string[],
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleGame[]> {
    logger.info({ teamCodes, startDate, endDate }, 'NBA: Fetching schedule');

    try {
      // Guard against invalid ranges
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        logger.warn({ startDate, endDate }, 'NBA: fetchSchedule invalid dates, returning []');
        return [];
      }

      // Fetch live/featured listings and derive schedule entries
      const games = await this.fetchLive(teamCodes || []);

      // Only include scheduled games within date range
      const scheduled = games.filter(g => g.status === 'scheduled' && g.startTime instanceof Date);
      const inRange = scheduled.filter(g => {
        const ts = g.startTime.getTime();
        return ts >= start.getTime() && ts <= end.getTime();
      });

      // Map to ScheduleGame contract
      return inRange.map(g => ({
        gameId: g.gameId,
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        startTime: g.startTime,
        status: g.status,
        source: g.source,
      }));
    } catch (err) {
      logger.warn({ err }, 'NBA: fetchSchedule failed, returning []');
      return [];
    }
  }

  /**
   * Fetch detailed box score for a specific game
   * 
   * @param gameId - Unique game identifier
   * @returns BoxScore object with team totals
   */
  async fetchBoxScore(gameId: string): Promise<BoxScore> {
    // Safe-default behavior until implementation per 1.4.5 control flow
    // Return an empty BoxScore structure with zeros to comply with contract
    logger.warn({ gameId }, 'NBA: fetchBoxScore not implemented yet, returning safe defaults');
    return {
      gameId,
      home: { pts: 0 },
      away: { pts: 0 },
      updatedAt: new Date(),
      source: 'unavailable',
    };
  }

  /**
   * Fetch featured games for league overview (no team filtering)
   * 
   * @param sport - Sport identifier (should be "NBA")
   * @param limit - Maximum number of games to return
   * @returns Array of ScheduleGame objects
   */
  async fetchFeaturedGames(sport: string, limit: number): Promise<ScheduleGame[]> {
    logger.info({ sport, limit }, 'NBA: Fetching featured games');

    try {
      // Fetch all games without team filter
      const liveGames = await this.fetchLive([]);
      
      // Convert to ScheduleGame format
      return liveGames.slice(0, limit).map(game => ({
        gameId: game.gameId,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
        startTime: game.startTime,
        status: game.status,
        source: game.source,
      }));
    } catch (err) {
      logger.error({ err }, 'NBA: fetchFeaturedGames failed');
      return [];
    }
  }

  /**
   * Scrape NBA games from ESPN.com
   * Primary data source
   * 
   * @param teamCodes - Optional team codes for filtering
   * @returns Array of GameScore objects
   */
  private async scrapeESPN(teamCodes?: string[]): Promise<GameScore[]> {
    try {
      const html = await ethicalFetcher.fetch(this.sources.espn);
      const $ = HTMLParser.load(html);
      const games: GameScore[] = [];

      // ESPN uses a card-based layout for games
      $('.ScoreCell, .gameModules, [data-module="game"]').each((i, elem) => {
        try {
          const $game = $(elem);
          
          // Extract team names - ESPN typically has team abbreviations
          const $teams = $game.find('.ScoreCell__TeamName, .team-name, .Gamestrip__Team');
          if ($teams.length < 2) return;

          const awayTeamName = HTMLParser.extractText($teams.eq(0));
          const homeTeamName = HTMLParser.extractText($teams.eq(1));

          // Extract scores
          const $scores = $game.find('.ScoreCell__Score, .score, .Gamestrip__Score');
          const awayScore = $scores.length > 0 ? HTMLParser.extractNumber($scores.eq(0)) : 0;
          const homeScore = $scores.length > 1 ? HTMLParser.extractNumber($scores.eq(1)) : 0;

          // Extract status
          const $status = $game.find('.ScoreCell__Status, .game-status, .Gamestrip__Time');
          const statusText = HTMLParser.extractText($status);

          // Map team names to IDs
          const homeTeamId = TeamMapper.mapTeam(homeTeamName, this.sport);
          const awayTeamId = TeamMapper.mapTeam(awayTeamName, this.sport);

          // Filter by team codes if provided
          if (teamCodes && teamCodes.length > 0) {
            const homeCode = homeTeamId.split('_')[1];
            const awayCode = awayTeamId.split('_')[1];
            if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) {
              return;
            }
          }

          games.push({
            gameId: `NBA_ESPN_${awayTeamId}_${homeTeamId}_${Date.now()}`,
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractPeriod(statusText),
            timeRemaining: this.extractTimeRemaining(statusText),
            startTime: this.extractScheduledStart(statusText) || new Date(),
            source: 'ESPN.com',
          });
        } catch (err) {
          logger.warn({ err, index: i }, 'Failed to parse game from ESPN');
        }
      });

      return games;
    } catch (err) {
      logger.error({ err }, 'ESPN scrape failed');
      return [];
    }
  }

  /**
   * Scrape NBA games from CBS Sports
   * Fallback data source
   * 
   * @param teamCodes - Optional team codes for filtering
   * @returns Array of GameScore objects
   */
  private async scrapeCBS(teamCodes?: string[]): Promise<GameScore[]> {
    try {
      const html = await ethicalFetcher.fetch(this.sources.cbs);
      const $ = HTMLParser.load(html);
      const games: GameScore[] = [];

      // CBS Sports uses a different structure
      $('.live-update, .game-item, .scoreboard-item').each((i, elem) => {
        try {
          const $game = $(elem);
          
          // CBS typically shows team abbreviations differently
          const awayTeamName = HTMLParser.extractText($game.find('.away-team .team-name-link'));
          const homeTeamName = HTMLParser.extractText($game.find('.home-team .team-name-link'));

          const awayScore = HTMLParser.extractNumber($game.find('.away-team .score'));
          const homeScore = HTMLParser.extractNumber($game.find('.home-team .score'));

          const statusText = HTMLParser.extractText($game.find('.game-status'));

          const homeTeamId = TeamMapper.mapTeam(homeTeamName, this.sport);
          const awayTeamId = TeamMapper.mapTeam(awayTeamName, this.sport);

          // Filter by team codes
          if (teamCodes && teamCodes.length > 0) {
            const homeCode = homeTeamId.split('_')[1];
            const awayCode = awayTeamId.split('_')[1];
            if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) {
              return;
            }
          }

          games.push({
            gameId: `NBA_CBS_${awayTeamId}_${homeTeamId}_${Date.now()}`,
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractPeriod(statusText),
            timeRemaining: this.extractTimeRemaining(statusText),
            startTime: this.extractScheduledStart(statusText) || new Date(),
            source: 'CBS Sports',
          });
        } catch (err) {
          logger.warn({ err, index: i }, 'Failed to parse game from CBS');
        }
      });

      return games;
    } catch (err) {
      logger.error({ err }, 'CBS scrape failed');
      return [];
    }
  }

  /**
   * Map status text to standardized status enum
   * 
   * @param statusText - Raw status text from scraping
   * @returns Standardized status: 'scheduled' | 'in_progress' | 'final'
   */
  private mapStatus(statusText: string): 'scheduled' | 'in_progress' | 'final' {
    const text = statusText || '';
    const lower = text.toLowerCase();

    // Final status indicators
    if (/\bfinal\b/i.test(text) || /\bfinal\/ot\b/i.test(text) || /\bf\/\d?ot\b/i.test(text)) {
      return 'final';
    }

    // In-progress indicators: quarter, halftime, live, or a running clock (exclude AM/PM time-of-day)
    const hasQuarter = /\bq\d\b/i.test(text) || /\b(?:1st|2nd|3rd|4th)\b/i.test(text);
    const isHalftime = /\bhalf(?:time)?\b/i.test(text);
    const hasLiveWord = /\blive\b/i.test(text);
    // Clock present but NOT time-of-day
    const clockMatch = /(\d{1,2}:\d{2})(?!\s*(?:am|pm))/i.test(text);
    if (hasQuarter || isHalftime || hasLiveWord || clockMatch) {
      return 'in_progress';
    }

    // Default to scheduled
    return 'scheduled';
  }

  /**
   * Extract quarter/period from status text
   * 
   * @param statusText - Raw status text
   * @returns Quarter number as string (e.g., "1", "2", "3", "4") or undefined
   */
  private extractPeriod(statusText: string): string | undefined {
    // Match patterns like "Q1", "Q2", "1st", "2nd", etc.
    const match = statusText.match(/Q(\d)|([\d])(?:st|nd|rd|th)/i);
    return match ? match[1] || match[2] : undefined;
  }

  /**
   * Extract time remaining from status text
   * 
   * @param statusText - Raw status text
   * @returns Time remaining (e.g., "5:32", "0:45") or undefined
   */
  private extractTimeRemaining(statusText: string): string | undefined {
    // Match patterns like "5:32", "10:45", "0:03"
    const match = statusText.match(/(\d{1,2}:\d{2})(?!\s*(?:AM|PM))/i);
    return match ? match[1] : undefined;
  }

  /**
   * Extract scheduled start time from status text (e.g., "7:00 PM", "8:30 PM ET", "Tomorrow 7:30 PM")
   * Returns a Date constructed for today (or tomorrow) in local timezone.
   * If a baseDate is provided, uses that as the day context.
   */
  private extractScheduledStart(statusText: string, baseDate?: Date): Date | undefined {
    const text = statusText || '';

    // Look for explicit AM/PM time-of-day (scheduled)
    const m = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
    if (!m) return undefined;

    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();

    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    const base = baseDate || new Date();
    const isTomorrow = /\btomorrow\b/i.test(text);
    const dayOffset = isTomorrow ? 1 : 0;

    // Construct Date in local timezone for simplicity; ignore timezone suffixes like ET/PT
    const start = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + dayOffset,
      hour,
      minute,
      0,
      0
    );

    return isNaN(start.getTime()) ? undefined : start;
  }
}
