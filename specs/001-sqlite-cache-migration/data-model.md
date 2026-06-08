# Data Model: In-Memory SQLite Cache Migration

**Feature**: 001-sqlite-cache-migration  
**Date**: 2026-06-07

---

## Entities

### MetricsCacheEntry

Represents one developer's cached computed metrics for a specific date range.

| Field | SQLite type | TypeScript type | Notes |
|---|---|---|---|
| `developer_id` | TEXT | `string` | Bitbucket username. Part of composite PK. |
| `start_date` | TEXT | `string` | ISO date `YYYY-MM-DD`. Part of composite PK. |
| `end_date` | TEXT | `string` | ISO date `YYYY-MM-DD`. Part of composite PK. |
| `metric_json` | TEXT | `string` (JSON) | Serialised `AggregatedDeveloperMetric`. |
| `cached_at` | INTEGER | `number` | Unix timestamp in ms (`Date.now()`). |

**Primary key**: `(developer_id, start_date, end_date)`  
**Uniqueness rule**: One row per developer per date range. `INSERT OR REPLACE` overwrites stale entries.  
**Staleness**: Entries older than `maxAgeMs` are treated as misses at read time (no background eviction needed for `:memory:`; eviction is implicit on restart).

---

### SyncRunLog

Top-level record for one complete sync run.

| Field | SQLite type | TypeScript type | Notes |
|---|---|---|---|
| `run_id` | TEXT | `string` | Natural unique key `YYYY-MM-DD-HH-mm-ss`. PK. |
| `started_at` | TEXT | `string` | ISO 8601 timestamp. |
| `finished_at` | TEXT | `string` | ISO 8601 timestamp. |
| `duration_ms` | INTEGER | `number` | Wall-clock duration of the full run. |
| `total_users` | INTEGER | `number` | Developer count for this run. |
| `batches_json` | TEXT | `string` (JSON) | Serialised `SyncBatchLog[]`. |

**Primary key**: `run_id`  
**Uniqueness rule**: One row per run. `INSERT OR REPLACE` used for idempotency.  
**Ordering**: Listed by `started_at DESC` (newest first), `LIMIT ?`.  
**Capacity**: No hard cap; memory is bounded by the number of runs between restarts. UI shows last 50 (`listRunLogs(50)`).

---

### SyncBatchLog (embedded in SyncRunLog)

Not a separate table — stored as a JSON array in `sync_run_logs.batches_json`.

| Field | TypeScript type | Notes |
|---|---|---|
| `batchIndex` | `number` | Zero-based batch position. |
| `userIds` | `string[]` | Developer IDs in this batch. |
| `startedAt` | `string` | ISO 8601 timestamp. |
| `finishedAt` | `string` | ISO 8601 timestamp. |
| `durationMs` | `number` | Wall-clock duration for this batch. |
| `status` | `'ok' \| 'error'` | Batch outcome. |
| `error` | `string \| undefined` | Semicolon-separated per-user errors (when status is `'error'`). |

**Rationale for embedding**: Batches are always written and read with their parent run as a unit. A separate table would require a join on every read with no query benefit.

---

## SQLite Schema (canonical)

```sql
CREATE TABLE IF NOT EXISTS metrics_cache (
  developer_id  TEXT    NOT NULL,
  start_date    TEXT    NOT NULL,
  end_date      TEXT    NOT NULL,
  metric_json   TEXT    NOT NULL,
  cached_at     INTEGER NOT NULL,
  PRIMARY KEY (developer_id, start_date, end_date)
);

CREATE TABLE IF NOT EXISTS sync_run_logs (
  run_id       TEXT    PRIMARY KEY,
  started_at   TEXT    NOT NULL,
  finished_at  TEXT    NOT NULL,
  duration_ms  INTEGER NOT NULL,
  total_users  INTEGER NOT NULL,
  batches_json TEXT    NOT NULL
);
```

---

## Module Ownership

| Module | Responsibility |
|---|---|
| `databaselayer/store/inMemoryDb.ts` | Singleton `Database` instance; schema initialisation; exported prepared statements or raw `db` handle. |
| `databaselayer/cache/metricsCache.ts` | `getCachedMetrics` / `setCachedMetrics` — read/write `metrics_cache` table. |
| `jobs/metricsSync.ts` | `writeRunLog` / `listRunLogs` / `purgeRunLogs` — read/write `sync_run_logs` table. |
| `databaselayer/cache/jsonFileCache.ts` | Retained for `data/sync-config.json` reads/writes and sentinel file creation. No changes. |

---

## TypeScript Interfaces (unchanged public contracts)

These interfaces are defined in `jobs/metricsSync.ts` and must remain byte-for-byte identical (FR-010):

```typescript
interface SyncBatchLog {
  batchIndex:  number;
  userIds:     string[];
  startedAt:   string;
  finishedAt:  string;
  durationMs:  number;
  status:      'ok' | 'error';
  error?:      string;
}

interface SyncRunLog {
  runId:      string;
  startedAt:  string;
  finishedAt: string;
  durationMs: number;
  totalUsers: number;
  batches:    SyncBatchLog[];
}
```

The `MetricsResult` type (`types/index.ts`) fields `cacheStatus` and `cachedAt` (renamed from `oldestCachedAt` in the route response) are also frozen — no changes to response shapes.

---

## State Transitions

```
Server startup
  → initInMemoryDb() called
    → success: tables created, store ready
    → failure: process.exit(1) + diagnostic log

First startup after deployment (sentinel absent)
  → attempt delete data/cache/metrics-result/ + data/sync-logs/
  → write data/.migrated-to-sqlite
  → continue (non-blocking on delete failure)

Subsequent startups
  → sentinel present → skip cleanup

Sync run completes
  → writeRunLog() → INSERT OR REPLACE into sync_run_logs

Developer metrics computed
  → setCachedMetrics() → INSERT OR REPLACE into metrics_cache

Server process exits / crashes
  → :memory: database discarded; all rows lost (intentional per Principle VI)

Next startup
  → FR-008a: 5 s delayed warm-up sync repopulates metrics_cache
```
