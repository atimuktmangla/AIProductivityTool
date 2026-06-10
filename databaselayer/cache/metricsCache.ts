import { getDb } from '../store/appStore.js';
import {
  detectWindowKind,
  nextIsoDate,
  currentMonthId,
  type WindowKind,
} from '../../backend/metrics/windowKind.js';
import { needsGapRefresh } from '../../backend/metrics/monthSlice.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

export type MetricsCacheStatus = 'full' | 'partial' | 'gap-merged';

interface CacheRow {
  metric_json: string;
  cached_at: number;
  start_date: string;
  end_date: string;
  window_kind: string;
  current_month: string | null;
}

function isFresh(cachedAt: number, maxAgeMs: number, now: number): boolean {
  if (maxAgeMs <= 0) return true;
  return now - cachedAt <= maxAgeMs;
}

function lookupRow(
  devId: string,
  startDate: string,
  endDate: string,
  windowKind: WindowKind,
): CacheRow | undefined {
  const db = getDb();
  if (windowKind === 'rolling-90') {
    return db.prepare<[string, string], CacheRow>(
      `SELECT metric_json, cached_at, start_date, end_date, window_kind, current_month
       FROM metrics_cache
       WHERE developer_id = ? AND window_kind = ?
       ORDER BY cached_at DESC LIMIT 1`,
    ).get(devId, 'rolling-90');
  }
  return db.prepare<[string, string, string], CacheRow>(
    `SELECT metric_json, cached_at, start_date, end_date, window_kind, current_month
     FROM metrics_cache
     WHERE developer_id = ? AND start_date = ? AND end_date = ? AND window_kind = 'fixed'`,
  ).get(devId, startDate, endDate);
}

/**
 * Returns cached metrics split into hits (fresh) and misses (absent or stale).
 * gapRefresh lists developers with a rolling hit that needs window-end merge.
 */
export async function getCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  maxAgeMs:     number,
): Promise<{
  hits: AggregatedDeveloperMetric[];
  misses: string[];
  gapRefresh: string[];
  oldestCachedAt: number;
}> {
  const windowKind = detectWindowKind(startDate, endDate);
  const hits: AggregatedDeveloperMetric[] = [];
  const misses: string[] = [];
  const gapRefresh: string[] = [];
  let oldestCachedAt = 0;
  const now = Date.now();

  for (const devId of developerIds) {
    const row = lookupRow(devId, startDate, endDate, windowKind);
    if (!row || !isFresh(row.cached_at, maxAgeMs, now)) {
      misses.push(devId);
      continue;
    }

    const metric = JSON.parse(row.metric_json) as AggregatedDeveloperMetric;
    if (
      windowKind === 'rolling-90' &&
      needsGapRefresh(row.end_date, endDate, row.current_month)
    ) {
      gapRefresh.push(devId);
      hits.push(metric);
      if (oldestCachedAt === 0 || row.cached_at < oldestCachedAt) {
        oldestCachedAt = row.cached_at;
      }
      continue;
    }

    hits.push(metric);
    if (oldestCachedAt === 0 || row.cached_at < oldestCachedAt) {
      oldestCachedAt = row.cached_at;
    }
  }

  return { hits, misses, gapRefresh, oldestCachedAt };
}

export function getGapRefreshRange(cachedEndDate: string, requestedEndDate: string): {
  startDate: string;
  endDate: string;
} | null {
  if (cachedEndDate >= requestedEndDate) return null;
  return { startDate: nextIsoDate(cachedEndDate), endDate: requestedEndDate };
}

/**
 * Stores one cache entry per developer.
 * Rolling-90 replaces prior rolling row for the developer.
 */
export async function setCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  metrics:      AggregatedDeveloperMetric[],
  windowKindOverride?: WindowKind,
): Promise<void> {
  const db = getDb();
  const windowKind = windowKindOverride ?? detectWindowKind(startDate, endDate);
  const cachedAt = Date.now();
  const month = currentMonthId();

  const deleteRolling = db.prepare(
    "DELETE FROM metrics_cache WHERE developer_id = ? AND window_kind = 'rolling-90'",
  );
  const upsert = db.prepare(
    `INSERT OR REPLACE INTO metrics_cache
     (developer_id, start_date, end_date, metric_json, cached_at, window_kind, current_month)
     VALUES (?,?,?,?,?,?,?)`,
  );

  for (const metric of metrics) {
    if (windowKind === 'rolling-90') {
      deleteRolling.run(metric.developerId);
    }
    upsert.run(
      metric.developerId,
      startDate,
      endDate,
      JSON.stringify(metric),
      cachedAt,
      windowKind,
      month,
    );
  }
}

/** Removes cache rows for developers (force full refresh). */
export function purgeCachedMetrics(developerIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM metrics_cache WHERE developer_id = ?');
  for (const id of developerIds) stmt.run(id);
}

/** Marks rows stale for current-month-only refresh (triggers gap merge on next resolve). */
export function markCurrentMonthStale(developerIds: string[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `UPDATE metrics_cache SET current_month = '0000-00' WHERE developer_id = ?`,
  );
  for (const id of developerIds) stmt.run(id);
}
