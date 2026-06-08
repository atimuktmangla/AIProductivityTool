---
description: "Task list for Sync Cache Improvements"
---

# Tasks: Sync Cache Improvements

**Input**: Design documents from `specs/002-sync-cache-improvements/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/sync-api.md ✅ quickstart.md ✅

**Tests**: Test tasks are included per the plan's traceability requirements (each FR needs a `@req`-tagged test before merge).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared state dependencies)
- **[Story]**: User story label (US1–US5, maps to spec.md user stories)

---

## Phase 1: Setup (No new setup needed)

**Purpose**: Confirm build passes before any changes. No new packages, files, or config required.

- [X] T001 Verify `npm run build` and `npm test` pass on the current branch before any changes

---

## Phase 2: Foundational (Shared Prerequisites)

**Purpose**: Small shared changes that multiple user stories depend on. MUST complete before US2–US5.

**⚠️ CRITICAL**: Steps here unlock US2 (cache-skip), US3 (warmup endpoint), and US5 (coverage endpoint).

- [X] T002 Export `dateRange()` from `jobs/metricsSync.ts` so `WEB/routes/syncRouter.ts` can import it (needed by /cache-coverage and /warmup endpoints)
- [X] T003 [P] Add `METRICS_CACHE_TTL_MS = 60 * 60 * 1000` as a module-level constant at the top of `jobs/metricsSync.ts`
- [X] T004 [P] Add `import { getCachedMetrics } from '../DB/cache/metricsCache.js'` to `jobs/metricsSync.ts`
- [X] T005 [P] Add `CacheCoverage` and `WarmupResult` interfaces to `jobs/metricsSync.ts` (exported, used by syncRouter and frontend types)
- [X] T006 [P] Add `CacheCoverage` and `WarmupResult` interfaces to `UI/src/types/index.ts` (frontend counterparts matching contracts/sync-api.md shapes)

**Checkpoint**: Build must still pass (`npm run build`) before proceeding.

---

## Phase 3: User Story 1 — Progress Panel Cap (Priority: P1) 🎯 MVP

**Goal**: The status API caps `completedUsers` to 50 (most recent) server-side, and the UI removes its now-redundant client-side slicing logic.

**Independent Test**: Trigger a sync for 80 users, poll `/api/dashboard/sync/status` — `completedUsers.length` must never exceed 50 while `totalSyncUsers` stays 80. Open the admin UI and verify no overflow chip is rendered.

### Tests for User Story 1

- [X] T007 [US1] Write `tests/unit/syncStatusCap.test.ts` with three `// @req REQ-002-FR-001` tests: (a) completedUsers ≤ 50 when 80 have completed, (b) totalSyncUsers equals 80, (c) all failed users present regardless of count

### Implementation for User Story 1

- [X] T008 [US1] In `jobs/metricsSync.ts` `getSyncStatus()`: change `completedUsers: [...completedUsers]` to `completedUsers: completedUsers.slice(-50)` — leave `failedUsers` and `totalSyncUsers` unchanged
- [X] T009 [US1] In `UI/src/components/SyncPage.tsx`: remove `.slice(-50)` on `status.completedUsers` (currently ~line 325) and remove the `sync-progress-chip--overflow` block (~lines 329–332) — server now guarantees ≤ 50

**Checkpoint**: `npm test` — T007 tests pass. `npm run build` passes. Manually verify progress panel in UI.

---

## Phase 4: User Story 2 — Manual Sync Cache-Skip (Priority: P1)

**Goal**: `runSync()` checks the SQLite cache before calling the upstream metrics API for each user. Fresh users (< 1 h) are promoted to completed without any Bitbucket/Jira calls. Each user's batch log entry records `source: 'cache'` or `source: 'live'`.

**Independent Test**: Run a full sync for 5 users. Immediately trigger a second manual sync for the same 5 users. Second run completes in < 5 s with zero `[sync] user X — start` log lines. Expand the run history batch row and verify `source: "cache"` on all 5 entries.

### Tests for User Story 2

- [X] T010 [US2] Write `tests/unit/syncCacheSkip.test.ts` with four `// @req REQ-002-FR-003` / `// @req REQ-002-FR-004` tests: (a) fresh cache hit skips `aggregateMetrics`, (b) stale/absent entry calls `aggregateMetrics`, (c) batch log records `source: 'cache'` for skipped users, (d) batch log records `source: 'live'` for fetched users

### Implementation for User Story 2

