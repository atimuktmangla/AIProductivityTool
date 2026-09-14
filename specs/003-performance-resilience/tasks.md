---
description: "Task list for Performance & Resilience Remediation"
---

# Tasks: Performance & Resilience Remediation

**Input**: Design documents from `specs/003-performance-resilience/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅ quickstart.md ✅

**Tests**: Included per plan traceability requirements — each FR needs a `// @req REQ-003-FR-*` test before merge.

**Organization**: Tasks grouped by user story (US1–US4). Phases 1–3 shippable without constitution amendment. Phase 6 (US4) gated on Principle VI v1.2.0.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared in-progress dependencies)
- **[Story]**: Maps to spec.md user stories US1–US4

---

## Phase 1: Setup

**Purpose**: Confirm green baseline before any changes.

- [X] T001 Verify `npm run build`, `npm test`, and `cd frontend && npm run build` pass on the current branch before any changes

---

## Phase 2: Foundational (Shared Prerequisites)

**Purpose**: Shared types and TTL constant used by US1 (types) and US2 (cacheTtl). US3 does not depend on this phase.

- [X] T002 Create `backend/config/cacheTtl.ts` exporting `METRICS_CACHE_TTL_MS = 60 * 60 * 1000`
- [X] T003 [P] Add `IssueLinkingMode` and `IssueLinkingStatus` interfaces to `types/index.ts` per `data-model.md`

**Checkpoint**: `npm run build` passes. US1 implementation can begin (T003 required for US1 env/types work).

---

## Phase 3: User Story 1 — Jira Metrics Without DVCS (Priority: P1) 🎯 MVP

**Goal**: Hybrid/assignee/connector issue linking modes; `/ready` reports linking status; work-type and code-quality populate without DVCS connector.

**Independent Test**: Set `JIRA_ISSUE_LINKING_MODE=hybrid`. Run metrics for a developer with assigned Jira tickets and no DVCS. `GET /ready` shows `jiraLinking`. Work-type counts are non-zero. See quickstart.md Scenario 1.

### Tests for User Story 1

- [X] T004 [US1] Write `tests/unit/jiraLinking.test.ts` with `// @req REQ-003-FR-001` tests: valid modes parse; invalid mode throws at config load
- [X] T005 [US1] Add to `tests/unit/jiraLinking.test.ts` `// @req REQ-003-FR-002` tests: hybrid falls back on empty connector result and on connector throw
- [X] T006 [US1] Add to `tests/unit/jiraLinking.test.ts` `// @req REQ-003-FR-003` test: PR-title keys merge with assignee issues, deduped by key
- [X] T007 [US1] Add to `tests/unit/jiraLinking.test.ts` `// @req REQ-003-FR-005` test: `getIssueLinkingStatus()` reflects probe result and config mode

### Implementation for User Story 1

- [X] T008 [US1] In `backend/config/env.ts`: add `issueLinkingMode: IssueLinkingMode` to `AppConfig`; parse `JIRA_ISSUE_LINKING_MODE` (default `hybrid`); throw on invalid value
- [X] T009 [P] [US1] Document `JIRA_ISSUE_LINKING_MODE` in `.env.example` with connector/assignee/hybrid descriptions
- [X] T010 [US1] In `databaselayer/services/jiraService.ts`: implement `buildConnectorJql`, `buildAssigneeJql`, `searchIssuesForDeveloper`, `probeConnectorAvailability`, `getIssueLinkingStatus`, `resetFallbackEngaged` per `contracts/jira-linking.md`
- [X] T011 [US1] In `backend/metrics/aggregator.ts`: replace `searchIssuesByAssignees([devId], …)` with `searchIssuesForDeveloper(devId, …)`; call `resetFallbackEngaged()` at start of each dev aggregation
- [X] T012 [US1] In `server.ts`: call `probeConnectorAvailability()` once after config load; extend `GET /ready` response with `jiraLinking` object per `contracts/ready-api.md`
- [X] T013 [US1] Add `<!-- REQ-003-FR-001 -->` through `<!-- REQ-003-FR-005 -->` tags to `docs/FUNCTIONAL_SPEC.md` documenting issue-linking behaviour

