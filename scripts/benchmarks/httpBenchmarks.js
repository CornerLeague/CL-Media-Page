/*
 Simple HTTP benchmark harness for top DB-backed endpoints.
 Usage:
   BASE_URL=http://localhost:5003 node scripts/benchmarks/httpBenchmarks.js

 Produces a JSON summary to stdout with p50, p95, avg for each endpoint.
*/

import fs from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5003';
const RUNS_PER_ENDPOINT = Number(process.env.RUNS || 20);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 15000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function timedFetch(url) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    const end = performance.now();
    clearTimeout(to);
    return { ok: res.ok, status: res.status, durationMs: end - start, size: text.length };
  } catch (err) {
    const end = performance.now();
    clearTimeout(to);
    return { ok: false, status: 0, durationMs: end - start, error: String(err) };
  }
}

function stats(durations) {
  const sorted = [...durations].sort((a, b) => a - b);
  const n = sorted.length;
  const avg = sorted.reduce((s, x) => s + x, 0) / Math.max(1, n);
  const p50 = sorted[Math.floor(0.5 * (n - 1))] || 0;
  const p95 = sorted[Math.floor(0.95 * (n - 1))] || 0;
  return { count: n, avgMs: avg, p50Ms: p50, p95Ms: p95 };
}

async function runEndpoint(name, path, runs = RUNS_PER_ENDPOINT) {
  const durations = [];
  let errors = 0;
  // One warm-up request
  await timedFetch(`${BASE_URL}${path}`);
  await sleep(100);

  for (let i = 0; i < runs; i++) {
    const r = await timedFetch(`${BASE_URL}${path}`);
    if (!r.ok) errors++;
    durations.push(r.durationMs);
    await sleep(25);
  }
  const s = stats(durations);
  return { name, path, ...s, errors };
}

async function main() {
  const endpoints = [
    { name: 'Dev Games (scores-like)', path: '/api/dev/games' },
    { name: 'Updates (news feed)', path: '/api/updates?pageSize=50' },
    { name: 'Experiences (content list)', path: '/api/experiences?pageSize=50' },
  ];

  const results = [];
  for (const ep of endpoints) {
    const r = await runEndpoint(ep.name, ep.path);
    results.push(r);
  }

  const summary = {
    baseUrl: BASE_URL,
    runsPerEndpoint: RUNS_PER_ENDPOINT,
    timestamp: new Date().toISOString(),
    results,
  };

  // Write a machine-friendly file for later ingestion if desired
  try {
    fs.mkdirSync('tmp', { recursive: true });
    fs.writeFileSync('tmp/http_benchmarks.json', JSON.stringify(summary, null, 2));
  } catch {}

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error('Benchmark harness failed:', e);
  process.exit(1);
});