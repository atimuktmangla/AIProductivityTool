# Data Model — AI Productivity Tool

**Version:** 1.0  
**Date:** 2026-06-08

---

## 1. Public API types (`types/index.ts`)

These types are shared by the backend and mirrored in `frontend/src/types/index.ts`.

### `AggregatedDeveloperMetric`

The primary output type. One object per developer per query.

| Field | Type | Description |
|---|---|---|
| `developerId` | `string` | Bitbucket username slug |
| `name` | `string` | Display name from Bitbucket |
| `totalCommits` | `number` | Commits in the date window |
| `totalPRs` | `number` | Merged PRs authored |
| `linesChanged` | `{ added, deleted }` | Lines added and deleted |
| `cycleTimeHrs` | `number` | Avg leave-adjusted working hours PR created → merged |
| `pickupDelayHrs` | `number` | Avg working hours PR created → first reviewer action |
| `reviewLifecycleHrs` | `number` | Avg working hours first review comment → merged |
| `reviewDepth` | `number` | Avg human review actions per PR |
| `avgPrSizeLines` | `number` | Avg (linesAdded + linesDeleted) per merged PR |
| `openPrsOverThreshold` | `number` | Open PRs older than `stalePrThresholdDays` business days |
| `prsReviewed` | `number` | Merged PRs authored by others where dev was PARTICIPANT |
| `workType` | `{ features, bugs, infraOrDebt }` | Issue count by category |
| `codeQuality` | `CodeQualityScore` | 4-signal composite quality score |
| `specMetrics?` | `SpecDrivenMetrics` | Present only when `SPEC_METRICS_ENABLED=true` |
| `prs` | `PRSummary[]` | Detail list for click-through drawer |

### `CodeQualityScore`

| Field | Type | Description |
|---|---|---|
| `score` | `number` | 0–100 composite |
| `bugRatio` | `number` | `bugs / totalIssues` — informational only |
| `criticalScore` | `number \| null` | `null` when no Jira issues; 0–100 otherwise |
| `approvalScore` | `number \| null` | `null` when no merged PRs; 0–100 otherwise |
| `prFocusScore` | `number \| null` | `null` when no merged PRs; 0–100 otherwise |
| `reworkRate` | `number` | Avg RESCOPED events per PR |

### `PRSummary`

| Field | Type | Description |
|---|---|---|
| `id` | `number` | Bitbucket PR ID |
| `title` | `string` | PR title |
| `projectKey` | `string` | Bitbucket project key |
| `repoSlug` | `string` | Bitbucket repo slug |
| `state` | `'MERGED' \| 'OPEN' \| 'DECLINED'` | |
| `createdDate` | `number` | Epoch ms |
| `closedDate?` | `number` | Epoch ms |
| `linesAdded` | `number` | |
| `linesRemoved` | `number` | |
| `cycleTimeHrs` | `number` | |
| `pickupDelayHrs` | `number` | |
| `reviewDepth` | `number` | |
| `url` | `string` | Link to Bitbucket PR |

### `SpecDrivenMetrics`

| Field | Type | Description |
|---|---|---|
| `specDefinitionTimeHrs` | `number` | Ticket created → spec approved (working hrs) |
| `implementationTimeHrs` | `number` | Spec approved → verification (working hrs) |
| `verificationTimeHrs` | `number` | Verification → done (working hrs) |
| `clarificationDelayHrs` | `number` | Cumulative hrs in blocked/awaiting-clarification |
| `specRegressions` | `number` | Times moved back from verification (sum) |
| `postMergeReworkCommits` | `number` | Commit messages matching rework keywords (sum) |
| `firstPassYield` | `boolean` | `true` when both sums are 0 |
| `specAdherenceScore` | `number` | 0–100 composite (avg of per-issue scores) |

### `MetricsResult`

Response body of `POST /api/dashboard/metrics` and `/insights`.

| Field | Type | Description |
|---|---|---|
| `current` | `AggregatedDeveloperMetric[]` | Current period results |
| `previous?` | `AggregatedDeveloperMetric[]` | Compare period (when `compareStartDate` provided) |
| `insights?` | `TeamInsights` | Only in `/insights` response |
| `cacheStatus?` | `'full' \| 'partial' \| 'none'` | |
| `cachedAt?` | `number` | Epoch ms of oldest cache entry used |

### `DashboardQueryPayload`

Request body of `POST /api/dashboard/metrics`.

| Field | Type | Required | Description |
|---|---|---|---|
| `developerIds` | `string[]` | Yes | 1–50 Bitbucket username slugs |
| `startDate` | `string` | Yes | `YYYY-MM-DD` |
| `endDate` | `string` | Yes | `YYYY-MM-DD` |
| `repoTargets?` | `RepoTarget[]` | No | Tier 1: explicit repo pairs |
| `projectKeys?` | `string[]` | No | Tier 2: project-scoped discovery |
| `compareStartDate?` | `string` | No | `YYYY-MM-DD` |
| `compareEndDate?` | `string` | No | `YYYY-MM-DD` |

### `TeamInsights`

| Field | Type | Description |
|---|---|---|
| `topContributor` | `string` | Name of developer with most commits |
| `bottleneck` | `'pickup' \| 'review' \| 'none'` | |
| `bottleneckDetail` | `string` | Human-readable description |
| `workTypeImbalance` | `boolean` | `true` when bug ratio > 40% |
| `workTypeDetail` | `string` | Work-type breakdown sentence |
| `teamHealthScore` | `number` | 0–100 rule-based health score |
| `summary` | `string` | Narrative (rule-based or LLM-generated) |
| `aiGenerated` | `boolean` | Whether LLM wrote the summary |
| `aiProvider?` | `string` | Provider that generated the summary |

