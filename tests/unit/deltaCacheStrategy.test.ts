import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initAppStore, _resetForTesting } from '../../databaselayer/store/appStore.js';
import {
  getCachedMetrics,
  setCachedMetrics,
  markCurrentMonthStale,
  purgeCachedMetrics,
} from '../../databaselayer/cache/metricsCache.js';
import { resolveMetricsFromCache } from '../../backend/metrics/cacheResolution.js';
import { mergeDeveloperMetrics } from '../../backend/metrics/metricsMerge.js';
import { formatLocalDate } from '../../backend/metrics/windowKind.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

const aggregateMetricsMock = vi.fn();
vi.mock('../../backend/metrics/aggregator.js', () => ({
  aggregateMetrics: (...args: unknown[]) => aggregateMetricsMock(...args),
}));

const getMergedPRsMock = vi.fn();
vi.mock('../../databaselayer/services/bitbucketService.js', () => ({
  getOpenPullRequestsByAuthor: vi.fn().mockResolvedValue([]),
  getMergedPRsParticipatedByUser: (...args: unknown[]) => getMergedPRsMock(...args),
}));

const searchIssuesMock = vi.fn();
vi.mock('../../databaselayer/services/jiraService.js', () => ({
  searchIssuesForDeveloper: (...args: unknown[]) => searchIssuesMock(...args),
  mergeIssuesByKey: (a: unknown[], b: unknown[]) => [...a, ...b],
}));

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({ cacheDir: 'data/cache-test' }),
}));

const readJsonMock = vi.fn();
const writeJsonMock = vi.fn();
vi.mock('../../databaselayer/cache/jsonFileCache.js', () => ({
  readJsonCache: (...args: unknown[]) => readJsonMock(...args),
  writeJsonCache: (...args: unknown[]) => writeJsonMock(...args),
}));

function rolling90(): { startDate: string; endDate: string } {
  const endDate = formatLocalDate(new Date());
  const start = new Date();
  start.setDate(start.getDate() - 89);
  return { startDate: formatLocalDate(start), endDate };
}

function makeMetric(developerId: string, totalCommits = 1): AggregatedDeveloperMetric {
  return {
    developerId,
    name: developerId,
    totalCommits,
    totalPRs: 1,
    linesChanged: { added: 1, deleted: 0 },
    cycleTimeHrs: 1,
    pickupDelayHrs: 1,
    reviewLifecycleHrs: 1,
    reviewDepth: 1,
    avgPrSizeLines: 1,
    openPrsOverThreshold: 0,
    prsReviewed: 0,
    workType: { features: 1, bugs: 0, infraOrDebt: 0 },
    codeQuality: {
      score: 80,
      bugRatio: 0,
      criticalScore: null,
      approvalScore: null,
      prFocusScore: null,
      reworkRate: 0,
    },
    prs: [],
  };
}

