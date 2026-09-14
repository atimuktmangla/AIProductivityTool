---
description: "Task list for Delta Cache Strategy"
---

# Tasks: Delta Cache Strategy

**Input**: Design documents from `specs/004-delta-cache-strategy/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: Each FR needs `// @req REQ-004-FR-*` before merge.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Verify green baseline (`npm run build`, `npm test`) before changes

---

## Phase 2: Foundational

- [X] T002 Split TTL: `METRICS_CACHE_TTL_MS` (changelog) vs `METRICS_SQLITE_TTL_MS` (default 0) in `backend/config/cacheTtl.ts`
- [X] T003 [P] Add `windowKind.ts`, `monthSlice.ts`, `metricsMerge.ts` under `backend/metrics/`
- [X] T004 Migrate `metrics_cache` schema: `window_kind`, `current_month` in `appStore.ts`

---

## Phase 3: User Story 1 — Durable SQLite (P1)

- [X] T005 [US1] Rewrite `getCachedMetrics` / `setCachedMetrics` for rolling-90 stable key
- [X] T006 [US1] Wire `METRICS_SQLITE_TTL_MS` in `metricsRouter.ts` and `metricsSync.ts`
- [X] T007 [US1] Write `tests/unit/windowKind.test.ts` and durable TTL tests in `deltaCacheStrategy.test.ts`

---

## Phase 4: User Story 2 — Current-month refresh (P1)

- [X] T008 [US2] Implement `needsGapRefresh`, `getGapRefreshRange`, `resolveMetricsFromCache`
- [X] T009 [US2] Add `markCurrentMonthStale`, `purgeCachedMetrics`; `POST /sync/refresh` in `syncRouter.ts`
- [X] T010 [US2] Export `triggerRefreshForUsers` from `metricsSync.ts`
- [X] T011 [US2] Gap-merge and refresh tests in `deltaCacheStrategy.test.ts`, `syncRefreshEndpoint.test.ts`

---

## Phase 5: User Story 3 — Delta upstream (P2)

- [X] T012 [US3] Create `openPrCache.ts`, `reviewedPrCache.ts`, `jiraSearchCache.ts`
- [X] T013 [US3] Wire delta caches in `aggregator.ts`
- [X] T014 [US3] Delta envelope tests in `deltaCacheStrategy.test.ts`

---

## Phase 6: Polish

- [X] T015 Add REQ-004-FR-001–011 to `docs/FUNCTIONAL_SPEC.md`
- [X] T016 Update `.env.example`, `CLAUDE.md` SPECKIT section
- [X] T017 Run `npm test` + traceability checker — all green

---

## Dependencies

- Phase 2 blocks Phases 3–5
- US1 (Phase 3) before US2 gap merge
- US3 independent of US2 after Phase 2

## Parallel opportunities

- T003 + T004 in parallel
- T012 delta cache files in parallel
- T007 + T011 test files after implementation slices