---

## 2. Sync types

### `SyncStatus`

Returned by `GET /api/dashboard/sync/status`.

| Field | Type | Description |
|---|---|---|
| `running` | `boolean` | Whether a sync is currently in progress |
| `lastRunAt` | `number \| null` | Epoch ms of last completed run |
| `nextRunAt` | `number \| null` | Epoch ms of next scheduled run |
| `configuredUsers` | `string[]` | User IDs in the active configuration |
| `intervalMinutes` | `number` | `0` = no schedule |
| `currentUser?` | `string` | User being processed in the current run |
| `completedUsers` | `string[]` | At most 50 most recently completed users |
| `failedUsers` | `string[]` | All failed users (never capped) |
| `totalSyncUsers` | `number` | True total regardless of completedUsers cap |
| `activeRunId?` | `string` | Present when `running === true` |

### `SyncConfig`

| Field | Type | Description |
|---|---|---|
| `developerIds` | `string[]` | Users to sync |
| `intervalMinutes` | `number` | `0`, `1440`, or `10080` |

### `SyncRunLog`

| Field | Type | Description |
|---|---|---|
| `runId` | `string` | `YYYY-MM-DD-HH-mm-ss` |
| `startedAt` | `number` | Epoch ms |
| `finishedAt` | `number` | Epoch ms |
| `durationMs` | `number` | |
| `totalUsers` | `number` | Total users in this run |
| `batches` | `SyncBatchLog[]` | Per-batch detail |

### `SyncBatchLog`

| Field | Type | Description |
|---|---|---|
| `batchIndex` | `number` | 0-based batch index |
| `userIds` | `string[]` | Users in this batch |
| `status` | `'ok' \| 'error'` | |
| `durationMs` | `number` | |
| `error?` | `string` | Error message if `status === 'error'` |
| `source?` | `'live' \| 'cache'` | Present for individual user entries; absent on legacy rows |

### `CacheCoverage`

Returned by `GET /api/dashboard/sync/cache-coverage`.

| Field | Type | Description |
|---|---|---|
| `totalConfigured` | `number` | Users in `sync-config.json` |
| `cachedCount` | `number` | Users with a fresh cache entry (< 1 hour) |
| `uncachedUsers` | `string[]` | Users with no cache entry |
| `staleUsers` | `string[]` | Users with a cache entry older than 1 hour |

### `WarmupResult`

Returned by `POST /api/dashboard/sync/warmup`.

| Field | Type | Description |
|---|---|---|
| `skipped` | `number` | Users already cached — no sync triggered |
| `queued` | `number` | Users queued for warming |
| `queuedUsers` | `string[]` | User IDs queued |

---

## 3. SQLite schema (`databaselayer/store/inMemoryDb.ts`)

The in-memory SQLite database has two tables.

### `metrics_cache`

```sql
CREATE TABLE IF NOT EXISTS metrics_cache (
  developer_id  TEXT    NOT NULL,
  start_date    TEXT    NOT NULL,
  end_date      TEXT    NOT NULL,
  cached_at     INTEGER NOT NULL,
  metric_json   TEXT    NOT NULL,
  PRIMARY KEY (developer_id, start_date, end_date)
);
```

- `metric_json` contains the full serialised `AggregatedDeveloperMetric`.
- A row is a cache miss when `Date.now() - cached_at > METRICS_CACHE_TTL_MS`.

### `sync_run_logs`

```sql
CREATE TABLE IF NOT EXISTS sync_run_logs (
  run_id       TEXT    NOT NULL PRIMARY KEY,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER NOT NULL,
  duration_ms  INTEGER NOT NULL,
  total_users  INTEGER NOT NULL,
  batches_json TEXT    NOT NULL
);
```

- `batches_json` contains the serialised `SyncBatchLog[]`. The `source` field in individual user entries is schema-free within this JSON column — no migration needed to add it.

---

## 4. Runtime files

| Path | Written by | Description |
|---|---|---|
| `data/sync-config.json` | `POST /sync/config` | Persisted sync schedule and user list |
| `data/.migrated-to-sqlite` | `databaselayer/store/migrationCleanup.ts` | Sentinel — written once on first post-migration startup |

All other runtime data (metrics cache, sync logs) is in SQLite in-memory and is cleared on server restart.

---

## 5. Bitbucket raw types

| Type | Source |
|---|---|
| `BitbucketUser` | `/rest/api/1.0/admin/users` |
| `BitbucketPagedResponse<T>` | All paginated Bitbucket endpoints |
| `RawCommit` | `/rest/api/1.0/projects/{key}/repos/{slug}/commits` |
| `RawPullRequest` | `/rest/api/1.0/projects/{key}/repos/{slug}/pull-requests` |
| `RawActivity` | `/rest/api/1.0/projects/{key}/repos/{slug}/pull-requests/{id}/activities` |
| `RawDiffStat` | `/rest/api/1.0/projects/{key}/repos/{slug}/pull-requests/{id}/diff` |

## 6. Jira raw types

| Type | Source |
|---|---|
| `RawJiraIssue` | `/rest/api/2/search` |
| `JiraSearchResponse` | `/rest/api/2/search` |
| `JiraIssueWithChangelog` | `/rest/api/2/issue/{key}?expand=changelog` (spec metrics only) |
| `JiraChangelogEntry` | Part of `JiraIssueWithChangelog.changelog.histories` |
