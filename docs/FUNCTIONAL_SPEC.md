# Functional Specification — AI Productivity Tool

**Version:** 1.5
**Date:** 2026-06-07
**Audience:** Product owners, engineering leads, QA

> **Requirement IDs** — every testable requirement carries a `REQ-<section>-<n>` tag.
> Tests must reference the relevant ID via a `// @req REQ-*` comment.
> Run `npm run test:trace` to verify full coverage.

---

## 1. Purpose

The AI Productivity Tool is an internal dashboard that aggregates developer activity data from on-premises Jira Server and Bitbucket Server to give engineering managers objective, data-backed visibility into individual and team productivity across the software development lifecycle (SDLC).

---

## 2. Scope

### In scope

- Per-developer commit counts and lines changed
- PR cycle time, pickup delay, and review lifecycle (working hours, leave-adjusted)
- Review depth (human reviewer actions per PR)
- Jira work-type classification (Features, Bugs, Infra & Tech Debt)
- Code quality composite score (0–100) derived from critical/security resolution, approval rate, PR focus, and rework stability
- Date-range filtering with preset shortcuts
- User selection from the live Bitbucket user directory
- Project and repository selection with three-tier auto-discovery fallback
- Sortable contributor leaderboard with click-through PR detail drawer
- Work-type donut chart and bar chart
- Code quality radar chart and per-developer score bars
- Period-over-period delta comparison
- **Background sync job** with admin UI for scheduling, triggering, and monitoring
- **Per-developer JSON file cache** with partial cache hit merging for sub-second report loads
- **Spec-driven metrics** (opt-in) — phased lead times, spec regression detection, clarification delay, first-pass yield, and spec adherence score derived from the Jira issue changelog

### Out of scope

- External static analysis tools (SonarQube, ESLint) or code smells
- Sprint velocity or velocity trending
- Individual performance ratings or HR integration
- Real-time (sub-minute) updates

---

## 3. Users

| Persona             | Needs                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| Engineering Manager | Understand team throughput and bottlenecks across a sprint or quarter |
| Tech Lead           | Spot slow review cycles or uneven workload distribution               |
| Developer           | See their own contribution data in context of the team                |

---

## 4. Functional requirements

### 4.1 User selection

<!-- REQ-4.1-1 --> The user picker loads all accounts from `GET /rest/api/1.0/admin/users` on mount.
<!-- REQ-4.1-2 --> Users are displayed with avatar initials and display name.
<!-- REQ-4.1-3 --> The list is searchable by display name or username slug.
<!-- REQ-4.1-4 --> A "Select all" button selects all currently filtered users.
<!-- REQ-4.1-5 --> The Run Report button is disabled until at least one user is selected.

### 4.2 Date range selection

<!-- REQ-4.2-1 --> Default range: last 30 days.
<!-- REQ-4.2-2 --> Preset shortcuts: Last 30 days, Current Quarter, Last 90 days.
<!-- REQ-4.2-3 --> Custom date inputs accept any YYYY-MM-DD range.
<!-- REQ-4.2-4 --> `endDate` must be ≥ `startDate`; the backend returns HTTP 400 otherwise.

### 4.3 Repository targeting

Repositories to scan are resolved via a three-tier priority system:

| Tier                   | Source                                                              | Behaviour                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Exact**          | UI `repoTargets` (projectKey+repoSlug pairs), or `BITBUCKET_PROJECTS` env var | Uses the listed `PROJECT/repo` pairs directly — no Bitbucket discovery calls                                                                              |
| **2 — Project-scoped** | UI `projectKeys` only, or `BITBUCKET_PROJECT_KEYS` env var      | Lists all repos in those projects via Bitbucket API, then filters to repos where the developer has a commit or merged PR in the date window                             |
| **3 — Auto-discover**  | Nothing provided                                                | Fetches each developer's recently-active repos via `/rest/api/1.0/profile/recent/repos`; falls back to scanning all visible projects if the profile API returns nothing |

<!-- REQ-4.3-1 --> UI values always override env values. See [api-usecases.md](api-usecases.md) for concrete examples.

### 4.4 Metrics computation

#### 4.4.1 Commits

