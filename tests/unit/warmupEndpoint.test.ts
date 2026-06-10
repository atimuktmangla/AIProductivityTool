import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { _resetForTesting } from '../../databaselayer/store/appStore.js';

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

describe('POST /sync/warmup (REQ-002-FR-006)', () => {
  let app: express.Express;

  beforeEach(async () => {
    _resetForTesting();
    readJsonCacheMock.mockReset();
    vi.resetModules();

    const { initAppStore: reinit } = await import('../../databaselayer/store/appStore.js');
    reinit(':memory:');

    const { syncRouter } = await import('../../api/routes/syncRouter.js');
    app = express();
    app.use(express.json());
    app.use('/sync', syncRouter);
  });

  // @req REQ-002-FR-006
  it('returns 400 when no sync-config.json is present', async () => {
    readJsonCacheMock.mockResolvedValue(null);

    const res = await request(app)
      .post('/sync/warmup')
      .set('X-Api-Key', 'test-key');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no users configured/i);
  });

  // @req REQ-002-FR-006
  it('returns 200 with queued:0 when all users are already cached', async () => {
    readJsonCacheMock.mockResolvedValue({
      developerIds: ['alice'],
      intervalMinutes: 1440,
    });

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
      .post('/sync/warmup')
      .set('X-Api-Key', 'test-key');

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.queued).toBe(0);
    expect(res.body.queuedUsers).toEqual([]);
  });

  // @req REQ-002-FR-006
  it('returns 202 and queues only cache-miss users', async () => {
    readJsonCacheMock.mockResolvedValue({
      developerIds: ['alice', 'bob'],
      intervalMinutes: 1440,
    });

    // Cache only alice
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
      .post('/sync/warmup')
      .set('X-Api-Key', 'test-key');

    expect(res.status).toBe(202);
    expect(res.body.skipped).toBe(1);
    expect(res.body.queued).toBe(1);
    expect(res.body.queuedUsers).toEqual(['bob']);
  });

  // @req REQ-002-FR-006 REQ-004-FR-010
  it('accepts explicit developerIds in body without sync-config', async () => {
    readJsonCacheMock.mockResolvedValue(null);

    const res = await request(app)
      .post('/sync/warmup')
      .set('X-Api-Key', 'test-key')
      .send({ developerIds: ['carol', 'dave'] });

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(2);
    expect(res.body.queuedUsers).toEqual(['carol', 'dave']);
    expect(res.body.skipped).toBe(0);
  });

  // @req REQ-002-FR-006
  it('returns 409 when a sync is already running', async () => {
    readJsonCacheMock.mockResolvedValue({
      developerIds: ['alice'],
      intervalMinutes: 1440,
    });

    // Patch getSyncStatus on the module to return running=true
    const syncMod = await import('../../jobs/metricsSync.js');
    vi.spyOn(syncMod, 'getSyncStatus').mockReturnValue({
      running: true,
      lastRunAt: null, nextRunAt: null, runStartedAt: null,
      activeUsers: ['alice'], completedUsers: [], failedUsers: [],
      totalSyncUsers: 1, configuredUsers: ['alice'],
      intervalMinutes: 0, scheduledTime: '',
    });

    const res = await request(app)
      .post('/sync/warmup')
      .set('X-Api-Key', 'test-key');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already running/i);
  });
});
