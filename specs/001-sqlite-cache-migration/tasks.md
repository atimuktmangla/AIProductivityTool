# Tasks: In-Memory SQLite Cache Migration

**Input**: Design documents from `specs/001-sqlite-cache-migration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/internal-store-api.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing. Constitution Principle I requires every new `REQ-*` tag to have a `@req`-tagged test — tests are therefore included for new requirements only (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-009, SC-007).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)

---

## Phase 1: Setup

**Purpose**: Add `better-sqlite3` dependency and verify the build before touching any logic.

- [X] T001 Add `better-sqlite3` to `dependencies` and `@types/better-sqlite3` to `devDependencies` in `package.json`
- [X] T002 Run `npm install` and verify `npm run build` compiles without errors (no logic changes)

**Checkpoint**: `npm run build` green. `better-sqlite3` available for import.

---

## Phase 2: Foundational — Singleton Store

**Purpose**: Create `databaselayer/store/inMemoryDb.ts` (the prerequisite for all user story migrations). Must be complete before any story phase begins.

**⚠️ CRITICAL**: All user story phases depend on this module.

### Tests for the store module

- [X] T003 [P] Write `tests/unit/inMemoryDb.test.ts` — `// @req` tags for REQ-4.12-1 (tables exist after init; server exits non-zero within 5 s on init failure), REQ-4.12-4 (singleton — same instance returned on repeated `getDb()` calls)

### Implementation

- [X] T004 Create `databaselayer/store/inMemoryDb.ts` with `initInMemoryDb()` and `getDb()` functions — `:memory:` database, `CREATE TABLE IF NOT EXISTS` for both `metrics_cache` and `sync_run_logs` per the schema in `data-model.md`
- [X] T005 Add `AppStoreNotInitialisedError` (typed structured error) exported from `databaselayer/store/inMemoryDb.ts` — thrown by `getDb()` when called before `initInMemoryDb()`
- [X] T006 Run `tests/unit/inMemoryDb.test.ts` — confirm all three test cases pass

**Checkpoint**: `databaselayer/store/inMemoryDb.ts` compiles and all store unit tests pass. `npm run build` still green.

---

## Phase 3: User Story 1 — Sync Job Completes Without File I/O Errors (Priority: P1) 🎯 MVP

**Goal**: Replace `setCachedMetrics` and `getCachedMetrics` with SQLite reads/writes so the sync job no longer writes per-developer JSON files. This directly eliminates ENOENT/EBUSY errors during concurrent batch processing.

**Independent Test**: Run a sync for multiple developers (or mock it). Verify `data/cache/metrics-result/` is not written; cached metrics are read back correctly; `cacheStatus: 'full'` is returned on a subsequent dashboard request.

### Tests for User Story 1

- [X] T007 [P] Write `tests/unit/metricsCache.sqlite.test.ts` — `// @req` tags for REQ-4.12-2 (`setCachedMetrics` stores with `cachedAt`; `getCachedMetrics` returns hit within TTL, miss when stale, miss when absent, `oldestCachedAt` is min across hits). Call `_resetForTesting()` (exported from `databaselayer/store/inMemoryDb.ts`, drops and recreates tables) in `beforeEach` to guarantee a clean state between tests.

### Implementation for User Story 1

- [X] T008 [US1] Rewrite `getCachedMetrics` in `databaselayer/cache/metricsCache.ts` — replace `readJsonCache` calls with `SELECT metric_json, cached_at FROM metrics_cache WHERE developer_id=? AND start_date=? AND end_date=?` prepared statement via `getDb()`. TTL comparison logic unchanged.
- [X] T009 [US1] Rewrite `setCachedMetrics` in `databaselayer/cache/metricsCache.ts` — replace `writeJsonCache` calls with `INSERT OR REPLACE INTO metrics_cache (developer_id, start_date, end_date, metric_json, cached_at) VALUES (?,?,?,?,?)` prepared statement via `getDb()`.
- [X] T010 [US1] Remove `devCachePath`, `safeKey` helper functions and the `readJsonCache`/`writeJsonCache` imports from `databaselayer/cache/metricsCache.ts` (now unused).
- [X] T011 [US1] Run `tests/unit/metricsCache.sqlite.test.ts` — confirm all cases pass.
- [X] T012 [US1] Run `npm test` — confirm all pre-existing tests (including `metricsRouter.test.ts`) still pass. The `getCachedMetrics`/`setCachedMetrics` public signatures are unchanged; callers need zero edits.

**Checkpoint**: No JSON files written under `data/cache/metrics-result/`. Cache round-trip works. All tests green.

