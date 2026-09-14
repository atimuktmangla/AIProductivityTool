import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import { metricsRouter } from '../../api/routes/metricsRouter.js';
import { syncRouter } from '../../api/routes/syncRouter.js';
import { errorHandler } from '../../api/middleware/errorHandler.js';
import { apiKeyAuth } from '../../api/middleware/apiKeyAuth.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({
    apiKey: 'test-key',
    syncDeveloperIds: [],
    syncIntervalMinutes: 0,
    appStorePath: ':memory:',
    metricsConcurrency: 2,
    httpConcurrency: 4,
    httpTimeoutMs: 5000,
    repoConcurrency: 2,
    cacheDir: 'data/cache',
    cacheRetentionMonths: 6,
    jiraBaseUrl: 'http://jira.local',
    jiraToken: 'tok',
    bitbucketBaseUrl: 'http://bb.local',
    bitbucketToken: 'tok',
    allowedOrigin: '*',
    botUserPattern: 'bot',
    stalePrThresholdDays: 3,
    repoTargets: [],
    bitbucketProjectKeys: [],
    aiInsightsEnabled: false,
    aiProvider: 'anthropic',
    aiApiKey: '',
  }),
}));

vi.mock('../../databaselayer/client/atlassianFetch.js', () => ({
  atlassianGet: vi.fn().mockResolvedValue({ values: [], isLastPage: true, size: 0, limit: 100, start: 0 }),
  atlassianPost: vi.fn().mockResolvedValue({ issues: [], total: 0, startAt: 0, maxResults: 0 }),
}));

vi.mock('../../databaselayer/cache/jsonFileCache.js', () => ({
  readJsonCache: vi.fn().mockResolvedValue(null),
  writeJsonCache: vi.fn().mockResolvedValue(undefined),
  removeCacheDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../databaselayer/store/appStore.js', () => ({
  initAppStore: vi.fn(),
  getDb: vi.fn(() => ({
    prepare: () => ({ all: () => [], get: () => undefined, run: () => ({ changes: 0 }) }),
  })),
  _resetForTesting: vi.fn(),
}));

vi.mock('../../backend/config/cacheTtl.js', () => ({
  METRICS_SQLITE_TTL_MS: 86_400_000,
  METRICS_CACHE_TTL_MS: 86_400_000,
}));

vi.mock('../../jobs/metricsSync.js', () => ({
  getSyncStatus: vi.fn(() => ({ running: false, lastRunAt: null, nextRunAt: null, runStartedAt: null, activeUsers: [], completedUsers: [], failedUsers: [], totalSyncUsers: 0, configuredUsers: [], intervalMinutes: 0, scheduledTime: '' })),
  triggerSyncForUsers: vi.fn(),
  triggerRefreshForUsers: vi.fn(),
  cancelSync: vi.fn(),
  rescheduleInterval: vi.fn(),
  listRunLogs: vi.fn(async () => []),
  purgeRunLogs: vi.fn(async () => undefined),
  dateRange: vi.fn(() => ({ startDate: '2024-01-01', endDate: '2024-01-31' })),
  METRICS_SQLITE_TTL_MS: 86_400_000,
}));

vi.mock('../../databaselayer/cache/metricsCache.js', () => ({
  getCachedMetrics: vi.fn(async () => ({ hits: [], misses: ['alice'], gapRefresh: [], oldestCachedAt: null })),
  setCachedMetrics: vi.fn(async () => undefined),
  purgeCachedMetrics: vi.fn(),
  markCurrentMonthStale: vi.fn(),
}));

vi.mock('../../backend/metrics/cacheResolution.js', () => ({
  resolveMetricsFromCache: vi.fn(async () => ({ metrics: [], cacheStatus: 'none', oldestCachedAt: null })),
}));

vi.mock('../../backend/metrics/aggregator.js', () => ({
  aggregateMetrics: vi.fn(async () => ({ current: [], cacheStatus: 'none' })),
}));

vi.mock('../../backend/evals/metricsValidator.js', () => ({
  validateMetrics: vi.fn(),
}));

vi.mock('../../databaselayer/services/bitbucketService.js', () => ({
  getAllUsers: vi.fn(async () => []),
  getAllProjectKeys: vi.fn(async () => ['SS', 'CORE']),
  getReposInProjectPublic: vi.fn(async () => []),
  getReposForProjects: vi.fn(async () => []),
  pingBitbucket: vi.fn(async () => true),
}));