<!-- REQ-4.4.1-1 --> **Total commits** are the sum of commit counts on merged pull requests authored in the date window (via `getCachedPRDetails`), not a full repository commit-log scan.
<!-- REQ-003-FR-010 --> Dashboard commit throughput MUST be derived from commits on merged PRs in the date window.
<!-- REQ-003-FR-011 --> Auxiliary repository-level commit fetches (scripts) partition by calendar month with write-once closed-month cache.
<!-- REQ-003-FR-012 --> On cache hit for a closed month, zero upstream commit pagination is required per developer-repository pair.
<!-- REQ-4.4.1-2 --> Date filtering applied in-memory on `authorTimestamp` (Bitbucket date params accept only commit SHAs, not dates).
<!-- REQ-4.4.1-3 --> All resolved repos are scanned per developer.

#### 4.4.2 Pull Requests

<!-- REQ-4.4.2-1 --> Source: `GET /rest/api/1.0/projects/{key}/repos/{slug}/pull-requests?state=MERGED`
<!-- REQ-4.4.2-2 --> Filtered to PRs authored by the developer whose `createdDate` falls within the selected window.

#### 4.4.3 PRs reviewed

<!-- REQ-4.4.3-1 --> Source: `GET .../pull-requests?state=MERGED&role=PARTICIPANT&username={slug}`. Counts merged PRs authored by others where the developer participated as reviewer, commenter, approver, or merger.
<!-- REQ-4.4.3-2 --> Own PRs (where `pr.author.user.name === developerSlug`) are excluded.
<!-- REQ-4.4.3-3 --> The count is deduplicated by PR id across all resolved repos.

#### 4.4.4 Jira issue linking

Issues are sourced two ways:

<!-- REQ-4.4.4-1 --> **Assignee search** via JQL (see section 4.4.4a).
<!-- REQ-4.4.4-2 --> **Commit message extraction** — regex `/([A-Z]+-\d+)/g` applied to every commit message; matched keys fetched directly from Jira.
<!-- REQ-4.4.4-3 --> Both result sets are merged and deduplicated by issue key.

##### 4.4.4a Assignee JQL

<!-- REQ-003-FR-001 --> Issue linking mode is configured via `JIRA_ISSUE_LINKING_MODE` (`connector` | `assignee` | `hybrid`; default `hybrid`).
<!-- REQ-003-FR-002 --> In `hybrid` mode, when connector JQL returns zero results or fails, the system retries with assignee-only JQL and sets `fallbackEngaged` in `/ready`.
<!-- REQ-003-FR-003 --> PR-title-extracted ticket keys are always merged with assignee-based results, deduplicated by issue key via `mergeIssuesByKey`.
<!-- REQ-003-FR-004 --> Work-type and code-quality metric shapes are identical regardless of linking mode.
<!-- REQ-003-FR-005 --> `GET /ready` includes `jiraLinking` with `mode`, `connectorAvailable`, and `fallbackEngaged`.

**Connector JQL** (when mode is `connector` or as first attempt in `hybrid`):

```
assignee in ("slug1","slug2")
AND development[pullrequests].all > 0
AND updated >= "YYYY-MM-DD"
AND updated <= "YYYY-MM-DD"
ORDER BY updated DESC
```

**Assignee-only JQL** (when mode is `assignee` or as hybrid fallback):

```
assignee = "slug"
AND updated >= "YYYY-MM-DD"
AND updated <= "YYYY-MM-DD"
ORDER BY updated DESC
```

#### 4.4.5 Cycle time

<!-- REQ-4.4.5-1 --> Working hours elapsed from PR `createdDate` to `closedDate`, counting only Monday through Friday, 09:00–17:00 local time.
<!-- REQ-4.4.5-2 --> Discounted by **12.64%** to account for 2.75 leave/holiday days per resource per month. Formula: `effectiveHours = rawWorkingHours × (1 − 33/261)`.
<!-- REQ-4.4.5-3 --> Reported as an average across all merged PRs for the developer.
<!-- REQ-4.4.5-4 --> Returns 0 when there are no merged PRs or when `closedDate` is null.

#### 4.4.6 Pickup delay

<!-- REQ-4.4.6-1 --> Working hours from PR `createdDate` to the `createdDate` of the first activity event by a non-author, non-bot reviewer.
<!-- REQ-4.4.6-2 --> Bot accounts matched by: `/sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot/i`

