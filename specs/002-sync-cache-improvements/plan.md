# Implementation Plan: Sync Cache Improvements

**Branch**: `main` | **Date**: 2026-06-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-sync-cache-improvements/spec.md`

---

## Summary

Three tightly related improvements to the sync job and its admin UI:
1. **Progress cap** — `getSyncStatus()` serialises at most 50 completed users (most recent) plus all failed users; `totalSyncUsers` is always the true count. The UI drops its client-side `.slice(-50)` and overflow chip, superseded by the server-side cap.
2. **Cache-skip on manual run** — `runSync()` calls `getCachedMetrics` per user before hitting the upstream API; fresh users (< 1 h old) are promoted to `completedUsers` immediately. The batch log records each user's `source` (`'live' | 'cache'`).
3. **Delta warm-up** — two new endpoints (`GET /cache-coverage`, `POST /warmup`), a Cache Coverage card in the admin UI, a "Warm Missing Cache" button, and `scripts/warm-cache.ps1` + `scripts/warm-cache.cmd` for scheduled/automated use.

All changes are additive or narrowly scoped. No existing public function signatures change. No new `npm` packages required.

---

## Technical Context

**Language/Version**: TypeScript 5.5 / Node.js 18.20.8 (ESM, `"type": "module"`)

**Primary Dependencies**:
- `better-sqlite3` — already installed (in-memory SQLite singleton)
- `express` — already installed (REST API host)
- No new production dependencies

**Storage**: In-memory SQLite via `databaselayer/store/inMemoryDb.ts` (single connection, initialised at startup). `data/sync-config.json` remains file-based (exempt per Principle VI).

**Testing**: Vitest (`npm test`) + `scripts/check-traceability.ts`. New unit tests follow the pattern in `tests/unit/metricsSync.sqlite.test.ts`.

**Target Platform**: Windows Server / Linux, on-prem. Node.js 18.20.8. PowerShell 5.1+ for warm-up scripts.

**Project Type**: Web service (Express REST API, TypeScript backend) + React/Vite frontend (`UI/`).

**Performance Goals**: Cache-skip path for 50 users completes in < 5 s (SC-002). Status payload stays lean at ≤ 50 completed users per poll (SC-001).

**Constraints**: Single SQLite connection (Principle VI). No new production packages. All existing public function signatures unchanged (FR-011).

**Scale/Scope**: 50–200 developers, batches of 6, up to 50 run logs retained.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I — Spec-to-Code Traceability | New REQ tags required for each new FR. Traceability checker must pass before merge. | ✅ Addressed in task list — each step names its `@req` tag |
| II — Boundary-First Security | Two new endpoints require input validation. `sync-config.json` is read internally (not from request body) — trust boundary remains the HTTP layer. | ✅ Validated in syncRouter |
| III — Working-Hours Accuracy | Not touched. | ✅ N/A |
| IV — Opt-In Extensibility | Not touched. | ✅ N/A |
| V — Simplicity Over Abstraction | Cache-skip is a pre-loop `getCachedMetrics` call, not a new class. New endpoints are two route handlers. Scripts are ~30 lines each. No new abstractions. | ✅ |
| VI — In-Memory SQLite Storage Law | All cache reads/writes use `databaselayer/store/inMemoryDb.ts`. Warmup reads `sync-config.json` via existing `readJsonCache` (config, exempt). No new JSON writes for metrics or logs. | ✅ |

**Post-design re-check**: All six principles satisfied. Complexity Tracking table not needed.

---

## Project Structure

### Documentation (this feature)

```text
specs/002-sync-cache-improvements/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions and rationale
├── data-model.md        # Phase 1 — entity contracts
├── contracts/
│   └── sync-api.md      # Phase 1 — new endpoint shapes
├── quickstart.md        # Phase 1 — validation scenarios
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16 passing)
└── tasks.md             # Phase 2 — NOT YET CREATED (/speckit-tasks)
```

### Source Code (affected files)

```text
# Modified files — backend
jobs/metricsSync.ts             # getSyncStatus() cap; runSync() cache-skip; SyncBatchLog source field
api/routes/syncRouter.ts        # GET /cache-coverage, POST /warmup

# Modified files — frontend
frontend/src/components/SyncPage.tsx  # Remove client-side .slice(-50); add CacheCoverageCard + warmup button
frontend/src/hooks/useSync.ts         # Add warmupMissing() + fetchCoverage(); coverage state

# New files — scripts
scripts/warm-cache.ps1          # PowerShell warm-up caller
scripts/warm-cache.cmd          # CMD wrapper

