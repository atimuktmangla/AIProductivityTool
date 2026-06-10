# Project Spec — AI Productivity Tool

**Version:** 1.0  
**Date:** 2026-06-08  
**Status:** Baseline (reflects built system)  
**Audience:** Engineering leads, product owners, QA, new contributors

---

## 1. Purpose

The AI Productivity Tool is an internal engineering dashboard that pulls live data from on-premises **Jira Server** and **Bitbucket Server (Stash)** to give engineering managers and tech leads objective, data-backed visibility into individual and team productivity across the full software development lifecycle (SDLC).

It is **not** a performance review tool. It surfaces patterns, bottlenecks, and spec adherence signals so engineering leads can have informed conversations and make better resourcing decisions.

---

## 2. Personas

| Persona | Primary need |
|---|---|
| Engineering Manager | Understand team throughput and review-cycle bottlenecks across a sprint or quarter |
| Tech Lead | Spot uneven workload, slow review pipelines, or spec rework patterns |
| Developer | See their own contribution data in context of the team |
| Sync Admin | Configure and monitor the background data sync job |

---

## 3. System overview

The system is two independent deployables connected by a REST API:

```
Browser (React/Vite — frontend/)
  │  /api/* proxied to :3000 in dev; direct in prod
  ▼
Express API (Node.js — server.ts)
  ├── api/          HTTP layer (routes, middleware, guardrails)
  ├── backend/      Business logic (metrics, config, evals)
  ├── databaselayer/ Data access (Atlassian clients, caches, store)
  ├── AI/           LLM provider + insights skill
  └── jobs/         Background sync job (metricsSync.ts)
        │
        ▼
  On-premises Jira Server  (REST API /rest/api/2)
  On-premises Bitbucket Server  (REST API /rest/api/1.0)
```

Both services are containerised via Docker Compose. The backend serves the API on port 3000; the frontend is served by Nginx on port 5173 (or 80 in production).

---

## 4. Layers

### 4.1 `frontend/` — React SPA

Single-page application built with React 18, TypeScript (strict), Vite, and Recharts. No CSS framework — uses a single `styles.css` with CSS custom properties for the dark theme.

Two top-level tabs:
- **Developer Metrics** — filter panel + metric panels
- **Sync Jobs** — background sync admin page

State is managed per-tab via `useReducer` hooks (`useDashboard`, `useSync`). API calls proxy to `:3000` in development via `vite.config.ts`.

### 4.2 `api/` — HTTP layer

Express 4 routes and middleware. Mounted at `/api/dashboard`. Responsibilities:
- Bearer token auth (`apiKeyAuth`)
- Input validation and sanitisation (`sanitiser`, route-level checks)
- Rate limiting (`rateLimiter`)
- Request ID and structured request logging
- Centralised error handler (`errorHandler`)
- Cache read/write integration (partial hit merging in `metricsRouter`)

Two routers:
- `metricsRouter` — users, projects, repos, metrics, insights
- `syncRouter` — sync status, trigger, config, logs, cache-coverage, warmup

### 4.3 `backend/` — Business logic

Pure TypeScript. No I/O. Responsibilities:
- `config/env.ts` — typed `AppConfig`, required-var enforcement, singleton
- `metrics/aggregator.ts` — per-developer fan-out, repo resolution, parallel data gathering
- `metrics/cycleTime.ts` — working-hours calculation with leave adjustment
- `metrics/reviewDepth.ts` — human reviewer action counting
- `metrics/codeQuality.ts` — 4-signal composite quality score
- `metrics/workType.ts` — Jira issue type classifier
- `metrics/specMetrics.ts` — phased lead time, regressions, FPY (opt-in)
- `evals/metricsValidator.ts` — post-computation data quality warnings (non-blocking)
- `util/concurrentMap.ts` — Promise.all with configurable concurrency limit

### 4.4 `databaselayer/` — Data access

All I/O with external systems and local storage. Responsibilities:
- `client/atlassianFetch.ts` — Axios instance factory (SSL bypass, auth header, error mapping)
- `errors/AtlassianHttpError.ts` — typed upstream error
- `services/jiraService.ts` — Jira REST API calls with pagination
- `services/bitbucketService.ts` — Bitbucket REST API calls with pagination
- `cache/metricsCache.ts` — per-developer metrics cache (SQLite in-memory store)
- `cache/bitbucketCache.ts` — TTL-cached Bitbucket API responses
- `cache/ttlCache.ts` — generic in-memory TTL cache
- `cache/cacheEviction.ts` — removes legacy stale JSON cache files
- `cache/jsonFileCache.ts` — atomic read/write helpers (tmp-file + rename)
- `store/inMemoryDb.ts` — shared SQLite `:memory:` instance (singleton)
- `store/migrationCleanup.ts` — one-time migration from legacy JSON files

