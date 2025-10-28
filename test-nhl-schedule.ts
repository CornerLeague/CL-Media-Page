// Quick probe for NHLAdapter.fetchSchedule
// Usage:
//   npx tsx test-nhl-schedule.ts [TEAM_ID optional] [START_DATE optional] [END_DATE optional]
// Examples:
//   npx tsx test-nhl-schedule.ts
//   npx tsx test-nhl-schedule.ts NHL_BOS 2025-10-01 2025-10-31
//   npx tsx test-nhl-schedule.ts ALL today tomorrow

import { NHLAdapter } from './server/agents/adapters/nhlAdapter';
import { TeamMapper } from './server/utils/scraping/teamMapper';

function parseDate(input?: string): Date | undefined {
  if (!input) return undefined;
  if (input.toLowerCase() === 'today') return new Date();
  if (input.toLowerCase() === 'tomorrow') return new Date(Date.now() + 24*60*60*1000);
  const d = new Date(input);
  return isNaN(d.getTime()) ? undefined : d;
}

async function main() {
  const [teamArg, startArg, endArg] = process.argv.slice(2);

  const adapter = new NHLAdapter();
  const startDate = parseDate(startArg) ?? new Date();
  const endDate = parseDate(endArg) ?? new Date(startDate.getTime() + 24*60*60*1000);

  let teamCodes: string[] = [];
  if (teamArg && teamArg.toUpperCase() !== 'ALL') {
    const teamId = teamArg.toUpperCase();
    const code = TeamMapper.getCodeFromId(teamId);
    teamCodes = [code];
  }

  console.log('NHL schedule probe:', { teamCodes, startDate, endDate });
  const schedule = await adapter.fetchSchedule(teamCodes, startDate, endDate);
  console.log('Total results:', schedule.length);
  const sample = schedule.slice(0, Math.min(5, schedule.length));
  for (const g of sample) {
    console.log({ gameId: g.gameId, away: g.awayTeamId, home: g.homeTeamId, startTime: g.startTime, status: g.status, source: g.source });
  }
}

main().catch(err => {
  console.error('Error running test-nhl-schedule:', err);
  process.exit(1);
});