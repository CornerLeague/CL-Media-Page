import type { IScoreSource, GameScore, ScheduleGame, BoxScore } from '../types';
import type { InsertGame } from '@shared/schema';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { HTMLParser } from '../../utils/scraping/parser';
import { TeamMapper } from '../../utils/scraping/teamMapper';
import { logger } from '../../logger';
import { buildStableGameId } from './idUtils';

/**
 * MLBAdapter
 * 
 * Sport-specific adapter for fetching MLB game data through web scraping.
 * Implements multi-source fallback strategy: ESPN -> CBS Sports
 * 
 * Features:
 * - Live game scores and status
 * - Team filtering by MLB team codes
 * - Featured games for league overview
 * - Handles 9 innings + extra innings
 * - Doubleheader support
 * - Robust error handling with fallback sources
 */
export class MLBAdapter implements IScoreSource {
  private readonly sport = 'MLB';
  private readonly sources = {
    espn: 'https://www.espn.com/mlb/scoreboard',
    espnJson: 'https://site.api.espn.com/apis/v2/sports/baseball/mlb/scoreboard',
    cbs: 'https://www.cbssports.com/mlb/scoreboard/',
    mlb: 'https://www.mlb.com/scores',
  };

  /**
   * Fetch recent games for specific teams (legacy method for backwards compatibility)
   * 
   * @param options - Team IDs and limit
   * @returns Array of InsertGame objects
   */
  async fetchRecentGames(options: { teamIds?: string[]; limit?: number }): Promise<InsertGame[]> {
    logger.info({ options }, 'MLBAdapter: fetchRecentGames called');
    
    try {
      // Extract team codes from full team IDs (e.g., "MLB_NYY" -> "NYY")
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
      logger.error({ err }, 'MLBAdapter: fetchRecentGames failed');
      return [];
    }
  }