### 4.5 `AI/` — AI features

- `providers/llmProvider.ts` — unified `callLlm(provider, key, prompt)` supporting Anthropic, OpenAI, and Gemini
- `subagents/retryAgent.ts` — retry wrapper for flaky LLM calls
- `skills/insightsSummary.ts` — rule-based team insights + optional LLM narrative overlay

### 4.6 `jobs/` — Background sync

- `metricsSync.ts` — `setInterval`-based sync job, reads `data/sync-config.json`, batches of 10 users, writes SQLite run logs, exposes `getSyncStatus()`, `triggerSyncForUsers()`, `rescheduleInterval()`

### 4.7 `types/` — Shared types

All public TypeScript interfaces used across layers. The frontend mirrors these in `frontend/src/types/index.ts` — kept in sync manually (intentional — avoids monorepo setup for an internal tool).

---

## 5. Functional requirements

### 5.1 User and date selection

- **FR-5.1-1** User picker loads all Bitbucket accounts from `GET /rest/api/1.0/admin/users` on mount.
- **FR-5.1-2** Users are displayed with avatar initials, display name, and are searchable by display name or username slug.
- **FR-5.1-3** "Select all" selects all currently filtered users. Run Report is disabled until at least one user is selected.
- **FR-5.1-4** Default date range: last 30 days. Preset shortcuts: Last 30 days, Last 90 days, Current Quarter.
- **FR-5.1-5** Custom date inputs accept any `YYYY-MM-DD` range. `endDate` must be ≥ `startDate`; backend returns `400` otherwise.
- **FR-5.1-6** Date range must not exceed 366 days; exceeding returns `400`.

### 5.2 Repository targeting (three-tier strategy)

| Tier | Source | Behaviour |
|---|---|---|
| **1 — Exact** | UI `repoTargets` or `BITBUCKET_PROJECTS` env var | Uses `PROJECT/repo` pairs directly — no discovery |
| **2 — Project-scoped** | UI `projectKeys` or `BITBUCKET_PROJECT_KEYS` env var | Lists all repos in projects; filters to repos where dev has activity |
| **3 — Auto-discover** | Nothing provided | Fetches each dev's recently-active repos via `/profile/recent/repos` |

- **FR-5.2-1** UI values always override env values.
- **FR-5.2-2** `projectKey` must match `/^[A-Z][A-Z0-9_]{0,9}$/`; `repoSlug` must match `/^[a-z0-9_.\-]{1,128}$/`; violations return `400`.
- **FR-5.2-3** `projectKeys` array may have at most 20 entries; exceeding returns `400`.

### 5.3 Metrics computation

#### 5.3.1 Commits

- **FR-5.3.1-1** Dashboard **total commits** are the sum of `commitCount` on merged pull requests in the date window (from PR detail cache), not a repository-wide commit-log scan.
- **FR-5.3.1-2** Auxiliary scripts that need raw commit history use month-partitioned Bitbucket commit cache (`data/cache/{YYYY-MM}/commits/`).
- **FR-5.3.1-3** The aggregator hot path does not paginate `GET .../commits` per repo.

#### 5.3.2 Pull Requests

- **FR-5.3.2-1** Merged PRs: `GET .../pull-requests?state=MERGED`, filtered to PRs authored by the developer whose `createdDate` falls in the selected window.
- **FR-5.3.2-2** PRs reviewed: `GET .../pull-requests?state=MERGED&role=PARTICIPANT&username={slug}`. Counts merged PRs authored by others where the dev was a reviewer, commenter, approver, or merger. Deduplicated by PR ID across all repos.

#### 5.3.3 Jira issue linking

- **FR-5.3.3-1** Assignee search via JQL: `assignee in ("slug") AND development[pullrequests].all > 0 AND updated >= "start" AND updated <= "end"`.
- **FR-5.3.3-2** Commit message extraction: regex `/([A-Z]+-\d+)/g` applied to PR titles; matched keys fetched from Jira.
- **FR-5.3.3-3** Both sets merged and deduplicated by issue key.

#### 5.3.4 Cycle time

- **FR-5.3.4-1** Working hours from PR `createdDate` to `closedDate`, counting only Mon–Fri 09:00–17:00.
- **FR-5.3.4-2** Discounted by **12.64%** for leave: `effectiveHours = rawHours × (1 − 33/261)`.
- **FR-5.3.4-3** Reported as average across all merged PRs. Returns 0 when no merged PRs or `closedDate` is null.

