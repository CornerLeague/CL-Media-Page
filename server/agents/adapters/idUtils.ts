import { TeamMapper } from '../../utils/scraping/teamMapper';

/**
 * Build a stable gameId using sport, source, team codes, and optional scheduled start date.
 * Format: `${sport}_${source}_${YYYYMMDD?}_${AWAY}_${HOME}`
 * - Includes `YYYYMMDD_` only when a reliable scheduled start is available
 */
export function buildStableGameId(
  sport: string,
  source: string,
  awayTeamId: string,
  homeTeamId: string,
  scheduledStart?: Date
): string {
  const awayCode = TeamMapper.getCodeFromId(awayTeamId);
  const homeCode = TeamMapper.getCodeFromId(homeTeamId);

  const datePart = scheduledStart ? formatDateYYYYMMDD(scheduledStart) + '_' : '';
  return `${sport}_${source}_${datePart}${awayCode}_${homeCode}`;
}

function formatDateYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}