  /**
   * Fetch live games with optional team filtering
   * Uses multi-source fallback strategy
   * 
   * @param teamCodes - Array of team codes to filter by (e.g., ["NYY", "BOS"])
   * @returns Array of GameScore objects
   */
  async fetchLive(teamCodes: string[]): Promise<GameScore[]> {
    logger.info({ teamCodes }, 'MLB: Fetching live games');

    // Try primary source first (ESPN)
    try {
      const games = await this.scrapeESPN(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'ESPN' }, 'MLB: Fetched from ESPN');
        return games;
      }
    } catch (err) {
      logger.warn({ err }, 'ESPN scrape failed, trying fallback');
    }

    // Fallback to CBS Sports
    try {
      const games = await this.scrapeCBS(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'CBS' }, 'MLB: Fetched from CBS');
        return games;
      }
    } catch (err) {
      logger.error({ err }, 'All MLB scrape sources failed');
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
    logger.warn('MLB: fetchSchedule not implemented yet');
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
    logger.warn('MLB: fetchBoxScore not implemented yet');
    throw new Error('MLB: fetchBoxScore not implemented yet');
  }

  /**
   * Fetch featured games for league overview (no team filtering)
   * 
   * @param sport - Sport identifier (should be "MLB")
   * @param limit - Maximum number of games to return
   * @returns Array of ScheduleGame objects
   */
  async fetchFeaturedGames(sport: string, limit: number): Promise<ScheduleGame[]> {
    logger.info({ sport, limit }, 'MLB: Fetching featured games');

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
      logger.error({ err }, 'MLB: fetchFeaturedGames failed');
      return [];
    }
  }

  /**
   * Scrape MLB games from ESPN.com
   * Primary data source
   * 
   * @param teamCodes - Optional team codes for filtering
   * @returns Array of GameScore objects
   */
  private async scrapeESPN(teamCodes?: string[]): Promise<GameScore[]> {
    try {
      // Prefer ESPN public JSON scoreboard for stability
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const dateStr = `${y}${m}${d}`;

      const raw = await ethicalFetcher.fetch(`${this.sources.espnJson}?dates=${dateStr}`);
      const data = JSON.parse(raw);

      const games: GameScore[] = [];
      const events = Array.isArray(data?.events) ? data.events : [];

      for (const event of events) {
        try {
          const competition = Array.isArray(event?.competitions) ? event.competitions[0] : undefined;
          const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
          const homeComp = competitors.find((c: any) => c.homeAway === 'home');
          const awayComp = competitors.find((c: any) => c.homeAway === 'away');
          if (!homeComp || !awayComp) continue;

          const homeName = homeComp.team?.displayName || homeComp.team?.shortDisplayName || homeComp.team?.name || homeComp.team?.abbreviation || '';
          const awayName = awayComp.team?.displayName || awayComp.team?.shortDisplayName || awayComp.team?.name || awayComp.team?.abbreviation || '';
          let homeTeamId = TeamMapper.mapTeam(homeName, this.sport);
          let awayTeamId = TeamMapper.mapTeam(awayName, this.sport);

          // Fallback: use abbreviations if name mapping failed
          const invalidId = (id: string) => !id || id.trim() === `${this.sport}_` || !id.includes('_') || id.endsWith('_');
          const homeAbbr = homeComp.team?.abbreviation || '';
          const awayAbbr = awayComp.team?.abbreviation || '';
          if (invalidId(homeTeamId) && homeAbbr) {
            homeTeamId = TeamMapper.mapTeam(homeAbbr, this.sport);
          }
          if (invalidId(awayTeamId) && awayAbbr) {
            awayTeamId = TeamMapper.mapTeam(awayAbbr, this.sport);
          }

          // Optional team filtering by code
          if (teamCodes && teamCodes.length > 0) {
            const homeCode = homeAbbr || homeTeamId.split('_')[1];
            const awayCode = awayAbbr || awayTeamId.split('_')[1];
            if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) {
              continue;
            }
          }

          const homeScore = parseInt(homeComp.score ?? '0', 10) || 0;
          const awayScore = parseInt(awayComp.score ?? '0', 10) || 0;

          const statusDetail = competition?.status?.type?.detail || event?.status?.type?.detail || '';
          const statusState = (competition?.status?.type?.state || event?.status?.type?.state || '').toLowerCase();
          const status: 'scheduled' | 'in_progress' | 'final' =
            statusState === 'pre' ? 'scheduled' :
            statusState === 'in' ? 'in_progress' :
            statusState === 'post' ? 'final' : this.mapStatus(statusDetail);

          const inning = this.extractInning(statusDetail);
          const substate = this.extractSubstate(statusDetail);
          const outs = this.extractOuts(statusDetail);
          const timeRemaining = substate ?? (outs ? outs : undefined);

          const startTimeStr = event?.date || competition?.date;
          const startTime = startTimeStr ? new Date(startTimeStr) : now;
          const gameId = event?.id ? `MLB_ESPN_${event.id}` : buildStableGameId(this.sport, 'ESPN', awayTeamId, homeTeamId, startTimeStr ? new Date(startTimeStr) : undefined);

          // Skip any game with invalid team IDs to avoid FK errors
          if (invalidId(homeTeamId) || invalidId(awayTeamId)) {
            logger.warn({ eventId: event?.id }, 'ESPN: skipped game due to missing team IDs');
            continue;
          }

          games.push({
            gameId,
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status,
            period: inning,
            timeRemaining,
            startTime,
            source: 'ESPN API',
          });
        } catch (err) {
          logger.warn({ err }, 'Failed to parse event from ESPN JSON');
        }
      }

      return games;
    } catch (err) {
      // Fall back to DOM scrape if JSON fails
      logger.error({ err }, 'ESPN JSON scoreboard fetch failed');

      try {
        const html = await ethicalFetcher.fetch(this.sources.espn);
        const $ = HTMLParser.load(html);
        const games: GameScore[] = [];

        $('.Scoreboard .Scoreboard__Item, [data-module="game"]').each((i, elem) => {
          try {
            const $game = $(elem);
            const $teams = $game.find('.ScoreCell__TeamName, .team-name');
            if ($teams.length < 2) return;

            const awayTeamName = HTMLParser.extractText($teams.eq(0));
            const homeTeamName = HTMLParser.extractText($teams.eq(1));

            const $scores = $game.find('.ScoreCell__Score, .score');
            const awayScore = $scores.length > 0 ? HTMLParser.extractNumber($scores.eq(0)) : 0;
            const homeScore = $scores.length > 1 ? HTMLParser.extractNumber($scores.eq(1)) : 0;

            const $status = $game.find('.ScoreCell__Status, .game-status');
            const statusText = HTMLParser.cleanText(HTMLParser.extractText($status));

            const homeTeamId = TeamMapper.mapTeam(homeTeamName, this.sport);
            const awayTeamId = TeamMapper.mapTeam(awayTeamName, this.sport);

            // Guard against invalid team IDs to prevent FK errors
            const invalidId = (id: string) => !id || id.trim() === `${this.sport}_` || !id.includes('_') || id.endsWith('_');
            if (invalidId(homeTeamId) || invalidId(awayTeamId)) {
              logger.warn({ index: i }, 'ESPN DOM: skipped game due to missing team IDs');
              return;
            }

            if (teamCodes && teamCodes.length > 0) {
              const homeCode = homeTeamId.split('_')[1];
              const awayCode = awayTeamId.split('_')[1];
              if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) {
                return;
              }
            }

            const inning = this.extractInning(statusText);
            const substate = this.extractSubstate(statusText);
            const outs = this.extractOuts(statusText);
            const scheduledStart = this.extractScheduledStart(statusText);

            games.push({
              gameId: buildStableGameId(this.sport, 'ESPN', awayTeamId, homeTeamId, scheduledStart),
              homeTeamId,
              awayTeamId,
              homePts: homeScore,
              awayPts: awayScore,
              status: this.mapStatus(statusText),
              period: inning,
              timeRemaining: substate ?? (outs ? outs : undefined),
              startTime: scheduledStart || new Date(),
              source: 'ESPN.com',
            });
          } catch (err) {
            logger.warn({ err, index: i }, 'Failed to parse game from ESPN');
          }
        });

        return games;
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr }, 'ESPN DOM scrape failed');
        return [];
      }
    }
  }

  /**
   * Scrape CBS Sports MLB scoreboard
   * @returns Array of GameScore objects
   */
  private async scrapeCBS(teamCodes?: string[]): Promise<GameScore[]> {
    try {
      const html = await ethicalFetcher.fetch(this.sources.cbs);
      const $ = HTMLParser.load(html);
      const games: GameScore[] = [];

      // Expanded container selectors per plan plus existing ones
      $('.live-event-card, .scoreboard-card, .live-update, .game-item, .scoreboard-item').each((i, elem) => {
        try {
          const $game = $(elem);

          // Try structured team blocks first
          const $teams = $game.find('.team, .team--away, .team.--away, .away-team, .team--home, .team.--home, .home-team');
          let awayTeamName = HTMLParser.extractText($teams.eq(0).find('.team-name, .team-name-link, .team-abbr, .name, .abbr'));
          let homeTeamName = HTMLParser.extractText($teams.eq(1).find('.team-name, .team-name-link, .team-abbr, .name, .abbr'));

          // Fallbacks to legacy selectors
          if (!awayTeamName) {
            awayTeamName = HTMLParser.extractText($game.find('.away-team .team-name-link, .team.--away .team-name, .team--away .team-name'));
          }
          if (!homeTeamName) {
            homeTeamName = HTMLParser.extractText($game.find('.home-team .team-name-link, .team.--home .team-name, .team--home .team-name'));
          }

          // Scores: prefer team blocks, fallback to legacy selectors
          let awayScore = HTMLParser.extractNumber($teams.eq(0).find('.score, .total'));
          let homeScore = HTMLParser.extractNumber($teams.eq(1).find('.score, .total'));
          if (Number.isNaN(awayScore)) {
            awayScore = HTMLParser.extractNumber($game.find('.away-team .score, .team.--away .score, .team--away .score'));
          }
          if (Number.isNaN(homeScore)) {
            homeScore = HTMLParser.extractNumber($game.find('.home-team .score, .team.--home .score, .team--home .score'));
          }
          if (Number.isNaN(awayScore)) awayScore = 0;
          if (Number.isNaN(homeScore)) homeScore = 0;

          const statusText = HTMLParser.extractText($game.find('.game-status, .status, .state')) || HTMLParser.extractText($game.find('.status'));

          // Map names to IDs
          let homeTeamId = TeamMapper.mapTeam(homeTeamName, this.sport);
          let awayTeamId = TeamMapper.mapTeam(awayTeamName, this.sport);

          // Fallback: parse abbreviations from links if names were not found
          const href = $game.find('a[href*="/mlb/gametracker/"]').attr('href')
            || $game.find('a[href*="mlb/gamecenter"]').attr('href')
            || $game.closest('.scoreboard-item').find('a[href*="/mlb/gametracker/"]').attr('href')
            || $('a[href*="/mlb/gametracker/"]').first().attr('href')
            || '';
          if ((!homeTeamId || !awayTeamId) && href) {
            const m = href.match(/MLB_\d{8}_([A-Z]{2,4})@([A-Z]{2,4})/)
              || href.match(/mlb\/(?:gametracker\/live|gamecenter)\/([A-Z]{2,4})-([A-Z]{2,4})/i);
            if (m) {
              const awayAbbr = m[1].toUpperCase();
              const homeAbbr = m[2].toUpperCase();
              awayTeamId = awayTeamId || TeamMapper.mapTeam(awayAbbr, this.sport);
              homeTeamId = homeTeamId || TeamMapper.mapTeam(homeAbbr, this.sport);
            }
          }

          // Defensive invalid ID check
          const invalidId = (id: string) => !id || id.trim() === `${this.sport}_` || !id.includes('_') || id.endsWith('_');
          if (invalidId(homeTeamId) || invalidId(awayTeamId)) {
            logger.warn({ index: i, homeTeamName, awayTeamName, href }, 'CBS: skipped game due to missing team IDs');
            return;
          }

          // Filter by team codes
          if (teamCodes && teamCodes.length > 0) {
            const homeCode = homeTeamId.split('_')[1];
            const awayCode = awayTeamId.split('_')[1];
            if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) {
              return;
            }
          }

          const scheduledStart = this.extractScheduledStart(statusText);
          games.push({
            gameId: buildStableGameId(this.sport, 'CBS', awayTeamId, homeTeamId, scheduledStart),
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractInning(statusText),
            timeRemaining: this.extractOuts(statusText),
            startTime: scheduledStart || new Date(),
            source: 'CBS Sports',
          });
        } catch (err) {
          logger.warn({ err, index: i }, 'Failed to parse game from CBS');
        }
      });

      // Additional fallback: parse preview links globally if no games found
      if (games.length === 0) {
        $('a[href*="/mlb/gametracker/preview/MLB_"], a[href*="mlb/gamecenter"]').each((i, a) => {
          try {
            const href = $(a).attr('href') || '';
            const m = href.match(/MLB_(\d{8})_([A-Z]{2,4})@([A-Z]{2,4})/)
              || href.match(/mlb\/(?:gametracker\/live|gamecenter)\/([A-Z]{2,4})-([A-Z]{2,4})/i);
            if (!m) return;
            const awayAbbr = m[1].toUpperCase();
            const homeAbbr = m[2].toUpperCase();
            const awayTeamId = TeamMapper.mapTeam(awayAbbr, this.sport);
            const homeTeamId = TeamMapper.mapTeam(homeAbbr, this.sport);

            if (teamCodes && teamCodes.length > 0) {
              const awayCode = awayTeamId.split('_')[1];
              const homeCode = homeTeamId.split('_')[1];
              if (!teamCodes.includes(awayCode) && !teamCodes.includes(homeCode)) return;
            }

            const scheduledStart = this.extractScheduledStart('scheduled');
            games.push({
              gameId: buildStableGameId(this.sport, 'CBS', awayTeamId, homeTeamId, scheduledStart),
              homeTeamId,
              awayTeamId,
              homePts: 0,
              awayPts: 0,
              status: 'scheduled',
              period: undefined,
              timeRemaining: undefined,
              startTime: scheduledStart || new Date(),
              source: 'CBS Sports',
            });
          } catch (err) {
            logger.warn({ err, index: i }, 'CBS: failed parsing preview link');
          }
        });
      }

      return games;
    } catch (err) {
      logger.error({ err }, 'CBS scrape failed');
      return [];
    }
  }

  /**
   * Map status text to standardized status enum
   * MLB-specific: handles innings (1-9+), top/bottom, extra innings
   * 
   * @param statusText - Raw status text from scraping
   * @returns Standardized status: 'scheduled' | 'in_progress' | 'final'
   */
  private mapStatus(statusText: string): 'scheduled' | 'in_progress' | 'final' {
    const lower = statusText.toLowerCase();

    // Explicit postponed handling (treated as not in-progress)
    if (lower.includes('postponed') || lower.includes('ppd')) {
      return 'scheduled';
    }

    // Final status indicators, including extra innings formats like F/10
    if (lower.includes('final') || lower.includes('f/')) {
      return 'final';
    }

    // Delays (weather delay, rain delay, etc.) count as in-progress but paused
    if (lower.includes('delay') || lower.includes('delayed') || lower.includes('rain delay')) {
      return 'in_progress';
    }

    // In-progress indicators: inning info, top/bot/mid/end, or ESPN/CBS LIVE markers
    if (
      lower.includes('top') ||
      lower.includes('bot') ||
      lower.includes('bottom') ||
      lower.includes('mid') ||
      lower.includes('middle') ||
      lower.includes('end') ||
      lower.includes('inning') ||
      lower.match(/\b(\d+)(st|nd|rd|th)\b/) !== null || // 1st, 2nd, 3rd, etc.
      lower.includes('out') ||
      lower.includes('live')
    ) {
      return 'in_progress';
    }

    // Default to scheduled
    return 'scheduled';
  }

  /**
   * Extract inning number from status text
   * MLB-specific: 1-9 innings (standard), 10+ extra innings
   * 
   * @param statusText - Raw status text
   * @returns Inning number as string (e.g., "1", "9", "10") or undefined
   */
  private extractInning(statusText: string): string | undefined {
    // Check for ordinal number format (1st, 2nd, 3rd, 4th, etc.)
    const ordinalMatch = statusText.match(/(\d+)(?:st|nd|rd|th)/i);
    if (ordinalMatch) {
      return ordinalMatch[1];
    }

    // Check for simple inning number
    const inningMatch = statusText.match(/(?:inning\s*)?(\d+)/i);
    if (inningMatch) {
      return inningMatch[1];
    }

    // Check for top/bottom format and return the numeric part
    const topBottomMatch = statusText.match(/(Top|Bot|Bottom|Mid|Middle|End)\s*(\d+)(?:st|nd|rd|th)?/i);
    if (topBottomMatch) {
      return topBottomMatch[2];
    }

    return undefined;
  }

  /**
   * Extract substate (Top/Bot/Mid/End + inning) from status text
   * 
   * @param statusText - Raw status text
   * @returns Substate string (e.g., "Top 3", "Bot 9", "Mid 4", "End 7") or undefined
   */
  private extractSubstate(statusText: string): string | undefined {
    const match = statusText.match(/(Top|Bot|Bottom|Mid|Middle|End)\s*(\d+)(?:st|nd|rd|th)?/i);
    if (!match) return undefined;
    const raw = match[1].toLowerCase();
    const num = match[2];
    const half = raw.startsWith('top') ? 'Top'
      : raw.startsWith('bot') || raw.startsWith('bottom') ? 'Bot'
      : raw.startsWith('mid') || raw.startsWith('middle') ? 'Mid'
      : 'End';
    return `${half} ${num}`;
  }

  /**
   * Extract outs from status text (optional enrichment)
   * Baseball uses outs instead of time remaining
   * 
   * @param statusText - Raw status text
   * @returns Outs info (e.g., "0 Outs", "1 Out", "2 Outs") or undefined
   */
  private extractOuts(statusText: string): string | undefined {
    // Match patterns like "0 Outs", "1 Out", "2 Outs"
    const outsMatch = statusText.match(/(\d)\s*(?:Out|Outs?)/i);
    if (outsMatch) {
      const count = parseInt(outsMatch[1], 10);
      return count === 1 ? '1 Out' : `${count} Outs`;
    }

    return undefined;
  }

  /**
   * Extract scheduled start time from status text (e.g., "7:05 PM", "8:30 PM ET", "Tomorrow 7:30 PM")
   * Returns a Date constructed for today (or tomorrow) in local timezone.
   */
  private extractScheduledStart(statusText: string, baseDate?: Date): Date | undefined {
    const text = statusText || '';

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
