# Detailed Design — AI Productivity Tool

**Version:** 1.5
**Date:** 2026-06-07
**Audience:** Backend and frontend engineers

---

## 1. Repository layout

```
AIProductivityTool/
├── .env                        # Local secrets (git-ignored)
├── .env.example                # Template — safe to commit
├── .gitignore
├── server.ts                   # Express app entry point
├── package.json                # Backend dependencies
├── tsconfig.json               # Backend TS config (strict, NodeNext)
├── vitest.config.ts            # Backend-only vitest config (scoped to tests/**)
├── README.md
├── scripts/
│   └── check-traceability.ts   # Spec → @req tag coverage enforcement
├── tests/
│   ├── unit/                   # Pure function unit tests
│   └── integration/            # Router integration tests (supertest)
├── docs/
│   ├── FUNCTIONAL_SPEC.md
│   ├── DETAILED_DESIGN.md      # This file
│   ├── SEQUENCE_DIAGRAM.md
│   ├── JQL_EXAMPLES.md
│   ├── GITHUB_PAGE.md
│   ├── api-usecases.md
│   ├── repo-resolution-flowcharts.md
│   ├── sync-job-ui-design.md
│   └── sync-job-operations.md
├── types/
│   └── index.ts                # All shared TypeScript interfaces (all layers)
├── WEB/                        # HTTP layer
│   ├── hooks/
│   │   ├── requestId.ts        # Attaches X-Request-Id header
│   │   └── requestLogger.ts    # Logs method + path + status + duration
│   ├── guardrails/
│   │   ├── rateLimiter.ts      # express-rate-limit token bucket
│   │   └── sanitiser.ts        # Trims strings, enforces max date range + developer count
│   ├── middleware/
│   │   ├── apiKeyAuth.ts       # X-Api-Key header guard
│   │   └── errorHandler.ts     # Express 4-arg error handler
│   └── routes/
│       ├── metricsRouter.ts    # GET /users, GET /projects, GET /repos, POST /metrics
│       └── syncRouter.ts       # GET/POST /sync/status, /trigger, /config, /logs
├── BL/                         # Business logic layer
│   ├── config/
│   │   └── env.ts              # Env validation → AppConfig
│   ├── evals/
│   │   └── metricsValidator.ts # Post-sync data quality warnings (non-blocking)
│   ├── util/
│   │   └── concurrentMap.ts    # Promise.all with configurable concurrency limit
│   └── metrics/
│       ├── aggregator.ts       # Orchestration — fan-out per developer
│       ├── cycleTime.ts        # Cycle / pickup / review lifecycle
│       ├── reviewDepth.ts      # Review action counting
│       ├── codeQuality.ts      # 4-signal composite quality score
│       ├── specMetrics.ts      # Spec-driven phased lead time, regressions, FPY (opt-in)
│       └── workType.ts         # Jira issue type classifier
├── DB/                         # Data access layer
│   ├── client/
│   │   └── atlassianFetch.ts   # Axios instance factory + error mapping
│   ├── errors/
│   │   └── AtlassianHttpError.ts
│   ├── cache/
│   │   ├── metricsCache.ts     # Per-developer JSON file cache (one file per devId+dateRange)
│   │   ├── bitbucketCache.ts   # TTL-cached Bitbucket API responses (users, repos, PRs)
│   │   ├── ttlCache.ts         # Generic in-memory TTL cache
│   │   ├── cacheEviction.ts    # Removes stale cache files older than retention window
│   │   └── jsonFileCache.ts    # Atomic read/write helpers (tmp file + rename)
│   └── services/
│       ├── jiraService.ts      # Jira REST API calls
│       └── bitbucketService.ts # Bitbucket REST API calls
├── AI/                         # AI features
│   ├── providers/
│   │   └── llmProvider.ts      # LLM provider type + factory (anthropic | openai | gemini)
│   ├── subagents/
│   │   └── retryAgent.ts       # Retry wrapper for flaky LLM calls
│   └── skills/
│       └── insightsSummary.ts  # Team insights narrative (rule-based + optional AI)
├── jobs/
│   └── metricsSync.ts          # Background sync job (setInterval, config file, run logs)
├── data/                       # Runtime data (git-ignored)
│   ├── sync-config.json        # Persisted sync schedule
│   ├── sync-logs/              # One JSON file per sync run
│   └── cache/metrics-result/   # Per-developer cache files
└── UI/                         # React frontend
    ├── index.html
    ├── package.json            # Frontend dependencies (React, Recharts, Vite)
    ├── tsconfig.json           # Frontend TS config (bundler moduleResolution)
    ├── vite.config.ts          # Vite + /api proxy to :3000
    └── src/
        ├── main.tsx            # App root — two-tab nav (Developer Metrics / Sync Jobs)
        ├── styles.css          # Single CSS file — CSS custom properties light theme
        ├── types/
        │   └── index.ts        # Mirrors backend public types + DashboardState
        ├── hooks/
        │   └── useDashboard.ts # useReducer state machine
        └── components/
            ├── Dashboard.tsx         # Root layout
            ├── FilterPanel.tsx       # Left sidebar
            ├── UserPicker.tsx        # Searchable user list
            ├── DateRangePicker.tsx   # Date inputs + preset shortcuts
            ├── RepoPicker.tsx        # Project pills + repo checkboxes
            ├── Skeleton.tsx          # Shimmer placeholder
            ├── WelcomePanel.tsx      # Intro screen shown before first report
            ├── SelectionSummary.tsx  # Pre-run summary banner
            ├── InsightsPanel.tsx     # Team insights section
            ├── ContributorDrawer.tsx # Click-through PR detail drawer
            ├── ThroughputOverview.tsx
            ├── WorkflowCycleTrack.tsx
            ├── WorkTypeChart.tsx
            ├── CodeQualityPanel.tsx
            └── ContributorTable.tsx
```

