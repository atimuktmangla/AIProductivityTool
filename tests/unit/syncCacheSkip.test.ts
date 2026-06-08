import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { initInMemoryDb, _resetForTesting } from '../../DB/store/inMemoryDb.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock('../../BL/config/env.js', () => ({
  getConfig: () => ({ syncDeveloperIds: [], syncIntervalMinutes: 0 }),
}));

vi.mock('../../DB/cache/jsonFileCache.js', () => ({
  readJsonCache:  vi.fn().mockResolvedValue(null),
  writeJsonCache: vi.fn().mockResolvedValue(undefined),
  removeCacheDir: vi.fn().mockResolvedValue(undefined),
}));

const aggregateMetricsMock = vi.fn();
vi.mock('../../BL/metrics/aggregator.js', () => ({
  aggregateMetrics: (...args: unknown[]) => aggregateMetricsMock(...args),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMetric(developerId: string): AggregatedDeveloperMetric {
  return {
    developerId,
    name: developerId,
    totalCommits: 1, totalPRs: 1,
    linesChanged: { added: 10, deleted: 5 },
    cycleTimeHrs: 1, pickupDelayHrs: 1, reviewLifecycleHrs: 1,
    reviewDepth: 1, avgPrSizeLines: 15, openPrsOverThreshold: 0, prsReviewed: 0,
    workType: { features: 1, bugs: 0, infraOrDebt: 0 },
    codeQuality: { score: 80, bugRatio: 0, criticalScore: null, approvalScore: null, prFocusScore: null, reworkRate: 0 },
    prs: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runSync cache-skip behaviour (REQ-002-FR-003, REQ-002-FR-004)', () => {
  beforeEach(() => {
    _resetForTesting();
    initInMemoryDb();
    aggregateMetricsMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // @req REQ-002-FR-003
  it('fresh cache hit skips aggregateMetrics call entirely', async () => {
    const { setCachedMetrics } = await import('../../DB/cache/metricsCache.js');
    const { triggerSyncForUsers, getSyncStatus } = await import('../../jobs/metricsSync.js');

    const end   = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const startDate = start.toISOString().slice(0, 10);
    const endDate   = end.toISOString().slice(0, 10);

    // Pre-populate fresh cache entry for 'alice'
    await setCachedMetrics(['alice'], startDate, endDate, [makeMetric('alice')]);

    aggregateMetricsMock.mockResolvedValue({ current: [makeMetric('alice')] });

    triggerSyncForUsers(['alice']);

    // Allow the fire-and-forget Promise to settle
    await new Promise((r) => setTimeout(r, 50));

    // aggregateMetrics must NOT have been called — alice was served from cache
    expect(aggregateMetricsMock).not.toHaveBeenCalled();
    expect(getSyncStatus().completedUsers).toContain('alice');
  });

  // @req REQ-002-FR-003
  it('stale or absent cache entry triggers aggregateMetrics call', async () => {
    const { triggerSyncForUsers, getSyncStatus } = await import('../../jobs/metricsSync.js');

    // No cache entry for 'bob' — aggregateMetrics must be called
    aggregateMetricsMock.mockResolvedValue({ current: [makeMetric('bob')] });

    triggerSyncForUsers(['bob']);
    await new Promise((r) => setTimeout(r, 100));

    expect(aggregateMetricsMock).toHaveBeenCalledOnce();
    expect(getSyncStatus().completedUsers).toContain('bob');
  });

  // @req REQ-002-FR-004
  it('batch log records source: cache for a cache-hit user', async () => {
    const { setCachedMetrics } = await import('../../DB/cache/metricsCache.js');
    const { triggerSyncForUsers, listRunLogs } = await import('../../jobs/metricsSync.js');

    const end   = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 90);
    const startDate = start.toISOString().slice(0, 10);
    const endDate   = end.toISOString().slice(0, 10);

    await setCachedMetrics(['carol'], startDate, endDate, [makeMetric('carol')]);
    aggregateMetricsMock.mockResolvedValue({ current: [] });

    triggerSyncForUsers(['carol']);
    await new Promise((r) => setTimeout(r, 100));

    const logs = await listRunLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].batches[0].source).toBe('cache');
  });

  // @req REQ-002-FR-004
  it('batch log records source: live for a cache-miss user', async () => {
    const { triggerSyncForUsers, listRunLogs } = await import('../../jobs/metricsSync.js');

    // No cache for 'dave'
    aggregateMetricsMock.mockResolvedValue({ current: [makeMetric('dave')] });

    triggerSyncForUsers(['dave']);
    await new Promise((r) => setTimeout(r, 100));

    const logs = await listRunLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].batches[0].source).toBe('live');
  });
});