**Checkpoint**: `npm test` — T004–T007 pass. Manual quickstart Scenario 1. `searchIssuesByAssignees` may remain exported for backwards compat but aggregator must not call it directly.

---

## Phase 4: User Story 2 — Spec Metrics Changelog Cache (Priority: P1)

**Goal**: Month-partitioned changelog cache under `data/cache/`; aggregator and sync job reuse stored history within TTL.

**Independent Test**: Enable `SPEC_METRICS_ENABLED=true`. Run metrics twice within 1 hour — second run ≥50% faster. Changelog JSON files appear under `data/cache/{month}/jira-changelog/`. See quickstart.md Scenario 2.

**Depends on**: Phase 2 (T002 for `METRICS_CACHE_TTL_MS`)

### Tests for User Story 2

- [X] T014 [US2] Write `tests/unit/jiraChangelogCache.test.ts` with `// @req REQ-003-FR-006` test: cache hit skips upstream `getIssueChangelog` call (mocked)
- [X] T015 [US2] Add to `tests/unit/jiraChangelogCache.test.ts` `// @req REQ-003-FR-009` test: closed calendar month is write-once (second fetch does not call upstream)
- [X] T016 [US2] Add to `tests/unit/jiraChangelogCache.test.ts` `// @req REQ-003-FR-008` test: null changelog returns null; aggregator excludes ticket silently
- [X] T017 [US2] Add to `tests/unit/jiraChangelogCache.test.ts` `// @req REQ-003-FR-007` test: sync job path calls `getCachedIssueChangelog` for linked issue keys when spec metrics enabled (mock `aggregateMetrics` result)

### Implementation for User Story 2

- [X] T018 [US2] Create `databaselayer/cache/jiraChangelogCache.ts` implementing `getCachedIssueChangelog()` per `contracts/internal-cache-api.md` (mirror `bitbucketCache.ts` month/TTL helpers)
- [X] T019 [US2] In `api/routes/metricsRouter.ts`: replace local `METRICS_CACHE_TTL_MS` constant with import from `backend/config/cacheTtl.js`
- [X] T020 [US2] In `jobs/metricsSync.ts`: replace local `METRICS_CACHE_TTL_MS` with import from `backend/config/cacheTtl.js`
- [X] T021 [US2] In `backend/metrics/aggregator.ts`: replace `getIssueChangelog(issue.key)` with `getCachedIssueChangelog(issue.key)`
- [X] T022 [US2] In `jobs/metricsSync.ts`: after successful per-user sync when `specMetricsEnabled`, collect linked issue keys from cached metric and call `getCachedIssueChangelog` for each (pre-warm)
- [X] T023 [US2] Add `<!-- REQ-003-FR-006 -->` through `<!-- REQ-003-FR-009 -->` tags to `docs/FUNCTIONAL_SPEC.md` for changelog cache behaviour

**Checkpoint**: `npm test` — T014–T017 pass. Repeat spec-metrics report measurably faster on second run.

---

## Phase 5: User Story 3 — Commit Throughput on Large Repos (Priority: P2)

**Goal**: Formalise PR-based `totalCommits`; update docs; verify commit month cache for auxiliary paths.

**Independent Test**: Run 90-day report — `totalCommits` equals sum of PR `commitCount` values. No `/commits` pagination in aggregator hot path. See quickstart.md Scenario 3.

**Depends on**: Phase 1 only (independent of US1/US2 per FR-018)

### Tests for User Story 3

- [X] T024 [US3] Write `tests/unit/commitThroughput.test.ts` with `// @req REQ-003-FR-010` test: mocked `prBundles` produce `totalCommits` equal to sum of `commitCount`
- [X] T025 [US3] Write `tests/unit/bitbucketCommitCache.test.ts` with `// @req REQ-003-FR-011` and `// @req REQ-003-FR-012` tests: closed month served from cache without re-paging; cache hit = zero upstream pages for that month

### Implementation for User Story 3

