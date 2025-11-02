import client, { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { config } from './config';

// Dedicated registry to avoid default global pollution
const register = new Registry();
client.collectDefaultMetrics({ register, prefix: 'app_' });

// Buckets tuned for ms latencies typical of local/dev environments
const LATENCY_BUCKETS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

// Metrics definitions
const dbQueryLatencyMs = new Histogram({
  name: 'db_query_latency_ms',
  help: 'Latency of database queries in milliseconds',
  labelNames: ['operation', 'table'],
  buckets: LATENCY_BUCKETS,
  registers: [register],
});

const dbRowsReturned = new Counter({
  name: 'db_rows_returned_total',
  help: 'Total rows returned by DB queries',
  labelNames: ['operation', 'table'],
  registers: [register],
});

const scoresAgentRunDurationMs = new Histogram({
  name: 'scores_agent_run_duration_ms',
  help: 'Duration of ScoresAgent runOnce executions in ms',
  labelNames: ['sport', 'mode'],
  buckets: LATENCY_BUCKETS,
  registers: [register],
});

// Use counters for hits/misses and expose hit rate via a gauge convenience
const cacheHitsTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['group'],
  registers: [register],
});

const cacheMissesTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['group'],
  registers: [register],
});

const cacheHitRate = new Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate (0-1)',
  labelNames: ['group'],
  registers: [register],
});

const validationErrorsTotal = new Counter({
  name: 'validation_errors_total',
  help: 'Total validation errors by sport',
  labelNames: ['sport'],
  registers: [register],
});

const jobExecutionDurationMs = new Histogram({
  name: 'job_execution_duration_ms',
  help: 'Duration of background job executions in ms',
  labelNames: ['job'],
  buckets: LATENCY_BUCKETS,
  registers: [register],
});

const jobFailuresTotal = new Counter({
  name: 'job_failures_total',
  help: 'Total background job failures',
  labelNames: ['job'],
  registers: [register],
});

// Error monitoring metrics
const userTeamScoresErrorsTotal = new Counter({
  name: 'user_team_scores_errors_total',
  help: 'Total errors in user team scores feature',
  labelNames: ['error_code', 'error_type', 'severity', 'operation'],
  registers: [register],
});

const errorRatePerMinute = new Gauge({
  name: 'user_team_scores_error_rate_per_minute',
  help: 'Current error rate per minute for user team scores',
  labelNames: ['error_type'],
  registers: [register],
});

const criticalErrorsTotal = new Counter({
  name: 'user_team_scores_critical_errors_total',
  help: 'Total critical errors in user team scores feature',
  labelNames: ['error_type', 'operation'],
  registers: [register],
});

const alertsTriggeredTotal = new Counter({
  name: 'user_team_scores_alerts_triggered_total',
  help: 'Total alerts triggered for user team scores errors',
  labelNames: ['alert_type', 'severity'],
  registers: [register],
});

// Helpers
function observeDbQuery(operation: string, table: string, durationMs: number, rows: number) {
  try {
    dbQueryLatencyMs.labels(operation, table).observe(durationMs);
    dbRowsReturned.labels(operation, table).inc(rows);
  } catch { /* swallow to avoid impacting prod paths */ }
}

function recordCacheEvent(group: string, hit: boolean) {
  try {
    if (hit) {
      cacheHitsTotal.labels(group).inc();
    } else {
      cacheMissesTotal.labels(group).inc();
    }
    const hits = (cacheHitsTotal as any).hashMap?.[`group:${group}`]?.value ?? 0;
    const misses = (cacheMissesTotal as any).hashMap?.[`group:${group}`]?.value ?? 0;
    const rate = hits + misses > 0 ? hits / (hits + misses) : 0;
    cacheHitRate.labels(group).set(rate);
  } catch { /* no-op */ }
}

// Error monitoring helpers
function recordUserTeamScoresError(
  errorCode: string,
  errorType: string,
  severity: string,
  operation: string
) {
  userTeamScoresErrorsTotal.inc({
    error_code: errorCode,
    error_type: errorType,
    severity,
    operation
  });
  
  if (severity === 'critical' || severity === 'high') {
    criticalErrorsTotal.inc({
      error_type: errorType,
      operation
    });
  }
}

function updateErrorRate(errorType: string, rate: number) {
  errorRatePerMinute.set({ error_type: errorType }, rate);
}

function recordAlert(alertType: string, severity: string) {
  alertsTriggeredTotal.inc({
    alert_type: alertType,
    severity
  });
}

async function getMetricsContent(): Promise<string> {
  return await register.metrics();
}

export const metrics = {
  register,
  dbQueryLatencyMs,
  dbRowsReturned,
  scoresAgentRunDurationMs,
  cacheHitsTotal,
  cacheMissesTotal,
  cacheHitRate,
  validationErrorsTotal,
  jobExecutionDurationMs,
  jobFailuresTotal,
  userTeamScoresErrorsTotal,
  errorRatePerMinute,
  criticalErrorsTotal,
  alertsTriggeredTotal,
  observeDbQuery,
  recordCacheEvent,
  recordUserTeamScoresError,
  updateErrorRate,
  recordAlert,
  getMetricsContent,
} as const;