- [X] T011 [US2] In `jobs/metricsSync.ts`: extend `SyncBatchLog` interface with `source?: 'live' | 'cache'` (optional field — backwards-compatible with existing `batches_json` rows)
- [X] T012 [US2] In `jobs/metricsSync.ts` `runSync()`: inside the `batch.map(async (userId) => …)` closure, add a `getCachedMetrics([userId], startDate, endDate, METRICS_CACHE_TTL_MS)` pre-check before the `aggregateMetrics` call — on a hit, push to `completedUsers` and return `{ userId, status: 'ok', source: 'cache' }` immediately
- [X] T013 [US2] In `jobs/metricsSync.ts` `runSync()`: on a cache miss, call `aggregateMetrics` as before and return `{ userId, status: 'ok', source: 'live' }` (or `status: 'error'` on failure)
- [X] T014 [US2] In `jobs/metricsSync.ts` `runSync()`: update `batchUserLogs` construction and `SyncBatchLog` push to propagate the `source` field from each per-user result into `batches_json`

**Checkpoint**: `npm test` — T010 tests pass. Second manual sync for already-cached users shows all `source: "cache"` in run history.

---

## Phase 5: User Story 3 — Delta Warm-Up Endpoints (Priority: P2, backend prerequisite for US3 UI and US5)

**Goal**: Two new Express endpoints — `GET /cache-coverage` and `POST /warmup` — are live. The warmup endpoint reads configured users from `sync-config.json`, identifies cache misses, and triggers a sync for only those users.

**Independent Test**: With 3 of 5 configured users cached, `GET /cache-coverage` returns `{ configuredUsers: 5, cachedUsers: 3, uncachedUsers: ["u4","u5"], staleUsers: [] }`. `POST /warmup` returns HTTP 202 `{ skipped: 3, queued: 2, queuedUsers: ["u4","u5"] }` and triggers the sync for exactly those 2 users.

### Tests for User Story 3 (Endpoints)

- [X] T015 [P] [US3] Write `tests/unit/cacheCoverageEndpoint.test.ts` with two `// @req REQ-002-FR-005` tests: (a) returns correct hit/miss counts when config present, (b) returns all-zero result when `sync-config.json` is absent
- [X] T016 [P] [US3] Write `tests/unit/warmupEndpoint.test.ts` with four `// @req REQ-002-FR-006` tests: (a) 409 when running, (b) 400 when no config, (c) queues only cache-miss users and skipped count matches hits, (d) 200 with `queued: 0` when all users cached

### Implementation for User Story 3 (Endpoints)

- [X] T017 [US3] In `WEB/routes/syncRouter.ts`: add `import { getCachedMetrics } from '../../DB/cache/metricsCache.js'` and `import { dateRange, getSyncStatus, triggerSyncForUsers } from '../../jobs/metricsSync.js'` (extend existing import)
- [X] T018 [US3] In `WEB/routes/syncRouter.ts`: implement `syncRouter.get('/cache-coverage', …)` — read `sync-config.json`, call `getCachedMetrics` for all configured users using `dateRange()` and `METRICS_CACHE_TTL_MS`, return `CacheCoverage` shape (see contracts/sync-api.md)
- [X] T019 [US3] In `WEB/routes/syncRouter.ts`: implement `syncRouter.post('/warmup', …)` — check `getSyncStatus().running` (→ 409), read config (→ 400 if absent/empty), call `getCachedMetrics` to split hits vs. misses, call `triggerSyncForUsers(misses)` if any, return `WarmupResult` shape (202 with users queued, 200 if none queued)

**Checkpoint**: `npm test` — T015 and T016 tests pass. Manually verify endpoint responses via curl or the quickstart.md Scenarios 3 and 4.

---

## Phase 6: User Story 4 — Warm-Up Scripts (Priority: P2)

**Goal**: `scripts/warm-cache.ps1` and `scripts/warm-cache.cmd` call `POST /warmup`, print a human-readable summary, and exit with code 0 on success / 1 on failure. Can be registered with Windows Task Scheduler.

**Independent Test**: Run `scripts/warm-cache.ps1` with the server running — prints `Skipped: N (cached). Queued: M.` and exits 0. Run with server stopped — prints error and exits 1. Double-click `warm-cache.cmd` — same behaviour, exit code propagates.

### Implementation for User Story 4