#### 5.3.5 Pickup delay

- **FR-5.3.5-1** Working hours from PR `createdDate` to the `createdDate` of the first activity event by a non-author, non-bot reviewer.
- **FR-5.3.5-2** Bot accounts matched by: `/sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot/i`

#### 5.3.6 Review lifecycle

- **FR-5.3.6-1** Working hours from the first `COMMENTED` activity by a non-author, non-bot user to PR `closedDate`.

#### 5.3.7 Review depth

- **FR-5.3.7-1** Count of `COMMENTED`, `REVIEWED`, or `APPROVED` activity events by non-author, non-bot accounts. Averaged across all PRs.

#### 5.3.8 Code quality score (0–100)

A composite from four equal-weighted signals (25% each):

| Signal | Formula |
|---|---|
| Critical/Security resolution | Effective resolution rate; BlackDuck/CVE/RCA/customer-reported/incident tickets carry 2.5× weight |
| Approval rate | % of merged PRs with ≥1 human APPROVED within 24 h SLA; rubber-stamp (< 5 min + zero comments) = 50 credit |
| PR focus | Sigmoid: `round(100 / (1 + e^((avgLines − 500) / 100)))` |
| Low rework | Exponential decay: `round(100 × 2^(−avgRescopedPerPR))` |

- **FR-5.3.8-1** `composite = round(criticalScore × 0.25 + approvalScore × 0.25 + prFocusScore × 0.25 + reworkScore × 0.25)`.
- **FR-5.3.8-2** Signals with no data (`null`) are excluded from the composite; weight is redistributed proportionally.
- **FR-5.3.8-3** Bug ratio (`bugs / totalIssues`) is an informational field only — not part of the composite.
- **FR-5.3.8-4** Rating bands: **Good** ≥ 75 · **Fair** 50–74 · **Needs work** < 50.

#### 5.3.9 Work-type classification

| Jira `issuetype.name` | Category |
|---|---|
| New Feature, Story, Feature, Epic, Improvement, Enhancement | `features` |
| Bug, Defect, Hotfix, Incident | `bugs` |
| Technical Task, Task, Sub-task, Tech Debt, Maintenance, Infrastructure, Refactor, Chore | `infraOrDebt` |

- **FR-5.3.9-1** Matched case-insensitively. Label-based fallback if type is unrecognised. Unknown type with no matching labels defaults to `features`.

### 5.4 Spec-driven metrics (opt-in, `SPEC_METRICS_ENABLED=true`)

#### Phased lead time

- **FR-5.4-1** **Spec Definition Time** — working hours from ticket `created` to first spec-approved status transition.
- **FR-5.4-2** **Implementation Time** — working hours from spec-approved to verification status entry.
- **FR-5.4-3** **Verification Time** — working hours from verification entry to `resolutiondate` (or done status).
- **FR-5.4-4** When a status is never reached in the lifecycle, the corresponding phase is recorded as `0`.

#### Waste signals

- **FR-5.4-5** **Clarification Delay** — cumulative leave-adjusted working hours in blocked/awaiting-clarification status across all visits.
- **FR-5.4-6** **Spec Regressions** — count of transitions where `fromStatus = specVerificationStatus` and `toStatus` is not done or verification.
- **FR-5.4-7** **Post-merge Rework Commits** — commit messages matching `/\b(fix spec|per feedback|scoping change|spec fix|clarif|revert spec|spec update|per review)\b/i`.

#### Adherence score

- **FR-5.4-8** `specAdherenceScore = max(0, 100 − round(100 × (1 − 2^(−regressions))) − min(reworkCommits × 5, 40))`.
- **FR-5.4-9** `firstPassYield = true` when `specRegressions === 0 AND postMergeReworkCommits === 0`.
- **FR-5.4-10** Developer-level values are averages (phased times, adherence score) or sums (regressions, rework commits) of per-issue values.

### 5.5 Dashboard UI sections

| Section | Content |
|---|---|
| Throughput Overview | KPI cards: total commits, lines added, lines deleted, avg cycle time |
| Workflow Cycle Track | Stage pipeline with colour-coded performance ratings; bar chart when >1 dev |
| Code Quality Score | Team average gauge, radar chart (4 axes), per-developer score bars |
| Jira Category Allocation | Donut chart + horizontal bar chart with percentage breakdown |
| Team Contributors | Sortable table with all metrics + sparklines, click-through PR detail drawer |