The repo also has:
```
├── UI/src/hooks/useSync.ts           # useReducer state for Sync Jobs tab
├── UI/src/components/SyncPage.tsx    # Sync admin page component
├── UI/src/components/SessionRestoreBanner.tsx
├── UI/src/components/SelectionSummary.tsx
├── UI/src/components/WidgetTooltip.tsx
└── UI/src/test/                      # Vitest + Testing Library UI tests
    ├── setup.ts
    └── components/
        ├── UserPicker.test.tsx
        ├── DateRangePicker.test.tsx
        ├── FilterPanel.test.tsx
        └── CacheBanner.test.tsx
```

---

## 2. Backend design

### 2.1 Entry point — `server.ts`

- Loads `.env` via `dotenv/config` before any other import.
- Calls `getConfig()` at startup — fails fast if any required env var is missing.
- Mounts `metricsRouter` at `/api/dashboard` and `syncRouter` at `/api/dashboard/sync`.
- Calls `startMetricsSyncJob()` (async — reads `data/sync-config.json` if present, then starts the interval).
- Registers `errorHandler` last (Express requires 4-arg middleware after all routes).
- Handles `SIGINT` for graceful shutdown.

### 2.2 Configuration — `BL/config/env.ts`

`getConfig()` is cached after first call. Returns `AppConfig`:

```typescript
interface AppConfig {
  jiraBaseUrl:              string;    // trailing slash stripped
  jiraToken:                string;
  bitbucketBaseUrl:         string;    // trailing slash stripped
  bitbucketToken:           string;
  apiKey:                   string;    // X-Api-Key for all /api routes
  allowedOrigin:            string;    // CORS; default http://localhost:5173
  botUserPattern:           string;    // regex for bot accounts
  stalePrThresholdDays:     number;    // default 3
  port:                     number;    // default 3000
  jiraPageSize:             number;    // default 500
  metricsConcurrency:       number;    // parallel developer aggregations; default 3
  httpConcurrency:          number;    // global HTTP semaphore; default 12
  httpTimeoutMs:            number;    // Axios timeout; default 60000
  repoConcurrency:          number;    // parallel repo-level calls per dev; default 4
  cacheDir:                 string;    // default 'data/cache'
  cacheRetentionMonths:     number;    // eviction window; default 6
  repoTargets:              RepoTarget[];  // Tier 1 from BITBUCKET_PROJECTS
  bitbucketProjectKeys:     string[];      // Tier 2 from BITBUCKET_PROJECT_KEYS
  aiInsightsEnabled:        boolean;
  aiProvider:               'anthropic' | 'openai' | 'gemini';
  aiApiKey:                 string;
  syncDeveloperIds:         string[];  // from SYNC_DEVELOPER_IDS
  syncIntervalMinutes:      number;    // from SYNC_INTERVAL_MINUTES; 0 = disabled
  specMetricsEnabled:       boolean;   // SPEC_METRICS_ENABLED; default false
  specApprovedStatus:       string;    // SPEC_APPROVED_STATUS; default 'spec approved'
  specVerificationStatus:   string;    // SPEC_VERIFICATION_STATUS; default 'verification'
  specDoneStatus:           string;    // SPEC_DONE_STATUS; default 'done'
  specBlockedStatus:        string;    // SPEC_BLOCKED_STATUS; default 'blocked'
}
```

