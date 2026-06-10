# Phase 0 Research: Performance & Resilience Remediation

**Feature**: `003-performance-resilience`
**Date**: 2026-06-10

---

## Decision 1 — Jira issue linking strategy

**Decision**: Add `JIRA_ISSUE_LINKING_MODE` env var with values `connector` | `assignee` | `hybrid` (default `hybrid`). Implement a thin `searchIssuesForDeveloper()` wrapper in `databaselayer/services/jiraService.ts` that:
1. In `connector` mode — runs current JQL with `development[pullrequests].all > 0`.
2. In `assignee` mode — runs assignee + date window only (no development clause).
3. In `hybrid` mode — tries connector JQL first; on upstream error or zero results, retries assignee-only and logs one warning.

PR-title key extraction (`JIRA_KEY_RE` on merged PR titles) + `getIssuesByKeys()` remains unconditional in `aggregator.ts` (FR-003).

**Rationale**: Teams without DVCS get assignee-based issues immediately. Connected teams keep today's behaviour when connector JQL succeeds. No new metric shapes — only discovery path changes.

**Alternatives considered**:
- Always assignee-only — rejected (loses PR-linked filter for connected teams; regression for FR US1 scenario 2).
- Bitbucket-side issue linking API — rejected (not available on all Stash versions; Jira is authoritative for work-type).
- Runtime auto-detect DVCS via probe JQL on every request — rejected (adds latency; hybrid with cached probe result is over-engineering for v1).

---

## Decision 2 — Readiness endpoint extension

**Decision**: Extend `GET /ready` response with optional `jiraLinking` object:
```json
{
  "status": "ready",
  "jiraLinking": {
    "mode": "hybrid",
    "connectorAvailable": true,
    "fallbackEngaged": false
  }
}
```
Probe connector availability once at startup (single JQL: `development[pullrequests].all > 0 AND updated >= -1d` with `maxResults: 1`). Cache result in module-level flag; refresh only on startup (not per request).

**Rationale**: FR-005 / SC-006 require operators to see mode without reading logs. Startup probe avoids adding JQL to every `/ready` poll from load balancers.

**Alternatives considered**:
- Separate `/ready/jira-linking` endpoint — rejected (extra surface; `/ready` already pings Jira).
- Per-request probe — rejected (noisy on health-check intervals).

---

## Decision 3 — Spec metrics change-history cache

**Decision**: New module `databaselayer/cache/jiraChangelogCache.ts` mirroring `bitbucketCache.ts` month partitioning:
- Path: `{cacheDir}/{YYYY-MM}/jira-changelog/{issueKey}.json`
- Closed months: write-once plain `JiraIssueWithChangelog` JSON.
- Current month: envelope `{ issue, cachedAt }` with 1-hour TTL (same as `METRICS_CACHE_TTL_MS`).
- Export `getCachedIssueChangelog(issueKey): Promise<JiraIssueWithChangelog | null>` — cache hit returns parsed issue; miss calls existing `getIssueChangelog()` then writes cache.

Aggregator replaces direct `getIssueChangelog()` calls with `getCachedIssueChangelog()`.

Sync job: after `aggregateMetrics()` for each user, if `specMetricsEnabled`, iterate linked issue keys from the computed metric and call `getCachedIssueChangelog()` for each (pre-warm path).

**Rationale**: Reuses proven month/immutability pattern from Bitbucket upstream cache. Lives under `data/cache/` as upstream API response cache — exempt from Principle VI prohibition on metrics-result JSON files. No SQLite schema change for US2.

**Alternatives considered**:
- Store changelogs in SQLite `changelog_cache` table — deferred to US4 phase; adds schema coupling before persistence story lands.
- Jira bulk search with `expand=changelog` — rejected (Jira Server search does not return full changelog histories in one page reliably).
- In-memory Map only — rejected (lost on restart; does not help sync warm path across processes).

---

## Decision 4 — Commit throughput definition

**Decision**: Formalise FR-010 — `totalCommits` = sum of `commitCount` from `getCachedPRDetails()` across merged PRs in the date window. No call to `getCommitsByAuthor()` / `getCachedCommitsByAuthor()` from `aggregator.ts`.

Keep `getCachedCommitsByAuthor()` in `bitbucketCache.ts` for auxiliary scripts (`scripts/bb-user-stats.cjs`) with existing month cache (FR-011). Document in baseline spec amendment.

**Rationale**: Code already implements PR-based commit counting (`aggregator.ts` line ~345). Full repo commit scan was removed from hot path but docs/sequence diagrams still describe the old flow.

**Alternatives considered**:
- Re-wire aggregator to `getCachedCommitsByAuthor()` — rejected (slower; contradicts FR-010).
- Remove commit cache entirely — rejected (scripts may still need it; FR-011 requires month partition for any repo-level fetch).

---

## Decision 5 — Persistent metrics store (constitution amendment)

**Decision**: Amend Principle VI to v1.2.0 — allow **one file-backed SQLite database** at configurable path (`APP_STORE_PATH`, default `data/cache/app-store.sqlite`). Rename module to `databaselayer/store/appStore.ts`; export `initAppStore()` (keep `initInMemoryDb` as deprecated alias for one release). Use `better-sqlite3` with `new Database(path)` and `journal_mode = WAL`.

Same schema (`metrics_cache`, `sync_run_logs`). Single connection rule unchanged. Still forbid `data/cache/metrics-result/*.json`.

**Rationale**: FR-013–FR-017 require restart durability without reintroducing per-developer JSON files. File-backed SQLite satisfies FR-015 with minimal code change (swap `:memory:` for path).

**Alternatives considered**:
- Keep `:memory:` + mandatory warm-up on startup only — rejected (does not meet FR-013; operator still waits after restart until warm-up completes).
- Dual-write memory + file — rejected (complexity; Principle V).
- PostgreSQL/external DB — rejected (new dependency; on-prem constraint).

**Constitution gate**: US4 requires approved amendment PR before merge. US1–US3 can merge independently.

---

## Decision 6 — Shared TTL constant

**Decision**: Extract `METRICS_CACHE_TTL_MS = 3_600_000` to `backend/config/cacheTtl.ts` (single export). Import in `metricsRouter.ts`, `jobs/metricsSync.ts`, and `jiraChangelogCache.ts`.

**Rationale**: Spec assumes one freshness window across metrics cache, sync cache-skip, changelog reuse, and post-restart staleness. Consolidates duplicated constants from features 002 and 003.

**Alternatives considered**:
- Env-configurable TTL — rejected (YAGNI; spec fixes at 1 hour).
- Keep duplicated constants — rejected (drift risk across four consumers).

---

## Decision 7 — Phased delivery

**Decision**: Four implementation phases matching user stories; US4 blocked on constitution amendment PR.

| Phase | Stories | Constitution |
|---|---|---|
| 1 | US1 Jira linking | ✅ No change |
| 2 | US2 Changelog cache | ✅ No change (JSON upstream cache exempt) |
| 3 | US3 Commit formalisation | ✅ No change |
| 4 | US4 Persistent store | ⚠️ Requires Principle VI v1.2.0 |

**Rationale**: FR-018 requires independent deployability. Phases 1–3 deliver 75% of user value without governance change.

---

## Decision 8 — REQ ID namespace

**Decision**: New requirements tagged `REQ-003-FR-001` through `REQ-003-FR-019` in `docs/FUNCTIONAL_SPEC.md`, mapped to spec FR-001–FR-019.

**Rationale**: Follows namespace pattern from `REQ-002-FR-*` (feature 002).