- [X] T026 [US3] Audit `backend/metrics/aggregator.ts`: confirm `totalCommits` from `prBundles.reduce(… commitCount)` only; remove any dead `getCommitsByAuthor` / `getCachedCommitsByAuthor` imports if present
- [X] T027 [P] [US3] Update `docs/FUNCTIONAL_SPEC.md` commit data-flow section to document PR-based throughput (FR-010)
- [X] T028 [P] [US3] Update `docs/SEQUENCE_DIAGRAM.md` metrics flow: remove full-repo commit pagination from aggregator path
- [X] T029 [US3] Update `specs/000-project-baseline/spec.md` §5.3.1 to state commits are counted from merged PR commit lists, not repo-wide scan
- [X] T030 [US3] Add `<!-- REQ-003-FR-010 -->` through `<!-- REQ-003-FR-012 -->` tags to `docs/FUNCTIONAL_SPEC.md`

**Checkpoint**: T024–T025 pass. Docs consistent with code. US3 can ship independently of US4.

---

## Phase 6: User Story 4 — Cache Survives Restart (Priority: P2) ⚠️ GATED

**Goal**: File-backed SQLite at `APP_STORE_PATH`; metrics cache and sync logs survive process restart within TTL.

**Independent Test**: Sync 10 users, restart server, query metrics — `< 500 ms`, `cacheStatus: "full"`, no upstream calls. See quickstart.md Scenario 4.

**Depends on**: Constitution amendment PR merged (Principle VI v1.2.0) — **do not start T032–T041 until T031 completes**

### Governance gate

- [X] T031 [US4] Amend `.specify/memory/constitution.md` Principle VI to v1.2.0: allow one file-backed SQLite store; retain single-connection rule and JSON metrics-file prohibition

### Tests for User Story 4

- [X] T032 [US4] Write `tests/unit/appStore.persistence.test.ts` with `// @req REQ-003-FR-013` test: write metrics cache row, close store, re-init, read back same row
- [X] T033 [US4] Add to `tests/unit/appStore.persistence.test.ts` `// @req REQ-003-FR-016` test: corrupt/unreadable store file causes `initAppStore` to throw
- [X] T034 [US4] Add to `tests/unit/appStore.persistence.test.ts` `// @req REQ-003-FR-017` test: entry older than TTL treated as miss after restart
- [X] T035 [US4] Add to `tests/unit/appStore.persistence.test.ts` `// @req REQ-003-FR-014` test: custom `APP_STORE_PATH` is honoured (temp directory)

### Implementation for User Story 4

- [X] T036 [US4] Rename `databaselayer/store/inMemoryDb.ts` → `databaselayer/store/appStore.ts`; open `APP_STORE_PATH` (default `data/cache/app-store.sqlite`) with WAL; export `initAppStore()`; keep `initInMemoryDb` as deprecated alias to `initAppStore`
- [X] T037 [US4] In `backend/config/env.ts`: add `appStorePath: string` parsed from `APP_STORE_PATH` with default `data/cache/app-store.sqlite`
- [X] T038 [P] [US4] Document `APP_STORE_PATH` in `.env.example`
- [X] T039 [US4] Update all imports of `inMemoryDb.js` across codebase to `appStore.js` (`server.ts`, `databaselayer/cache/metricsCache.ts`, tests, etc.)
- [X] T040 [US4] In `server.ts`: replace `initInMemoryDb()` with `initAppStore()`; ensure parent directory created before open
- [X] T041 [US4] Add `<!-- REQ-003-FR-013 -->` through `<!-- REQ-003-FR-017 -->` tags to `docs/FUNCTIONAL_SPEC.md`; verify no `data/cache/metrics-result/*.json` writes reintroduced (FR-015 — code review gate)

**Checkpoint**: T032–T035 pass. Restart persistence validated per quickstart Scenario 4.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Baseline spec cleanup, traceability gate, manual validation.

