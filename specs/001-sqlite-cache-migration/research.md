# Research: In-Memory SQLite Cache Migration

**Feature**: 001-sqlite-cache-migration  
**Date**: 2026-06-07  
**Phase**: 0 — Technical Decisions

---

## Decision 1: SQLite Library

**Decision**: Use `better-sqlite3`

**Rationale**: The project runs Node.js v18.20.8. The built-in `node:sqlite` module requires Node ≥ 22.5, so it is unavailable. `better-sqlite3` is the constitution-designated fallback (Principle VI). It provides a synchronous, blocking API — ideal for an in-memory store where async overhead adds no benefit. It has zero transitive runtime dependencies and ships pre-built native binaries for all major platforms.

**Alternatives considered**:
- `node:sqlite` — preferred by constitution but unavailable on Node 18. Ruled out.
- `better-sqlite3` (async wrapper `@databases/sqlite`) — unnecessary indirection; the sync API is simpler for a process-scoped in-memory store.
- `sql.js` (WASM port) — no native I/O; WASM overhead unwarranted for this use case.
- `sqlite3` (async callback-based) — older API, requires promisification, no advantage over `better-sqlite3`.

---

## Decision 2: Singleton Pattern

**Decision**: Single module `databaselayer/store/inMemoryDb.ts` exports a lazily-initialised singleton `Database` instance.

**Rationale**: Constitution Principle VI explicitly mandates a single connection at `databaselayer/store/inMemoryDb.ts`. All read/write modules import from there. The module calls `new Database(':memory:')` once, runs `CREATE TABLE IF NOT EXISTS` for both tables, and exports the instance. Startup failure throws immediately — server.ts wraps `initInMemoryDb()` call with a top-level catch that calls `process.exit(1)` (satisfying FR-001 / SC-007).

**Alternatives considered**:
- Per-module `new Database(':memory:')` — violates Principle VI, creates independent isolated stores.
- Connection pool — unnecessary for `:memory:`; pools open multiple connections, each with their own state.

---

## Decision 3: Schema Design

**Decision**: Two tables in the single in-memory database.

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

**Rationale**:
- `metrics_cache`: composite primary key on `(developer_id, start_date, end_date)` mirrors the current file key `{safeKey(devId)}__{start}__{end}`. `metric_json` stores the full `AggregatedDeveloperMetric` as JSON text — avoids schema coupling to a large nested type. `cached_at` is an integer Unix timestamp (ms) for direct comparison with `Date.now()`.
- `sync_run_logs`: `run_id` is already a unique YYYY-MM-DD-HH-mm-ss slug (natural key). `batches_json` stores the `SyncBatchLog[]` array as JSON — avoids a separate batches table for a one-to-many relation that is always read/written as a unit.
- `better-sqlite3` stores all data as text or integer; JSON serialisation is the standard pattern for complex nested objects.

**Alternatives considered**:
- Separate `sync_batch_logs` table — normalised but over-engineered; batches are always written and read with their parent run.
- JSONB column — not supported in SQLite; TEXT JSON is idiomatic.

---

## Decision 4: Data Migration Strategy (Historical JSON Files)

**Decision**: No data seeding. One-time cleanup of legacy JSON files on first startup.

**Rationale**: The clarified spec (FR-009, Assumptions) establishes that the in-memory cache is intentionally transient and historically non-seeded. The startup warm-up sync (FR-008a, 5 s delay) repopulates the cache from live API data — there is no need to parse and import stale JSON files. The user input suggestion to "seed from lean_metrics_db.json" was based on a file that does not exist in the codebase; the actual legacy files are per-developer JSON envelopes scattered across `data/cache/metrics-result/` and per-run JSON logs in `data/sync-logs/`. Importing them would add complexity with no user-visible benefit (stale cached data would be overwritten within 1 hour anyway by the TTL).

The correct migration behaviour is:
1. First startup (sentinel absent) → attempt `rm -rf data/cache/metrics-result/ data/sync-logs/`, log result, write sentinel.
2. Subsequent startups → skip cleanup.

