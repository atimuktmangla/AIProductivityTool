# Implementation Plan: Performance & Resilience Remediation

**Branch**: `main` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-performance-resilience/spec.md`

---

## Summary

Four independent remediations for documented known limitations:

1. **Jira linking fallback** — `JIRA_ISSUE_LINKING_MODE` (`connector` | `assignee` | `hybrid`); hybrid retries assignee-only when DVCS JQL fails or returns empty; `/ready` reports linking status.
2. **Changelog cache** — `jiraChangelogCache.ts` with month-partitioned JSON under `data/cache/`; aggregator and sync job use `getCachedIssueChangelog()`.
3. **Commit throughput** — formalise PR-based `totalCommits` (already implemented); remove stale commit-scan references from docs; keep `getCachedCommitsByAuthor` for scripts only.
4. **Persistent store** — file-backed SQLite at `APP_STORE_PATH` (requires Principle VI amendment to v1.2.0).

Phases 1–3 ship without constitution change. Phase 4 is gated on governance PR.

---

## Technical Context

**Language/Version**: TypeScript 5.5 / Node.js 18+ (ESM, `"type": "module"`)

**Primary Dependencies**:
- `better-sqlite3` — already installed; Phase 4 opens file path instead of `:memory:`
- `express`, `axios` — unchanged
- No new production dependencies

**Storage**:
- Phase 1–3: in-memory SQLite (`databaselayer/store/inMemoryDb.ts`) + JSON upstream caches (`data/cache/YYYY-MM/`)
- Phase 4: file-backed SQLite at `data/cache/app-store.sqlite` (default)

**Testing**: Vitest + `scripts/check-traceability.ts`. New tests tagged `// @req REQ-003-FR-*`.

**Target Platform**: Windows Server / Linux on-prem.

**Project Type**: Express REST API + React/Vite frontend (`frontend/`).

**Performance Goals**: SC-002 (50% faster repeat spec report); SC-003 (< 30 s cache-warm 90-day report); SC-004 (< 500 ms post-restart cache read for 20 devs).

**Constraints**: Single SQLite connection (Principle VI, amended in Phase 4). FR-018 independent deployability. No per-developer metrics JSON files.

**Scale/Scope**: 10–200 developers; 20–100 linked Jira issues per developer when spec metrics enabled.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Phases 1–3 | Phase 4 |
|---|---|---|---|
| I — Traceability | REQ tags + `@req` tests for each FR | ✅ Planned | ✅ Planned |
| II — Boundary-First Security | Validate new env vars at startup | ✅ `parseIssueLinkingMode()` | ✅ Path sanitisation |
| III — Working-Hours | Not touched | ✅ N/A | ✅ N/A |
| IV — Opt-In Extensibility | Spec metrics stay gated | ✅ Unchanged default | ✅ N/A |
| V — Simplicity | Thin wrappers, no new abstractions | ✅ | ✅ WAL + path swap only |
| VI — SQLite Storage Law | No metrics JSON files | ✅ Changelog = upstream cache exempt | ⚠️ **Amendment required** |

**Post-design re-check (Phases 1–3)**: Principles I–V satisfied; VI satisfied (changelog JSON is upstream API cache, same as `bitbucketCache.ts`).

**Phase 4**: Requires Complexity Tracking entry + constitution v1.2.0 amendment before merge.

---

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Principle VI — file-backed SQLite | FR-013: cache must survive restart | `:memory:` + startup warm-up still leaves gap until warm-up completes (violates SC-004) |
| Principle VI — file-backed SQLite | FR-014–FR-015: single consolidated store | Per-developer JSON files reintroduce race conditions 001 explicitly removed |

---

## Project Structure

### Documentation (this feature)

```text
specs/003-performance-resilience/
├── plan.md              # This file
├── research.md          # Phase 0 decisions
├── data-model.md        # Entity contracts
├── contracts/
│   ├── ready-api.md
│   ├── jira-linking.md
│   └── internal-cache-api.md
├── quickstart.md        # Validation scenarios
├── checklists/
│   └── requirements.md
└── tasks.md             # NOT YET CREATED (/speckit-tasks)
```

