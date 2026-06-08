import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { initInMemoryDb, _resetForTesting } from '../../databaselayer/store/inMemoryDb.js';

// Hoist mocks so vi.mocked() works on these after dynamic imports
const readJsonCacheMock = vi.fn();

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({
    apiKey: 'test-key',
    allowedOrigin: 'http://localhost:5173',
    syncDeveloperIds: [],
    syncIntervalMinutes: 0,
  }),
}));

vi.mock('../../databaselayer/cache/jsonFileCache.js', () => ({
  readJsonCache:  readJsonCacheMock,
  writeJsonCache: vi.fn().mockResolvedValue(undefined),
  removeCacheDir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../backend/metrics/aggregator.js', () => ({
  aggregateMetrics: vi.fn(),
}));

describe('GET /sync/cache-coverage (REQ-002-FR-005)', () => {
  let app: express.Express;

  beforeEach(async () => {
    _resetForTesting();
    readJsonCacheMock.mockReset();
    vi.resetModules();

    // Re-init after resetModules so all dynamically imported modules share
    // the same freshly-initialised singleton instance.
    const { initInMemoryDb: reinit } = await import('../../databaselayer/store/inMemoryDb.js');
    reinit();

    const { syncRouter } = await import('../../api/routes/syncRouter.js');
    app = express();
    app.use(express.json());
    app.use('/sync', syncRouter);
  });

  // @req REQ-002-FR-005
  it('returns all-zero counts when sync-config.json is absent', async () => {
    readJsonCacheMock.mockResolvedValue(null);

    const res = await request(app)
      .get('/sync/cache-coverage')
      .set('X-Api-Key', 'test-key');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      configuredUsers: 0,
      cachedUsers: 0,
      uncachedUsers: [],
      staleUsers: [],
    });
  });

  // @req REQ-002-FR-005
  it('returns correct hit/miss counts when some users are cached', async () => {
    readJsonCacheMock.mockResolvedValue({
      developerIds: ['alice', 'bob', 'carol'],
      intervalMinutes: 1440,
    });

    // Pre-populate cache for alice only
    const { setCachedMetrics } = await import('../../databaselayer/cache/metricsCache.js');
    const end   = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    await setCachedMetrics(
      ['alice'],
      start.toISOString().slice(0, 10),
      end.toISOString().slice(0, 10),
      [{
        developerId: 'alice', name: 'alice', totalCommits: 1, totalPRs: 1,
        linesChanged: { added: 1, deleted: 0 }, cycleTimeHrs: 1, pickupDelayHrs: 1,
        reviewLifecycleHrs: 1, reviewDepth: 1, avgPrSizeLines: 1,
        openPrsOverThreshold: 0, prsReviewed: 0,
        workType: { features: 1, bugs: 0, infraOrDebt: 0 },
        codeQuality: { score: 80, bugRatio: 0, criticalScore: null, approvalScore: null, prFocusScore: null, reworkRate: 0 },
        prs: [],
      }],
    );

    const res = await request(app)
      .get('/sync/cache-coverage')
      .set('X-Api-Key', 'test-key');

    expect(res.status).toBe(200);
    expect(res.body.configuredUsers).toBe(3);
    expect(res.body.cachedUsers).toBe(1);
    expect(res.body.uncachedUsers).toContain('bob');
    expect(res.body.uncachedUsers).toContain('carol');
    expect(res.body.uncachedUsers).not.toContain('alice');
    expect(res.body.staleUsers).toHaveLength(0);
  });
});
