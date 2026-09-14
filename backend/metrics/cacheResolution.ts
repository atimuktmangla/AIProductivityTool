import { aggregateMetrics } from './aggregator.js';
import { mergeDeveloperMetrics } from './metricsMerge.js';
import {
  getCachedMetrics,
  getGapRefreshRange,
  setCachedMetrics,
  type MetricsCacheStatus,
} from '../../databaselayer/cache/metricsCache.js';
import { detectWindowKind } from './windowKind.js';
import type { AggregatedDeveloperMetric, DashboardQueryPayload } from '../../types/index.js';
import { getDb } from '../../databaselayer/store/appStore.js';

export interface ResolvedMetrics {
  metrics: AggregatedDeveloperMetric[];
  cacheStatus: MetricsCacheStatus;
  oldestCachedAt: number;
}

function lookupCachedEndDate(devId: string): string | null {
  const row = getDb()
    .prepare<[string], { end_date: string }>(
      `SELECT end_date FROM metrics_cache
       WHERE developer_id = ? AND window_kind = 'rolling-90'
       ORDER BY cached_at DESC LIMIT 1`,
    )
    .get(devId);
  return row?.end_date ?? null;
}

/**
 * Resolves SQLite cache with gap merge for rolling-90 windows.
 */
export async function resolveMetricsFromCache(
  developerIds: string[],
  startDate: string,
  endDate: string,
  maxAgeMs: number,
  basePayload?: Omit<DashboardQueryPayload, 'developerIds' | 'startDate' | 'endDate'>,
): Promise<ResolvedMetrics> {
  const { hits, misses, gapRefresh, oldestCachedAt } = await getCachedMetrics(
    developerIds,
    startDate,
    endDate,
    maxAgeMs,
  );

  const byDev = new Map<string, AggregatedDeveloperMetric>();
  for (const m of hits) byDev.set(m.developerId, m);

  let gapMerged = false;

  for (const devId of gapRefresh) {
    const cached = byDev.get(devId);
    if (!cached) continue;
    const cachedEnd = lookupCachedEndDate(devId) ?? endDate;
    const range = getGapRefreshRange(cachedEnd, endDate);
    if (!range) continue;

    const gapResult = await aggregateMetrics({
      ...basePayload,
      developerIds: [devId],
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const gapMetric = gapResult.current[0];
    if (!gapMetric) continue;

    const merged = mergeDeveloperMetrics(cached, gapMetric);
    byDev.set(devId, merged);
    gapMerged = true;
  }

  if (misses.length > 0) {
    const live = await aggregateMetrics({
      ...basePayload,
      developerIds: misses,
      startDate,
      endDate,
    });
    for (const m of live.current) byDev.set(m.developerId, m);
  }

  const metrics = developerIds
    .map((id) => byDev.get(id))
    .filter((m): m is AggregatedDeveloperMetric => m !== undefined);

  if (metrics.length > 0) {
    await setCachedMetrics(
      metrics.map((m) => m.developerId),
      startDate,
      endDate,
      metrics,
      detectWindowKind(startDate, endDate),
    );
  }

  let cacheStatus: MetricsCacheStatus = 'full';
  if (misses.length > 0 && hits.length > 0) cacheStatus = 'partial';
  else if (gapMerged && misses.length === 0) cacheStatus = 'gap-merged';
  else if (misses.length > 0) cacheStatus = 'partial';

  if (misses.length === 0 && hits.length === developerIds.length && !gapMerged) {
    cacheStatus = 'full';
  }

  return { metrics, cacheStatus, oldestCachedAt };
}