Required env vars: `JIRA_BASE_URL`, `JIRA_TOKEN`, `BITBUCKET_BASE_URL`, `BITBUCKET_TOKEN`, `API_KEY`. Throws with a clear message listing all missing required variables.

### 2.3 HTTP client — `DB/client/atlassianFetch.ts`

One Axios instance is created per `baseUrl + token` pair and cached in a `Map`. Each instance is configured with:
- `httpsAgent: new https.Agent({ rejectUnauthorized: false })` — tolerates self-signed on-prem TLS certs
- `Authorization: Bearer <token>` header
- 30-second timeout

Exports `atlassianGet<T>` and `atlassianPost<T>`. On non-2xx, maps the Axios error to `AtlassianHttpError` (preserves `status`, `statusText`, `detail`, `url`).

### 2.4 Jira service — `DB/services/jiraService.ts`

| Function | Endpoint | Pagination |
|---|---|---|
| `searchIssuesByAssignees(devIds, start, end)` | `POST /rest/api/2/search` | `startAt` loop until `startAt >= total` |
| `getIssuesByKeys(keys[])` | `POST /rest/api/2/search` | Same |
| `getIssueChangelog(issueKey)` | `GET /rest/api/2/issue/{key}?expand=changelog` | Single issue; no pagination — returns full history in one response. Returns `null` on error. Used only when `SPEC_METRICS_ENABLED=true`. |

JQL for assignee search:
```
assignee in ("slug1","slug2")
AND development[pullrequests].all > 0
AND updated >= "YYYY-MM-DD"
AND updated <= "YYYY-MM-DD"
ORDER BY updated DESC
```

Page size comes from `AppConfig.jiraPageSize` (env: `JIRA_PAGE_SIZE`, default `500`).

### 2.5 Bitbucket service — `DB/services/bitbucketService.ts`

| Function | Endpoint | Notes |
|---|---|---|
| `getAllUsers()` | `GET /rest/api/1.0/admin/users` | Full pagination |
| `getAllProjectKeys()` | `GET /rest/api/1.0/projects` | Full pagination; always returns all projects for the UI picker |
| `getReposInProjectPublic(projectKey)` | `GET /rest/api/1.0/projects/{key}/repos` | Full pagination |
| `getReposByUserProfile(userSlug)` | `GET /rest/api/1.0/profile/recent/repos?username={u}` | Used by Tier-2/3 discovery |
| `getCommitsByAuthor(proj, repo, slug, start, end)` | `GET /rest/api/1.0/projects/{p}/repos/{r}/commits` | Date filter in-memory on `authorTimestamp`; early-exit when `authorTimestamp < sinceMs` |
| `getMergedPullRequestsByAuthor(proj, repo, slug, startDate?)` | `GET .../pull-requests?state=MERGED&author={slug}` | Stop-early on `updatedDate < sinceMs` |
| `getMergedPRsParticipatedByUser(proj, repo, slug, startDate)` | `GET .../pull-requests?state=MERGED&role=PARTICIPANT&username={slug}` | Counts PRs authored by others where dev was reviewer, commenter, approver, or merger |
| `getPRActivities(proj, repo, prId)` | `GET .../pull-requests/{id}/activities` | Full pagination |
| `getPRDiffStat(proj, repo, prId)` | `GET .../pull-requests/{id}/diff` | Counts `ADDED`/`REMOVED` segment lines; skips lockfiles and generated assets |
| `getPRCommitCount(proj, repo, prId)` | `GET .../pull-requests/{id}/commits` | Paginated count only |
| `filterByUserActivity(candidates, slug, start, end)` | `GET .../pull-requests?state=MERGED&author={slug}` | Keeps only repos where the user has a merged PR in the window |

