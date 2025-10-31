/*
 Reads tmp/http_benchmarks.json and updates docs/perf/DB_BENCHMARKS.md
 with a rendered table of results.

 Usage:
   node scripts/benchmarks/formatHttpBenchmarks.js
*/

const fs = require('fs');
const path = require('path');

function renderTable(results) {
  const header = '| Endpoint | p50 (ms) | p95 (ms) | avg (ms) | errors |\n|---|---:|---:|---:|---:|';
  const rows = results.map(r => `| ${r.name} | ${r.p50Ms.toFixed(1)} | ${r.p95Ms.toFixed(1)} | ${r.avgMs.toFixed(1)} | ${r.errors} |`).join('\n');
  return `${header}\n${rows}`;
}

function renderDoc(summary) {
  const { baseUrl, runsPerEndpoint, timestamp, results } = summary;
  return `# Database-Backed Endpoint Benchmarks\n\n- Environment: \`BASE_URL\`=\`${baseUrl}\`\n- Harness: \`scripts/benchmarks/httpBenchmarks.js\`\n- Runs per endpoint: \`${runsPerEndpoint}\`\n- Timestamp: ${timestamp}\n\n## Results Summary\n\n${renderTable(results)}\n\n## How to Run\n\n- Ensure the dev server is running on \`5003\`.\n- Run: \`BASE_URL=${baseUrl} node scripts/benchmarks/httpBenchmarks.js\`\n- Re-render: \`node scripts/benchmarks/formatHttpBenchmarks.js\`\n\n## Notes\n\n- Dev Games endpoint represents a heavy query path: reads all teams then fetches games by team IDs.\n- Updates and Experiences reflect common feed queries with broader coverage.\n- Slow query logs and Prometheus metrics (\`dbQueryLatencyMs\`) complement these measurements for deeper analysis.\n`;
}

function main() {
  const input = path.join('tmp', 'http_benchmarks.json');
  const output = path.join('docs', 'perf', 'DB_BENCHMARKS.md');
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}. Run the benchmark harness first.`);
    process.exit(1);
  }
  const summary = JSON.parse(fs.readFileSync(input, 'utf-8'));
  const doc = renderDoc(summary);
  fs.writeFileSync(output, doc);
  console.log(`Updated ${output} from ${input}`);
}

main();