- **FR-5.5-1** All sections display animated skeleton placeholders while `isLoading === true`.
- **FR-5.5-2** Period-over-period delta arrows shown when `compareStartDate` / `compareEndDate` are provided.
- **FR-5.5-3** Green cache status banner when results served from sync cache; partial-hit banner for mixed results.

### 5.6 Background sync job

- **FR-5.6-1** `startMetricsSyncJob()` reads `data/sync-config.json` on startup; falls back to `SYNC_DEVELOPER_IDS` / `SYNC_INTERVAL_MINUTES` env vars.
- **FR-5.6-2** Users processed in sequential batches of 10 with a **90-day rolling window**.
- **FR-5.6-3** Schedule survives server restarts. Valid intervals: `0` (off), `1440` (daily), `10080` (weekly).
- **FR-5.6-4** Each run writes a structured log to SQLite (`runId`, timestamps, `durationMs`, `totalUsers`, per-batch entries).
- **FR-5.6-5** `GET /sync/status` returns at most **50 completed users** (most recent by completion order); `totalSyncUsers` always reflects the true count; `failedUsers` is never truncated.
- **FR-5.6-6** `POST /sync/trigger` while a run is in progress returns `409 Conflict` with `{ "error": "sync_in_progress", "runId": "<activeRunId>" }`.
- **FR-5.6-7** Per-user 5-minute timeout prevents hung batches.

### 5.7 Cache and warmup

- **FR-5.7-1** Cache TTL: 1 hour (`METRICS_CACHE_TTL_MS`). Partial cache hits merge live results with cached results.
- **FR-5.7-2** Manual sync runs check SQLite for each user before calling upstream APIs. Users with entries younger than 1 hour are promoted to completed immediately (`source: 'cache'`).
- **FR-5.7-3** `GET /sync/cache-coverage` returns counts of cached, uncached, and stale users for all users in `sync-config.json`.
- **FR-5.7-4** `POST /sync/warmup` triggers a sync for uncached users only. Returns `409` if a sync is running; `400` if no users are configured.
- **FR-5.7-5** `scripts/warm-cache.ps1` reads `PORT` and `VITE_API_KEY` from `.env`; calls `/warmup`; exits code 0 on success, code 1 on error.
- **FR-5.7-6** `scripts/warm-cache.cmd` wraps the PowerShell script with `-ExecutionPolicy Bypass` and propagates the exit code.

### 5.8 AI insights

- **FR-5.8-1** `POST /api/dashboard/insights` returns metrics plus a `TeamInsights` narrative.
- **FR-5.8-2** When `AI_INSIGHTS_ENABLED=false` or `AI_API_KEY` is absent, falls back to a rule-based narrative (never errors).
- **FR-5.8-3** Supported LLM providers: `anthropic` (Claude Haiku), `openai` (GPT-4o Mini), `gemini` (Gemini 2.0 Flash). Provider selected via `AI_PROVIDER` env var.
- **FR-5.8-4** LLM call fails silently — rule-based summary used as fallback; report is never blocked.

### 5.9 Input validation and authentication

- **FR-5.9-1** All `/api/*` routes require `X-Api-Key: <token>` header. Absent or invalid → `401`. Compared using constant-time comparison against `API_KEY` env var.
- **FR-5.9-2** `developerIds`: 1–50 entries; excess → `400`.
- **FR-5.9-3** Leading/trailing whitespace in `developerIds` trimmed before processing.
- **FR-5.9-4** `endDate ≥ startDate`; date range ≤ 366 days.
- **FR-5.9-5** See FR-5.2-2 and FR-5.2-3 for `projectKey` / `repoSlug` validation.

### 5.10 Error handling

- **FR-5.10-1** Upstream 401/403 → `502` with credential hint.
- **FR-5.10-2** Upstream 5xx → `502` with upstream detail.
- **FR-5.10-3** Validation failure → `400` with field description.
- **FR-5.10-4** All other errors → `500`.
- **FR-5.10-5** Upstream `429` → retry up to 3× with exponential backoff (initial 500 ms, multiplier 2, ±25% jitter). After retries exhausted → `429` to client with `Retry-After: 60`.

### 5.11 Concurrency

- **FR-5.11-1** All outbound Bitbucket/Jira calls bounded by `MAX_CONCURRENT_API_CALLS` (env var, default `50`). Implemented via `concurrentMap` utility.
- **FR-5.11-2** Per-developer aggregations parallelised via `concurrentMap` (bounded by `METRICS_CONCURRENCY`, default `3`).

### 5.12 Storage (SQLite in-memory)

