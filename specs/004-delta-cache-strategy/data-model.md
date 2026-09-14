# Data Model: Delta Cache Strategy

## SQLite `metrics_cache` (extended)

| Column | Type | Notes |
|--------|------|-------|
| developer_id | TEXT | PK part |
| start_date | TEXT | PK part; anchor start at write time |
| end_date | TEXT | PK part; anchor end at write time |
| window_kind | TEXT | `fixed` \| `rolling-90` |
| current_month | TEXT | `YYYY-MM` when row last fully merged |
| metric_json | TEXT | AggregatedDeveloperMetric |
| cached_at | INTEGER | Unix ms |

**Rolling-90 write**: DELETE existing `window_kind='rolling-90'` for developer, then INSERT.

**Rolling-90 read**: SELECT latest row WHERE `developer_id=? AND window_kind='rolling-90'`.

## JSON delta envelopes

### open-prs/{project}__{repo}__{user}.json`

```json
{ "prs": [], "cursorUpdatedMs": 0, "cachedAt": 0 }
```

### reviewed-prs/{project}__{repo}__{user}.json`

Same shape as open-prs.

### jira-search/{user}.json

```json
{ "issues": [], "cursorUpdatedIso": "2026-06-01", "cachedAt": 0 }
```

## Cache resolution flow

```text
resolveMetricsCache(devIds, start, end)
  → detectWindowKind(start, end)
  → for each dev: lookup row (fixed exact | rolling latest)
  → if maxAgeMs > 0 && stale: miss
  → if rolling && end_date < requestedEnd: gap merge path
  → else hit
```