#### 4.4.7 Review lifecycle

<!-- REQ-4.4.7-1 --> Working hours from the first `COMMENTED` activity by a non-author, non-bot user to PR `closedDate`.

#### 4.4.8 Review depth

<!-- REQ-4.4.8-1 --> Count of `COMMENTED`, `REVIEWED`, or `APPROVED` activity events by non-author, non-bot accounts. Averaged across all PRs.

#### 4.4.9 Code quality score

A composite 0–100 score from four equal-weighted signals (25% each), derived entirely from data already collected in the pipeline — no new API calls.

| Signal                         | Weight | Source        | Formula                                                                                                                                                                                                       |
| ------------------------------ | ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical / Security resolution | 25%    | Jira issues   | Effective resolution rate with a **2.5× multiplier** for BlackDuck, CVE, customer-reported, RCA, or incident tickets. Rewards high-risk firefighting; does not penalise developers assigned to security work. |
| Approval rate                  | 25%    | PR activities | % of merged PRs approved by a human within a 24-hour SLA. Rubber-stamp approvals (< 5 min + zero reviewer comments) count as 50%.                                                                             |
| PR focus                       | 25%    | PR diff stats | Sigmoid decay: `round(100 / (1 + e^((avgLines − 500) / 100)))`. ≤ 200 lines ≈ 100, 500 lines = 50, ≥ 800 lines ≈ 0. A 1-line security fix scores the same as a clean 200-line feature.                        |
| Low rework & stability         | 25%    | PR activities | Exponential penalty on RESCOPED events per PR: `round(100 × 2^(−avgRescopedPerPR))`. 0 rescopes = 100; penalty doubles every additional rescope.                                                              |

<!-- REQ-4.4.9-1 --> `composite = round(criticalScore × 0.25 + approvalScore × 0.25 + prFocusScore × 0.25 + reworkScore × 0.25)`
<!-- REQ-4.4.9-2 --> No issues → `criticalScore = null` (signal excluded from composite). No PRs → `approvalScore = null` and `prFocusScore = null`.
<!-- REQ-4.4.9-3 --> Critical/security issues (BlackDuck, CVE, customer-reported, RCA, incident labels) carry a **2.5× weight** in the resolution denominator.
<!-- REQ-4.4.9-4 --> Human approval within 24 h SLA with at least one reviewer comment → full credit (100). Approval in < 5 min with zero reviewer comments → rubber stamp → 50 credit. Approval outside 24 h → zero credit.
<!-- REQ-4.4.9-5 --> Bot and self-approvals are excluded from the approval rate.
<!-- REQ-4.4.9-6 --> PR focus score: sigmoid `round(100 / (1 + e^((lines − 500) / 100)))`. ≤ 200 lines ≥ 93, 500 lines = 50, ≥ 800 lines ≤ 7.
<!-- REQ-4.4.9-7 --> Rework score: `round(100 × 2^(−avgRescopedPerPR))`. 0 rescopes = 100; 1 rescope/PR = 50.
<!-- REQ-4.4.9-8 --> **Bug ratio** (`bugs / totalIssues`) is returned as an informational field only — not included in the composite.
<!-- REQ-4.4.9-9 --> Rating bands: **Good** ≥ 75 · **Fair** 50–74 · **Needs work** < 50.

#### 4.4.10 Work-type classification

| Jira `issuetype.name`                                                                   | Maps to       |
| --------------------------------------------------------------------------------------- | ------------- |
| New Feature, Story, Feature, Epic, Improvement, Enhancement                             | `features`    |
| Bug, Defect, Hotfix, Incident                                                           | `bugs`        |
| Technical Task, Task, Sub-task, Tech Debt, Maintenance, Infrastructure, Refactor, Chore | `infraOrDebt` |

<!-- REQ-4.4.10-1 --> Type names are matched case-insensitively.
<!-- REQ-4.4.10-2 --> Label-based fallback: scans issue labels for bug/infra keywords if the issue type is unrecognised.
<!-- REQ-4.4.10-3 --> Unrecognised type with no matching labels defaults to `features`.

### 4.5 Dashboard sections