- **FR-5.12-1** A single shared SQLite `:memory:` instance is initialised at startup before accepting requests. Startup aborts with a structured error if initialisation fails.
- **FR-5.12-2** Developer metrics cached in SQLite keyed by `(developerId, startDate, endDate)` with `cachedAt` timestamp.
- **FR-5.12-3** Sync run logs stored in SQLite. Last N logs listed by `startedAt DESC`; all logs purgeable.
- **FR-5.12-4** No new `data/cache/metrics-result/*.json` or `data/sync-logs/*.json` files are written after migration. Legacy files cleaned up on first startup after deployment (detected via sentinel file `data/.migrated-to-sqlite`).

---

## 6. Non-functional requirements

| Requirement | Target |
|---|---|
| Response time (live) | < 30 s for a 7-developer 90-day query over 5 repos |
| Response time (cache) | < 500 ms for any team size when all developers are in the sync cache |
| TypeScript strictness | `"strict": true` in both backend and frontend `tsconfig.json` |
| SSL | Self-signed on-prem certificates tolerated via `rejectUnauthorized: false` |
| Auth | Bearer token PAT — no OAuth flow required |
| UI theme | Dark theme (`background: #1a1d27`) with CSS custom properties |
| CI | TypeScript type check + Vitest pass on every PR |
| Traceability | Every `it()` test block must have a `// @req REQ-*` tag; `npm run test:trace` enforces this |

---

## 7. Configuration reference

### Backend `.env`

| Variable | Required | Default | Description |
|---|---|---|---|
| `JIRA_BASE_URL` | Yes | — | Base URL of on-prem Jira Server |
| `JIRA_TOKEN` | Yes | — | Jira Personal Access Token |
| `BITBUCKET_BASE_URL` | Yes | — | Base URL of Bitbucket Server (Stash) |
| `BITBUCKET_TOKEN` | Yes | — | Bitbucket Personal Access Token |
| `API_KEY` | Yes | — | Shared secret for all `/api` routes |
| `ALLOWED_ORIGIN` | No | `http://localhost:5173` | CORS origin |
| `BITBUCKET_PROJECTS` | No | — | `PROJECT/repo` pairs (Tier 1) |
| `BITBUCKET_PROJECT_KEYS` | No | — | Project keys (Tier 2) |
| `JIRA_PAGE_SIZE` | No | `500` | Issues per Jira API page |
| `BOT_USER_PATTERN` | No | `sonarqube\|jenkins\|...` | Regex to exclude bots |
| `STALE_PR_THRESHOLD_DAYS` | No | `3` | Open PRs older than N business days flagged |
| `PORT` | No | `3000` | Backend HTTP port |
| `MAX_CONCURRENT_API_CALLS` | No | `50` | Outbound API call concurrency cap |
| `METRICS_CONCURRENCY` | No | `3` | Parallel developer aggregations |
| `SYNC_DEVELOPER_IDS` | No | — | Comma-separated default user IDs for sync |
| `SYNC_INTERVAL_MINUTES` | No | `0` | Default sync interval (`0` = off) |
| `SPEC_METRICS_ENABLED` | No | `false` | Enable spec-driven metrics |
| `SPEC_APPROVED_STATUS` | No | `Spec Approved` | Jira status for locked spec |
| `SPEC_VERIFICATION_STATUS` | No | `Verification` | Jira status for QA entry |
| `SPEC_DONE_STATUS` | No | `Done` | Jira status for completion |
| `SPEC_BLOCKED_STATUS` | No | `Blocked` | Jira status for clarification wait |
| `AI_INSIGHTS_ENABLED` | No | `false` | Enable LLM-generated insights |
| `AI_PROVIDER` | No | `anthropic` | `anthropic` \| `openai` \| `gemini` |
| `AI_API_KEY` | No | — | API key for the selected LLM provider |

### Frontend `frontend/.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_API_KEY` | Yes | Must match `API_KEY` in backend `.env` |

---

## 8. Known limitations

Remediated items are documented in `specs/003-performance-resilience/` (hybrid Jira linking, changelog cache, PR-based commits, persistent SQLite store).

Remaining limitations:

- Tier-3 auto-discovery relies on `/profile/recent/repos` — very old inactive repos may be missed.
- Post-merge rework detection is keyword-based on commit messages. Inconsistent commit conventions may under-report churn.

---

## 9. Out of scope

- External static analysis tools (SonarQube, ESLint)
- Sprint velocity or velocity trending
- Individual performance ratings or HR integration
- Real-time (sub-minute) metric updates
- Multi-tenant support or user accounts within the tool itself
