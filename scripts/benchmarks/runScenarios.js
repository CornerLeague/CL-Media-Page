/*
 Runs the existing HTTP benchmark harness across labeled scenarios and
 writes outputs into test-results/ with clear filenames.

 Scenarios:
 - cold: single run intended for cold cache (run after server restart)
 - warm: two consecutive runs, the second result saved
 - jobs_on: same as warm but with JOBS_ENABLED=true noted in metadata

 Usage:
   node scripts/benchmarks/runScenarios.js --base http://localhost:5000 --runs 25 --timeout 15000

 Notes:
 - This script does not start the server. Ensure the API is reachable at BASE_URL.
 - The underlying harness: scripts/benchmarks/httpBenchmarks.js
*/

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runHarnessOnce(env) {
  const res = spawnSync(
    process.execPath,
    [path.join('scripts', 'benchmarks', 'httpBenchmarks.js')],
    {
      env: { ...process.env, ...env },
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Number(env.TIMEOUT_MS || 30000),
    }
  );
  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  let summary = null;
  try {
    summary = JSON.parse(stdout);
  } catch {
    summary = { error: 'Failed to parse harness output', raw: stdout, stderr };
  }
  return { status: res.status, error: res.error, summary };
}

function writeResult(name, summary, meta) {
  const dir = path.join('test-results');
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${name}--${ts}.json`);
  const payload = { scenario: name, meta, summary };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${file}`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { base: process.env.BASE_URL || 'http://localhost:5000', runs: Number(process.env.RUNS || 25), timeout: Number(process.env.TIMEOUT_MS || 15000) };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--base') opts.base = args[++i];
    else if (a === '--runs') opts.runs = Number(args[++i]);
    else if (a === '--timeout') opts.timeout = Number(args[++i]);
  }
  return opts;
}

function main() {
  const opts = parseArgs();
  const baseEnv = { BASE_URL: opts.base, RUNS: String(opts.runs), TIMEOUT_MS: String(opts.timeout) };

  // Cold cache (assumes caller restarted server beforehand)
  console.log('Running scenario: cold');
  const cold = runHarnessOnce(baseEnv);
  writeResult('benchmarks-cold', cold.summary, { baseUrl: opts.base, runs: opts.runs, timeoutMs: opts.timeout });

  // Warm cache: two runs back-to-back, save the second
  console.log('Running scenario: warm (warm-up + measured)');
  runHarnessOnce(baseEnv); // warm-up
  const warm = runHarnessOnce(baseEnv);
  writeResult('benchmarks-warm', warm.summary, { baseUrl: opts.base, runs: opts.runs, timeoutMs: opts.timeout });

  // Jobs enabled metadata (caller should start server with JOBS_ENABLED=true)
  console.log('Running scenario: jobs_on (requires server with jobs enabled)');
  const jobsOn = runHarnessOnce(baseEnv);
  writeResult('benchmarks-jobs-on', jobsOn.summary, { baseUrl: opts.base, runs: opts.runs, timeoutMs: opts.timeout, jobsEnabled: true });
}

main();