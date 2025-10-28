import { NHLAdapter } from './server/agents/adapters/nhlAdapter';

async function test() {
  const adapter = new NHLAdapter();

  // Usage:
  //   npx tsx test-nhl-boxscore.ts 401802500
  //   npx tsx test-nhl-boxscore.ts NHL_ESPN_401802500
  const arg = process.argv[2];
  if (!arg) {
    console.error('Please provide an ESPN event id, e.g., 401802500');
    process.exit(1);
    return;
  }

  const box = await adapter.fetchBoxScore(arg);
  console.log('Box score fetched:');
  console.log(JSON.stringify(box, null, 2));
}

test().catch((err) => {
  console.error('NHLAdapter box score manual test error:', err);
  process.exitCode = 1;
});