---

## Phase 4: User Story 2 — Dashboard Loads from Cache in Under 500 ms (Priority: P1)

**Goal**: The dashboard cache hit path is already wired through `getCachedMetrics` in `metricsRouter.ts`. After Phase 3, it reads from SQLite automatically. This phase validates the performance target and ensures the `cacheStatus`/`oldestCachedAt` response shape is preserved.

**Independent Test**: After a sync, submit a dashboard POST for all synced developers. Measure response time. Verify `cacheStatus: 'full'` and `cachedAt` field are present and correct.

### Implementation for User Story 2

- [X] T013 [US2] Confirm `metricsRouter.ts` requires zero changes — `getCachedMetrics` signature and return shape are identical. Trace the call in `api/routes/metricsRouter.ts:79-103` to verify `cacheStatus`, `cachedAt` (mapped from `oldestCachedAt`) are passed through unchanged.
- [X] T014 [US2] Run the quickstart Scenario 3 from `quickstart.md` — `POST /api/dashboard/metrics` with all synced developers, verify `cacheStatus: 'full'`, response within 500 ms.
- [X] T015 [US2] Run `tests/integration/metricsRouter.test.ts` — confirm partial-hit and full-hit test cases still pass (these already mock `getCachedMetrics`; no changes needed).

**Checkpoint**: Dashboard returns `cacheStatus: 'full'` from SQLite. Response time ≤ 500 ms p95. All integration tests pass.

---

## Phase 5: User Story 3 — Sync Run History Visible in Admin UI (Priority: P2)

**Goal**: Replace `writeRunLog`/`listRunLogs`/`purgeRunLogs` in `jobs/metricsSync.ts` with SQLite reads/writes so run history appears in the admin Sync Jobs panel after migration.

**Independent Test**: Trigger three sync runs. `GET /api/dashboard/sync/logs` returns all three with correct fields. `DELETE /api/dashboard/sync/logs` returns 204 and clears the list. Verify no JSON files written to `data/sync-logs/`.

### Tests for User Story 3

- [X] T016 [P] Write `tests/unit/metricsSync.sqlite.test.ts` — `// @req` tags for REQ-4.12-3 (`writeRunLog` stores run with batches; `listRunLogs` returns newest first and honours `maxCount`; `purgeRunLogs` clears all rows). Also add a test tagged `// @req REQ-4.8.1-1` (FR-008a proxy) that imports `startMetricsSyncJob` and asserts the `setTimeout` 5-second warm-up is still scheduled after the function runs (spy on `setTimeout`). Call `_resetForTesting()` in `beforeEach` to guarantee a clean state between tests.

### Implementation for User Story 3

- [X] T017 [US3] Rewrite `writeRunLog` in `jobs/metricsSync.ts` — replace `writeJsonCache` with `INSERT OR REPLACE INTO sync_run_logs (run_id, started_at, finished_at, duration_ms, total_users, batches_json) VALUES (?,?,?,?,?,?)`. `batches_json = JSON.stringify(log.batches)`.
- [X] T018 [US3] Rewrite `listRunLogs` in `jobs/metricsSync.ts` — replace `readdir`+`readJsonCache` loop with `SELECT * FROM sync_run_logs ORDER BY started_at DESC LIMIT ?`. Parse `batches_json` on each row to reconstruct `SyncRunLog.batches`.
- [X] T019 [US3] Rewrite `purgeRunLogs` in `jobs/metricsSync.ts` — replace `removeCacheDir(syncLogsDir())` with `DELETE FROM sync_run_logs`.
- [X] T020 [US3] Remove `syncLogsDir()` helper function and the `readdir` import from `jobs/metricsSync.ts` (no longer needed for logs). Keep `readSyncConfig` and `readJsonCache` import — still needed for `data/sync-config.json`.
- [X] T021 [US3] Run `tests/unit/metricsSync.sqlite.test.ts` — confirm all three run-log test cases pass.
- [X] T022 [US3] Run `tests/integration/syncRouter.test.ts` — confirm all existing route tests pass (they mock `listRunLogs`/`purgeRunLogs`; signatures unchanged).

**Checkpoint**: Run logs stored in SQLite. No JSON files written to `data/sync-logs/`. Admin UI `GET /logs` and `DELETE /logs` work correctly. All tests green.

---

## Phase 6: User Story 4 — Cache Freshness Banner Remains Accurate (Priority: P2)

**Goal**: Verify `oldestCachedAt` (exposed as `cachedAt` in the API response) returns the correct value from SQLite so the "Served from sync cache · synced {date}" banner shows the right timestamp.

