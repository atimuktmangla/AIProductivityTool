# Data Model: Sync Cache Improvements

**Feature**: `002-sync-cache-improvements`
**Date**: 2026-06-08

---

## Modified Entities

### SyncStatus (extended)

The existing `SyncStatus` interface in `jobs/metricsSync.ts` gains a documented invariant — no new field is added.

| Field | Type | Change | Notes |
|---|---|---|---|
| `completedUsers` | `string[]` | **Capped** | Serialised as at most 50 entries (last 50 by order). No interface change — the cap is applied in `getSyncStatus()` before return. |
| `totalSyncUsers` | `number` | Unchanged | Always the true count of users in the run, regardless of the cap. |
| `failedUsers` | `string[]` | Unchanged | Never truncated. |

All other fields (`running`, `lastRunAt`, `nextRunAt`, `runStartedAt`, `activeUsers`, `configuredUsers`, `intervalMinutes`, `scheduledTime`) are unchanged.

---

### SyncBatchLog (extended)

The existing `SyncBatchLog` interface in `jobs/metricsSync.ts` gains one optional field.

| Field | Type | Change | Notes |
|---|---|---|---|
| `source` | `'live' \| 'cache'` (optional) | **New** | Present only when `runSync()` processes a user. `'cache'` = promoted from SQLite without upstream fetch. `'live'` = fetched via `aggregateMetrics`. Absent on legacy rows stored before this feature. |

All other fields (`batchIndex`, `userIds`, `startedAt`, `finishedAt`, `durationMs`, `status`, `error`) are unchanged.

**Storage**: `source` is serialised inside the existing `batches_json` TEXT column of `sync_run_logs`. No schema migration required.

---

## New Entities

### CacheCoverage

Returned by `GET /api/dashboard/sync/cache-coverage`. Read-only snapshot, computed on demand.

| Field | Type | Description |
|---|---|---|
| `configuredUsers` | `number` | Total count of users in `sync-config.json`. 0 if config absent. |
| `cachedUsers` | `number` | Count of users with a fresh cache entry (< 1 h old) for the current 90-day date range. |
| `uncachedUsers` | `string[]` | User IDs with no cache entry at all for the current date range. |
| `staleUsers` | `string[]` | User IDs with a cache entry that exists but is older than 1 h. |

Note: `cachedUsers + uncachedUsers.length + staleUsers.length === configuredUsers` always holds.

**TypeScript interface** (backend — add to `jobs/metricsSync.ts` or a shared types file):
```ts
export interface CacheCoverage {
  configuredUsers: number;
  cachedUsers:     number;
  uncachedUsers:   string[];
  staleUsers:      string[];
}
```

**TypeScript interface** (frontend — add to `UI/src/types/index.ts`):
```ts
export interface CacheCoverage {
  configuredUsers: number;
  cachedUsers:     number;
  uncachedUsers:   string[];
  staleUsers:      string[];
}
```

---

### WarmupResult

Returned by `POST /api/dashboard/sync/warmup`. Describes how many users were skipped vs. queued.

| Field | Type | Description |
|---|---|---|
| `skipped` | `number` | Count of users with a fresh cache entry — not synced. |
| `queued` | `number` | Count of users without a fresh cache entry — sync triggered for these. |
| `queuedUsers` | `string[]` | The user IDs actually queued (empty when `queued === 0`). |

**TypeScript interface** (backend + frontend):
```ts
export interface WarmupResult {
  skipped:     number;
  queued:      number;
  queuedUsers: string[];
}
```

---

## SQLite Schema Impact

No schema changes. The `metrics_cache` and `sync_run_logs` tables remain identical.

```sql
-- Unchanged — metrics_cache
CREATE TABLE IF NOT EXISTS metrics_cache (
  developer_id TEXT NOT NULL,
  start_date   TEXT NOT NULL,
  end_date     TEXT NOT NULL,
  metric_json  TEXT NOT NULL,
  cached_at    INTEGER NOT NULL,
  PRIMARY KEY (developer_id, start_date, end_date)
);

-- Unchanged — sync_run_logs
CREATE TABLE IF NOT EXISTS sync_run_logs (
  run_id       TEXT PRIMARY KEY,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  total_users  INTEGER NOT NULL,
  batches_json TEXT NOT NULL
);
```

The `source` field added to `SyncBatchLog` is stored inside `batches_json` — a free-form JSON column. Old rows without `source` deserialise with `source: undefined` (valid TypeScript optional field).