vi.mock('../../databaselayer/services/jiraService.js', () => ({
  pingJira: vi.fn(async () => true),
  probeConnectorAvailability: vi.fn(async () => true),
  getIssueLinkingStatus: vi.fn(() => 'hybrid'),
}));

vi.mock('../../AI/skills/insightsSummary.js', () => ({
  generateInsightsSummary: vi.fn(async () => null),
}));

// ── App factory ───────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', apiKeyAuth);
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api/dashboard', metricsRouter);
  app.use('/api/dashboard/sync', syncRouter);
  app.use(errorHandler);
  return app;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function get(path: string, withAuth = true) {
  const { default: supertest } = await import('supertest');
  const r = supertest(buildApp()).get(path);
  if (withAuth) r.set('X-Api-Key', 'test-key');
  return r;
}

async function post(path: string, body: unknown, withAuth = true) {
  const { default: supertest } = await import('supertest');
  const r = supertest(buildApp()).post(path).send(body).set('Content-Type', 'application/json');
  if (withAuth) r.set('X-Api-Key', 'test-key');
  return r;
}

async function del(path: string, withAuth = true) {
  const { default: supertest } = await import('supertest');
  const r = supertest(buildApp()).delete(path);
  if (withAuth) r.set('X-Api-Key', 'test-key');
  return r;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('API Smoke Tests', () => {

  describe('Authentication', () => {
    // @req REQ-4.9-6
    it('GET /api/dashboard/users without API key returns 401', async () => {
      const res = await get('/api/dashboard/users', false);
      expect(res.status).toBe(401);
    });

    // @req REQ-4.9-6
    it('GET /api/dashboard/users with valid key returns 200', async () => {
      const res = await get('/api/dashboard/users');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await get('/health', false);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/dashboard/users', () => {
    // @req REQ-4.1-1
    it('returns 200 with array', async () => {
      const res = await get('/api/dashboard/users');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/dashboard/projects', () => {
    // @req REQ-4.3-2
    it('returns 200 with project keys array', async () => {
      const res = await get('/api/dashboard/projects');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /api/dashboard/metrics', () => {
    // @req REQ-4.4-1
    it('returns 400 when payload is missing required fields', async () => {
      const res = await post('/api/dashboard/metrics', {});
      expect(res.status).toBe(400);
    });

    // @req REQ-4.4-1
    it('returns 200 with valid payload', async () => {
      const res = await post('/api/dashboard/metrics', {
        developerIds: ['alice'],
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Sync endpoints', () => {
    // @req REQ-4.8.1-1
    it('GET /api/dashboard/sync/status returns sync status', async () => {
      const res = await get('/api/dashboard/sync/status');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('running');
    });

    // @req REQ-4.8.1-1
    it('POST /api/dashboard/sync/trigger with valid body returns 202', async () => {
      const res = await post('/api/dashboard/sync/trigger', { developerIds: ['alice'] });
      expect(res.status).toBe(202);
    });

    // @req REQ-4.8.1-1
    it('POST /api/dashboard/sync/trigger with empty developerIds returns 400', async () => {
      const res = await post('/api/dashboard/sync/trigger', { developerIds: [] });
      expect(res.status).toBe(400);
    });

    // @req REQ-4.8.4-1
    it('GET /api/dashboard/sync/logs returns array', async () => {
      const res = await get('/api/dashboard/sync/logs');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    // @req REQ-4.8.5-1
    it('DELETE /api/dashboard/sync/logs returns 204', async () => {
      const res = await del('/api/dashboard/sync/logs');
      expect(res.status).toBe(204);
    });

    // @req REQ-4.8.3-1
    it('GET /api/dashboard/sync/config returns config object', async () => {
      const res = await get('/api/dashboard/sync/config');
      expect(res.status).toBe(200);
    });

    // @req REQ-4.8.3-1
    it('POST /api/dashboard/sync/config with valid body returns 200', async () => {
      const res = await post('/api/dashboard/sync/config', {
        developerIds: ['alice'],
        intervalMinutes: 1440,
      });
      expect(res.status).toBe(200);
    });
  });
});