- [X] T020 [P] [US4] Create `scripts/warm-cache.ps1`: parse `.env` from repo root for `PORT` (fallback 3000) and `VITE_API_KEY`, POST to `http://localhost:$port/api/dashboard/sync/warmup` with `X-Api-Key` header, print `Skipped: $skipped (cached). Queued: $queued.` (append `Nothing to warm.` when queued = 0), exit 0 on HTTP 2xx, exit 1 on connection error or non-2xx
- [X] T021 [P] [US4] Create `scripts/warm-cache.cmd`: two-line CMD wrapper that calls `powershell.exe -ExecutionPolicy Bypass -File "%~dp0warm-cache.ps1"` and propagates `%ERRORLEVEL%` (see contracts/sync-api.md Scenario 6)

**Checkpoint**: Manual validation per quickstart.md Scenario 6 — success, nothing-to-warm, and unreachable-server cases.

---

## Phase 7: User Story 5 — Cache Coverage Card + Warmup Button (Priority: P2/P3 UI)

**Goal**: The Sync Jobs admin panel shows a Cache Coverage card (`N / M users cached`, lists up to 5 uncached names with overflow) and a "Warm Missing Cache" button. Both auto-refresh at the 30 s polling interval. The button is disabled when all users are cached or a sync is running.

**Independent Test**: With 3 of 5 configured users cached, open the Sync Jobs tab — card shows `3 / 5 users cached` and names the 2 uncached users. Click "Warm Missing Cache" — progress panel appears for 2 users. With all cached — button disabled, tooltip "All users are cached". While running — button disabled, tooltip "A sync is already running".

### Implementation for User Story 5

- [X] T022 [US5] In `UI/src/hooks/useSync.ts`: add `coverage: CacheCoverage | null` and `isWarmingUp: boolean` to `SyncPageState` and `initialState`
- [X] T023 [US5] In `UI/src/hooks/useSync.ts`: add `SET_COVERAGE` and `WARMUP_START` / `WARMUP_DONE` action types to the `Action` union and handle them in the reducer
- [X] T024 [US5] In `UI/src/hooks/useSync.ts`: implement `fetchCoverage()` — `apiFetch<CacheCoverage>('/api/dashboard/sync/cache-coverage')` → dispatch `SET_COVERAGE`
- [X] T025 [US5] In `UI/src/hooks/useSync.ts`: implement `warmupMissing()` — dispatch `WARMUP_START`, `apiFetch<WarmupResult>('/api/dashboard/sync/warmup', { method: 'POST' })`, then `fetchStatus()` + `fetchCoverage()`, dispatch `WARMUP_DONE`
- [X] T026 [US5] In `UI/src/hooks/useSync.ts`: include `fetchCoverage()` in the initial load `useEffect` and in the polling `useEffect` (30 s idle interval alongside `fetchStatus` and `fetchLogs`)
- [X] T027 [US5] In `UI/src/hooks/useSync.ts`: expose `warmupMissing` and `coverage` / `isWarmingUp` in the hook return value
- [X] T028 [US5] In `UI/src/components/SyncPage.tsx`: add inline `CacheCoverageCard` component — displays `{cachedUsers} / {configuredUsers} users cached`, lists `uncachedUsers` (≤ 5 names, then `+N more` overflow), renders `<Skeleton>` while `coverage === null`, shows "No users configured" when `configuredUsers === 0`
- [X] T029 [US5] In `UI/src/components/SyncPage.tsx`: place `<CacheCoverageCard>` in a new `<section className="sync-page__section">` between the Status card and the Progress panel (or below the Status card when no run is active)
- [X] T030 [US5] In `UI/src/components/SyncPage.tsx`: add "Warm Missing Cache" `<button>` below the coverage card — disabled when `isRunning || (coverage?.uncachedUsers.length ?? 0) === 0 || isWarmingUp`; `title` prop shows `"All users are cached"` or `"A sync is already running"` as appropriate; `onClick` → `warmupMissing()`

**Checkpoint**: Manual validation per quickstart.md Scenario 5 — coverage card, warmup button states, and auto-refresh.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Traceability gate, final integration check, and type exports.

