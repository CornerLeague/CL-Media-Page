import type { IScoreSource, GameScore, ScheduleGame, BoxScore } from '../types';
import type { InsertGame } from '@shared/schema';
import { ethicalFetcher } from '../../utils/scraping/fetcher';
import { HTMLParser } from '../../utils/scraping/parser';
import { TeamMapper } from '../../utils/scraping/teamMapper';
import { logger } from '../../logger';
import { buildStableGameId } from './idUtils';

/**
 * NHLAdapter
 * 
 * Sport-specific adapter for fetching NHL game data through web scraping.
 * Implements multi-source fallback strategy: ESPN -> CBS Sports
 * 
 * Features:
 * - Live game scores and status
 * - Team filtering by NHL team codes
 * - Featured games for league overview
 * - Handles 3 periods + overtime + shootout
 * - Robust error handling with fallback sources
 */
export class NHLAdapter implements IScoreSource {
  private readonly sport = 'NHL';
  private readonly sources = {
    espn: 'https://www.espn.com/nhl/scoreboard',
    espnJson: 'https://site.api.espn.com/apis/v2/sports/hockey/nhl/scoreboard',
    cbs: 'https://www.cbssports.com/nhl/scoreboard/',
    nhl: 'https://www.nhl.com/scores',
  };

  /**
   * Fetch recent games for specific teams (legacy method for backwards compatibility)
   * 
   * @param options - Team IDs and limit
   * @returns Array of InsertGame objects
   */
  async fetchRecentGames(options: { teamIds?: string[]; limit?: number }): Promise<InsertGame[]> {
    logger.info({ options }, 'NHLAdapter: fetchRecentGames called');
    
    try {
      // Extract team codes from full team IDs (e.g., "NHL_TOR" -> "TOR")
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
      logger.error({ err }, 'NHLAdapter: fetchRecentGames failed');
      return [];
    }
  }

