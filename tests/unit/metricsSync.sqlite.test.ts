import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initAppStore, _resetForTesting } from '../../databaselayer/store/appStore.js';

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({
    syncDeveloperIds:    ['alice'],
    syncIntervalMinutes: 1440,
  }),
}));

vi.mock('../../databaselayer/cache/jsonFileCache.js', () => ({
  readJsonCache:  vi.fn().mockResolvedValue(null),
  writeJsonCache: vi.fn().mockResolvedValue(undefined),
  removeCacheDir: vi.fn().mockResolvedValue(undefined),
}));

// Import after store is set up so the module-level imports resolve correctly
let writeRunLog: (log: import('../../jobs/metricsSync.js').SyncRunLog) => Promise<void>;
let listRunLogs: (maxCount?: number) => Promise<import('../../jobs/metricsSync.js').SyncRunLog[]>;
let purgeRunLogs: () => Promise<void>;
let startMetricsSyncJob: () => Promise<void>;

function makeBatch(i: number): import('../../jobs/metricsSync.js').SyncBatchLog {
  return {
    batchIndex:  i,
    userIds:     [`user${i}`],
    startedAt:   new Date(1_000_000 + i * 1000).toISOString(),
    finishedAt:  new Date(1_001_000 + i * 1000).toISOString(),
    durationMs:  1000,
    status:      'ok',
  };
}

function makeRun(id: string, startOffset = 0): import('../../jobs/metricsSync.js').SyncRunLog {
  return {
    runId:      id,
    startedAt:  new Date(1_000_000 + startOffset).toISOString(),
    finishedAt: new Date(1_005_000 + startOffset).toISOString(),
    durationMs: 5000,
    totalUsers: 1,
    batches:    [makeBatch(0)],
  };
}

describe('metricsSync run logs (SQLite)', () => {
  beforeEach(async () => {
    _resetForTesting();
    initAppStore(':memory:');
    // Dynamic import so the module uses the freshly initialised store
    const mod = await import('../../jobs/metricsSync.js');
    writeRunLog        = mod.writeRunLog as typeof writeRunLog;
    listRunLogs        = mod.listRunLogs;
    purgeRunLogs       = mod.purgeRunLogs;
    startMetricsSyncJob = mod.startMetricsSyncJob;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // @req REQ-4.12-3
  it('writeRunLog stores a run and listRunLogs retrieves it', async () => {
    const run = makeRun('2026-06-01-10-00-00');
    await writeRunLog(run);

    const logs = await listRunLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].runId).toBe('2026-06-01-10-00-00');
    expect(logs[0].totalUsers).toBe(1);
    expect(logs[0].batches).toHaveLength(1);
    expect(logs[0].batches[0].batchIndex).toBe(0);
  });

  // @req REQ-4.12-3
  it('listRunLogs returns newest first (ordered by started_at DESC)', async () => {
    await writeRunLog(makeRun('2026-06-01-08-00-00', 0));
    await writeRunLog(makeRun('2026-06-01-10-00-00', 7_200_000));
    await writeRunLog(makeRun('2026-06-01-09-00-00', 3_600_000));

    const logs = await listRunLogs();
    expect(logs[0].runId).toBe('2026-06-01-10-00-00');
    expect(logs[1].runId).toBe('2026-06-01-09-00-00');
    expect(logs[2].runId).toBe('2026-06-01-08-00-00');
  });

  // @req REQ-4.12-3
  it('listRunLogs honours maxCount', async () => {
    for (let i = 0; i < 5; i++) {
      await writeRunLog(makeRun(`2026-06-01-0${i}-00-00`, i * 3_600_000));
    }
    const logs = await listRunLogs(2);
    expect(logs).toHaveLength(2);
  });

  // @req REQ-4.12-3
  it('purgeRunLogs clears all rows', async () => {
    await writeRunLog(makeRun('2026-06-01-10-00-00'));
    await writeRunLog(makeRun('2026-06-01-11-00-00', 3_600_000));

    await purgeRunLogs();

    const logs = await listRunLogs();
    expect(logs).toHaveLength(0);
  });

  // @req REQ-4.12-3
  it('no JSON files are written to data/sync-logs/', async () => {
    const { existsSync } = await import('node:fs');
    await writeRunLog(makeRun('2026-06-01-10-00-00'));
    // Directory may exist from prior runs but must contain no .json files
    const { readdirSync } = await import('node:fs');
    const jsonFiles = existsSync('data/sync-logs')
      ? readdirSync('data/sync-logs').filter((f) => f.endsWith('.json'))
      : [];
    expect(jsonFiles).toHaveLength(0);
  });

  // @req REQ-4.8.1-1
  it('startMetricsSyncJob schedules the 5-second warm-up setTimeout when a schedule is configured', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    // readJsonCache mock (hoisted above) returns { developerIds: ['alice'], intervalMinutes: 1440 }
    await startMetricsSyncJob();

    const warmUpCall = setTimeoutSpy.mock.calls.find(
      (args) => typeof args[1] === 'number' && args[1] === 5_000,
    );
    expect(warmUpCall).toBeDefined();
  });
});