| Section                  | Content                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Throughput Overview      | KPI cards: total commits, lines added, lines deleted, avg cycle time                                     |
| Workflow Cycle Track     | Stage pipeline with colour-coded performance ratings; bar chart when >1 developer selected               |
| Code Quality Score       | Team average gauge, radar chart (critical / approval / PR focus / rework axes), per-developer score bars |
| Jira Category Allocation | Donut chart + horizontal bar chart with percentage breakdown                                             |
| Team Contributors        | Sortable table with columns: commits, lines +/-, PRs reviewed, cycle time, pickup delay, review lifecycle, review depth, work type, quality score; sparklines and quality badge per row |

### 4.6 Skeleton loading

<!-- REQ-4.6-1 --> All metric sections display animated skeleton placeholders while `isLoading === true`, preventing layout shift.

### 4.7 Error handling

<!-- REQ-4.7-1 --> Upstream Jira/Bitbucket 401/403 → `502 Bad Gateway` with credential hint.
<!-- REQ-4.7-2 --> Upstream 5xx → `502 Bad Gateway` with upstream detail.
<!-- REQ-4.7-3 --> Validation failure → `400 Bad Request` with field description.
<!-- REQ-4.7-4 --> All other errors → `500 Internal Server Error`.
<!-- REQ-4.7-5 --> Upstream 429 (rate limit) → retry the upstream call up to **3 times** with exponential backoff and jitter (initial delay 500 ms, multiplier 2, ±25% jitter). If all retries are exhausted, respond `429 Too Many Requests` to the client with a `Retry-After: 60` header.

### 4.8 Sync job admin

#### 4.8.1 Purpose

<!-- REQ-4.8.1-1 --> A background sync job pre-computes and caches metrics for a configured set of users on a repeating schedule. Once synced, dashboard queries load from per-developer cache files instantly without hitting Bitbucket or Jira APIs.

#### 4.8.2 User selection modes

The Sync Jobs tab offers three modes:

| Mode | Behaviour |
|------|-----------|
| **All users** | Auto-fetches the full Bitbucket user directory and selects all |
| **By project** | Shows project pills; user selects one project, then a user picker loads all users for refinement |
| **Select manually** | Standard user picker with search and multi-select |

#### 4.8.3 Schedule options

| Option | Effect |
|--------|--------|
| Run once now | Triggers an immediate sync with no recurring schedule |
| Daily (every 24 h) | Saves `intervalMinutes: 1440` to `data/sync-config.json` and schedules a `setInterval` |
| Weekly (every 7 d) | Saves `intervalMinutes: 10080` to `data/sync-config.json` |

<!-- REQ-4.8.3-1 --> The schedule survives server restarts: `startMetricsSyncJob()` reads `data/sync-config.json` on startup and resumes the interval.

#### 4.8.4 Run logs

<!-- REQ-4.8.4-1 --> Each sync run writes a structured JSON log to `data/sync-logs/{YYYY-MM-DD-HH-mm-ss}.json` with fields: `runId`, `startedAt`, `finishedAt`, `durationMs`, `totalUsers`, and per-batch entries (`batchIndex`, `userIds`, `durationMs`, `status`, optional `error`).
<!-- REQ-4.8.4-2 --> The Run History table shows the last 50 runs with expandable per-batch detail rows. Green left border for fully successful runs, red for any batch error.

#### 4.8.5 Purge logs

<!-- REQ-4.8.5-1 --> A "Purge run logs before starting" checkbox calls `DELETE /api/dashboard/sync/logs` before triggering the sync, removing all files in `data/sync-logs/`.

#### 4.8.7 Concurrent trigger protection

<!-- REQ-4.8.7-1 --> If a sync run is already in progress when `POST /sync/trigger` is received, the server MUST respond `409 Conflict` with body `{ "error": "sync_in_progress", "runId": "<activeRunId>" }`. The client MUST NOT start a new run.

#### 4.8.6 Cache freshness indicator

<!-- REQ-4.8.6-1 --> When results include data from the sync cache, a green banner reads "Served from sync cache · synced {date}". Banner includes a "Manage sync jobs →" link to the Sync Jobs tab.
<!-- REQ-4.8.6-2 --> For partial hits, the banner reads "Partial cache hit — some developers loaded live".