- [X] T031 Verify `UI/src/types/index.ts` exports `CacheCoverage` and `WarmupResult` (created in T006) are used consistently by `SyncPage.tsx` and `useSync.ts` — no `any` or inline type literals
- [X] T032 Run `npm test` (vitest run + traceability checker) — all existing tests pass, all new `// @req REQ-002-*` tags present, zero untested/orphaned items reported
- [X] T033 Run `npm run build` — zero TypeScript errors
- [X] T034 [P] Run quickstart.md Scenario 1 manually (progress cap with 80+ users)
- [X] T035 [P] Run quickstart.md Scenario 2 manually (cache-skip on second run)
- [X] T036 [P] Run quickstart.md Scenarios 3–6 manually (endpoints, UI, scripts)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS US2, US3, US4, US5**
- **Phase 3 (US1 — cap)**: Depends on Phase 1 only — can start in parallel with Phase 2
- **Phase 4 (US2 — cache-skip)**: Depends on Phase 2 (needs `getCachedMetrics` import + `METRICS_CACHE_TTL_MS`)
- **Phase 5 (US3 — endpoints)**: Depends on Phase 2 (needs `dateRange()` export + `CacheCoverage`/`WarmupResult` types)
- **Phase 6 (US4 — scripts)**: Depends on Phase 5 (scripts call the `/warmup` endpoint)
- **Phase 7 (US5 — UI)**: Depends on Phases 5 and 2 (hooks call `/cache-coverage` and `/warmup`)
- **Phase 8 (Polish)**: Depends on all above

### User Story Dependencies

| Story | Depends on | Independent from |
|---|---|---|
| US1 (cap) | Phase 1 only | US2, US3, US4, US5 |
| US2 (cache-skip) | Phase 2 (T002–T006) | US1, US3, US4, US5 |
| US3 (endpoints) | Phase 2 (T002, T005) | US1, US2, US4 |
| US4 (scripts) | US3 endpoints live | US1, US2, US5 |
| US5 (UI) | US3 endpoints + Phase 2 types | US1, US2, US4 |

### Within Each Story

- Tests (T007, T010, T015, T016) should be written first — confirm they fail — then implement
- Foundation tasks (T002–T006) can all run in parallel within Phase 2
- Endpoint tests (T015, T016) can run in parallel with each other within Phase 5
- Script tasks (T020, T021) can run in parallel within Phase 6
- Hook state tasks (T022–T027) are sequential; component tasks (T028–T030) follow after hook is complete

---

## Parallel Opportunities

```
# Phase 2 — all can run simultaneously:
T002  Export dateRange() from jobs/metricsSync.ts
T003  Add METRICS_CACHE_TTL_MS constant to jobs/metricsSync.ts
T004  Add getCachedMetrics import to jobs/metricsSync.ts
T005  Add CacheCoverage/WarmupResult to jobs/metricsSync.ts
T006  Add CacheCoverage/WarmupResult to UI/src/types/index.ts

# Phase 5 — tests can run in parallel:
T015  cacheCoverageEndpoint.test.ts
T016  warmupEndpoint.test.ts

# Phase 6 — both scripts are independent:
T020  scripts/warm-cache.ps1
T021  scripts/warm-cache.cmd

# Phase 8 — manual validations in parallel:
T034  Quickstart Scenario 1
T035  Quickstart Scenario 2
T036  Quickstart Scenarios 3–6
```

---

## Implementation Strategy

### MVP First (US1 only — 3 tasks)

1. Complete Phase 1 (T001)
2. Complete T008 + T009 (server cap + UI simplification)
3. Complete T007 (test)
4. **STOP and VALIDATE**: Progress panel shows ≤ 50 chips; `totalSyncUsers` accurate
5. Deploy/demo if sufficient

### Full Incremental Delivery

1. Phase 1 → Phase 2 → Foundation ready
2. US1 (T007–T009) → Progress cap live
3. US2 (T010–T014) → Cache-skip live
4. US3 endpoints (T015–T019) → Coverage + warmup APIs live
5. US4 (T020–T021) → Scripts ready for Task Scheduler
6. US5 UI (T022–T030) → UI coverage card + warmup button live
7. Phase 8 polish → Ship

### Parallel Team Strategy

With two developers after Phase 2 is complete:
- Developer A: US1 + US2 (backend-only, no UI conflict)
- Developer B: US3 endpoints (syncRouter additions, no overlap with metricsSync)
- After both complete: Developer A → US4 scripts; Developer B → US5 UI

---

## Notes

- `[P]` tasks touch different files and have no shared in-progress dependencies
- `source` is an optional field in `SyncBatchLog` — old rows without it deserialise with `source: undefined` (no migration)
- The progress cap (US1) is a 2-line backend change + 2-line UI change; tackle it first for quick wins
- Traceability checker (`npm test`) will fail if any `// @req REQ-002-FR-*` tag is missing from a new test — write tags before running the suite
- `METRICS_CACHE_TTL_MS` is duplicated (metricsSync.ts and metricsRouter.ts) intentionally to avoid circular imports (see research.md Decision 2)
