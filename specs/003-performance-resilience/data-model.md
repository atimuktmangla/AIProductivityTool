# Data Model: Performance & Resilience Remediation

**Feature**: `003-performance-resilience`
**Date**: 2026-06-10

---

## Configuration (new env fields)

### IssueLinkingMode

| Env var | Type | Default | Values |
|---|---|---|---|
| `JIRA_ISSUE_LINKING_MODE` | string | `hybrid` | `connector` \| `assignee` \| `hybrid` |

Added to `AppConfig` in `backend/config/env.ts`.

### AppStorePath (Phase 4 only)

| Env var | Type | Default | Notes |
|---|---|---|---|
| `APP_STORE_PATH` | string | `data/cache/app-store.sqlite` | File-backed SQLite path; git-ignored via `data/` |

---

## New runtime types

### IssueLinkingStatus

Returned by `GET /ready` (extended). Read-only snapshot.

| Field | Type | Description |
|---|---|---|
| `mode` | `'connector' \| 'assignee' \| 'hybrid'` | Active linking mode from config |
| `connectorAvailable` | `boolean` | Startup probe found DVCS JQL usable |
| `fallbackEngaged` | `boolean` | Last metrics run used assignee fallback (hybrid only) |

**TypeScript** (add to `types/index.ts`):
```ts
export type IssueLinkingMode = 'connector' | 'assignee' | 'hybrid';

export interface IssueLinkingStatus {
  mode:                IssueLinkingMode;
  connectorAvailable:  boolean;
  fallbackEngaged:     boolean;
}
```

Module-level `fallbackEngaged` flag set in `jiraService.ts` when hybrid fallback runs; reset at start of each `aggregateMetrics` call.

---

## Upstream cache entities (filesystem)

All paths under `{cacheDir}/{YYYY-MM}/` where `cacheDir` defaults to `data/cache`. Subject to `evictOldCacheMonths()` retention.

### ChangeHistoryCacheEntry (closed month)

File: `jira-changelog/{issueKey}.json`

Plain serialisation of `JiraIssueWithChangelog` (write-once when month is closed).

### ChangeHistoryCacheEnvelope (current month)

File: `jira-changelog/{issueKey}.json`

| Field | Type | Description |
|---|---|---|
| `issue` | `JiraIssueWithChangelog` | Full issue + changelog payload |
| `cachedAt` | `number` | Unix ms timestamp |

Fresh when `Date.now() - cachedAt < METRICS_CACHE_TTL_MS`.

### CommitMonthCacheEntry

Already implemented in `bitbucketCache.ts` at `{month}/commits/{project}__{repo}__{author}.json`. No schema change — FR-011 formalises existing behaviour.

---

## Persistent store (Phase 4)

### SQLite schema (unchanged from 001)

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

**Change**: database file path moves from `:memory:` to `APP_STORE_PATH`. WAL mode enabled on open.

---

## Modified entities (no shape change)

### AggregatedDeveloperMetric

`totalCommits` semantics documented: sum of PR commit counts in window (FR-010). Interface unchanged.

### RawJiraIssue / JiraIssueWithChangelog

Unchanged. Changelog cache stores full `JiraIssueWithChangelog`.

---

## Entity relationships

```text
aggregateForDeveloper()
  ├── searchIssuesForDeveloper()     ← mode: connector | assignee | hybrid
  ├── getIssuesByKeys(prTitleKeys)   ← always
  ├── getCachedIssueChangelog(key)   ← spec metrics only
  └── getCachedPRDetails(pr)         ← commitCount for totalCommits

metrics_cache (SQLite file)
  └── keyed by (developer_id, start_date, end_date)

jira-changelog cache (JSON files)
  └── keyed by issueKey + calendar month partition
```

---

## Validation rules

| Rule | Enforcement |
|---|---|
| `JIRA_ISSUE_LINKING_MODE` invalid value | Startup throws structured config error |
| `APP_STORE_PATH` parent dir missing | Created on startup (`mkdir -p` equivalent) |
| Corrupt SQLite file | Startup fail-fast (FR-016) |
| Issue key in cache path | `safeKey()` sanitisation (reuse from bitbucketCache) |