### Source Code (affected files)

```text
# Phase 1 — Jira linking
backend/config/env.ts                          # JIRA_ISSUE_LINKING_MODE
databaselayer/services/jiraService.ts          # searchIssuesForDeveloper, probe, status
backend/metrics/aggregator.ts                  # use searchIssuesForDeveloper
server.ts                                      # extend /ready response
types/index.ts                                 # IssueLinkingMode, IssueLinkingStatus
.env.example                                   # document new env var
tests/unit/jiraLinking.test.ts                 # REQ-003-FR-001–005

# Phase 2 — Changelog cache
backend/config/cacheTtl.ts                     # METRICS_CACHE_TTL_MS (new)
databaselayer/cache/jiraChangelogCache.ts      # getCachedIssueChangelog (new)
backend/metrics/aggregator.ts                  # use getCachedIssueChangelog
jobs/metricsSync.ts                            # pre-warm changelogs after sync
api/routes/metricsRouter.ts                    # import cacheTtl
tests/unit/jiraChangelogCache.test.ts          # REQ-003-FR-006–009

# Phase 3 — Commit formalisation
backend/metrics/aggregator.ts                  # verify no getCommitsByAuthor import
docs/FUNCTIONAL_SPEC.md                        # update commit data flow
docs/SEQUENCE_DIAGRAM.md                       # remove commit pagination from hot path
specs/000-project-baseline/spec.md             # FR-019 partial (commit + jira items)

# Phase 4 — Persistent store (gated)
.specify/memory/constitution.md                # Principle VI v1.2.0
databaselayer/store/appStore.ts                # rename from inMemoryDb.ts
server.ts                                      # initAppStore()
backend/config/env.ts                          # APP_STORE_PATH
tests/unit/appStore.persistence.test.ts        # REQ-003-FR-013–017
```

**Structure Decision**: Backend-only changes except none required for frontend. Four phased PRs recommended.

---

## Implementation Sequence

Keep `npm run build` and `npm test` green at every checkpoint.

### Phase 1 — Jira issue linking (US1)

**Step 1.1** Add `IssueLinkingMode` to `AppConfig`; parse `JIRA_ISSUE_LINKING_MODE` (default `hybrid`); invalid → startup error.

**Step 1.2** Implement in `jiraService.ts`:
- `buildConnectorJql()` / `buildAssigneeJql()` private helpers
- `searchIssuesForDeveloper()` with hybrid fallback
- `probeConnectorAvailability()` — called once from `server.ts` after config load
- `getIssueLinkingStatus()` / `resetFallbackEngaged()`

**Step 1.3** Replace `searchIssuesByAssignees([devId], …)` in `aggregator.ts` with `searchIssuesForDeveloper(devId, …)`; call `resetFallbackEngaged()` at start of each dev aggregation.

**Step 1.4** Extend `GET /ready` in `server.ts` to include `jiraLinking` object.

**Step 1.5** Tests `tests/unit/jiraLinking.test.ts`:
- `// @req REQ-003-FR-001` — three modes parse correctly
- `// @req REQ-003-FR-002` — hybrid falls back on empty connector result
- `// @req REQ-003-FR-002` — hybrid falls back on connector throw
- `// @req REQ-003-FR-003` — PR keys merged with assignee issues, deduped
- `// @req REQ-003-FR-005` — getIssueLinkingStatus reflects probe result

**Step 1.6** Add REQ tags to `docs/FUNCTIONAL_SPEC.md` for FR-001–FR-005.

---

### Phase 2 — Changelog cache (US2)

**Step 2.1** Create `backend/config/cacheTtl.ts`; update `metricsRouter.ts` and `metricsSync.ts` to import `METRICS_CACHE_TTL_MS`.

**Step 2.2** Create `databaselayer/cache/jiraChangelogCache.ts` following `bitbucketCache.ts` month/TTL patterns (see `contracts/internal-cache-api.md`).

**Step 2.3** In `aggregator.ts`, replace `getIssueChangelog(issue.key)` with `getCachedIssueChangelog(issue.key)`.