  /**
   * Fetch live games with optional team filtering
   * Uses multi-source fallback strategy
   * 
   * @param teamCodes - Array of team codes to filter by (e.g., ["TOR", "MTL"])
   * @returns Array of GameScore objects
   */
  async fetchLive(teamCodes: string[]): Promise<GameScore[]> {
    logger.info({ teamCodes }, 'NHL: Fetching live games');

    // Try primary source first (ESPN)
    try {
      const games = await this.scrapeESPN(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'ESPN' }, 'NHL: Fetched from ESPN');
        return games;
      }
    } catch (err) {
      logger.warn({ err }, 'NHL: ESPN scrape failed, trying fallback');
    }

    // Fallback to CBS Sports
    try {
      const games = await this.scrapeCBS(teamCodes);
      if (games.length > 0) {
        logger.info({ count: games.length, source: 'CBS' }, 'NHL: Fetched from CBS');
        return games;
      }
    } catch (err) {
      logger.error({ err }, 'All NHL scrape sources failed');
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
    logger.info({ teamCodes, startDate, endDate }, 'NHL: Fetching schedule');

    const results: ScheduleGame[] = [];

    // Iterate day-by-day (ESPN JSON supports per-day scoreboard)
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

    while (cursor.getTime() <= end.getTime()) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      const dateStr = `${y}${m}${d}`;

      let dayEvents: any[] = [];

      // Primary: ESPN public JSON
      try {
        const raw = await ethicalFetcher.fetch(`${this.sources.espnJson}?dates=${dateStr}`);
        const data = JSON.parse(raw);
        if (Array.isArray(data?.events)) dayEvents = data.events;
      } catch (err) {
        logger.warn({ err, dateStr }, 'NHL: ESPN JSON schedule fetch failed');
      }

      // Alternate ESPN site JSON if primary empty
      if (!dayEvents || dayEvents.length === 0) {
        try {
          const raw = await ethicalFetcher.fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`);
          const data = JSON.parse(raw);
          if (Array.isArray(data?.events)) dayEvents = data.events;
        } catch (err) {
          logger.warn({ err, dateStr }, 'NHL: ESPN alternate JSON schedule fetch failed');
        }
      }

      // Build schedule items from JSON
      if (dayEvents && dayEvents.length > 0) {
        for (const event of dayEvents) {
          try {
            const competition = Array.isArray(event?.competitions) ? event.competitions[0] : undefined;
            const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
            if (competitors.length < 2) continue;

            const away = competitors.find((c: any) => c.homeAway === 'away') || competitors[0];
            const home = competitors.find((c: any) => c.homeAway === 'home') || competitors[1];

            const awayName = away?.team?.abbreviation || away?.team?.shortDisplayName || away?.team?.name || '';
            const homeName = home?.team?.abbreviation || home?.team?.shortDisplayName || home?.team?.name || '';

            const awayTeamId = TeamMapper.mapTeam(awayName, this.sport);
            const homeTeamId = TeamMapper.mapTeam(homeName, this.sport);

            // Filter by team codes if provided
            if (teamCodes && teamCodes.length > 0) {
              const awayCode = awayTeamId.split('_')[1];
              const homeCode = homeTeamId.split('_')[1];
              if (!teamCodes.includes(awayCode) && !teamCodes.includes(homeCode)) {
                continue;
              }
            }

            const eventId = event?.id ? String(event.id) : `NHL_${dateStr}_${awayTeamId}_${homeTeamId}`;
            const startIso = competition?.date || event?.date;
            const startTime = startIso ? new Date(startIso) : new Date(cursor);
            const state: string | undefined = event?.status?.type?.state || competition?.status?.type?.state;
            const status = this.mapESPNJSONState(state);

            results.push({
              gameId: `NHL_ESPN_${eventId}`,
              homeTeamId,
              awayTeamId,
              startTime,
              status,
              source: 'ESPN API',
            });
          } catch (err) {
            logger.warn({ err, dateStr }, 'NHL: Failed to parse schedule event from ESPN JSON');
          }
        }
      } else {
        // Fallback: ESPN DOM for that date
        try {
          const html = await ethicalFetcher.fetch(`${this.sources.espn}?date=${dateStr}`);
          const $ = HTMLParser.load(html);

          $('.ScoreCell, .gameModules, [data-module="game"], .ScoreboardScoreCell').each((i, elem) => {
            try {
              const $game = $(elem);

              let $teams = $game.find(
                '.ScoreCell__TeamName, .team-name, .Gamestrip__Team, .ScoreboardScoreCell__Abbrev, .ScoreboardScoreCell__TeamName'
              );
              if ($teams.length < 2) {
                $teams = $game.find('.competitors .abbr, .Competitors .ScoreboardScoreCell__Abbrev, .ScoreCell__Abbrev');
              }
              if ($teams.length < 2) return;

              const awayName = HTMLParser.extractText($teams.eq(0));
              const homeName = HTMLParser.extractText($teams.eq(1));

              const statusText = HTMLParser.extractText(
                $game.find('.ScoreCell__Status, .game-status, .Gamestrip__Time, .ScoreboardScoreCell__Time, .ScoreCell__Time')
              );

              const homeTeamId = TeamMapper.mapTeam(homeName, this.sport);
              const awayTeamId = TeamMapper.mapTeam(awayName, this.sport);

              if (teamCodes && teamCodes.length > 0) {
                const homeCode = homeTeamId.split('_')[1];
                const awayCode = awayTeamId.split('_')[1];
                if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) return;
              }

              results.push({
                gameId: `NHL_ESPN_DOM_${dateStr}_${awayTeamId}_${homeTeamId}_${i}`,
                homeTeamId,
                awayTeamId,
                startTime: this.extractScheduledStart(statusText) || new Date(cursor),
                status: this.mapStatus(statusText),
                source: 'ESPN.com',
              });
            } catch (err) {
              logger.warn({ err, dateStr, index: i }, 'NHL: Failed to parse schedule from ESPN DOM');
            }
          });
        } catch (err) {
          logger.warn({ err, dateStr }, 'NHL: ESPN DOM schedule fetch failed');
        }
      }

      // Next day
      cursor.setDate(cursor.getDate() + 1);
    }

    // Deduplicate by home/away/date
    const unique: ScheduleGame[] = [];
    const seen = new Set<string>();
    for (const g of results) {
      const key = `${g.awayTeamId}_${g.homeTeamId}_${g.startTime.toDateString()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(g);
      }
    }

    logger.info({ count: unique.length }, 'NHL: Schedule fetch complete');
    return unique;
  }

  /**
   * Fetch detailed box score for a specific game
   * 
   * @param gameId - Unique game identifier
   * @returns BoxScore object with team totals
   */
  async fetchBoxScore(gameId: string): Promise<BoxScore> {
    logger.info({ gameId }, 'NHL: Fetching box score');

    // Accept either raw ESPN event id (e.g., 401802500) or prefixed id (e.g., NHL_ESPN_401802500)
    const idMatch = gameId.match(/(\d{9})/);
    if (!idMatch) {
      throw new Error('NHL: fetchBoxScore requires an ESPN event id (e.g., 4018xxxxx)');
    }
    const eventId = idMatch[1];

    // Primary: ESPN summary JSON
    try {
      const raw = await ethicalFetcher.fetch(`https://site.api.espn.com/apis/v2/sports/hockey/nhl/summary?event=${eventId}`);
      const data = JSON.parse(raw);

      const competition = Array.isArray(data?.competitions) ? data.competitions[0] : undefined;
      const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
      if (competitors.length < 2) throw new Error('NHL: ESPN summary missing competitors');

      const away = competitors.find((c: any) => c.homeAway === 'away') || competitors[0];
      const home = competitors.find((c: any) => c.homeAway === 'home') || competitors[1];

      const awayScore = typeof away?.score === 'string' ? parseInt(away.score, 10) : (away?.score || 0);
      const homeScore = typeof home?.score === 'string' ? parseInt(home.score, 10) : (home?.score || 0);

      return {
        gameId: `NHL_ESPN_${eventId}`,
        home: { pts: Number.isFinite(homeScore) ? homeScore : 0 },
        away: { pts: Number.isFinite(awayScore) ? awayScore : 0 },
        updatedAt: new Date(),
        source: 'ESPN API',
      };
    } catch (err) {
      logger.warn({ err, eventId }, 'NHL: ESPN summary fetch failed, trying DOM fallback');
    }

    // Fallback: ESPN game page DOM
    try {
      const html = await ethicalFetcher.fetch(`https://www.espn.com/nhl/game?gameId=${eventId}`);
      const $ = HTMLParser.load(html);

      // Try standard scoreboard cells first
      let $scores = $('.ScoreboardScoreCell__Score, .ScoreCell__Score, .score');
      if ($scores.length < 2) {
        // Alternative selectors seen across ESPN layouts
        $scores = $('.Competitors .ScoreboardScoreCell__Score, .competitors .score');
      }
      const awayScore = $scores.length > 0 ? HTMLParser.extractNumber($scores.eq(0)) : 0;
      const homeScore = $scores.length > 1 ? HTMLParser.extractNumber($scores.eq(1)) : 0;

      return {
        gameId: `NHL_ESPN_${eventId}`,
        home: { pts: Number.isFinite(homeScore) ? homeScore : 0 },
        away: { pts: Number.isFinite(awayScore) ? awayScore : 0 },
        updatedAt: new Date(),
        source: 'ESPN.com',
      };
    } catch (err) {
      logger.error({ err, eventId }, 'NHL: Both ESPN summary and DOM box score fetch failed');
      throw new Error('NHL: fetchBoxScore failed for event ' + eventId);
    }
  }

  /**
   * Fetch featured games for league overview (no team filtering)
   * 
   * @param sport - Sport identifier (should be "NHL")
   * @param limit - Maximum number of games to return
   * @returns Array of ScheduleGame objects
   */
  async fetchFeaturedGames(sport: string, limit: number): Promise<ScheduleGame[]> {
    logger.info({ sport, limit }, 'NHL: Fetching featured games');

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
      logger.error({ err }, 'NHL: fetchFeaturedGames failed');
      return [];
    }
  }

  /**
   * Scrape NHL games from ESPN.com
   * Primary data source
   * 
   * @param teamCodes - Optional team codes for filtering
   * @returns Array of GameScore objects
   */
  private async scrapeESPN(teamCodes?: string[]): Promise<GameScore[]> {
    try {
      // Prefer ESPN public JSON scoreboard for stability and reliable start times
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const dateStr = `${y}${m}${d}`;

      let raw = await ethicalFetcher.fetch(`${this.sources.espnJson}?dates=${dateStr}`);
      let data = JSON.parse(raw);

      const games: GameScore[] = [];
      let events = Array.isArray(data?.events) ? data.events : [];

      // If primary endpoint returns no events, try alternate site endpoint
      if (!events || events.length === 0) {
        try {
          raw = await ethicalFetcher.fetch(`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=${dateStr}`);
          data = JSON.parse(raw);
          events = Array.isArray(data?.events) ? data.events : [];
        } catch (e) {
          // Swallow and continue to DOM fallback
          logger.warn({ err: e }, 'NHL: ESPN alternate JSON endpoint failed');
        }
      }

      for (const event of events) {
        try {
          const competition = Array.isArray(event?.competitions) ? event.competitions[0] : undefined;
          const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
          const homeComp = competitors.find((c: any) => c.homeAway === 'home');
          const awayComp = competitors.find((c: any) => c.homeAway === 'away');
          if (!homeComp || !awayComp) continue;

          const homeName = homeComp.team?.displayName || homeComp.team?.shortDisplayName || homeComp.team?.name || homeComp.team?.abbreviation || '';
          const awayName = awayComp.team?.displayName || awayComp.team?.shortDisplayName || awayComp.team?.name || awayComp.team?.abbreviation || '';
          const homeAbbr = homeComp.team?.abbreviation || TeamMapper.getCodeFromId(TeamMapper.mapTeam(homeName, this.sport));
          const awayAbbr = awayComp.team?.abbreviation || TeamMapper.getCodeFromId(TeamMapper.mapTeam(awayName, this.sport));

          const homeTeamId = TeamMapper.mapTeam(homeAbbr || homeName, this.sport);
          const awayTeamId = TeamMapper.mapTeam(awayAbbr || awayName, this.sport);

          const homeScore = Number(homeComp.score ?? 0) || 0;
          const awayScore = Number(awayComp.score ?? 0) || 0;

          const statusDetail = competition?.status?.type?.detail || event?.status?.type?.detail || '';
          const statusState = (competition?.status?.type?.state || event?.status?.type?.state || '').toLowerCase();
          const status: 'scheduled' | 'in_progress' | 'final' =
            statusState === 'pre' ? 'scheduled' :
            statusState === 'in' ? 'in_progress' :
            statusState === 'post' ? 'final' : this.mapStatus(statusDetail);

          const period = this.extractPeriod(statusDetail);
          const timeRemaining = this.extractTimeRemaining(statusDetail);

          // Filter by team codes if provided
          if (teamCodes && teamCodes.length > 0) {
            const homeCode = homeTeamId.split('_')[1];
            const awayCode = awayTeamId.split('_')[1];
            if (!teamCodes.includes(homeCode) && !teamCodes.includes(awayCode)) {
              continue;
            }
          }

          const startTimeStr = event?.date || competition?.date;
          const startTime = startTimeStr ? new Date(startTimeStr) : now;
          const gameId = event?.id ? `NHL_ESPN_${event.id}` : `NHL_ESPN_${awayTeamId}_${homeTeamId}_${Date.now()}`;

          games.push({
            gameId,
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status,
            period,
            timeRemaining,
            startTime,
            source: 'ESPN API',
          });
        } catch (err) {
          logger.warn({ err }, 'NHL: Failed to parse event from ESPN JSON');
        }
      }

      if (games.length > 0) {
        return games;
      }
    } catch (err) {
      // Fall back to DOM scrape if JSON fails
      logger.error({ err }, 'NHL: ESPN JSON scoreboard fetch failed');
    }

    try {
      const html = await ethicalFetcher.fetch(this.sources.espn);
      const $ = HTMLParser.load(html);
      const games: GameScore[] = [];

      // ESPN uses a card-based layout for games
      $('.ScoreCell, .gameModules, [data-module="game"], .ScoreboardScoreCell').each((i, elem) => {
        try {
          const $game = $(elem);
          
          // Extract team names - ESPN typically has team abbreviations
          let $teams = $game.find(
            '.ScoreCell__TeamName, .team-name, .Gamestrip__Team, .ScoreboardScoreCell__Abbrev, .ScoreboardScoreCell__TeamName'
          );
          if ($teams.length < 2) {
            // Fallback selectors used on some ESPN layouts
            $teams = $game.find('.competitors .abbr, .Competitors .ScoreboardScoreCell__Abbrev, .ScoreCell__Abbrev');
          }
          if ($teams.length < 2) return;

          const awayTeamName = HTMLParser.extractText($teams.eq(0));
          const homeTeamName = HTMLParser.extractText($teams.eq(1));

          // Extract scores (goals in hockey)
          let $scores = $game.find(
            '.ScoreCell__Score, .score, .Gamestrip__Score, .ScoreboardScoreCell__Score, .ScoreCell__ScoreNumber'
          );
          if ($scores.length < 2) {
            // Alternative score containers
            $scores = $game.find('.competitors .score, .Competitors .ScoreboardScoreCell__Score');
          }
          const awayScore = $scores.length > 0 ? HTMLParser.extractNumber($scores.eq(0)) : 0;
          const homeScore = $scores.length > 1 ? HTMLParser.extractNumber($scores.eq(1)) : 0;

          // Extract status
          const $status = $game.find(
            '.ScoreCell__Status, .game-status, .Gamestrip__Time, .ScoreboardScoreCell__Time, .ScoreCell__Time'
          );
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

          const scheduledStart = this.extractScheduledStart(statusText);
          games.push({
            gameId: buildStableGameId(this.sport, 'ESPN', awayTeamId, homeTeamId, scheduledStart),
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractPeriod(statusText),
            timeRemaining: this.extractTimeRemaining(statusText),
            startTime: scheduledStart || new Date(),
            source: 'ESPN.com',
          });
        } catch (err) {
          logger.warn({ err, index: i }, 'NHL: Failed to parse game from ESPN');
        }
      });

      // Deduplicate potential duplicates from different ESPN modules
      const unique: GameScore[] = [];
      const seen = new Set<string>();
      for (const g of games) {
        const key = `${g.awayTeamId}_${g.homeTeamId}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(g);
        }
      }
      return unique;
    } catch (err) {
      logger.error({ err }, 'NHL: ESPN scrape failed');
      return [];
    }
  }

  /**
   * Scrape NHL games from CBS Sports
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

      // CBS Sports uses varied card layouts
      $('.live-event-card, .scoreboard-card, .live-update, .game-item, .scoreboard-item').each((i, elem) => {
        try {
          const $game = $(elem);
          
          // Prefer structured team blocks
          const $teamBlocks = $game.find('.team, .team--away, .team.--away, .away-team, .team--home, .team.--home, .home-team');
          let awayTeamName = HTMLParser.extractText($teamBlocks.eq(0).find('.team-name, .team-name-link, .team-abbr, .name, .abbr'));
          let homeTeamName = HTMLParser.extractText($teamBlocks.eq(1).find('.team-name, .team-name-link, .team-abbr, .name, .abbr'));

          // Fallbacks to legacy selectors
          if (!awayTeamName) {
            awayTeamName = HTMLParser.extractText($game.find('.away-team .team-name-link, .team.--away .team-name, .team--away .team-name, .away-team .abbr'));
          }
          if (!homeTeamName) {
            homeTeamName = HTMLParser.extractText($game.find('.home-team .team-name-link, .team.--home .team-name, .team--home .team-name, .home-team .abbr'));
          }

          // Scores
          let awayScore = HTMLParser.extractNumber($teamBlocks.eq(0).find('.score, .TeamScore'));
          let homeScore = HTMLParser.extractNumber($teamBlocks.eq(1).find('.score, .TeamScore'));
          if (!awayScore && !homeScore) {
            awayScore = HTMLParser.extractNumber($game.find('.away-team .score, .team.--away .score, .team--away .score'));
            homeScore = HTMLParser.extractNumber($game.find('.home-team .score, .team.--home .score, .team--home .score'));
          }

          const statusText = HTMLParser.extractText($game.find('.game-status, .status, .status-text, .update-status'));

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

          const scheduledStart = this.extractScheduledStart(statusText);
          games.push({
            gameId: buildStableGameId(this.sport, 'CBS', awayTeamId, homeTeamId, scheduledStart),
            homeTeamId,
            awayTeamId,
            homePts: homeScore,
            awayPts: awayScore,
            status: this.mapStatus(statusText),
            period: this.extractPeriod(statusText),
            timeRemaining: this.extractTimeRemaining(statusText),
            startTime: scheduledStart || new Date(),
            source: 'CBS Sports',
          });
        } catch (err) {
          logger.warn({ err, index: i }, 'NHL: Failed to parse game from CBS');
        }
      });

      // Deduplicate games if multiple layouts produced duplicates
      const unique: GameScore[] = [];
      const seen = new Set<string>();
      for (const g of games) {
        const key = `${g.awayTeamId}_${g.homeTeamId}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(g);
        }
      }
      return unique;
    } catch (err) {
      logger.error({ err }, 'NHL: CBS scrape failed');
      return [];
    }
  }

  /**
   * Map status text to standardized status enum
   * NHL-specific: handles 3 periods, intermissions, overtime, shootout
   * 
   * @param statusText - Raw status text from scraping
   * @returns Standardized status: 'scheduled' | 'in_progress' | 'final'
   */
  private mapStatus(statusText: string): 'scheduled' | 'in_progress' | 'final' {
    const text = statusText || '';
    const lower = text.toLowerCase();

    // Final status indicators (including overtime and shootout)
    if (/\bfinal\b/i.test(text) || /\bfinal\/(?:ot|so)\b/i.test(text) || /\bf\/(?:ot|so)\b/i.test(text)) {
      return 'final';
    }

    // In-progress indicators
    const inProgressByPeriod = /(\b1st\b|\b2nd\b|\b3rd\b|\bot\b|\bovertime\b|\bso\b|\bshootout\b|\bperiod\b|intermission|\bend\s+(?:1st|2nd|3rd))/i.test(text);
    // Clock present but NOT time-of-day (exclude "am"/"pm")
    const clockMatch = /(\d{1,2}:\d{2})(?!\s*(?:am|pm))/i.test(text);
    const liveWord = /\blive\b/i.test(text);
    if (inProgressByPeriod || clockMatch || liveWord) {
      return 'in_progress';
    }

    // Default to scheduled
    return 'scheduled';
  }

  /**
   * Extract period from status text
   * NHL-specific: 1st, 2nd, 3rd periods, OT (overtime), SO (shootout)
   * 
   * @param statusText - Raw status text
   * @returns Period as string (e.g., "1", "2", "3", "OT", "SO") or undefined
   */
  private extractPeriod(statusText: string): string | undefined {
    const text = statusText || '';

    // Shootout / Overtime indicators
    if (/\bSO\b|shootout/i.test(text)) return 'SO';
    if (/\bOT\b|overtime/i.test(text)) return 'OT';

    // Intermission handling: try to capture which intermission
    if (/intermission/i.test(text)) {
      const afterMatch = text.match(/(?:after\s+)?(\d)(?:st|nd|rd)/i);
      if (afterMatch) return `INT${afterMatch[1]}`;
      const nthMatch = text.match(/(\d)(?:st|nd|rd)\s+intermission/i);
      if (nthMatch) return `INT${nthMatch[1]}`;
      return 'INT';
    }

    // End-of-period states (e.g., "End 1st")
    const endMatch = text.match(/end\s+(\d)(?:st|nd|rd)/i);
    if (endMatch) return endMatch[1];

    // Standard period labels: 1st, 2nd, 3rd
    const periodMatch = text.match(/(\d)(?:st|nd|rd)\s*(?:period)?/i);
    if (periodMatch) return periodMatch[1];

    return undefined;
  }

  /**
   * Extract time remaining from status text
   * 
   * @param statusText - Raw status text
   * @returns Time remaining (e.g., "15:32", "5:00", "0:03") or undefined
   */
  private extractTimeRemaining(statusText: string): string | undefined {
    const text = statusText || '';
    // Match clock (e.g., "15:32") but exclude time-of-day (AM/PM)
    const match = text.match(/\b(\d{1,2}:\d{2})\b(?!\s*(?:am|pm))/i);
    return match ? match[1] : undefined;
  }

  /**
   * Extract scheduled start time from status text (e.g., "7:00 PM", "8:30 PM ET", "Tomorrow 7:00 PM")
   * Returns a Date constructed for today (or tomorrow) in local timezone.
   * Note: We intentionally avoid complex timezone math; if "ET" is present
   * we still return a local Date representing that clock time to keep behavior consistent.
   */
  private extractScheduledStart(statusText: string): Date | undefined {
    const text = statusText || '';
    // Look for explicit AM/PM time-of-day (scheduled)
    const m = text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/i);
    if (!m) return undefined;

    let hour = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    const ampm = m[3].toUpperCase();

    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    const now = new Date();
    const isTomorrow = /\btomorrow\b/i.test(text);
    const dayOffset = isTomorrow ? 1 : 0;

    // Construct Date in local timezone for simplicity
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + dayOffset,
      hour,
      minute,
      0,
      0
    );

    return isNaN(start.getTime()) ? undefined : start;
  }

  /**
   * Map ESPN JSON status state (e.g., "pre", "in", "post") to internal enum
   */
  private mapESPNJSONState(state?: string): 'scheduled' | 'in_progress' | 'final' {
    const s = (state || '').toLowerCase();
    if (s === 'in') return 'in_progress';
    if (s === 'post') return 'final';
    // Treat others (e.g., pre, postponed) as scheduled
    return 'scheduled';
  }
}
