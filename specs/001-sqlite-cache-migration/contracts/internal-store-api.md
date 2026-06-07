# Internal Store API Contract

**Feature**: 001-sqlite-cache-migration  
**Date**: 2026-06-07

This document defines the TypeScript API contract for `DB/store/inMemoryDb.ts` — the new singleton module that owns the in-memory SQLite connection.

---

## `DB/store/inMemoryDb.ts`

### Exports

#### `initInMemoryDb(): void`

Initialises the singleton `Database` instance (`:memory:`) and creates all required tables.

- Called once in `server.ts` before routes are registered and before `app.listen()`.
- If the `better-sqlite3` native binary is absent or the `Database` constructor throws for any reason, this function re-throws — the caller is responsible for catching and calling `process.exit(1)`.
- Calling this function a second time is a no-op (guard with an `initialised` flag).

#### `getDb(): Database`

Returns the singleton `Database` instance. Throws `AppStoreNotInitialisedError` if called before `initInMemoryDb()`.

#### `_resetForTesting(): void`

Drops and recreates all tables, then resets the `initialised` flag so `initInMemoryDb()` will run again. **Only exported for use in test files** — must not be called in production code. Call in `beforeEach` to guarantee test isolation.

---

## `DB/cache/metricsCache.ts` — unchanged public signatures

These function signatures must not change (SC-003):

```typescript
export async function getCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  maxAgeMs:     number,
): Promise<{ hits: AggregatedDeveloperMetric[]; misses: string[]; oldestCachedAt: number }>

export async function setCachedMetrics(
  developerIds: string[],
  startDate:    string,
  endDate:      string,
  metrics:      AggregatedDeveloperMetric[],
): Promise<void>
```

**Internal change**: Both functions switch from `readJsonCache` / `writeJsonCache` to prepared-statement reads/writes against `metrics_cache`. The `async` wrapper is retained for interface compatibility; the underlying operations are synchronous `better-sqlite3` calls.

---

## `jobs/metricsSync.ts` — unchanged public signatures

These function signatures must not change (SC-003):

```typescript
export async function listRunLogs(maxCount?: number): Promise<SyncRunLog[]>
export async function purgeRunLogs(): Promise<void>
```

The internal `writeRunLog` function (not exported) switches from `writeJsonCache` to `INSERT OR REPLACE`.

---

## Migration Cleanup API (server.ts call site)

A new function performs the one-time sentinel-gated cleanup:

```typescript
// In server.ts startup sequence (or a helper called from there)
async function runMigrationCleanup(): Promise<void>
```

- Reads `data/.migrated-to-sqlite` via `readJsonCache` (or raw `existsSync`).
- If absent: attempts `rm -rf data/cache/metrics-result/` and `rm -rf data/sync-logs/`, logs result, writes sentinel.
- If present: returns immediately.
- Never throws — any failure is logged as a warning, never as an error that aborts startup.

---

## HTTP API — unchanged

No HTTP endpoint signatures change as a result of this migration. The following endpoints continue to work identically:

| Method | Path | Change |
|---|---|---|
| `POST` | `/api/dashboard/metrics` | None — `getCachedMetrics` contract preserved |
| `GET` | `/api/dashboard/sync/logs` | None — `listRunLogs` contract preserved |
| `DELETE` | `/api/dashboard/sync/logs` | None — `purgeRunLogs` contract preserved |
| `POST` | `/api/dashboard/sync/trigger` | None — `triggerSyncForUsers` unchanged |
| `POST` | `/api/dashboard/sync/config` | None — config is still file-based (`data/sync-config.json`) |
| `GET` | `/api/dashboard/sync/config` | None |
| `GET` | `/api/dashboard/sync/status` | None |
