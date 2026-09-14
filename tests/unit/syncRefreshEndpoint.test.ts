import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const readJsonCacheMock = vi.fn();
const triggerRefreshMock = vi.fn();

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({
    apiKey: 'test-key',
    allowedOrigin: 'http://localhost:5173',
    syncDeveloperIds: [],
    syncIntervalMinutes: 0,
  }),
}));

vi.mock('../../databaselayer/cache/jsonFileCache.js', () => ({
  readJsonCache: readJsonCacheMock,
  writeJsonCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../jobs/metricsSync.js', () => ({
  getSyncStatus: vi.fn(() => ({ running: false })),
  triggerSyncForUsers: vi.fn(),
  triggerRefreshForUsers: triggerRefreshMock,
  cancelSync: vi.fn(),
  rescheduleInterval: vi.fn(),
  listRunLogs: vi.fn(async () => []),
  purgeRunLogs: vi.fn(async () => undefined),
  dateRange: vi.fn(() => ({ startDate: '2026-03-01', endDate: '2026-06-10' })),
  METRICS_SQLITE_TTL_MS: 0,
}));

describe('POST /sync/refresh (REQ-004-FR-009)', () => {
  let app: express.Express;

  beforeEach(async () => {
    readJsonCacheMock.mockReset();
    triggerRefreshMock.mockReset();
    vi.resetModules();

    const { syncRouter } = await import('../../api/routes/syncRouter.js');
    app = express();
    app.use(express.json());
    app.use('/sync', syncRouter);
  });

  // @req REQ-004-FR-009
  it('returns 202 and queues current-month refresh for configured users', async () => {
    readJsonCacheMock.mockResolvedValue({
      developerIds: ['alice', 'bob'],
      intervalMinutes: 1440,
    });

    const res = await request(app)
      .post('/sync/refresh')
      .set('X-Api-Key', 'test-key')
      .send({});

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: 2, scope: 'current-month' });
    expect(triggerRefreshMock).toHaveBeenCalledWith(['alice', 'bob'], 'current-month');
  });

  // @req REQ-004-FR-009
  it('accepts full scope and explicit developerIds', async () => {
    const res = await request(app)
      .post('/sync/refresh')
      .set('X-Api-Key', 'test-key')
      .send({ developerIds: ['carol'], scope: 'full' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: 1, scope: 'full' });
    expect(triggerRefreshMock).toHaveBeenCalledWith(['carol'], 'full');
  });

  // @req REQ-004-FR-009
  it('returns 400 when no users configured', async () => {
    readJsonCacheMock.mockResolvedValue(null);

    const res = await request(app)
      .post('/sync/refresh')
      .set('X-Api-Key', 'test-key')
      .send({});

    expect(res.status).toBe(400);
    expect(triggerRefreshMock).not.toHaveBeenCalled();
  });
});
