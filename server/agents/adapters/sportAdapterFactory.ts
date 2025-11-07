import type { IScoreSource } from '../types';
import { DummyScoreSource } from './dummyScoreSource';
import { NBAAdapter } from './nbaAdapter';
import { NFLAdapter } from './nflAdapter';
import { MLBAdapter } from './mlbAdapter';
import { NHLAdapter } from './nhlAdapter';
import { logger } from '../../logger';

/**
 * SportAdapterFactory
 * 
 * Factory pattern for creating sport-specific data adapters.
 * Returns the appropriate adapter based on the sport type.
 * Falls back to DummyScoreSource for unsupported or not-yet-implemented sports.
 * 
 * Usage:
 *   const adapter = SportAdapterFactory.getAdapter('NBA');
 *   const games = await adapter.fetchRecentGames({ teamIds: ['NBA_LAL'], limit: 5 });
 */
export class SportAdapterFactory {
  /**
   * Get the appropriate adapter for a given sport.
   * 
   * @param sport - Sport name (case-insensitive): NBA, NFL, MLB, NHL, SOCCER, COLLEGE_FOOTBALL, COLLEGE_BASKETBALL
   * @returns IScoreSource adapter instance
  */
  static getAdapter(sport: string): IScoreSource {
    // Defensive: handle null/undefined/empty sport to avoid TypeError
    if (sport == null || String(sport).trim() === '') {
      logger.warn('SportAdapterFactory: getAdapter called with null/empty sport, using DummyScoreSource');
      return new DummyScoreSource();
    }

    const normalizedSport = sport.toUpperCase().trim();
    
    logger.info({ sport: normalizedSport }, 'SportAdapterFactory: Getting adapter');

    switch (normalizedSport) {
      case 'NBA':
      case 'BASKETBALL':
        return new NBAAdapter();

      case 'NFL':
      case 'FOOTBALL':
        return new NFLAdapter();

      case 'MLB':
      case 'BASEBALL':
        return new MLBAdapter();

      case 'NHL':
      case 'HOCKEY':
        return new NHLAdapter();

      case 'SOCCER':
      case 'MLS':
        logger.warn('Soccer adapter not implemented yet, using DummyScoreSource');
        return new DummyScoreSource();

      case 'COLLEGE_FOOTBALL':
      case 'CFB':
        logger.warn('College Football adapter not implemented yet, using DummyScoreSource');
        return new DummyScoreSource();

      case 'COLLEGE_BASKETBALL':
      case 'CBB':
        logger.warn('College Basketball adapter not implemented yet, using DummyScoreSource');
        return new DummyScoreSource();

      default:
        logger.warn({ sport: normalizedSport }, 'No adapter found for sport, using DummyScoreSource');
        return new DummyScoreSource();
    }
  }

  /**
   * Get a list of all sports that have adapters (or will have adapters).
   * 
   * @returns Array of supported sport codes
   */
  static getSupportedSports(): string[] {
    return [
      'NBA',
      'NFL',
      'MLB',
      'NHL',
      'SOCCER',
      'COLLEGE_FOOTBALL',
      'COLLEGE_BASKETBALL',
    ];
  }

  /**
   * Check if a sport is in the supported list.
   * Note: This returns true even if the adapter is not yet implemented.
   * 
   * @param sport - Sport name to check (case-insensitive)
   * @returns true if the sport is in the supported list
  */
  static isSupported(sport?: string | null): boolean {
    if (sport == null || String(sport).trim() === '') {
      return false;
    }
    const normalizedSport = sport.toUpperCase().trim();
    
    // Handle aliases
    const sportAliases: Record<string, string> = {
      'BASKETBALL': 'NBA',
      'FOOTBALL': 'NFL',
      'BASEBALL': 'MLB',
      'HOCKEY': 'NHL',
      'MLS': 'SOCCER',
      'CFB': 'COLLEGE_FOOTBALL',
      'CBB': 'COLLEGE_BASKETBALL',
    };

    const mappedSport = sportAliases[normalizedSport] || normalizedSport;
    return this.getSupportedSports().includes(mappedSport);
  }

  /**
   * Get adapters for multiple sports at once.
   * Useful for fetching data across multiple sports simultaneously.
   * 
   * @param sports - Array of sport names
   * @returns Map of sport -> adapter
   */
  static getAdapters(sports: string[]): Map<string, IScoreSource> {
    const adapters = new Map<string, IScoreSource>();
    
    // Defensive: handle non-array input to prevent runtime TypeError
    if (!Array.isArray(sports)) {
      logger.warn('SportAdapterFactory: getAdapters received non-array sports; returning empty map');
      return adapters;
    }
    
    for (const sport of sports) {
      // Defensive: skip null/undefined/empty entries to avoid TypeError
      if (sport == null || String(sport).trim() === '') {
        logger.warn('SportAdapterFactory: getAdapters received null/empty sport; skipping');
        continue;
      }
      const normalizedSport = sport.toUpperCase().trim();
      adapters.set(normalizedSport, this.getAdapter(sport));
    }
    
    return adapters;
  }
}
