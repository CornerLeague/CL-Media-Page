import type { IScoreSource, GameScore, ScheduleGame, BoxScore } from '../types';
import type { InsertGame } from '@shared/schema';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { HTMLParser } from '../../utils/scraping/parser';
import { TeamMapper } from '../../utils/scraping/teamMapper';
import { logger } from '../../logger';

/**
 * NFLAdapter
 * 
 * Sport-specific adapter for fetching NFL game data through web scraping.
 * Implements multi-source fallback strategy: ESPN -> CBS Sports
 * 
 * Features:
 * - Live game scores and status
 * - Team filtering by NFL team codes
 * - Featured games for league overview
 * - Handles 4 quarters + overtime
 * - Robust error handling with fallback sources
 */
export class NFLAdapter implements IScoreSource {
  private readonly sport = 'NFL';
  private readonly sources = {
    espn: 'https://www.espn.com/nfl/scoreboard',
    cbs: 'https://www.cbssports.com/nfl/scoreboard/',
    nfl: 'https://www.nfl.com/scores',
  };

  /**
   * Fetch recent games for specific teams (legacy method for backwards compatibility)
   * 
   * @param options - Team IDs and limit
   * @returns Array of InsertGame objects
   */
  async fetchRecentGames(options: { teamIds?: string[]; limit?: number }): Promise<InsertGame[]> {
    logger.info({ options }, 'NFLAdapter: fetchRecentGames called');
    
    try {
      // Extract team codes from full team IDs (e.g., "NFL_NE" -> "NE")
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
      logger.error({ err }, 'NFLAdapter: fetchRecentGames failed');
      return [];
    }
  }

  /**
   * Fetch live games with optional team filtering
   * Uses multi-source fallback strategy
   * 
   * @param teamCodes - Array of team codes to filter by (e.g., ["NE", "KC"])
   * @returns Array of GameScore objects
   */
  async fetchLive(teamCodes: string[]): Promise<GameScore[]> {
    logger.info({ teamCodes }, 'NFL: Fetching live games');

    // Try primary source first (ESPN)
    try {
      const games = await this.scrapeESPN(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'ESPN' }, 'NFL: Fetched from ESPN');
        return games;
      }
    } catch (err) {
      logger.warn({ err }, 'ESPN scrape failed, trying fallback');
    }

    // Fallback to CBS Sports
    try {
      const games = await this.scrapeCBS(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'CBS' }, 'NFL: Fetched from CBS');
        return games;
      }
    } catch (err) {
      logger.error({ err }, 'All NFL scrape sources failed');
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
    // TODO: Implement schedule fetching in future iteration
    logger.warn('NFL: fetchSchedule not implemented yet');
    return [];
  }

  /**
   * Fetch detailed box score for a specific game
   * 
   * @param gameId - Unique game identifier
   * @returns BoxScore object with team totals
   */
  async fetchBoxScore(gameId: string): Promise<BoxScore> {
    // TODO: Implement box score fetching in future iteration
    logger.warn('NFL: fetchBoxScore not implemented yet');
    throw new Error('NFL: fetchBoxScore not implemented yet');
  }

  /**
   * Fetch featured games for league overview (no team filtering)
   * 
   * @param sport - Sport identifier (should be "NFL")
   * @param limit - Maximum number of games to return
   * @returns Array of ScheduleGame objects
   */
  async fetchFeaturedGames(sport: string, limit: number): Promise<ScheduleGame[]> {
    logger.info({ sport, limit }, 'NFL: Fetching featured games');

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
      logger.error({ err }, 'NFL: fetchFeaturedGames failed');
      return [];
    }
  }

  /**
   * Scrape NFL games from ESPN.com
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
            gameId: `NFL_ESPN_${awayTeamId}_${homeTeamId}_${Date.now()}`,
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractPeriod(statusText),
            timeRemaining: this.extractTimeRemaining(statusText),
            startTime: new Date(), // TODO: Parse actual start time from page
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
   * Scrape NFL games from CBS Sports
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
            gameId: `NFL_CBS_${awayTeamId}_${homeTeamId}_${Date.now()}`,
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractPeriod(statusText),
            timeRemaining: this.extractTimeRemaining(statusText),
            startTime: new Date(),
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
   * NFL-specific: handles quarters (Q1-Q4), overtime (OT), and halftime
   * 
   * @param statusText - Raw status text from scraping
   * @returns Standardized status: 'scheduled' | 'in_progress' | 'final'
   */
  private mapStatus(statusText: string): 'scheduled' | 'in_progress' | 'final' {
    const lower = statusText.toLowerCase();
    
    // Final status indicators
    if (lower.includes('final') || lower.includes('f/ot')) {
      return 'final';
    }
    
    // In-progress indicators (quarter + time, halftime, overtime, or "LIVE")
    if (
      lower.includes('q') || 
      lower.includes('quarter') ||
      lower.includes('half') || 
      lower.includes('halftime') ||
      lower.includes('ot') ||
      lower.includes('overtime') ||
      lower.includes(':') || 
      lower.includes('live')
    ) {
      return 'in_progress';
    }
    
    // Default to scheduled
    return 'scheduled';
  }

  /**
   * Extract quarter/period from status text
   * NFL-specific: Q1, Q2, Q3, Q4, OT, 2OT, etc.
   * 
   * @param statusText - Raw status text
   * @returns Quarter number as string (e.g., "1", "2", "3", "4", "OT") or undefined
   */
  private extractPeriod(statusText: string): string | undefined {
    // Check for overtime first
    if (/\bOT\b|overtime/i.test(statusText)) {
      // Match patterns like "OT", "2OT", "3OT"
      const otMatch = statusText.match(/(\d+)?OT/i);
      if (otMatch) {
        return otMatch[1] ? `${otMatch[1]}OT` : 'OT';
      }
      return 'OT';
    }

    // Check for halftime
    if (/half|halftime/i.test(statusText)) {
      return 'HALF';
    }

    // Match patterns like "Q1", "Q2", "1st", "2nd", "3rd", "4th"
    const match = statusText.match(/Q(\d)|([\d])(?:st|nd|rd|th)/i);
    return match ? match[1] || match[2] : undefined;
  }

  /**
   * Extract time remaining from status text
   * 
   * @param statusText - Raw status text
   * @returns Time remaining (e.g., "12:34", "5:32", "0:03") or undefined
   */
  private extractTimeRemaining(statusText: string): string | undefined {
    // Match patterns like "12:34", "5:32", "0:03"
    const match = statusText.match(/(\d{1,2}:\d{2})/);
    return match ? match[1] : undefined;
  }
}