### 4.9 Input validation

<!-- REQ-4.9-1 --> `developerIds` array must have at least 1 and at most 50 entries; exceeding 50 returns HTTP 400.
<!-- REQ-4.9-6 --> All `/api/*` routes MUST require an `X-Api-Key: <token>` header. Absent or invalid headers return HTTP 401 with body `{ "error": "Unauthorized — provide a valid X-Api-Key header" }`. The token MUST be compared against the `API_KEY` env var using a constant-time comparison to prevent timing attacks.
<!-- REQ-4.9-2 --> Date range must not exceed 366 days; exceeding returns HTTP 400.
<!-- REQ-4.9-3 --> Leading/trailing whitespace in `developerIds` entries is trimmed before processing.
<!-- REQ-4.9-4 --> Each `repoTargets` entry `projectKey` must match `/^[A-Z][A-Z0-9_]{0,9}$/`; `repoSlug` must match `/^[a-z0-9_.\-]{1,128}$/`. Any entry failing either pattern returns HTTP 400 with field description.
<!-- REQ-4.9-5 --> Each `projectKeys` entry must match the same `projectKey` pattern above. Array may have at most 20 entries; exceeding returns HTTP 400.

### 4.10 API rate-limit and concurrency

<!-- REQ-4.10-1 --> All outbound Bitbucket and Jira API calls MUST be bounded by `MAX_CONCURRENT_API_CALLS` (env var, default `50`). The same `concurrentMap` utility used for spec-metrics MUST be applied to all aggregator fan-out loops.
<!-- REQ-4.10-2 --> When any upstream API responds with HTTP 429, the call MUST be retried up to 3 times with exponential backoff (initial 500 ms, multiplier 2, ±25% jitter). After all retries exhausted, the aggregator MUST surface `429 Too Many Requests` to the client with a `Retry-After: 60` header (see REQ-4.7-5).

### 4.11 Clarifications

#### Session 2026-06-07

- Q: How should upstream HTTP 429 (rate limit) responses be handled? → A: Propagate 429 to client with `Retry-After` header; retry upstream up to 3× with exponential backoff + jitter.
- Q: What is the hard concurrency cap for outbound Bitbucket/Jira API calls during a live report? → A: Configurable `MAX_CONCURRENT_API_CALLS` env var, default 50.
- Q: Should `repoTargets` and `projectKeys` fields be validated at the HTTP boundary? → A: Yes — validate `projectKey` format (`/^[A-Z][A-Z0-9_]{0,9}$/`) and `repoSlug` format (`/^[a-z0-9_.-]{1,128}$/`); return HTTP 400 on violation.
- Q: What happens when `POST /sync/trigger` is called while a sync is already running? → A: Return HTTP 409 Conflict with `{ "error": "sync_in_progress", "runId": "<activeRunId>" }`.
- Q: What is the API key validation contract for all `/api/*` routes? → A: `X-Api-Key: <token>` header required; HTTP 401 on absent/invalid; constant-time compare against `API_KEY` env var.

---

### 4.12 In-memory SQLite storage (migration from JSON cache files)

