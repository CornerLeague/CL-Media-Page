import { NHLAdapter } from './server/agents/adapters/nhlAdapter';

async function test() {
  const adapter = new NHLAdapter();

  // Optionally pass team codes via CLI args: node script TOR BOS
  const teamCodes = process.argv.slice(2);
  console.log('Team codes filter:', teamCodes.length > 0 ? teamCodes : 'none');

  // Call private scrapeCBS via any-cast for manual testing
  const games = await (adapter as any).scrapeCBS(teamCodes);
  console.log('Found CBS games:', games.length);
  console.log(JSON.stringify(games.slice(0, 5), null, 2));
}

test().catch((err) => {
  console.error('NHLAdapter CBS manual test error:', err);
  process.exitCode = 1;
});