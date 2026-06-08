# Implementation Plan: In-Memory SQLite Cache Migration

**Branch**: `master` | **Date**: 2026-06-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-sqlite-cache-migration/spec.md`

---

## Summary

Replace the file-based JSON analytics cache (`data/cache/metrics-result/*.json` and `data/sync-logs/*.json`) with a single in-memory SQLite database (`:memory:`), eliminating file I/O race conditions during concurrent sync batches. The store is provisioned by a new singleton module `databaselayer/store/inMemoryDb.ts` using `better-sqlite3` (Node 18 fallback per Principle VI). All existing public function signatures remain unchanged; callers and tests need zero modification. First startup performs a one-time sentinel-gated cleanup of legacy JSON files.

---

## Technical Context

**Language/Version**: TypeScript 5.5 / Node.js 18.20.8 (ESM, `"type": "module"`)

**Primary Dependencies**:
- `better-sqlite3` — new production dependency (synchronous SQLite, `:memory:`)
- `@types/better-sqlite3` — new dev dependency (TypeScript types)
- All existing dependencies unchanged

**Storage**: In-memory SQLite via `better-sqlite3` (`:memory:`). `data/sync-config.json` and `data/.migrated-to-sqlite` remain file-based.

**Testing**: Vitest (`npm test`). Traceability checker: `npx tsx scripts/check-traceability.ts`.

**Target Platform**: Linux/Windows server, on-prem. Node.js 18.20.8.

**Project Type**: Web service (Express REST API, TypeScript backend)

**Performance Goals**: Dashboard cache-hit response ≤ 500 ms p95 (SC-002). Sync job completes 50-developer run with zero file I/O errors (SC-001).

**Constraints**: Single SQLite connection (Principle VI). No new production packages beyond `better-sqlite3`. Existing public function signatures must not change (SC-003).

**Scale/Scope**: 50+ developers, ~5 sync batches of 10, up to 50 run logs in memory between restarts.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I — Spec-to-Code Traceability | New REQ tags for FR-001/FR-009/SC-007 must have `@req` tests before merge. Traceability checker must pass. | ✅ Addressed in task list |
| II — Boundary-First Security | No new trust boundaries introduced. SQLite is process-internal. | ✅ N/A |
| III — Working-Hours Accuracy | Not touched by this change. | ✅ N/A |
| IV — Opt-In Extensibility | Not touched by this change. | ✅ N/A |
| V — Simplicity Over Abstraction | `databaselayer/store/inMemoryDb.ts` is the minimal singleton; no ORM, no query builder, no abstraction layers. `getCachedMetrics` and `setCachedMetrics` stay in their existing module. | ✅ |
| VI — In-Memory SQLite Storage Law | Exactly one `:memory:` connection at `databaselayer/store/inMemoryDb.ts`. No second connection. No new JSON cache writes for metrics or run logs. | ✅ Core of this feature |

**Post-design re-check**: All six principles satisfied. No violations. Complexity Tracking table not needed.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-sqlite-cache-migration/
├── plan.md              # This file
├── research.md          # Phase 0 — technical decisions
├── data-model.md        # Phase 1 — schema and entity contracts
├── contracts/
│   └── internal-store-api.md   # Phase 1 — module API contracts
├── quickstart.md        # Phase 1 — validation scenarios
├── checklists/
│   └── requirements.md  # Spec quality checklist (all 16/16 passing)
└── tasks.md             # Phase 2 — NOT YET CREATED (/speckit-tasks)
```

### Source Code (affected files)

```text
# New files
databaselayer/store/inMemoryDb.ts        # Singleton :memory: Database + schema init + _resetForTesting()
databaselayer/store/migrationCleanup.ts  # runMigrationCleanup() — standalone, testable, not embedded in server.ts

# Modified files
databaselayer/cache/metricsCache.ts      # getCachedMetrics / setCachedMetrics → SQLite
jobs/metricsSync.ts           # writeRunLog / listRunLogs / purgeRunLogs → SQLite
server.ts                     # initInMemoryDb() call + runMigrationCleanup() import + call

# Unchanged files (confirmed)
databaselayer/cache/jsonFileCache.ts     # Retained for sync-config.json + sentinel file
databaselayer/cache/cacheEviction.ts     # Out of scope (month-subdirectory eviction)
databaselayer/cache/bitbucketCache.ts    # Out of scope (TTL map, not file I/O)
databaselayer/cache/ttlCache.ts          # Out of scope
api/routes/metricsRouter.ts   # Zero changes (getCachedMetrics contract preserved)
api/routes/syncRouter.ts      # Zero changes (listRunLogs / purgeRunLogs contract preserved)

# New test files
tests/unit/inMemoryDb.test.ts           # REQ-4.12-1, REQ-4.12-4: init, fail-fast, singleton
tests/unit/metricsCache.sqlite.test.ts  # REQ-4.12-2: cache read/write
tests/unit/metricsSync.sqlite.test.ts   # REQ-4.12-3, REQ-4.8.1-1: run log read/write/purge + warm-up preserved
tests/unit/migrationCleanup.test.ts     # REQ-4.12-5: sentinel, cleanup, non-blocking

# package.json
package.json                  # Add better-sqlite3 (dep) + @types/better-sqlite3 (devDep)
```

**Structure Decision**: Single-project web service. Backend-only change. No frontend modifications.

---

## Implementation Sequence

The tasks are sequenced to keep the build green at every step.

### Step 1 — Add `better-sqlite3` dependency

Install `better-sqlite3` and its types. Verify `npm run build` passes. No logic changes.

### Step 2 — Create `databaselayer/store/inMemoryDb.ts`

Implement the singleton module:
- `initInMemoryDb()` — opens `:memory:`, creates both tables, sets `initialised = true`.
- `getDb()` — returns the `Database` instance, throws `AppStoreNotInitialisedError` if called before init.
- Add `AppStoreNotInitialisedError` (typed structured error per constitution quality standards).

Write `tests/unit/inMemoryDb.test.ts` covering:
- `// @req REQ-FR-001` — tables exist after init
- `// @req REQ-SC-007` — `getDb()` throws if not initialised (simulates abort path)

### Step 3 — Update `server.ts` startup sequence

1. Call `initInMemoryDb()` synchronously-wrapped in try/catch before `app.listen()`.
2. On catch: `console.error('[store] failed to initialise:', err.message)` + `process.exit(1)`.
3. Add `runMigrationCleanup()` call (implemented in this step) after init, before `startMetricsSyncJob()`.

`runMigrationCleanup()` logic:
- Check `data/.migrated-to-sqlite` existence.
- If absent: attempt `removeCacheDir('data/cache/metrics-result')` + `removeCacheDir('data/sync-logs')` (both wrapped in try/catch, log warn on failure). Then write sentinel via `writeJsonCache`.
- If present: return.

Write `tests/unit/migrationCleanup.test.ts` covering:
- `// @req REQ-FR-009` — cleanup runs once, sentinel written
- `// @req REQ-FR-009` — cleanup skipped when sentinel present
- `// @req REQ-FR-009` — cleanup continues when delete fails (non-blocking)

### Step 4 — Migrate `databaselayer/cache/metricsCache.ts`

Replace `readJsonCache` / `writeJsonCache` calls with `getDb()` prepared statements:
- `getCachedMetrics`: `SELECT metric_json, cached_at FROM metrics_cache WHERE developer_id=? AND start_date=? AND end_date=?` for each devId. Filter by `Date.now() - cached_at <= maxAgeMs`.
- `setCachedMetrics`: `INSERT OR REPLACE INTO metrics_cache VALUES (?,?,?,?,?)` for each metric. `metric_json = JSON.stringify(metric)`.

Remove the `devCachePath` / `safeKey` helper functions (no longer needed).

Write `tests/unit/metricsCache.sqlite.test.ts` covering:
- `// @req REQ-FR-002` — set then get returns hit
- `// @req REQ-FR-003` — stale entry returns miss
- `// @req REQ-FR-003` — absent entry returns miss
- `// @req REQ-FR-003` — `oldestCachedAt` is min across hits

### Step 5 — Migrate `jobs/metricsSync.ts` run logs

Replace `writeJsonCache` / `readJsonCache` / `removeCacheDir` calls:
- `writeRunLog(log)`: `INSERT OR REPLACE INTO sync_run_logs VALUES (?,?,?,?,?,?)`. `batches_json = JSON.stringify(log.batches)`.
- `listRunLogs(maxCount)`: `SELECT * FROM sync_run_logs ORDER BY started_at DESC LIMIT ?`. Parse `batches_json` on each row.
- `purgeRunLogs()`: `DELETE FROM sync_run_logs`.

Remove the `syncLogsDir()` helper and `readdir` import (now unused for logs).

Write `tests/unit/metricsSync.sqlite.test.ts` covering:
- `// @req REQ-FR-004` — writeRunLog stores run
- `// @req REQ-FR-005` — listRunLogs returns newest first, honours maxCount
- `// @req REQ-FR-006` — purgeRunLogs clears all entries

### Step 6 — Run full test suite + traceability check

```bash
npm test   # vitest run + check-traceability.ts
```

All existing tests must pass unchanged. New tests must be tagged with `@req` comments. Traceability checker must report zero untested, orphaned, or untagged items.

---

## Spec → Requirement Traceability

New `@req` tags needed (not yet covered by existing tests):

| Canonical REQ ID | Spec ref | Test file | Coverage |
|---|---|---|---|
| REQ-4.12-1 | FR-001, SC-007 | `tests/unit/inMemoryDb.test.ts` | init creates tables; process exits non-zero on init failure |
| REQ-4.12-2 | FR-002, FR-003 | `tests/unit/metricsCache.sqlite.test.ts` | setCachedMetrics stores with cachedAt; getCachedMetrics hit/miss/oldestCachedAt |
| REQ-4.12-3 | FR-004–FR-006 | `tests/unit/metricsSync.sqlite.test.ts` | writeRunLog, listRunLogs ordered+limited, purgeRunLogs |
| REQ-4.12-4 | FR-007 | `tests/unit/inMemoryDb.test.ts` | getDb returns same instance; AppStoreNotInitialisedError on early access |
| REQ-4.12-5 | FR-009 | `tests/unit/migrationCleanup.test.ts` | sentinel absent → cleanup runs; sentinel present → skip; delete failure → non-blocking |
| REQ-4.8.1-1 | FR-008a | `tests/unit/metricsSync.sqlite.test.ts` | startMetricsSyncJob still schedules 5 s warm-up setTimeout after Phase 5 refactor |

FR-008 (sync-config.json unchanged), FR-010 (API shapes unchanged — existing integration tests cover) require no new test files.

---

## Rollback Note

If this deployment is rolled back, the operator must:

1. Delete `data/.migrated-to-sqlite` before re-deploying the new version.
2. Without this step, legacy JSON files written during the rollback period are never deleted (they are never read by the new version, but occupy disk space).

This constraint is documented in the spec Assumptions section.
