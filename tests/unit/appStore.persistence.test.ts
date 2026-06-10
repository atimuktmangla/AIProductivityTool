import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  initAppStore,
  getDb,
  _resetForTesting,
} from '../../databaselayer/store/appStore.js';
import { getCachedMetrics, setCachedMetrics } from '../../databaselayer/cache/metricsCache.js';
import { METRICS_CACHE_TTL_MS } from '../../backend/config/cacheTtl.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

function sampleMetric(devId: string): AggregatedDeveloperMetric {
  return {
    developerId: devId,
    name: devId,
    totalCommits: 1,
    totalPRs: 1,
    prsReviewed: 0,
    linesChanged: { added: 1, deleted: 0 },
    cycleTimeHrs: 1,
    pickupDelayHrs: 1,
    reviewLifecycleHrs: 1,
    reviewDepth: 1,
    avgPrSizeLines: 1,
    openPrsOverThreshold: 0,
    workType: { features: 1, bugs: 0, infraOrDebt: 0 },
    codeQuality: { score: 80, bugRatio: 0, criticalScore: null, approvalScore: null, prFocusScore: null, reworkRate: 0 },
    prs: [],
  };
}

describe('appStore persistence', () => {
  let storePath: string;

  beforeEach(() => {
    storePath = join(mkdtempSync(join(tmpdir(), 'app-store-')), 'store.sqlite');
  });

  afterEach(() => {
    _resetForTesting();
    try {
      rmSync(join(storePath, '..'), { recursive: true, force: true });
    } catch {
      // Windows may briefly lock WAL sidecars after close
    }
  });

  // @req REQ-003-FR-013
  it('persists metrics cache across store re-init', async () => {
    initAppStore(storePath);
    await setCachedMetrics(['alice'], '2026-01-01', '2026-03-31', [sampleMetric('alice')]);
    _resetForTesting();

    initAppStore(storePath);
    const { hits, misses } = await getCachedMetrics(['alice'], '2026-01-01', '2026-03-31', METRICS_CACHE_TTL_MS);
    expect(misses).toEqual([]);
    expect(hits).toHaveLength(1);
    expect(hits[0].developerId).toBe('alice');
  });

  // @req REQ-003-FR-014
  it('honours custom APP_STORE_PATH', () => {
    initAppStore(storePath);
    expect(getDb()).toBeDefined();
  });

  // @req REQ-003-FR-016
  it('throws when store file is corrupt', () => {
    writeFileSync(storePath, 'not-a-sqlite-database');
    expect(() => initAppStore(storePath)).toThrow(/Failed to open application store/);
  });

  // @req REQ-003-FR-017
  it('treats stale cache entry as miss after restart', async () => {
    initAppStore(storePath);
    const db = getDb();
    db.prepare(
      'INSERT INTO metrics_cache (developer_id, start_date, end_date, metric_json, cached_at) VALUES (?,?,?,?,?)',
    ).run('bob', '2026-01-01', '2026-03-31', JSON.stringify(sampleMetric('bob')), Date.now() - METRICS_CACHE_TTL_MS - 1);
    _resetForTesting();

    initAppStore(storePath);
    const { hits, misses } = await getCachedMetrics(['bob'], '2026-01-01', '2026-03-31', METRICS_CACHE_TTL_MS);
    expect(hits).toHaveLength(0);
    expect(misses).toEqual(['bob']);
  });
});