> **Why date filtering is in-memory for commits:** The Bitbucket `/commits` API accepts only commit SHAs for `since`/`until`, not dates. Commits are returned newest-first; the loop exits as soon as `authorTimestamp < sinceMs`.

### 2.6 Repo resolution — `BL/metrics/aggregator.ts`

`resolveRepoTargets(payload, config)` applies the three-tier strategy:

1. **Tier 1 — Exact pairs:** If `payload.repoSlugs + payload.projectKeys` are set, or `config.bitbucketProjects` has entries, build `[projectKey, repoSlug]` pairs directly. No Bitbucket API calls.
2. **Tier 2 — Project-scoped:** If project keys are provided (UI or env) but no repo slugs, call `getReposForProject()` for each project, then probe each repo for user activity in the date window.
3. **Tier 3 — Auto-discover:** Call `getRecentReposForUser()` for each selected developer. If that returns nothing, fall back to listing all projects and all repos, probing for activity.

UI values (`payload.projectKeys`, `payload.repoSlugs`) always take precedence over env values.

### 2.7 Aggregation — `BL/metrics/aggregator.ts`

`aggregateMetrics(payload)` fans out to one `aggregateForDeveloper` call per developer ID, all in parallel via `concurrentMap` (bounded by `metricsConcurrency`).

Per developer (all four fetches run in parallel via `Promise.all`):

1. **Repo resolution** — `resolveSharedRepos` + `resolvePerDeveloperRepos` run once and are shared across all developers.
2. **Merged PRs authored** — from all resolved repos via `getCachedMergedPRsByAuthor`; filtered to `pr.author.user.name === devId` and `pr.createdDate` within window.
3. **Open PRs authored** — via `getOpenPullRequestsByAuthor`; used for stale PR count.
4. **Jira assignee issues** — `searchIssuesByAssignees([devId], startDate, endDate)`.
5. **PRs participated in** — `getMergedPRsParticipatedByUser` with `role=PARTICIPANT`; counts PRs authored by others where the dev was a reviewer, commenter, approver, or merger. Deduplicated by PR ID.
6. **Jira key extraction** — regex `/([A-Z]+-\d+)/g` on PR titles of authored PRs; commit-linked issues fetched via `getIssuesByKeys`; merged and deduplicated with assignee issues.
7. **PR bundles** — for each authored PR, fetch `activities` + `diff` + `commitCount` via `getCachedPRDetails`.
8. **Metric computation** — purely functional helpers called per PR, then averaged.
9. **Work type** — each Jira issue classified and counted.
10. **Spec-driven metrics** (when `specMetricsEnabled`) — fetches each linked issue's changelog via `getIssueChangelog`, calls `computeSpecMetrics` per issue, then `aggregateSpecMetrics` to produce the developer-level summary. Issues where the changelog fetch fails are silently skipped.
11. **Display name** — resolved from first PR's `author.user.displayName`, fallback to `getUserDisplayName(devId)`.

### 2.8 Metric functions

#### `cycleTime.ts`

```
rawHours = sum of minutes within 09:00–17:00 Mon–Fri between createdMs and mergedMs
effectiveHours = rawHours × (1 − 33/261)   // 12.64% leave discount
```

`computePickupDelayHrs(createdMs, firstReviewerMs)` and `computeReviewLifecycleHrs(firstCommentMs, mergedMs)` both delegate to `computeCycleTimeHrs`.

#### `reviewDepth.ts`

Counts activity events where:
- `action` ∈ `{ COMMENTED, REVIEWED, APPROVED }`
- `user.name !== authorSlug`
- `user.name` does not match `/sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot/i`

#### `codeQuality.ts`