**Independent Test**: Run a sync at a known time, wait 2 minutes, load the dashboard. Verify banner timestamp matches the sync completion time (i.e., `cachedAt` in the response equals the `cached_at` stored by `setCachedMetrics`).

### Implementation for User Story 4

- [X] T023 [US4] Verify `oldestCachedAt` computation in the rewritten `getCachedMetrics` (T008) correctly finds the minimum `cached_at` across all hit rows. Confirm via the existing `metricsCache.sqlite.test.ts` test for `oldestCachedAt` (covered in T007).
- [X] T024 [US4] Run quickstart Scenario 3 — inspect `cachedAt` field in the response and confirm it matches the time `setCachedMetrics` was called. No code changes expected; this is a validation-only task.

**Checkpoint**: `cacheStatus` and `cachedAt` are correct in 100% of cache-hit responses (SC-006).

---

## Phase 7: Startup Integration — Fail-Fast Init + Migration Cleanup

**Purpose**: Wire `initInMemoryDb()` and `runMigrationCleanup()` into `server.ts`. These span all user stories — they must be done before any production deployment but can be done in parallel with phases 3–6 during development (dev server uses `npm run dev` which calls `server.ts` directly).

### Tests for startup integration

- [X] T025 [P] Write `tests/unit/migrationCleanup.test.ts` — `// @req` tags for REQ-4.12-5: (a) cleanup runs and sentinel is written when sentinel is absent, (b) cleanup is skipped when sentinel is present, (c) cleanup continues (non-blocking; only a warning logged) when `removeCacheDir` throws. Import from `databaselayer/store/migrationCleanup.ts` (see T027).

### Implementation

- [X] T026 Update `server.ts` — call `initInMemoryDb()` in a try/catch before `app.listen()`. On catch: `console.error('[store] failed to initialise in-memory database:', err instanceof Error ? err.message : String(err))` followed by `process.exit(1)`. This satisfies REQ-4.12-1 / SC-007. (**Must complete before starting `npm run dev` after Phase 3 or Phase 5 edits** — once `getDb()` calls exist in `metricsCache.ts` / `metricsSync.ts`, an uninitialised store throws `AppStoreNotInitialisedError` on every request.)
- [X] T027 Create `databaselayer/store/migrationCleanup.ts` — export `async function runMigrationCleanup(): Promise<void>`. Logic: check existence of `data/.migrated-to-sqlite` via `readJsonCache`; if absent, call `removeCacheDir('data/cache/metrics-result')` and `removeCacheDir('data/sync-logs')` each in a separate try/catch (log `console.warn` on failure, never throw); write sentinel via `writeJsonCache('data/.migrated-to-sqlite', { migratedAt: new Date().toISOString() })`; log one-time migration notice. If sentinel present, return immediately. (Standalone module — not embedded in `server.ts` — so `tests/unit/migrationCleanup.test.ts` can import and test it without booting Express.)
- [X] T028 Import `runMigrationCleanup` from `databaselayer/store/migrationCleanup.ts` in `server.ts`. Call `await runMigrationCleanup()` after `initInMemoryDb()` and before `startMetricsSyncJob()`.
- [X] T029 Run `tests/unit/migrationCleanup.test.ts` — confirm all three cleanup cases pass.
- [X] T030 Run quickstart Scenario 1 (fail-fast) and Scenario 2 (migration cleanup) from `quickstart.md` to validate end-to-end startup behaviour.
- [X] T030a Run `npx tsx scripts/check-traceability.ts` after T029 — early traceability check on all new `@req` tags before the Phase 8 full sweep.

**Checkpoint**: Server aborts with non-zero exit code and diagnostic message when `better-sqlite3` native binary is absent. Sentinel file gates legacy cleanup on first startup. All new unit tests pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final traceability, cleanup, and validation pass.

- [X] T031 [P] Final merge-gate: run `npm test` (Vitest + traceability checker) — all tests green, zero untested/orphaned/untagged items. All new `@req REQ-4.12-x` tags must map to passing `it()` blocks.
- [X] T032 [P] Confirm `package.json` production `dependencies` contains only pre-existing packages plus `better-sqlite3` — no extra packages crept in (SC-005 verification).
- [X] T033 Verify no new JSON cache files are written after any sync run: `ls data/cache/metrics-result/ 2>/dev/null` and `ls data/sync-logs/*.json 2>/dev/null` must both produce no output (quickstart Scenario "No new JSON cache files").
- [X] T034 [P] Confirm `databaselayer/cache/cacheEviction.ts` call in `server.ts` is a no-op when `data/cache/` no longer contains `metrics-result/` — no code change needed; verify `evictOldCacheMonths` handles a missing directory gracefully (it already uses `listCacheMonths` which returns `[]` on ENOENT).
- [X] T035 Run `npm run build` — confirm TypeScript compilation is clean with strict mode and no `any` escapes without justifying comments.

