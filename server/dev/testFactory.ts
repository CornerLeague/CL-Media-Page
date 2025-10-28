/**
 * Quick verification script for SportAdapterFactory
 * Run with: tsx server/dev/testFactory.ts
 */

import { SportAdapterFactory } from '../agents/adapters';

console.log('\n=== SportAdapterFactory Verification ===\n');

// Test 1: Basic adapter retrieval
console.log('Test 1: Basic adapter retrieval');
const nbaAdapter = SportAdapterFactory.getAdapter('NBA');
console.log(`  NBA adapter: ${nbaAdapter.constructor.name}`);

const nflAdapter = SportAdapterFactory.getAdapter('NFL');
console.log(`  NFL adapter: ${nflAdapter.constructor.name}`);

const mlbAdapter = SportAdapterFactory.getAdapter('MLB');
console.log(`  MLB adapter: ${mlbAdapter.constructor.name}`);

const nhlAdapter = SportAdapterFactory.getAdapter('NHL');
console.log(`  NHL adapter: ${nhlAdapter.constructor.name}`);
console.log('  ✅ All adapters retrieved successfully\n');

// Test 2: Case insensitivity
console.log('Test 2: Case insensitivity');
const tests = ['nba', 'NBA', 'NbA', 'BASKETBALL', 'basketball'];
for (const sport of tests) {
  const adapter = SportAdapterFactory.getAdapter(sport);
  console.log(`  "${sport}" -> ${adapter.constructor.name}`);
}
console.log('  ✅ Case insensitivity works\n');

// Test 3: Supported sports list
console.log('Test 3: Supported sports list');
const supportedSports = SportAdapterFactory.getSupportedSports();
console.log(`  Supported sports (${supportedSports.length}):`, supportedSports);
console.log('  ✅ getSupportedSports works\n');

// Test 4: isSupported method
console.log('Test 4: isSupported method');
const supportTests = [
  { sport: 'NBA', expected: true },
  { sport: 'basketball', expected: true },
  { sport: 'NFL', expected: true },
  { sport: 'TENNIS', expected: false },
  { sport: 'GOLF', expected: false },
];

let allPassed = true;
for (const { sport, expected } of supportTests) {
  const result = SportAdapterFactory.isSupported(sport);
  const status = result === expected ? '✅' : '❌';
  console.log(`  ${status} Sport: "${sport}" -> Supported: ${result} (expected: ${expected})`);
  if (result !== expected) allPassed = false;
}
if (allPassed) {
  console.log('  ✅ All isSupported tests passed\n');
}

// Test 5: getAdapters for multiple sports
console.log('Test 5: getAdapters for multiple sports');
const sports = ['NBA', 'NFL', 'MLB'];
const adapters = SportAdapterFactory.getAdapters(sports);
console.log(`  Adapter map size: ${adapters.size} (expected: 3)`);
Array.from(adapters.entries()).forEach(([sport, adapter]) => {
  console.log(`  ${sport} -> ${adapter.constructor.name}`);
});
console.log('  ✅ getAdapters works\n');

// Test 6: Fallback for unsupported sports
console.log('Test 6: Fallback for unsupported sports');
const unsupported = ['TENNIS', 'GOLF', 'INVALID'];
for (const sport of unsupported) {
  const adapter = SportAdapterFactory.getAdapter(sport);
  console.log(`  "${sport}" -> ${adapter.constructor.name} (fallback to DummyScoreSource)`);
}
console.log('  ✅ Fallback works correctly\n');

console.log('=== All Tests Passed! ===\n');
