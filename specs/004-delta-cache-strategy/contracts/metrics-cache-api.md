# Contract: Metrics Cache Resolution API

## `detectWindowKind(startDate, endDate): 'rolling-90' | 'fixed'`

Returns `rolling-90` when end date is today (local) and span is 89–91 inclusive days.

## `resolveAndGetCachedMetrics(developerIds, startDate, endDate, maxAgeMs)`

Returns:

```typescript
{
  hits: AggregatedDeveloperMetric[];
  misses: string[];
  gapRefresh: string[];  // devs needing window-end merge
  oldestCachedAt: number;
  cacheStatus: 'full' | 'partial' | 'gap-merged';
}
```

## `setCachedMetrics(..., windowKind?)`

Writes with `window_kind` and `current_month` (YYYY-MM).

## `mergeMetricsCacheGap(developerId, cached, gapStart, gapEnd)`

Runs partial aggregation and merges into stored row.
