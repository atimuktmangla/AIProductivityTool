import { join } from 'node:path';
import { getConfig } from '../../BL/config/env.js';
import { readJsonCache, writeJsonCache } from './jsonFileCache.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

interface MetricsCacheEnvelope {
  metric:   AggregatedDeveloperMetric;
  cachedAt: number;
}

function safeKey(s: string): string {
  return s.replace(/[/\\:*?"<>|,]/g, '_');
}

function devCachePath(cacheDir: string, devId: string, startDate: string, endDate: string): string {
  return join(cacheDir, 'metrics-result', `${safeKey(devId)}__${startDate}__${endDate}.json`);
}

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
  const { cacheDir } = getConfig();
  const hits: AggregatedDeveloperMetric[] = [];
  const misses: string[] = [];
  let oldestCachedAt = 0;

  await Promise.all(
    developerIds.map(async (devId) => {
      const path = devCachePath(cacheDir, devId, startDate, endDate);
      const envelope = await readJsonCache<MetricsCacheEnvelope>(path);
      if (envelope && Date.now() - envelope.cachedAt <= maxAgeMs) {
        hits.push(envelope.metric);
        if (oldestCachedAt === 0 || envelope.cachedAt < oldestCachedAt) {
          oldestCachedAt = envelope.cachedAt;
        }
      } else {
        misses.push(devId);
      }
    }),
  );

  return { hits, misses, oldestCachedAt };
}

/**
 * Writes one cache file per developer. Each file is keyed by (devId, startDate, endDate)
 * so individual developers can be refreshed independently without touching others.
 */
export async function setCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  metrics:      AggregatedDeveloperMetric[],
): Promise<void> {
  const { cacheDir } = getConfig();

  await Promise.all(
    metrics.map((metric) => {
      const path = devCachePath(cacheDir, metric.developerId, startDate, endDate);
      return writeJsonCache<MetricsCacheEnvelope>(path, { metric, cachedAt: Date.now() });
    }),
  );
}
