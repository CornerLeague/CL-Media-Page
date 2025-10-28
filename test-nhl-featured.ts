import { NHLAdapter } from './server/agents/adapters/nhlAdapter';

async function test() {
  const adapter = new NHLAdapter();
  const games = await adapter.fetchFeaturedGames('NHL', 5);
  console.log('Featured games:', games.length);
  console.log(JSON.stringify(games, null, 2));
}

test().catch((err) => {
  console.error('NHLAdapter featured manual test error:', err);
  process.exitCode = 1;
});