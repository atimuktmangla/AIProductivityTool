import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { syncRouter } from '../../WEB/routes/syncRouter.js';
import { errorHandler } from '../../WEB/middleware/errorHandler.js';

// ── Mock metricsSync module ──────────────────────────────────────────────────

vi.mock('../../jobs/metricsSync.js', () => ({
  getSyncStatus:      vi.fn(() => ({ running: false, lastRunAt: null, nextRunAt: null })),
  triggerSyncForUsers: vi.fn(),
  rescheduleInterval: vi.fn(),
  listRunLogs:        vi.fn(async () => []),
  purgeRunLogs:       vi.fn(async () => undefined),
}));

// ── Mock jsonFileCache so no disk I/O ────────────────────────────────────────

vi.mock('../../DB/cache/jsonFileCache.js', () => ({
  readJsonCache:  vi.fn(async () => null),
  writeJsonCache: vi.fn(async () => undefined),
}));

// ── Mock env ─────────────────────────────────────────────────────────────────

vi.mock('../../BL/config/env.js', () => ({
  getConfig: () => ({
    syncDeveloperIds:    [],
    syncIntervalMinutes: 0,
  }),
}));

import { purgeRunLogs, listRunLogs, triggerSyncForUsers } from '../../jobs/metricsSync.js';

const mockedPurge   = vi.mocked(purgeRunLogs);
const mockedList    = vi.mocked(listRunLogs);
const mockedTrigger = vi.mocked(triggerSyncForUsers);

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard/sync', syncRouter);
  app.use(errorHandler);
  return app;
}

async function req(
  method: 'get' | 'post' | 'delete',
  path: string,
  body?: unknown,
) {
  const { default: supertest } = await import('supertest');
  const r = supertest(buildApp())[method](path);
  if (body) r.send(body).set('Content-Type', 'application/json');
  return r;
}

describe('syncRouter', () => {
  beforeEach(() => vi.clearAllMocks());

  // @req REQ-4.8.5-1
  it('DELETE /logs → 204 and calls purgeRunLogs', async () => {
    const res = await req('delete', '/api/dashboard/sync/logs');
    expect(res.status).toBe(204);
    expect(mockedPurge).toHaveBeenCalledOnce();
  });

  // @req REQ-4.8.4-1 REQ-4.8.4-2
  it('GET /logs returns array (up to 50) from listRunLogs', async () => {
    const fakeLogs = [
      {
        runId: '2026-06-01-10-00-00',
        startedAt: '2026-06-01T10:00:00.000Z',
        finishedAt: '2026-06-01T10:05:00.000Z',
        durationMs: 300_000,
        totalUsers: 5,
        batches: [
          {
            batchIndex: 0, userIds: ['alice'],
            startedAt: '2026-06-01T10:00:00.000Z',
            finishedAt: '2026-06-01T10:05:00.000Z',
            durationMs: 300_000, status: 'ok',
          },
        ],
      },
    ];
    mockedList.mockResolvedValueOnce(fakeLogs as Awaited<ReturnType<typeof listRunLogs>>);
    const res = await req('get', '/api/dashboard/sync/logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBe(1);
    expect(mockedList).toHaveBeenCalledWith(50);
  });

  // @req REQ-4.8.4-1
  it('GET /logs returns empty array when no logs exist', async () => {
    const res = await req('get', '/api/dashboard/sync/logs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  // @req REQ-4.8.1-1
  it('POST /trigger with valid developerIds → 202 and calls triggerSyncForUsers', async () => {
    const res = await req('post', '/api/dashboard/sync/trigger', { developerIds: ['alice', 'bob'] });
    expect(res.status).toBe(202);
    expect((res.body as { queued?: boolean }).queued).toBe(true);
    expect(mockedTrigger).toHaveBeenCalledWith(['alice', 'bob']);
  });

  // @req REQ-4.8.1-1
  it('POST /trigger with empty developerIds → 400', async () => {
    const res = await req('post', '/api/dashboard/sync/trigger', { developerIds: [] });
    expect(res.status).toBe(400);
    expect(mockedTrigger).not.toHaveBeenCalled();
  });

  // @req REQ-4.8.3-1
  it('POST /config saves valid schedule config → 200 with saved body', async () => {
    const { writeJsonCache } = await import('../../DB/cache/jsonFileCache.js');
    const body = { developerIds: ['alice'], intervalMinutes: 1440 };
    const res = await req('post', '/api/dashboard/sync/config', body);
    expect(res.status).toBe(200);
    expect((res.body as { intervalMinutes?: number }).intervalMinutes).toBe(1440);
    expect(vi.mocked(writeJsonCache)).toHaveBeenCalled();
  });

  // @req REQ-4.8.3-1
  it('POST /config with invalid intervalMinutes → 400', async () => {
    const res = await req('post', '/api/dashboard/sync/config', {
      developerIds: ['alice'],
      intervalMinutes: 999,
    });
    expect(res.status).toBe(400);
  });
});