`computeCodeQuality(issues, prs, authorSlug)` returns a `CodeQualityScore` from four equal-weighted signals (25% each):

| Signal | Formula | Notes |
|---|---|---|
| Critical / Security resolution | Effective resolution rate with 2.5× multiplier for BlackDuck / CVE / RCA / customer-reported / incident tickets | Bug ratio is returned as `bugRatio` for display only; not in composite |
| Approval rate | % of PRs with ≥1 human APPROVED within 24 h. Rubber-stamp (< 5 min + zero reviewer comments) = 50% credit | Excludes author self-approvals and bot accounts |
| PR focus | `round(100 / (1 + e^((avgLines − 500) / 100)))` — sigmoid midpoint at 500 lines, ≈100 at ≤200, ≈0 at ≥800 | Uses `PRQualityInput.linesChanged` (caller should pre-filter lockfiles) |
| Low rework | `round(100 × 2^(−avgRescopedPerPR))` — exponential decay on RESCOPED events | 0 rescopes = 100; penalty doubles per rescope |

Input type `PRQualityInput` (exported from `codeQuality.ts`): `{ activities, linesChanged, createdDate, closedDate }`.

#### `workType.ts`

Exact `issuetype.name.toLowerCase()` lookup in a static map.
If not found, scans label strings for bug/debt keywords.
Default: `'features'`.

#### `specMetrics.ts`

**`computeSpecMetrics(issue, postMergeCommitMessages)`**

1. Sorts the `changelog.histories` array by `created` ascending to build an ordered list of status transitions.
2. Extracts the first timestamp for each of the four configured status names (`specApprovedStatus`, `specVerificationStatus`, `specDoneStatus`, `specBlockedStatus`) using `firstTransitionToMs`.
3. Computes the three phase durations using `computeCycleTimeHrs` (same leave-adjusted working-hours logic as cycle time).
4. Scans all transitions where `fromStatus === specBlockedStatus` and sums the working hours of each window for `clarificationDelayHrs`.
5. Counts transitions where `fromStatus === specVerificationStatus` and `toStatus` is not `done`/`verification` for `specRegressions`.
6. Applies `/\b(fix spec|per feedback|scoping change|spec fix|clarif|revert spec|spec update|per review)\b/i` against `postMergeCommitMessages` for `postMergeReworkCommits`.
7. Computes `specAdherenceScore = max(0, 100 − round(100 × (1 − 2^−regressions)) − min(reworkCommits × 5, 40))`.

**`aggregateSpecMetrics(perIssue[])`**

Averages phased times and adherence score; sums regressions and rework commits; sets `firstPassYield = totalRegressions === 0 && totalPostMergeCommits === 0`.

**`AppConfig` additions (all from env vars):**

| Field | Env var | Default |
|---|---|---|
| `specMetricsEnabled` | `SPEC_METRICS_ENABLED` | `false` |
| `specApprovedStatus` | `SPEC_APPROVED_STATUS` | `spec approved` |
| `specVerificationStatus` | `SPEC_VERIFICATION_STATUS` | `verification` |
| `specDoneStatus` | `SPEC_DONE_STATUS` | `done` |
| `specBlockedStatus` | `SPEC_BLOCKED_STATUS` | `blocked` |

### 2.9 Routing & validation — `WEB/routes/metricsRouter.ts`

`POST /api/dashboard/metrics` validates:
- `developerIds`: non-empty string array
- `startDate` / `endDate`: YYYY-MM-DD, parseable, `endDate >= startDate`
- `projectKeys` (optional): string array
- `repoSlugs` (optional): string array

Returns `400` with a descriptive message on failure; passes errors to the error handler via `next(err)`.

**Cache integration (partial hit merging):**

Before calling `aggregateMetrics`, the router calls `getCachedMetrics(developerIds, start, end, TTL)`.

- **Full hit** (`misses.length === 0`): returns `{ current: hits, cacheStatus: 'full', cachedAt: oldestCachedAt }` immediately — zero live API calls.
- **Partial hit** (`hits.length > 0 && misses.length > 0`): calls `aggregateMetrics` for the missing developers only, merges with hits, returns `cacheStatus: 'partial'`.
- **Miss**: falls through to full live computation.