<!-- REQ-4.12-1 --> On server startup the system MUST initialise a single SQLite instance at `APP_STORE_PATH` (default `data/cache/app-store.sqlite`) with WAL mode and create all required tables before accepting any API requests. If initialisation fails the server MUST abort startup immediately with a structured error and exit with a non-zero code within 5 seconds.
<!-- REQ-003-FR-013 --> Developer metrics cache entries survive server restart when younger than the configured freshness window.
<!-- REQ-003-FR-014 --> Store path is configurable via `APP_STORE_PATH`; default under git-ignored `data/cache/`.
<!-- REQ-003-FR-015 --> Per-developer JSON metrics files (`data/cache/metrics-result/*.json`) MUST NOT be reintroduced.
<!-- REQ-003-FR-016 --> Startup MUST fail fast if the store file is corrupt or unreadable.
<!-- REQ-003-FR-017 --> Changelog cache TTL remains 1 hour (`METRICS_CACHE_TTL_MS`); SQLite metrics age expiry is controlled separately via `METRICS_SQLITE_TTL_MS` (default 0 = no age expiry).
<!-- REQ-004-FR-001 --> SQLite metrics cache MUST NOT expire by age by default (`METRICS_SQLITE_TTL_MS` default `0`).
<!-- REQ-004-FR-002 --> Rolling 90-day requests MUST resolve cache via `window_kind=rolling-90` plus developer id (not exact date pair alone).
<!-- REQ-004-FR-003 --> Fixed date-range requests MUST use exact `(developerId, startDate, endDate)` lookup with `window_kind=fixed`.
<!-- REQ-004-FR-004 --> When a rolling cache hit exists but the window end advanced or calendar month changed, the system MUST refresh the gap slice only and merge into the stored metric.
<!-- REQ-004-FR-005 --> Closed calendar months MUST NOT trigger upstream calls when a write-once JSON month cache exists.
<!-- REQ-004-FR-006 --> Open PR fetch MUST use per-repo monthly JSON envelope with update cursor (delta merge within current month).
<!-- REQ-004-FR-007 --> Reviewed PR fetch MUST use per-repo monthly JSON envelope with update cursor (delta from `cursorUpdatedMs`).
<!-- REQ-004-FR-008 --> Jira issue search MUST use per-developer monthly JSON envelope with `updated` cursor (delta JQL).
<!-- REQ-004-FR-009 --> `POST /api/dashboard/sync/refresh` MUST accept `scope: current-month | full` (default `current-month`) and return HTTP 202 with queued count.
<!-- REQ-004-FR-010 --> Sync job and dashboard MUST share `resolveMetricsFromCache` for partial hits, gap merge, and cache writes.
<!-- REQ-004-FR-011 --> Metrics API response MUST expose `cacheStatus` values `full`, `partial`, or `gap-merged` when served from cache resolution.
<!-- REQ-4.12-2 --> The system MUST store computed developer metrics (keyed by `developerId`, `startDate`, and `endDate`) together with a `cachedAt` Unix-ms timestamp in the store, and retrieve them as hits (entries within `maxAgeMs`) or misses (absent or stale) — preserving the existing `getCachedMetrics` / `setCachedMetrics` public signatures unchanged.
<!-- REQ-4.12-3 --> The system MUST store sync run logs (`runId`, timestamps, `durationMs`, `totalUsers`, per-batch detail) in the store immediately after each sync run completes, support listing the last N logs ordered by `startedAt` descending, and support purging all logs — preserving the existing `writeRunLog` / `listRunLogs` / `purgeRunLogs` internal/public signatures unchanged.
<!-- REQ-4.12-4 --> A single shared store instance MUST be used; no second connection or parallel store instance may be created. The singleton connection MUST be owned by `databaselayer/store/appStore.ts`; all other modules import from there.
<!-- REQ-4.12-5 --> After the SQLite migration the system MUST NOT write any new `data/cache/metrics-result/*.json` or `data/sync-logs/*.json` files. On first startup after deployment — detected by the absence of sentinel file `data/.migrated-to-sqlite` — the system MUST attempt to delete both legacy directories, log a one-time migration notice, write the sentinel file, and continue normally regardless of whether deletion succeeds (non-blocking; warn on failure). Subsequent startups skip the cleanup because the sentinel file is present.
<!-- REQ-003-FR-018 --> Jira linking, changelog cache, commit formalisation, and persistent store are independently deployable feature slices.
<!-- REQ-003-FR-019 --> Known limitations in baseline spec are updated when each remediation ships.

<!-- REQ-002-FR-001 --> The sync status endpoint MUST return at most 50 completed users (the most recent 50 by completion order) in the `completedUsers` field. The `totalSyncUsers` field MUST always reflect the true count of users in the run regardless of the cap. The `failedUsers` array MUST never be truncated.
<!-- REQ-002-FR-003 --> When a manual sync run is triggered, the system MUST check the SQLite metrics cache for each user before calling the upstream metrics API. Users with a cache entry younger than 1 hour MUST be promoted to completed immediately without any upstream API call.
<!-- REQ-002-FR-004 --> Cache-skipped users MUST be recorded in the batch log with `status: 'ok'` and a `source: 'cache'` field. Freshly fetched users MUST be recorded with `source: 'live'`. The `source` field is optional and absent on legacy run log rows.
<!-- REQ-002-FR-005 --> The system MUST expose a `GET /api/dashboard/sync/cache-coverage` endpoint that returns, for all users configured in `sync-config.json`, a count of cached users, a count and list of uncached users (no entry for current date range), and a count and list of stale users (entry older than 1 hour). When no config file is present the endpoint returns all-zero counts.
<!-- REQ-002-FR-006 --> The system MUST expose a `POST /api/dashboard/sync/warmup` endpoint that reads configured users from `sync-config.json`, identifies those without a fresh cache entry, and triggers a sync for only those users. If a sync is already running it MUST return HTTP 409. If no users are configured it MUST return HTTP 400. The response MUST include the counts of skipped (cached) and queued (warming) users and the list of queued user IDs.

