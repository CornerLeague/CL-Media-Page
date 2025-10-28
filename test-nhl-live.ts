import { NHLAdapter } from './server/agents/adapters/nhlAdapter';

async function test() {
  const adapter = new NHLAdapter();

  // Optionally pass team codes via CLI args: npx tsx test-nhl-live.ts TOR BOS
  const teamCodes = process.argv.slice(2);
  console.log('Team codes filter:', teamCodes.length > 0 ? teamCodes : 'none');

  // Use the public fetchLive to exercise combined ESPN + CBS flows
  const games = await adapter.fetchLive(teamCodes);
  console.log('Found live games (combined):', games.length);
  console.log(JSON.stringify(games.slice(0, 10), null, 2));
}

test().catch((err) => {
  console.error('NHLAdapter live manual test error:', err);
  process.exitCode = 1;
});