describe('delta cache strategy', () => {
  beforeEach(() => {
    _resetForTesting();
    initAppStore(':memory:');
    aggregateMetricsMock.mockReset();
    readJsonMock.mockReset();
    writeJsonMock.mockResolvedValue(undefined);
    getMergedPRsMock.mockReset();
    searchIssuesMock.mockReset();
  });

  // @req REQ-004-FR-001
  it('SQLite entries do not expire when maxAgeMs is 0', async () => {
    const { startDate, endDate } = rolling90();
    await setCachedMetrics(['alice'], startDate, endDate, [makeMetric('alice')]);

    const db = (await import('../../databaselayer/store/appStore.js')).getDb();
    db.prepare('UPDATE metrics_cache SET cached_at = ? WHERE developer_id = ?').run(
      Date.now() - 7 * 86_400_000,
      'alice',
    );

    const { hits, misses } = await getCachedMetrics(['alice'], startDate, endDate, 0);
    expect(hits).toHaveLength(1);
    expect(misses).toHaveLength(0);
  });

  // @req REQ-004-FR-002
  it('rolling-90 lookup hits by window_kind not exact end date shift', async () => {
    const { startDate, endDate } = rolling90();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cachedEnd = formatLocalDate(yesterday);

    await setCachedMetrics(['bob'], startDate, cachedEnd, [makeMetric('bob')], 'rolling-90');

    const { hits, gapRefresh } = await getCachedMetrics(['bob'], startDate, endDate, 0);
    expect(hits).toHaveLength(1);
    expect(gapRefresh).toContain('bob');
  });

  // @req REQ-004-FR-003
  it('fixed window requires exact start and end dates', async () => {
    await setCachedMetrics(['carol'], '2026-01-01', '2026-03-31', [makeMetric('carol')]);

    const { hits, misses } = await getCachedMetrics(
      ['carol'],
      '2026-01-01',
      '2026-03-31',
      0,
    );
    expect(hits).toHaveLength(1);
    expect(misses).toHaveLength(0);

    const miss = await getCachedMetrics(['carol'], '2026-02-01', '2026-03-31', 0);
    expect(miss.hits).toHaveLength(0);
    expect(miss.misses).toContain('carol');
  });

  // @req REQ-004-FR-004
  it('mergeDeveloperMetrics combines commits from base and gap slices', () => {
    const base = makeMetric('dave', 10);
    const gap = makeMetric('dave', 3);
    const merged = mergeDeveloperMetrics(base, gap);
    expect(merged.totalCommits).toBe(13);
  });

  // @req REQ-004-FR-004 REQ-004-FR-011
  it('resolveMetricsFromCache gap-merges when window end advanced', async () => {
    const { startDate, endDate } = rolling90();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const cachedEnd = formatLocalDate(yesterday);

    await setCachedMetrics(['eve'], startDate, cachedEnd, [makeMetric('eve', 5)], 'rolling-90');

    aggregateMetricsMock.mockResolvedValue({
      current: [makeMetric('eve', 2)],
    });

    const resolved = await resolveMetricsFromCache(['eve'], startDate, endDate, 0);
    expect(resolved.cacheStatus).toBe('gap-merged');
    expect(resolved.metrics[0].totalCommits).toBe(7);
    expect(aggregateMetricsMock).toHaveBeenCalledOnce();
  });

  // @req REQ-004-FR-009
  it('markCurrentMonthStale triggers gap refresh on next lookup', async () => {
    const { startDate, endDate } = rolling90();
    await setCachedMetrics(['frank'], startDate, endDate, [makeMetric('frank')], 'rolling-90');

    markCurrentMonthStale(['frank']);

    const { gapRefresh } = await getCachedMetrics(['frank'], startDate, endDate, 0);
    expect(gapRefresh).toContain('frank');
  });

  // @req REQ-004-FR-009
  it('purgeCachedMetrics removes rows for full refresh scope', async () => {
    const { startDate, endDate } = rolling90();
    await setCachedMetrics(['grace'], startDate, endDate, [makeMetric('grace')]);
    purgeCachedMetrics(['grace']);
    const { misses } = await getCachedMetrics(['grace'], startDate, endDate, 0);
    expect(misses).toContain('grace');
  });

  // @req REQ-004-FR-007
  it('reviewed PR cache passes delta start from cursor on refresh', async () => {
    readJsonMock.mockResolvedValueOnce({
      prs: [{ id: 1, updatedDate: Date.parse('2026-06-01') }],
      cursorUpdatedMs: Date.parse('2026-06-05'),
      cachedAt: 0,
    });
    getMergedPRsMock.mockResolvedValueOnce([]);

    const { getCachedReviewedPRsByUser } = await import(
      '../../databaselayer/cache/reviewedPrCache.js'
    );
    await getCachedReviewedPRsByUser('PROJ', 'repo', 'heidi', '2026-01-01');

    expect(getMergedPRsMock).toHaveBeenCalledWith('PROJ', 'repo', 'heidi', '2026-06-05');
  });

  // @req REQ-004-FR-008
  it('Jira search cache uses updated cursor for delta fetch', async () => {
    readJsonMock.mockResolvedValueOnce({
      issues: [],
      cursorUpdatedIso: '2026-06-03',
      cachedAt: 0,
    });
    searchIssuesMock.mockResolvedValueOnce([]);

    const { getCachedIssuesForDeveloper } = await import(
      '../../databaselayer/cache/jiraSearchCache.js'
    );
    await getCachedIssuesForDeveloper('ivan', '2026-01-01', '2026-06-10');

    expect(searchIssuesMock).toHaveBeenCalledWith('ivan', '2026-06-03', '2026-06-10');
  });

  // @req REQ-004-FR-006
  it('open PR cache returns cached envelope within current-month TTL without upstream call', async () => {
    const { getOpenPullRequestsByAuthor } = await import(
      '../../databaselayer/services/bitbucketService.js'
    );
    const openMock = vi.mocked(getOpenPullRequestsByAuthor);
    openMock.mockClear();

    readJsonMock.mockResolvedValueOnce({
      prs: [{ id: 99 }],
      cursorUpdatedMs: Date.now(),
      cachedAt: Date.now(),
    });

    const { getCachedOpenPRsByAuthor } = await import(
      '../../databaselayer/cache/openPrCache.js'
    );
    const prs = await getCachedOpenPRsByAuthor('PROJ', 'repo', 'jane');
    expect(prs).toHaveLength(1);
    expect(openMock).not.toHaveBeenCalled();
  });

  // @req REQ-004-FR-005
  it('reviewed PR cache returns fresh envelope without upstream call', async () => {
    getMergedPRsMock.mockClear();
    readJsonMock.mockResolvedValueOnce({
      prs: [{ id: 2 }],
      cursorUpdatedMs: Date.now(),
      cachedAt: Date.now(),
    });

    const { getCachedReviewedPRsByUser } = await import(
      '../../databaselayer/cache/reviewedPrCache.js'
    );
    const prs = await getCachedReviewedPRsByUser('PROJ', 'repo', 'kate', '2026-01-01');
    expect(prs).toHaveLength(1);
    expect(getMergedPRsMock).not.toHaveBeenCalled();
  });

  // @req REQ-004-FR-010
  it('resolveMetricsFromCache fetches misses and writes SQLite', async () => {
    aggregateMetricsMock.mockResolvedValue({ current: [makeMetric('leo')] });

    const { startDate, endDate } = rolling90();
    const resolved = await resolveMetricsFromCache(['leo'], startDate, endDate, 0);
    expect(resolved.metrics).toHaveLength(1);
    expect(resolved.cacheStatus).toBe('partial');

    const { hits } = await getCachedMetrics(['leo'], startDate, endDate, 0);
    expect(hits).toHaveLength(1);
  });
});
