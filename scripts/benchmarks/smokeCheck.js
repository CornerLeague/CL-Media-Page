/*
 Basic performance smoke check for CI.
 - Runs the HTTP benchmark harness with small RUNS
 - Fails the build if p95 exceeds threshold or errors are nonzero

 Usage:
   node scripts/benchmarks/smokeCheck.js --base http://localhost:5060 --p95 1200 --runs 5 --timeout 8000 --maxErrors 0

 Env vars supported:
   BASE_URL, RUNS, TIMEOUT_MS, P95_THRESHOLD, MAX_ERRORS
*/

import { spawnSync } from 'node:child_process';
import path from 'node:path';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    base: process.env.BASE_URL || 'http://localhost:5000',
    runs: Number(process.env.RUNS || 5),
    timeout: Number(process.env.TIMEOUT_MS || 8000),
    p95: Number(process.env.P95_THRESHOLD || 1200),
    maxErrors: Number(process.env.MAX_ERRORS || 0),
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--base') opts.base = args[++i];
    else if (a === '--runs') opts.runs = Number(args[++i]);
    else if (a === '--timeout') opts.timeout = Number(args[++i]);
    else if (a === '--p95') opts.p95 = Number(args[++i]);
    else if (a === '--maxErrors') opts.maxErrors = Number(args[++i]);
  }
  return opts;
}

function runHarness(env) {
  const res = spawnSync(
    process.execPath,
    [path.join('scripts', 'benchmarks', 'httpBenchmarks.js')],
    {
      env: { ...process.env, ...env },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Number(env.TIMEOUT_MS || 20000),
    }
  );
  let summary = null;
  try {
    summary = JSON.parse(res.stdout || '');
  } catch {
    console.error('Failed to parse harness output. Raw stdout:', res.stdout);
    console.error('stderr:', res.stderr);
    process.exit(1);
  }
  return summary;
}

function checkThresholds(summary, { p95, maxErrors }) {
  const failures = [];
  for (const r of summary.results || []) {
    if (r.p95Ms > p95) {
      failures.push(`p95 ${r.p95Ms.toFixed(1)}ms > ${p95}ms for ${r.name} (${r.path})`);
    }
    if (r.errors > maxErrors) {
      failures.push(`errors ${r.errors} > ${maxErrors} for ${r.name} (${r.path})`);
    }
  }
  return failures;
}

function main() {
  const opts = parseArgs();
  const env = {
    BASE_URL: opts.base,
    RUNS: String(opts.runs),
    TIMEOUT_MS: String(opts.timeout),
  };
  console.log(`Running smoke benchmarks: base=${opts.base} runs=${opts.runs} timeoutMs=${opts.timeout} p95<=${opts.p95} maxErrors<=${opts.maxErrors}`);
  const summary = runHarness(env);
  const failures = checkThresholds(summary, { p95: opts.p95, maxErrors: opts.maxErrors });
  if (failures.length > 0) {
    console.error('Performance smoke check FAILED:');
    for (const f of failures) console.error(` - ${f}`);
    console.error('Summary:', JSON.stringify(summary, null, 2));
    process.exit(1);
  }
  console.log('Performance smoke check passed. Summary:');
  console.log(JSON.stringify(summary, null, 2));
}

main();