**Step 2.4** In `jobs/metricsSync.ts`, after successful `aggregateMetrics` for a user when `specMetricsEnabled`, collect linked issue keys from result and call `getCachedIssueChangelog` for each (pre-warm).

**Step 2.5** Tests `tests/unit/jiraChangelogCache.test.ts`:
- `// @req REQ-003-FR-006` — cache hit skips upstream call (mock)
- `// @req REQ-003-FR-009` — closed month write-once
- `// @req REQ-003-FR-008` — null changelog excluded from aggregate
- `// @req REQ-003-FR-007` — sync path invokes pre-warm (integration-style unit test with mocks)

---

### Phase 3 — Commit throughput formalisation (US3)

**Step 3.1** Audit `aggregator.ts` — confirm `totalCommits` from `prBundles` only; remove any dead `getCommitsByAuthor` imports if present.

**Step 3.2** Update `docs/FUNCTIONAL_SPEC.md`, `docs/SEQUENCE_DIAGRAM.md`, and baseline spec §5.3.1 to document PR-based commit counting.

**Step 3.3** Test `tests/unit/commitThroughput.test.ts`:
- `// @req REQ-003-FR-010` — totalCommits equals sum of PR commitCount mocks
- `// @req REQ-003-FR-011` — getCachedCommitsByAuthor uses month partition (existing bitbucketCache test or extend)

---

### Phase 4 — Persistent store (US4) — **GATED**

**Step 4.0** Merge constitution amendment PR (Principle VI v1.2.0).

**Step 4.1** Rename `inMemoryDb.ts` → `appStore.ts`; open `APP_STORE_PATH` with WAL; keep `initInMemoryDb` alias.

**Step 4.2** Update all imports; ensure `getDb()` unchanged signature.

**Step 4.3** Tests `tests/unit/appStore.persistence.test.ts`:
- `// @req REQ-003-FR-013` — write cache, re-init store, read back
- `// @req REQ-003-FR-016` — corrupt file → init throws
- `// @req REQ-003-FR-017` — TTL stale entry treated as miss after restart

**Step 4.4** Update baseline spec §8 known limitations + FR-019 completion.

---

## Spec → Requirement Traceability

| Canonical REQ ID | Spec FR | Primary test file |
|---|---|---|
| REQ-003-FR-001 | FR-001 | `jiraLinking.test.ts` |
| REQ-003-FR-002 | FR-002 | `jiraLinking.test.ts` |
| REQ-003-FR-003 | FR-003 | `jiraLinking.test.ts` |
| REQ-003-FR-004 | FR-004 | `jiraLinking.test.ts` + integration |
| REQ-003-FR-005 | FR-005 | `jiraLinking.test.ts` |
| REQ-003-FR-006 | FR-006 | `jiraChangelogCache.test.ts` |
| REQ-003-FR-007 | FR-007 | `jiraChangelogCache.test.ts` |
| REQ-003-FR-008 | FR-008 | `jiraChangelogCache.test.ts` |
| REQ-003-FR-009 | FR-009 | `jiraChangelogCache.test.ts` |
| REQ-003-FR-010 | FR-010 | `commitThroughput.test.ts` |
| REQ-003-FR-011 | FR-011 | `bitbucketCommitCache.test.ts` (extend existing or new) |
| REQ-003-FR-012 | FR-012 | `bitbucketCommitCache.test.ts` |
| REQ-003-FR-013 | FR-013 | `appStore.persistence.test.ts` |
| REQ-003-FR-014 | FR-014 | `appStore.persistence.test.ts` |
| REQ-003-FR-015 | FR-015 | manual + code review gate |
| REQ-003-FR-016 | FR-016 | `appStore.persistence.test.ts` |
| REQ-003-FR-017 | FR-017 | `appStore.persistence.test.ts` |
| REQ-003-FR-018 | FR-018 | phased PR structure (process) |
| REQ-003-FR-019 | FR-019 | manual doc review |

---

## Post-Plan Agent Context

Run `/speckit-agent-context-update` after this plan is written so `CLAUDE.md` points to this file.