---

## 5. Non-functional requirements

| Requirement           | Target                                                                     |
| --------------------- | -------------------------------------------------------------------------- |
| Response time (live)  | < 30 s for a 7-developer, 90-day query over 5 repos                        |
| Response time (cache) | < 500 ms for any team size when all developers are in the sync cache       |
| Concurrency           | Per-developer and per-PR API calls parallelised via `Promise.all`          |
| Cache scalability     | One JSON file per (devId, startDate, endDate) — scales to hundreds of devs without contention |
| API concurrency       | All outbound Bitbucket/Jira calls bounded by `MAX_CONCURRENT_API_CALLS` (default 50); configurable per deployment |
| SSL                   | Self-signed on-prem certificates tolerated via `rejectUnauthorized: false` |
| Auth                  | Bearer token (PAT) — no OAuth flow required; `Authorization: Bearer <token>` header required on all `/api/*` routes |
| TypeScript strictness | `"strict": true` in both backend and frontend                              |
| UI theme              | Dark theme (background `#1a1d27`) with CSS custom properties; all colour values via semantic tokens |

---

## 6. Data flow

### 6.1 Ad-hoc report (live computation)

```
Browser
  │  POST /api/dashboard/metrics  { developerIds, startDate, endDate, ... }
  ▼
Express Router (metricsRouter)
  │  validatePayload() → getCachedMetrics() → check hits/misses
  │
  ├── Full cache hit → return hits immediately (cacheStatus: 'full')
  ├── Partial hit    → aggregateMetrics(misses only) → merge with hits (cacheStatus: 'partial')
  └── Cache miss     → aggregateMetrics(all devs)
        │
        ▼
      Aggregator (per developer, parallel)
        ├── Bitbucket: getCommitsByAuthor() → extract Jira keys from messages
        ├── Jira: searchIssuesByAssignees() + getIssuesByKeys() → merge + dedup
        ├── Bitbucket: getMergedPullRequestsByAuthor() → filter by author + date
        ├── Bitbucket: getMergedPRsParticipatedByUser() → PRs reviewed (role=PARTICIPANT, excl. own)
        └── per PR (parallel): getPRActivities() + getPRDiffStat()
              └── computeCycleTimeHrs / computePickupDelayHrs / computeReviewLifecycleHrs
                  computeReviewDepth / classifyWorkType
        ▼
      AggregatedDeveloperMetric[] → setCachedMetrics() → JSON response
```

### 6.2 Background sync job

```
setInterval (daily/weekly) or POST /sync/trigger
  │
  ▼
metricsSync.runSync(developerIds)
  │  reads data/sync-config.json at each tick (overrides env vars)
  │
  ├── For each batch of 10 users (parallel):
  │     aggregateMetrics(batch) → setCachedMetrics(batch)
  │     writes data/cache/metrics-result/{devId}__{start}__{end}.json
  │
  └── writes data/sync-logs/{YYYY-MM-DD-HH-mm-ss}.json
        (runId, startedAt, finishedAt, durationMs, totalUsers, batches[])
```

---

## 7. API contract