Compare-period requests (`compareStartDate` present) always bypass the cache.

### 2.10 Per-developer cache — `DB/cache/metricsCache.ts`

**File path pattern:** `data/cache/metrics-result/{safeDevId}__{startDate}__{endDate}.json`

Each file contains:
```typescript
{ metric: AggregatedDeveloperMetric; cachedAt: number }  // cachedAt: epoch ms
```

**`getCachedMetrics(developerIds, start, end, maxAgeMs)`**
- Reads all files in parallel via `Promise.all`.
- Returns `{ hits, misses, oldestCachedAt }`.
- A file is a miss if it doesn't exist or `Date.now() - cachedAt > maxAgeMs`.

**`setCachedMetrics(developerIds, start, end, metrics)`**
- Writes N files in parallel, one per developer.
- Uses `writeJsonCache` (atomic tmp-file + rename) to prevent partial writes.

This design scales to hundreds of developers without lock contention: each file is independent and each developer can be refreshed by the sync job without touching other developers' cache entries.

### 2.11 Background sync job — `jobs/metricsSync.ts`

Module-level state:
```typescript
let running = false;
let lastRunAt: number | null = null;
let nextRunAt: number | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let configuredUsers: string[] = [];
let configuredInterval = 0;
```

**`startMetricsSyncJob()`** — called from `server.ts` on startup:
1. Reads `data/sync-config.json` (if present) for `developerIds` + `intervalMinutes`.
2. Falls back to `SYNC_DEVELOPER_IDS` / `SYNC_INTERVAL_MINUTES` env vars.
3. Calls `rescheduleInterval(intervalMinutes, developerIds)`.

**`runSync(developerIds)`** — core logic:
1. Re-reads `data/sync-config.json` at the start of each run (picks up UI config changes without restart).
2. Sets `running = true`, records `lastRunAt`.
3. Iterates users in sequential batches of 10. Within each batch, users are processed one at a time so `currentUser` / `completedUsers` / `failedUsers` remain accurate for live status polling.
4. Calls `aggregateMetrics({ developerIds: [userId], ... })` with a **90-day rolling window**.
5. Calls `setCachedMetrics([userId], ...)` to write the cache file for that user.
6. Records per-batch `SyncBatchLog` entries (status, duration, optional error).
7. Writes the run log to `data/sync-logs/{YYYY-MM-DD-HH-mm-ss}.json`.
8. Sets `running = false`, clears `currentUser`.

**`triggerSyncForUsers(developerIds)`** — non-blocking: calls `runSync()` without awaiting.

**`rescheduleInterval(intervalMinutes, developerIds)`** — clears old `setInterval`, sets new one, computes next `nextRunAt`.

**`getSyncStatus()`** — returns the current module state as a `SyncStatus` snapshot.

**`listRunLogs(max)`** / **`purgeRunLogs()`** — read/delete files in `data/sync-logs/`.

### 2.12 Sync router — `WEB/routes/syncRouter.ts`