# New test files
tests/unit/syncStatusCap.test.ts          # REQ-002-FR-001: completedUsers capped to 50
tests/unit/syncCacheSkip.test.ts          # REQ-002-FR-003/004: cache-skip + source field
tests/unit/cacheCoverageEndpoint.test.ts  # REQ-002-FR-005: /cache-coverage response shape
tests/unit/warmupEndpoint.test.ts         # REQ-002-FR-006: /warmup skip/queue logic

# Unchanged files (confirmed)
databaselayer/cache/metricsCache.ts        # getCachedMetrics signature unchanged
databaselayer/store/inMemoryDb.ts          # No schema changes (source field is inside batches_json column)
types/index.ts                  # SyncBatchLog extended with optional source field only
```

**Structure Decision**: Web service with co-located React frontend. Backend changes in `jobs/` and `api/routes/`; frontend changes in `frontend/src/`; scripts at repo root `scripts/`.

---

## Implementation Sequence

Steps keep `npm run build` and `npm test` green at every checkpoint.

### Step 1 — Cap `completedUsers` in `getSyncStatus()`

In `jobs/metricsSync.ts`, change the `getSyncStatus()` return to slice completed users:
- Return `completedUsers.slice(-50)` for the `completedUsers` field.
- `totalSyncUsers` and `failedUsers` remain unsliced.

Write `tests/unit/syncStatusCap.test.ts`:
- `// @req REQ-002-FR-001` — status returns ≤ 50 completed users when 80 have completed
- `// @req REQ-002-FR-001` — `totalSyncUsers` still equals full count (80)
- `// @req REQ-002-FR-001` — all failed users appear regardless of count

### Step 2 — Remove client-side slice in `SyncPage.tsx`

In `frontend/src/components/SyncPage.tsx`:
- Remove `.slice(-50)` on `status.completedUsers` (currently line 325).
- Remove the `sync-progress-chip--overflow` block (currently lines 329–332).

The server now guarantees ≤ 50; no client-side slicing or overflow chip needed.

### Step 3 — Add `source` field + cache-skip in `runSync()`

In `jobs/metricsSync.ts`:

1. Extend `SyncBatchLog` with `source?: 'live' | 'cache'` (optional, backwards-compatible with existing `batches_json` stored in SQLite).

2. Add `METRICS_CACHE_TTL_MS = 60 * 60 * 1000` as a module-level constant (avoids circular import through the router; the router continues to use its own local constant with the same value).

3. Import `getCachedMetrics` from `databaselayer/cache/metricsCache.js`.

4. Inside the `batch.map(async (userId) => …)` closure, before `aggregateMetrics`, add:
   ```
   const { hits } = await getCachedMetrics([userId], startDate, endDate, METRICS_CACHE_TTL_MS);
   if (hits.length > 0) {
     completedUsers = [...completedUsers, userId];
     return { userId, status: 'ok' as const, source: 'cache' as const };
   }
   ```
   On a miss, fall through to the existing `aggregateMetrics` call and mark `source: 'live'`.

5. Update `batchUserLogs` construction to propagate `source` from each result.
   Update `SyncBatchLog` construction to include `source` in the per-user detail (stored in `batches_json`).

Write `tests/unit/syncCacheSkip.test.ts`:
- `// @req REQ-002-FR-003` — fresh cache hit skips `aggregateMetrics` call
- `// @req REQ-002-FR-003` — stale/absent entry calls `aggregateMetrics`
- `// @req REQ-002-FR-004` — batch log records `source: 'cache'` for skipped users
- `// @req REQ-002-FR-004` — batch log records `source: 'live'` for fetched users

### Step 4 — Add `GET /cache-coverage` endpoint

In `api/routes/syncRouter.ts`:

1. Export `dateRange()` from `metricsSync.ts` (or duplicate the 3-line helper locally).
2. Add `syncRouter.get('/cache-coverage', …)` handler:
   - Read `sync-config.json` via `readJsonCache`. If null → return `{ configuredUsers: 0, cachedUsers: 0, uncachedUsers: [], staleUsers: [] }`.
   - Call `getCachedMetrics(allUsers, startDate, endDate, METRICS_CACHE_TTL_MS)`.
   - Return `CacheCoverage` shape: `{ configuredUsers, cachedUsers, uncachedUsers, staleUsers }`.

Write `tests/unit/cacheCoverageEndpoint.test.ts`:
- `// @req REQ-002-FR-005` — returns correct hit/miss counts when config present
- `// @req REQ-002-FR-005` — returns zero counts when config absent

### Step 5 — Add `POST /warmup` endpoint

