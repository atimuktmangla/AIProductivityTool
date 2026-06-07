import { getDb } from '../store/inMemoryDb.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

/**
 * Returns cached metrics split into hits (fresh) and misses (absent or stale).
 * Callers can use hits immediately and compute only the misses.
 * oldestCachedAt is the earliest cachedAt timestamp among all hits (0 when no hits).
 */
export async function getCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  maxAgeMs:     number,
): Promise<{ hits: AggregatedDeveloperMetric[]; misses: string[]; oldestCachedAt: number }> {
  const db = getDb();
  const stmt = db.prepare<[string, string, string], { metric_json: string; cached_at: number }>(
    'SELECT metric_json, cached_at FROM metrics_cache WHERE developer_id=? AND start_date=? AND end_date=?',
  );

  const hits: AggregatedDeveloperMetric[] = [];
  const misses: string[] = [];
  let oldestCachedAt = 0;
  const now = Date.now();

  for (const devId of developerIds) {
    const row = stmt.get(devId, startDate, endDate);
    if (row && now - row.cached_at <= maxAgeMs) {
      hits.push(JSON.parse(row.metric_json) as AggregatedDeveloperMetric);
      if (oldestCachedAt === 0 || row.cached_at < oldestCachedAt) {
        oldestCachedAt = row.cached_at;
      }
    } else {
      misses.push(devId);
    }
  }

  return { hits, misses, oldestCachedAt };
}

/**
 * Stores one cache entry per developer, keyed by (developerId, startDate, endDate).
 * Uses INSERT OR REPLACE so subsequent writes overwrite stale entries atomically.
 */
export async function setCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  metrics:      AggregatedDeveloperMetric[],
): Promise<void> {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO metrics_cache (developer_id, start_date, end_date, metric_json, cached_at) VALUES (?,?,?,?,?)',
  );
  const cachedAt = Date.now();

  for (const metric of metrics) {
    stmt.run(metric.developerId, startDate, endDate, JSON.stringify(metric), cachedAt);
  }
}