Mounted at `/api/dashboard/sync`. All endpoints require the existing `apiKeyAuth` middleware (applied at the parent router level).

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/status` | — | `SyncStatus` |
| POST | `/trigger` | `{ developerIds: string[] }` | `202 { queued: true }` |
| GET | `/config` | — | `SyncConfig` (file or env fallback) |
| POST | `/config` | `{ developerIds, intervalMinutes }` | `200 SyncConfig` |
| GET | `/logs` | — | `SyncRunLog[]` (newest first, max 50) |
| DELETE | `/logs` | — | `204` |

Validation: `developerIds` must be a non-empty string array; `intervalMinutes` must be `0`, `1440`, or `10080`.

`POST /config` atomically writes `data/sync-config.json` via `writeJsonCache`, then immediately calls `rescheduleInterval()` so the new schedule takes effect without a restart.

### 2.13 Error handler — `WEB/middleware/errorHandler.ts`

| Error | HTTP response |
|---|---|
| `AtlassianHttpError` 401/403 | `502` — credential hint |
| `AtlassianHttpError` 5xx | `502` — upstream detail |
| `AtlassianHttpError` other 4xx | `502` — status + detail + URL |
| Anything else | `500` |

Always logs `err.stack` to `console.error`.

---

## 3. Frontend design

### 3.1 State management — `hooks/useDashboard.ts`

Uses `useReducer` with a typed `DashboardState`:

```typescript
interface DashboardState {
  selectedUsers:   string[];
  startDate:       string;
  endDate:         string;
  selectedProjects: string[];
  selectedRepos:   string[];
  dashboardData:   AggregatedDeveloperMetric[] | null;
  isLoading:       boolean;
  errorMessage:    string | null;
}
```

Actions: `SET_USERS`, `SET_START_DATE`, `SET_END_DATE`, `SET_PROJECTS`, `SET_REPOS`, `FETCH_START`, `FETCH_SUCCESS`, `FETCH_ERROR`.

`fetchMetrics()` POSTs to `/api/dashboard/metrics` including `projectKeys` and `repoSlugs` when set, and dispatches either `FETCH_SUCCESS` or `FETCH_ERROR`.

`setDatePreset(preset)` calculates the correct `startDate` for `'last30'`, `'last90'`, or `'currentQuarter'` and dispatches both date actions.

All exported callbacks are wrapped in `useCallback` for stable references.

### 3.2 Component tree

```
Dashboard
├── FilterPanel
│   ├── UserPicker           (fetches /api/dashboard/users on mount)
│   ├── DateRangePicker      (inputs + preset buttons)
│   └── RepoPicker           (fetches /api/dashboard/projects on mount;
│                             fetches /api/dashboard/repos when projects change)
└── main
    ├── InsightsPanel        (AI-generated team insights, when enabled)
    ├── ThroughputOverview   (KPI stat cards)
    ├── WorkflowCycleTrack   (stage pipeline + Recharts BarChart)
    ├── CodeQualityPanel     (team gauge, radar chart, per-dev score bars)
    ├── WorkTypeChart        (Recharts PieChart + bar rows)
    └── ContributorTable     (sortable table, sortKey: keyof AggregatedDeveloperMetric)