In `api/routes/syncRouter.ts`, add `syncRouter.post('/warmup', …)` handler:

1. Check `getSyncStatus().running` → HTTP 409 `{ error: 'A sync is already running' }`.
2. Read `sync-config.json`. Empty/absent → HTTP 400 `{ error: 'No users configured' }`.
3. Call `getCachedMetrics(allUsers, startDate, endDate, METRICS_CACHE_TTL_MS)`.
4. `queuedUsers = misses`. If empty → respond `{ skipped: hits.length, queued: 0, queuedUsers: [] }`.
5. Otherwise `triggerSyncForUsers(queuedUsers)` → respond `{ skipped: hits.length, queued: queuedUsers.length, queuedUsers }` HTTP 202.

Write `tests/unit/warmupEndpoint.test.ts`:
- `// @req REQ-002-FR-006` — returns 409 when a sync is running
- `// @req REQ-002-FR-006` — returns 400 when no config
- `// @req REQ-002-FR-006` — queues only cache-miss users; skipped count matches hits
- `// @req REQ-002-FR-006` — returns 200 with `queued: 0` when all users are cached

### Step 6 — Create `scripts/warm-cache.ps1` and `scripts/warm-cache.cmd`

`scripts/warm-cache.ps1`:
- Parse `.env` from repo root for `PORT` (fallback `3000`) and `VITE_API_KEY`.
- POST to `http://localhost:$port/api/dashboard/sync/warmup` with `X-Api-Key: $key` header.
- Print response summary: `Skipped: N (cached). Queued: M.` (append `Nothing to warm.` when M = 0).
- Exit 0 on HTTP 2xx; exit 1 on connection error or non-2xx.

`scripts/warm-cache.cmd`:
```cmd
@echo off
powershell.exe -ExecutionPolicy Bypass -File "%~dp0warm-cache.ps1"
exit /b %ERRORLEVEL%
```

### Step 7 — Frontend: Cache Coverage card + warmup button

`frontend/src/hooks/useSync.ts`:
- Add `coverage: CacheCoverage | null` + `isWarmingUp: boolean` to `SyncPageState`.
- Add `fetchCoverage()` — GET `/api/dashboard/sync/cache-coverage`.
- Add `warmupMissing()` — POST `/api/dashboard/sync/warmup`; on response, refresh status + coverage.
- Include `fetchCoverage` in the 30 s idle polling effect.

`frontend/src/components/SyncPage.tsx`:
- Add `CacheCoverageCard` inline component: shows `{cachedUsers} / {configuredUsers} users cached`; lists uncached names ≤ 5 with `+N more` overflow; renders `Skeleton` while `coverage === null`.
- Add "Warm Missing Cache" `<button>` below the card: disabled when `isRunning || (coverage?.uncachedUsers.length ?? 0) === 0 || isWarmingUp`; tooltip explains why disabled; `onClick` → `warmupMissing()`.
- Add `CacheCoverage` and `WarmupResult` interfaces to `frontend/src/types/index.ts` (or inline in `useSync.ts` if no separate frontend types file exists).

### Step 8 — Run full test suite + traceability check

```bash
npm test   # vitest run + check-traceability.ts
```

All existing tests must pass unchanged. New tests must carry `// @req REQ-002-FR-*` tags. Traceability checker must report zero untested, orphaned, or untagged items.

---

## Spec → Requirement Traceability

| Canonical REQ ID | Spec ref | Test file | Coverage |
|---|---|---|---|
| REQ-002-FR-001 | FR-001, FR-002 | `tests/unit/syncStatusCap.test.ts` | completedUsers ≤ 50; totalSyncUsers accurate; failedUsers untruncated |
| REQ-002-FR-003 | FR-003 | `tests/unit/syncCacheSkip.test.ts` | fresh hit skips aggregateMetrics; stale/absent calls it |
| REQ-002-FR-004 | FR-004 | `tests/unit/syncCacheSkip.test.ts` | source: 'cache' and source: 'live' recorded in batch log |
| REQ-002-FR-005 | FR-005 | `tests/unit/cacheCoverageEndpoint.test.ts` | /cache-coverage returns hit/miss counts; handles missing config |
| REQ-002-FR-006 | FR-006 | `tests/unit/warmupEndpoint.test.ts` | 409 running; 400 no config; queues misses; 200 all cached |

FR-007/FR-008 (UI) and FR-009/FR-010 (scripts) are verified by manual testing (SC-004, SC-005, SC-007).
FR-011 (no signature changes) is verified by the existing test suite passing unchanged.
