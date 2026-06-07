import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { getConfig } from './BL/config/env.js';
import { metricsRouter } from './WEB/routes/metricsRouter.js';
import { syncRouter } from './WEB/routes/syncRouter.js';
import { errorHandler } from './WEB/middleware/errorHandler.js';
import { requestId } from './WEB/hooks/requestId.js';
import { requestLogger } from './WEB/hooks/requestLogger.js';
import { apiRateLimiter } from './WEB/guardrails/rateLimiter.js';
import { apiKeyAuth } from './WEB/middleware/apiKeyAuth.js';
import { pingJira } from './DB/services/jiraService.js';
import { pingBitbucket } from './DB/services/bitbucketService.js';
import { evictOldCacheMonths } from './DB/cache/cacheEviction.js';
import { startMetricsSyncJob } from './jobs/metricsSync.js';
import { initInMemoryDb } from './DB/store/inMemoryDb.js';
import { runMigrationCleanup } from './DB/store/migrationCleanup.js';

const config = getConfig();

// Fail fast if the in-memory store cannot be initialised (REQ-4.12-1 / SC-007)
try {
  initInMemoryDb();
} catch (err) {
  console.error('[store] failed to initialise in-memory database:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.allowedOrigin, credentials: false }));

// ── Hooks (run first on every request) ────────────────────────────────────────
app.use(requestId);
app.use(requestLogger);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '64kb' }));

// ── Guardrails ────────────────────────────────────────────────────────────────
app.use('/api', apiKeyAuth);
app.use('/api', apiRateLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    await Promise.all([pingJira(), pingBitbucket()]);
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', detail: String(err) });
  }
});

app.use('/api/dashboard', metricsRouter);
app.use('/api/dashboard/sync', syncRouter);

// ── Error handler (must be last) ──────────────────────────────────────────────
app.use(errorHandler);

evictOldCacheMonths(config.cacheDir, config.cacheRetentionMonths).catch((err) => {
  console.warn('[cache] eviction failed on startup:', err);
});

runMigrationCleanup().catch((err) => {
  console.warn('[migration] cleanup error on startup:', err);
});

startMetricsSyncJob().catch((err) => {
  console.warn('[sync] failed to start sync job:', err);
});

const server = app.listen(config.port, () => {
  console.log(`AIProductivityTool listening on port ${config.port}`);
  console.log(`  GET  /health`);
  console.log(`  GET  /ready`);
  console.log(`  GET  /api/dashboard/users`);
  console.log(`  POST /api/dashboard/metrics`);
  console.log(`  POST /api/dashboard/insights  (AI skill)`);
});

process.on('SIGINT', () => {
  console.log('Shutting down…');
  server.close(() => process.exit(0));
});