See [../README.md](../README.md#api-endpoints) for full request/response schemas.

---

## 8. Configuration reference

See [../README.md](../README.md#configuration) for all environment variables.

---

## 9. Spec-driven metrics requirements

### 9.1 Prerequisites

<!-- REQ-9.1-1 --> Spec-driven metrics are gated behind `SPEC_METRICS_ENABLED=true`. When disabled, `specMetrics` is absent from all `AggregatedDeveloperMetric` objects.
<!-- REQ-9.1-2 --> Jira status names for all four phases are configurable via env vars (`SPEC_APPROVED_STATUS`, `SPEC_VERIFICATION_STATUS`, `SPEC_DONE_STATUS`, `SPEC_BLOCKED_STATUS`). Comparisons are case-insensitive.
<!-- REQ-9.1-3 --> When a ticket never reaches a configured status, the corresponding time phase is recorded as `0` — the phase is absent from the lifecycle, not slow.

### 9.2 Phased lead time

<!-- REQ-9.2-1 --> **Spec Definition Time** — working hours from ticket `created` to first transition into the spec-approved status, computed using the same leave-adjusted working-hours formula as cycle time.
<!-- REQ-9.2-2 --> **Implementation Time** — working hours from spec-approved status to the ticket entering verification status. Falls back to ticket created when spec-approved is not in the changelog.
<!-- REQ-9.2-3 --> **Verification Time** — working hours from verification status entry to `resolutiondate` (or the first transition into the done status if `resolutiondate` is null).

### 9.3 Spec waste signals

<!-- REQ-9.3-1 --> **Clarification Delay** — cumulative leave-adjusted working hours the ticket spent in the blocked/awaiting-clarification status across all visits. Multiple visits are summed.
<!-- REQ-9.3-2 --> **Spec Regressions** — count of status transitions whose `fromStatus` (lowercased) equals `specVerificationStatus` and whose `toStatus` is not `done` or `verification`. Each such transition represents the implementation being sent back for rework after failing verification.
<!-- REQ-9.3-3 --> **Post-merge Rework Commits** — commit messages (supplied by the caller from PR commit data) that match `/\b(fix spec|per feedback|scoping change|spec fix|clarif|revert spec|spec update|per review)\b/i`. Counted per issue.

### 9.4 Spec adherence score

<!-- REQ-9.4-1 --> Score formula: `max(0, 100 − regressionPenalty − churnPenalty)` where `regressionPenalty = round(100 × (1 − 2^(−specRegressions)))` and `churnPenalty = min(postMergeReworkCommits × 5, 40)`.
<!-- REQ-9.4-2 --> First-pass yield (`firstPassYield`) is `true` when `specRegressions === 0` AND `postMergeReworkCommits === 0`.

### 9.5 Aggregation

<!-- REQ-9.5-1 --> Per-issue `SpecDrivenMetrics` objects are computed in parallel (bounded by `repoConcurrency`). Issues for which the changelog cannot be fetched are silently excluded.
<!-- REQ-003-FR-006 --> When spec metrics are enabled, ticket change history is cached after first fetch and reused within `METRICS_CACHE_TTL_MS` (1 hour).
<!-- REQ-003-FR-007 --> The background sync job pre-warms changelog cache for PR-title-linked keys after each live user sync when spec metrics are enabled.
<!-- REQ-003-FR-008 --> Changelog fetch failures remain non-blocking (issues excluded from spec aggregates).
<!-- REQ-003-FR-009 --> Closed-month changelog cache entries are write-once; current-month entries refresh when TTL expires.
<!-- REQ-9.5-2 --> Developer-level `specMetrics` is the average of all per-issue values for phased times and clarification delay; `specRegressions` and `postMergeReworkCommits` are totals; `specAdherenceScore` is the average of per-issue scores; `firstPassYield` is `true` only when totals are both zero.

---

## 10. Known limitations

- Tier-3 auto-discovery relies on `/profile/recent/repos`, which only returns repos the user has recently pushed to — very old repos may be missed without Tier-1 or Tier-2 configuration.
- Post-merge rework detection is keyword-based on commit messages. Teams with inconsistent commit message conventions may see underreported churn.

**Resolved in `specs/003-performance-resilience/`:**

- ~~Bitbucket `/commits` date-range scanning on long repo histories~~ — commit throughput is PR-based; auxiliary commit cache uses month partitioning.
- ~~Jira DVCS connector required for issue linking~~ — hybrid/assignee linking modes with `/ready` status.
- ~~In-memory cache lost on restart~~ — file-backed SQLite at `APP_STORE_PATH`.
- ~~Spec metrics N+1 changelog fetches~~ — changelog cache with sync pre-warm.