```

### 3.3 Sorting — `ContributorTable`

```typescript
const handleTableSort = (_e: MouseEvent<HTMLButtonElement>, fieldKey: SortKey) => { ... }
```

- Toggles `asc`/`desc` on re-click of the same column.
- New column defaults to `desc`.
- `getSortValue()` handles object fields: `linesChanged` → `added + deleted`; `workType` → total issues.

### 3.4 Skeleton loading

`<Skeleton width height />` renders a `div` with a CSS shimmer animation (`@keyframes shimmer`, `background-size: 800px`).
Every metric section renders skeletons when `isLoading === true`.

### 3.5 Performance ratings

`WorkflowCycleTrack` colours each stage value and label based on benchmarks:

| Stage field | Green (on track) | Amber (needs attention) | Red (at risk) |
|---|---|---|---|
| `pickupDelayHrs` | ≤ 4 h | ≤ 8 h | > 8 h |
| `reviewLifecycleHrs` | ≤ 8 h | ≤ 16 h | > 16 h |
| `cycleTimeHrs` | ≤ 24 h | ≤ 40 h | > 40 h |

### 3.6 Vite proxy

`vite.config.ts` proxies `/api/*` to `http://localhost:3000` in development, so the frontend never hard-codes the backend URL.

### 3.7 Styling

Single `styles.css` file. CSS custom properties on `:root` for the **dark theme** palette (background `#1a1d27`, surface `#2a2d3a`, accent `#4f8ef7`). No CSS framework — all styles are BEM-style utility classes co-located in the one file.

### 3.8 App navigation — `main.tsx`

A top-level `<App>` component holds a `useState<'dashboard' | 'sync'>` page state. Two tabs in `<nav class="app-nav">` switch between `<Dashboard>` and `<SyncPage>`. A `window` custom event `navigate-to-sync` allows the cache status banner in the Dashboard to programmatically navigate to the Sync Jobs tab.

### 3.9 Sync page — `SyncPage.tsx` + `useSync.ts`

`useSync` follows the same `useReducer` pattern as `useDashboard`. State:

```typescript
interface SyncPageState {
  status:          SyncStatus | null;
  config:          SyncConfig | null;
  logs:            SyncRunLog[];
  mode:            'all' | 'by-project' | 'manual';
  selectedUsers:   string[];
  selectedProject: string;
  scheduleOption:  'now' | 'daily' | 'weekly';
  purgeLogsOnRun:  boolean;
  isLoadingStatus: boolean;
  isLoadingLogs:   boolean;
  isSaving:        boolean;
  error:           string | null;
}
```

**Adaptive polling:** A `useEffect` sets a `setInterval` — 5 seconds when `status.running === true`, 30 seconds when idle. Clears on unmount.

**`saveAndRun()` flow:**
1. Optionally `DELETE /api/dashboard/sync/logs` (if `purgeLogsOnRun`).
2. Optionally `POST /api/dashboard/sync/config` (if schedule is daily or weekly).
3. `POST /api/dashboard/sync/trigger`.
4. Immediately calls `fetchStatus()` + `fetchLogs()` to update the UI.

`SyncPage` renders: status card → user selection (3-mode tabs) → schedule radios → purge checkbox + Save & Run button → expandable run history table with per-batch detail rows.

---

## 4. Type sharing

Backend (`types/index.ts`) and frontend (`UI/src/types/index.ts`) both define the same public interfaces (`BitbucketUser`, `AggregatedDeveloperMetric`, `DashboardQueryPayload`, `DashboardState`). They are kept in sync manually — intentional to avoid a monorepo or shared-package setup for a small internal tool.

Key `AggregatedDeveloperMetric` fields:

| Field | Type | Notes |
|---|---|---|
| `prsReviewed` | `number` | Merged PRs authored by others where this dev was a PARTICIPANT (reviewer, commenter, approver, or merger) |
| `codeQuality.criticalScore` | `number \| null` | `null` when no Jira issues exist in the period — excluded from composite |
| `codeQuality.approvalScore` | `number \| null` | `null` when no merged PRs exist — excluded from composite |
| `codeQuality.prFocusScore` | `number \| null` | `null` when no merged PRs exist — excluded from composite |
| `specMetrics` | `SpecDrivenMetrics \| undefined` | Present only when `SPEC_METRICS_ENABLED=true`; `undefined` otherwise |

The UI renders `null` sub-scores as **N/A** with a greyed-out bar, rather than 0.

`SpecDrivenMetrics` fields:

| Field | Type | Notes |
|---|---|---|
| `specDefinitionTimeHrs` | `number` | 0 if spec-approved status never reached |
| `implementationTimeHrs` | `number` | 0 if verification status never reached |
| `verificationTimeHrs` | `number` | 0 if done status never reached |
| `clarificationDelayHrs` | `number` | Sum across all blocked visits |
| `specRegressions` | `number` | Total per developer (sum, not average) |
| `postMergeReworkCommits` | `number` | Total per developer (sum, not average) |
| `firstPassYield` | `boolean` | `true` only when both totals are 0 |
| `specAdherenceScore` | `number` | 0–100; average of per-issue scores |

---

## 5. Adding a new metric

1. Add the field to `AggregatedDeveloperMetric` in both `types/index.ts` and `UI/src/types/index.ts`.
2. Write a pure function in a new or existing file under `BL/metrics/`.
3. Call it in `BL/metrics/aggregator.ts` and include the result in the returned object.
4. Add a column to `COLS` in `UI/src/components/ContributorTable.tsx` and a stat card / chart as needed.
5. Run `npx tsc --noEmit` in both root and `UI/` — TypeScript will point to anything missed.

---

## 6. Adding a new repository to scan

**Tier 1 (pin exact repos):** Edit `BITBUCKET_PROJECTS` in `.env`:
```
BITBUCKET_PROJECTS=PROJ/backend-api,PROJ/frontend-app,INFRA/k8s-configs
```

**Tier 2 (expand a project):** Edit `BITBUCKET_PROJECT_KEYS` in `.env`:
```
BITBUCKET_PROJECT_KEYS=PROJ,INFRA
```

No code change required in either case. The aggregator reads these at runtime on every request.