**Checkpoint**: Full test suite green. Traceability checker passes. Build clean. No JSON cache files written by the new code.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 (need `better-sqlite3` installed)
- **Phases 3–6 (User Stories)**: All depend on Phase 2 (`databaselayer/store/inMemoryDb.ts` must exist)
  - Phase 3 and Phase 7 can be developed in parallel (different files)
  - Phase 4 depends on Phase 3 (validates SQLite cache hit path)
  - Phase 5 is independent of Phase 3/4 (different tables, different module)
  - Phase 6 depends on Phase 3 (validates `oldestCachedAt`)
- **Phase 7 (Startup)**: Can be done in parallel with Phases 3–6; must be complete before production deploy
- **Phase 8 (Polish)**: Depends on all prior phases

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only
- **US2 (P1)**: Depends on US1 (dashboard cache-hit validation requires working `getCachedMetrics`)
- **US3 (P2)**: Depends on Phase 2 only — independent of US1/US2 (different table)
- **US4 (P2)**: Depends on US1 (validates `oldestCachedAt` from `getCachedMetrics`)

### Parallel Opportunities

- T003 (store test) and T007 (metrics cache test) and T016 (sync log test) and T025 (migration cleanup test) can all be written in parallel before any implementation starts
- T008 and T009 within US1 can be written in parallel (different exported functions in same file — coordinate on imports)
- T017, T018, T019 within US3 can be written in parallel after T016 passes
- T013 (US2 confirm) and T016 (US3 test write) can be done in parallel while T011 (US1 tests) is running

---

## Parallel Example: Phase 2 Foundational

```text
Parallelizable:
  Task T003: Write tests/unit/inMemoryDb.test.ts
  Task T004: Create databaselayer/store/inMemoryDb.ts

Sequential after T004:
  Task T005: Add AppStoreNotInitialisedError (same file as T004)
  Task T006: Run tests — confirm pass
```

## Parallel Example: Write all new test files first

```text
Parallel batch (no dependencies between them):
  Task T003: tests/unit/inMemoryDb.test.ts
  Task T007: tests/unit/metricsCache.sqlite.test.ts
  Task T016: tests/unit/metricsSync.sqlite.test.ts
  Task T025: tests/unit/migrationCleanup.test.ts
```

---

## Implementation Strategy

### MVP Scope (US1 + fail-fast startup — delivers the core P1 value)

1. Phase 1: Install `better-sqlite3`
2. Phase 2: Create `databaselayer/store/inMemoryDb.ts` (T003–T006)
3. Phase 3: Migrate metrics cache (T007–T012)
4. Phase 7: Wire `server.ts` startup (T025–T030)
5. **STOP and VALIDATE**: Sync runs without file I/O errors; `GET /metrics` returns from SQLite cache. Quickstart Scenarios 1, 2, 3 pass.

### Incremental Delivery

1. MVP above → no more file I/O race conditions (US1 delivered)
2. Add Phase 5 (run logs) → admin Run History table works (US3 delivered)
3. Phase 4 and Phase 6 are validation-only phases — no new code, only confirmations
4. Phase 8 (polish) → traceability clean, build green → ready to merge

### Single Developer Strategy

Work sequentially: Phase 1 → 2 → 3 → 7 → 5 → 4 → 6 → 8. Each phase is independently verifiable with `npm test` at the checkpoint.

---

## Notes

- `[P]` tasks touch different files; they can be done in any order or truly in parallel with a team
- `[Story]` labels map each task to the spec user story for traceability
- Every new test file must have `// @req REQ-*` tags immediately before each `it()` block — required by Principle I
- `npm test` runs both Vitest and the traceability checker; run it after every phase checkpoint
- `databaselayer/cache/jsonFileCache.ts` is **not** deleted — still used by `syncRouter.ts` for `data/sync-config.json` and by `runMigrationCleanup` for the sentinel file
- `databaselayer/cache/cacheEviction.ts` is **not** modified — it evicts month-subdirectory caches, not `metrics-result/`
- After Phase 3, `data/cache/metricsCache.ts` no longer imports from `jsonFileCache.ts` — confirm no circular dependency issues