- [X] T042 Update `specs/000-project-baseline/spec.md` §8 Known limitations — remove or revise all four remediated items; add pointer to `specs/003-performance-resilience/` (FR-019)
- [X] T043 Update `README.md` known-limitations / architecture notes if they still describe in-memory-only cache or DVCS-only Jira linking
- [X] T044 Run `npm test` (vitest + `scripts/check-traceability.ts`) — all `// @req REQ-003-FR-*` tags present; zero untested/orphaned items
- [X] T045 Run `npm run build` and `cd frontend && npm run build` — zero TypeScript errors
- [ ] T046 [P] Run `quickstart.md` Scenarios 1–3 manually (US1–US3)
- [ ] T047 [P] Run `quickstart.md` Scenario 4 manually (US4 — skip if Phase 6 not implemented)
- [X] T048 Run `/speckit-agent-context-update` to refresh `CLAUDE.md` if plan path changed during polish

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — T003 blocks US1 types; T002 blocks US2
- **Phase 3 (US1)**: Depends on Phase 1 + T003 — **MVP; no dependency on US2–US4**
- **Phase 4 (US2)**: Depends on Phase 2 (T002) — independent of US3/US4
- **Phase 5 (US3)**: Depends on Phase 1 only — can run parallel with US1/US2 after T001
- **Phase 6 (US4)**: Depends on T031 (constitution amendment) — independent of US1–US3 code paths
- **Phase 7 (Polish)**: Depends on all shipped story phases

### User Story Dependencies

| Story | Depends on | Independent from |
|---|---|---|
| US1 (Jira linking) | T003 | US2, US3, US4 |
| US2 (Changelog cache) | T002 | US1, US3, US4 |
| US3 (Commit formalisation) | T001 | US1, US2, US4 |
| US4 (Persistent store) | T031 governance | US1, US2, US3 |

### Within Each Story

- Write tests (T004–T007, T014–T017, etc.) first — confirm they fail — then implement
- T008–T012 sequential within US1 (env → service → aggregator → server)
- T018 before T021 (cache module before aggregator swap)

---

## Parallel Opportunities

```text
# Phase 2:
T002  backend/config/cacheTtl.ts
T003  types/index.ts IssueLinking types

# Phase 3 — after T003:
T009  .env.example                    [P]
T004–T007  jiraLinking.test.ts       (sequential within file)

# Phase 5 — docs in parallel:
T027  docs/FUNCTIONAL_SPEC.md         [P]
T028  docs/SEQUENCE_DIAGRAM.md        [P]

# Phase 6 — after T031:
T038  .env.example APP_STORE_PATH     [P]
T032–T035  appStore.persistence.test.ts

# Phase 7:
T046  quickstart Scenarios 1–3       [P]
T047  quickstart Scenario 4           [P]
```

---

## Implementation Strategy

### MVP First (US1 only — 10 tasks)

1. Complete Phase 1 (T001) + T003
2. Complete T004–T013 (US1 tests + implementation)
3. **STOP and VALIDATE**: quickstart Scenario 1; work-type populated without DVCS
4. Ship PR 1 if sufficient

### Incremental Delivery (recommended — 4 PRs)

1. **PR 1 — US1**: T001, T003, T004–T013 (Jira hybrid linking)
2. **PR 2 — US2**: T002, T014–T023 (changelog cache + cacheTtl consolidation)
3. **PR 3 — US3**: T024–T030 (commit formalisation + docs)
4. **PR 4 — US4**: T031–T041 (constitution + persistent store) — after governance approval
5. **PR 5 — Polish**: T042–T048

### Parallel Team Strategy

After T001:
- Developer A: US1 (Phase 3)
- Developer B: US3 (Phase 5) — docs + tests, no conflict with A
- After T002 lands: Developer C: US2 (Phase 4)

---

## Notes

- FR-015 (no per-developer JSON metrics files) is enforced by code review at T041, not a runtime test
- FR-018 satisfied by phased PR strategy above
- `searchIssuesByAssignees` in `jiraService.ts` may remain for direct callers/tests; hybrid logic lives in `searchIssuesForDeveloper`
- US4 is explicitly gated — do not merge T036–T040 until T031 constitution amendment is approved
- Traceability checker fails if any new test lacks `// @req REQ-003-FR-*` on the preceding line
