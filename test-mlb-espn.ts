import { MLBAdapter } from './server/agents/adapters/mlbAdapter';

async function test() {
  const adapter = new MLBAdapter();

  // Optionally pass team codes via CLI args: node script NYY BOS
  const teamCodes = process.argv.slice(2);
  console.log('Team codes filter:', teamCodes.length > 0 ? teamCodes : 'none');

  const games = await adapter.fetchLive(teamCodes);
  console.log('Found games:', games.length);
  console.log(JSON.stringify(games.slice(0, 5), null, 2));
}

test().catch((err) => {
  console.error('MLBAdapter manual test error:', err);
  process.exitCode = 1;
});