**Alternatives considered**:
- Seed from existing JSON files — rejected per spec Assumptions; files are transient analytics, not durable source-of-truth.
- Keep JSON files alongside SQLite for a dual-write period — over-engineered, violates Principle V and Principle VI.

---

## Decision 5: `metricsCache.ts` Refactor Approach

**Decision**: Replace file I/O with direct `better-sqlite3` prepared-statement calls inside the existing `getCachedMetrics` and `setCachedMetrics` functions. Keep the same exported signatures — no callers change.

**Rationale**: `metricsCache.ts` is the single module that owns the metrics cache contract. Keeping the public API identical (FR-003, SC-003) means `metricsRouter.ts` and existing tests need zero changes. Internally, `Promise.all(developerIds.map(...))` becomes a synchronous loop over prepared statements — `better-sqlite3` is synchronous so `async/await` wrappers remain but become no-op.

---

## Decision 6: `metricsSync.ts` Refactor Approach (Run Logs)

**Decision**: Replace `writeRunLog`, `listRunLogs`, and `purgeRunLogs` with direct `better-sqlite3` prepared-statement calls. Existing exported signatures unchanged.

**Rationale**: These three functions are the only callers of the file-based run log path. Replacing their internals keeps `syncRouter.ts` and its tests untouched (SC-003). The `writeRunLog` function moves from `writeJsonCache` to an `INSERT OR REPLACE` statement. `listRunLogs` becomes a `SELECT … ORDER BY started_at DESC LIMIT ?` query. `purgeRunLogs` becomes `DELETE FROM sync_run_logs`.

---

## Decision 7: Startup Initialisation Order

**Decision**: `initInMemoryDb()` called in `server.ts` before `startMetricsSyncJob()`, before any route is registered. If it throws, the process exits with code 1 and a diagnostic message.

**Rationale**: FR-001 requires the store to be ready before any API request is accepted. Express does not start accepting connections until `app.listen()` — so calling `initInMemoryDb()` before `listen()` satisfies this. The fail-fast requirement (SC-007: exit within 5 s, non-zero code) is met by synchronous `new Database(':memory:')` — if the `better-sqlite3` native binary is absent (e.g., after a rollback to a Node version with a different ABI), the constructor throws synchronously.

---

## Decision 8: `cacheEviction.ts` Scope

**Decision**: `evictOldCacheMonths` in `databaselayer/cache/cacheEviction.ts` is out of scope. It evicts old month-subdirectory caches from `data/cache/` — a different path from `data/cache/metrics-result/`. After migration, `data/cache/metrics-result/` will no longer exist. The eviction call in `server.ts` may become a no-op (directory absent) or can be removed in a follow-up task.

---

## Decision 9: `@types/better-sqlite3` Dev Dependency

**Decision**: Add `@types/better-sqlite3` as a `devDependency` alongside `better-sqlite3` as a `dependency`.

**Rationale**: TypeScript strict mode requires types. `better-sqlite3` ships its own bundled typings (as of v9) — `@types/better-sqlite3` is a DefinitelyTyped package maintained separately and may lag. Confirm at install time whether bundled types are sufficient; if so, `@types/better-sqlite3` is not needed. Add only what compiles cleanly.

---

## Resolved: User Input Constraints vs. Spec

| User input item | Resolution |
|---|---|
| "Use `better-sqlite3` or `sqlite3`" | `better-sqlite3` chosen (synchronous API, constitution-designated) |
| "Initialize with `:memory:` flag" | Confirmed — `new Database(':memory:')` |
| "Seed from `lean_metrics_db.json` on startup" | **Rejected** — file does not exist; cache is intentionally transient; spec Assumptions explicitly exclude seeding |
| "Modify `lean://dashboard/summary` MCP resource" | **Not applicable** — no MCP resource by this name exists in the codebase; dashboard is served via Express REST endpoints (`/api/dashboard/metrics`). No changes to route shape needed. |
