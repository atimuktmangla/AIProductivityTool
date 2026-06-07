# AI Productivity Tool

Internal engineering dashboard that pulls live data from on-premises **Jira Server** and **Bitbucket Server (Stash)** to surface developer productivity metrics across the SDLC.

---

## Features

- Commit throughput, PR cycle time, pickup delay, and review lifecycle — all in working hours with leave adjustment
- Work-type breakdown (Features / Bugs / Infra & Tech Debt) sourced directly from Jira
- Composite code quality score (0–100) from critical/security resolution, approval rate, PR focus, and rework stability
- Contributor comparison table with sortable columns and click-through PR detail drawer
- Three-tier repo discovery: pin exact repos, scope to projects, or let the tool auto-discover from user profiles
- Period-over-period delta comparison with delta arrows per metric
- AI-generated team insights summary
- **Background sync job** — schedule daily/weekly automatic data sync for your team; reports load from per-developer JSON cache in sub-seconds
- **Sync Jobs admin UI** — configure users, schedule, and trigger syncs; monitor per-run and per-batch logs
- **Spec-driven metrics** (opt-in) — phased lead times, spec regression detection, clarification delay, and first-pass yield derived from the Jira changelog

---

## What it measures

| Metric               | Description                                                                   |
| -------------------- | ----------------------------------------------------------------------------- |
| **Total Commits**    | All commits authored in the selected window per developer                     |
| **Lines Changed**    | Lines added and deleted, with inline balance bar                              |
| **Cycle Time**       | Working hours from PR creation to merge (Mon–Fri 09:00–17:00, leave-adjusted) |
| **Pickup Delay**     | Working hours from PR creation until the first human reviewer action          |
| **Review Lifecycle** | Working hours from first review comment to merge                              |
| **Review Depth**     | Count of human review actions (comments, approvals) per PR — bots excluded    |
| **Work Type**        | Jira issue breakdown — Features / Bugs / Infra & Tech Debt                    |

> **Leave adjustment:** All time metrics are discounted by 12.6% to account for 2.75 leave/holiday days per resource per month (33 days ÷ 261 workdays/year).

### Spec-driven metrics (when `SPEC_METRICS_ENABLED=true`)

| Metric                      | Description                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| **Spec Definition Time**    | Working hours from ticket created to spec-approved status transition                           |
| **Implementation Time**     | Working hours from spec approved to PR merged (pure coding + review)                           |
| **Verification Time**       | Working hours from verification entry to ticket done                                           |
| **Clarification Delay**     | Cumulative working hours the ticket spent in a Blocked/Awaiting-Clarification status           |
| **Spec Regressions**        | Count of times a ticket moved back from Verification to In Progress (spec was missed)          |
| **Post-merge Rework**       | Commit messages after merge containing spec-churn keywords (`fix spec`, `per feedback`, etc.)  |
| **First-pass Yield (FPY)**  | `true` when zero regressions and zero post-merge rework — the implementation matched the spec  |
| **Spec Adherence Score**    | 0–100 composite: exponential penalty per regression + linear penalty per rework commit         |

---

## Architecture

```
AIProductivityTool/
├── server.ts               # Entry point — Express app, startup checks
├── types/                  # Shared TypeScript interfaces (all layers)
├── WEB/                    # HTTP layer — Express routes & middleware
│   ├── routes/
│   │   ├── metricsRouter.ts  # users, projects, repos, metrics, insights
│   │   └── syncRouter.ts     # sync status, trigger, config, logs
│   ├── middleware/           # apiKeyAuth, errorHandler
│   └── guardrails/           # rateLimiter, sanitiser
├── BL/                     # Business logic — metric computation & config
│   ├── config/env.ts       # Env validation & typed AppConfig
│   ├── metrics/            # cycleTime, reviewDepth, workType, codeQuality, specMetrics, aggregator
│   └── evals/              # metricsValidator — sanity checks on output
├── DB/                     # Data access — Atlassian API clients & caching
│   ├── client/             # Axios instance factory (SSL bypass for on-prem)
│   ├── cache/
│   │   ├── metricsCache.ts   # per-developer JSON file cache (one file per devId+dateRange)
│   │   └── jsonFileCache.ts  # atomic read/write helpers (tmp file + rename)
│   └── services/           # jiraService, bitbucketService
├── AI/                     # AI features
│   └── skills/             # insightsSummary — team insights narrative
├── jobs/
│   └── metricsSync.ts      # Background sync job — reads data/sync-config.json, writes run logs
├── data/                   # Runtime data (git-ignored)
│   ├── sync-config.json    # Persisted sync schedule (written by POST /sync/config)
│   ├── sync-logs/          # One JSON file per sync run
│   └── cache/metrics-result/  # Per-developer cache files
└── UI/                     # React + TypeScript + Vite + Recharts
    └── src/
        ├── components/     # Dashboard, SyncPage, FilterPanel, charts, table
        ├── hooks/          # useDashboard, useSync — typed useReducer state
        └── types/          # Shared API types
```

---

## Two ways to get data

### Normal run (ad-hoc)

Select users, date range, and repos in the **Developer Metrics** tab and click **Run report**. The backend queries Bitbucket and Jira live and returns results in ~5–30 seconds depending on team size and history depth.

Use this when:

- You need a one-off query
- You're exploring a new date range
- You're comparing periods

### Job run (background sync)

Configure a schedule in the **Sync Jobs** tab and click **Save & Run**. The backend syncs data for the configured users in parallel batches of 10, then writes one cache file per developer to `data/cache/metrics-result/`. Subsequent dashboard queries for cached developers load instantly without hitting Bitbucket or Jira.

Use this when:

- Your team runs daily or weekly reports on the same set of users
- You want reports to load in under a second
- You want automated scheduled refreshes (daily or weekly)

**Cache behaviour:**

- Cache TTL: 1 hour. After that, the router falls through to live computation.
- Partial cache hits: if some developers are cached and some are not, the router merges cached results with live results for the uncached developers.
- The dashboard shows a green cache banner when results came from the sync cache, with the sync timestamp and a link to the Sync Jobs tab.

---

## Quick start

### Prerequisites

- Node.js 18+
- Personal Access Tokens for your on-prem Jira Server and Bitbucket Server

### 1. Configure

```bash
cp .env.example .env
cp UI/.env.example UI/.env
```

Edit `.env` and `UI/.env` — see [Configuration](#configuration) below.

### 2. Start (one command)

On Windows, double-click **`start-dev.cmd`** or run:

```bat
start-dev.cmd
```

This kills any stale processes on ports 3000 / 5173, starts both servers in separate windows, and opens the browser automatically.

**Manual start** (if preferred):

```bash
# Backend (port 3000)
npm install
npm run dev

# Frontend (port 5173) — in a second terminal
cd UI
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `:3000` automatically.

### 3. Build for production

```bash
# Backend
npm run build        # outputs to dist/

# Frontend
cd UI && npm run build   # outputs to UI/dist/
```

---

## Docker

```bash
docker compose up --build
```

| Service | Port | Description                 |
| ------- | ---- | --------------------------- |
| `api`   | 3000 | Express backend             |
| `ui`    | 5173 | Nginx-served React frontend |

The `api` service uses the `.env` file in the repo root. The `ui` service talks to `api` via the internal Docker network.

---

## Configuration

### Backend `.env`

| Variable                  | Required | Default                   | Description                                                              |
| ------------------------- | -------- | ------------------------- | ------------------------------------------------------------------------ |
| `JIRA_BASE_URL`           | Yes      | —                         | Base URL of your Jira Server instance                                    |
| `JIRA_TOKEN`              | Yes      | —                         | Jira Personal Access Token                                               |
| `BITBUCKET_BASE_URL`      | Yes      | —                         | Base URL of your Bitbucket Server (Stash)                                |
| `BITBUCKET_TOKEN`         | Yes      | —                         | Bitbucket Personal Access Token                                          |
| `API_KEY`                 | Yes      | —                         | Shared secret — all `/api` requests must send this in `X-Api-Key` header |
| `ALLOWED_ORIGIN`          | No       | `http://localhost:5173`   | CORS origin for the UI                                                   |
| `BITBUCKET_PROJECT_KEYS`  | No       | —                         | Comma-separated project keys for Tier 2 discovery (e.g. `DOSC,PLATFORM`) |
| `BITBUCKET_PROJECTS`      | No       | —                         | Comma-separated `PROJECT/repo-slug` pairs to pin exact repos (Tier 1)    |
| `JIRA_PAGE_SIZE`          | No       | `500`                     | Issues per Jira API page                                                 |
| `BOT_USER_PATTERN`        | No       | `sonarqube\|jenkins\|...` | Regex to exclude bot accounts from review metrics                        |
| `STALE_PR_THRESHOLD_DAYS` | No       | `3`                       | Open PRs older than this many business days are flagged                  |
| `PORT`                    | No       | `3000`                    | Backend HTTP port                                                        |
| `SYNC_DEVELOPER_IDS`        | No       | —                         | Comma-separated default user IDs for the background sync job             |
| `SYNC_INTERVAL_MINUTES`     | No       | `0`                       | Default sync interval: `1440` = daily, `10080` = weekly, `0` = off       |
| `SPEC_METRICS_ENABLED`      | No       | `false`                   | Enable spec-driven metrics (phased lead time, regressions, FPY)          |
| `SPEC_APPROVED_STATUS`      | No       | `Spec Approved`           | Jira status name marking a spec as locked (case-insensitive)             |
| `SPEC_VERIFICATION_STATUS`  | No       | `Verification`            | Jira status name marking QA / verification entry (case-insensitive)      |
| `SPEC_DONE_STATUS`          | No       | `Done`                    | Jira status name marking ticket completion (case-insensitive)            |
| `SPEC_BLOCKED_STATUS`       | No       | `Blocked`                 | Jira status name meaning blocked / awaiting clarification (case-insensitive) |

> `SYNC_DEVELOPER_IDS` and `SYNC_INTERVAL_MINUTES` are the env-var fallbacks. Once you save a schedule via the Sync Jobs UI, `data/sync-config.json` takes precedence and the env vars are ignored.

> Spec status names must match your Jira workflow exactly. The comparison is case-insensitive. If the status is never reached in a ticket's lifecycle, the corresponding time phase is recorded as 0.

**PAT setup:** Jira — **Profile → Personal Access Tokens**. Bitbucket — **Account → Personal Access Tokens**.

### Frontend `UI/.env`

| Variable       | Required | Description                                |
| -------------- | -------- | ------------------------------------------ |
| `VITE_API_KEY` | Yes      | Must match `API_KEY` in the backend `.env` |

### Repository targeting

The tool uses a three-tier resolution strategy to decide which repos to scan:

| Priority                    | Trigger                                                    | Behaviour                                                                          |
| --------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Tier 1 — Exact**          | UI sends repo chips, or `BITBUCKET_PROJECTS` is set        | Uses listed `PROJECT/repo` pairs directly — no discovery                           |
| **Tier 2 — Project-scoped** | UI sends project pills, or `BITBUCKET_PROJECT_KEYS` is set | Lists all repos in those projects, filters to repos where the developer was active |
| **Tier 3 — Auto-discover**  | Nothing provided                                           | Fetches each developer's recently-active repos via `/profile/recent/repos`         |

See [docs/api-usecases.md](docs/api-usecases.md) and [docs/repo-resolution-flowcharts.md](docs/repo-resolution-flowcharts.md) for details.

---

## API endpoints

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-05-29T10:00:00.000Z" }
```

### `GET /ready`

Pings both Jira and Bitbucket. Returns `503` if either is unreachable.

```json
{ "status": "ready" }
```

### `GET /api/dashboard/users`

Returns all users from the Bitbucket Server global directory. Cached for 5 minutes.

```json
[
  {
    "name": "jsmith",
    "displayName": "Jane Smith",
    "emailAddress": "jsmith@company.com"
  }
]
```

### `GET /api/dashboard/projects`

Returns all available Bitbucket project keys.

```json
["DOSC", "PLATFORM", "MOBILE"]
```

### `GET /api/dashboard/repos?projectKeys=DOSC,PLATFORM`

Returns repos for the requested project keys.

```json
[
  { "projectKey": "DOSC", "repoSlug": "react-Test" },
  { "projectKey": "PLATFORM", "repoSlug": "infra-core" }
]
```

### `POST /api/dashboard/metrics`

Returns aggregated developer metrics. All requests require `X-Api-Key` header.

**Request body:**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "projectKeys": ["DOSC"],
  "compareStartDate": "2025-10-01",
  "compareEndDate": "2025-12-31"
}
```

`repoTargets`, `projectKeys`, `compareStartDate`, `compareEndDate` are all optional.

**Response:** `{ current: AggregatedDeveloperMetric[], previous?: AggregatedDeveloperMetric[] }`

When `SPEC_METRICS_ENABLED=true`, each `AggregatedDeveloperMetric` includes a `specMetrics` field:

```json
"specMetrics": {
  "specDefinitionTimeHrs": 3.2,
  "implementationTimeHrs": 12.4,
  "verificationTimeHrs": 4.1,
  "clarificationDelayHrs": 1.5,
  "specRegressions": 1,
  "postMergeReworkCommits": 0,
  "firstPassYield": false,
  "specAdherenceScore": 50
}
```

### `POST /api/dashboard/insights`

Same payload as `/metrics`. Returns metrics plus an AI-generated team insights narrative.

```json
{
  "metrics": { "current": [...] },
  "insights": { "summary": "...", "highlights": [...], "risks": [...] }
}
```

### `GET /api/dashboard/sync/status`

Returns the current sync job state.

```json
{
  "running": false,
  "lastRunAt": 1748923643000,
  "nextRunAt": 1749010043000,
  "configuredUsers": ["jsmith", "bjones"],
  "intervalMinutes": 1440
}
```

### `POST /api/dashboard/sync/trigger`

Triggers an immediate non-blocking sync for the given users. Returns `202 Accepted`.

```json
{ "developerIds": ["jsmith", "bjones"] }
```

### `GET /api/dashboard/sync/config`

Returns the persisted sync configuration from `data/sync-config.json`, or env-var fallback.

```json
{ "developerIds": ["jsmith"], "intervalMinutes": 1440 }
```

### `POST /api/dashboard/sync/config`

Saves a new sync configuration and reschedules the interval immediately.

```json
{ "developerIds": ["jsmith", "bjones"], "intervalMinutes": 10080 }
```

Valid `intervalMinutes` values: `0` (no schedule), `1440` (daily), `10080` (weekly).

### `GET /api/dashboard/sync/logs`

Returns the last 50 sync run logs, newest first.

```json
[{
  "runId": "2026-06-03-10-47-23",
  "startedAt": 1748923643000,
  "finishedAt": 1748923761000,
  "durationMs": 118000,
  "totalUsers": 27,
  "batches": [{ "batchIndex": 0, "userIds": [...], "status": "ok", "durationMs": 39000 }]
}]
```

### `DELETE /api/dashboard/sync/logs`

Purges all sync run log files. Returns `204 No Content`.

---

## Performance benchmarks

| Stage            | On track | Needs attention | At risk  |
| ---------------- | -------- | --------------- | -------- |
| Pickup Delay     | ≤ 4 hrs  | ≤ 8 hrs         | > 8 hrs  |
| Review Lifecycle | ≤ 8 hrs  | ≤ 16 hrs        | > 16 hrs |
| Total Cycle Time | ≤ 24 hrs | ≤ 40 hrs        | > 40 hrs |

---

## Development

### Testing

```bash
npm test                  # run all tests once
npm run test:watch        # watch mode
npm run test:coverage     # coverage report
```

### Type checking

```bash
npx tsc --noEmit          # backend
cd UI && npx tsc --noEmit # frontend
```

Both must pass with zero errors before opening a PR.

---

## Docs

| Document                                                                 | Description                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| [docs/FUNCTIONAL_SPEC.md](docs/FUNCTIONAL_SPEC.md)                       | Product requirements, data flow, known limitations             |
| [docs/DETAILED_DESIGN.md](docs/DETAILED_DESIGN.md)                       | Component design, algorithm details, extension guide           |
| [docs/SEQUENCE_DIAGRAM.md](docs/SEQUENCE_DIAGRAM.md)                     | Mermaid sequence diagrams for all major flows                  |
| [docs/api-usecases.md](docs/api-usecases.md)                             | Concrete API request examples for all repo-targeting scenarios |
| [docs/repo-resolution-flowcharts.md](docs/repo-resolution-flowcharts.md) | Decision flowcharts for the repo resolution tiers              |
| [docs/JQL_EXAMPLES.md](docs/JQL_EXAMPLES.md)                             | JQL query library for Jira                                     |
| [DASHBOARD_DOCUMENTATION.md](DASHBOARD_DOCUMENTATION.md)                 | Full widget-by-widget user guide for engineering managers      |

---

## Contributing

1. Branch from `main`
2. Run `npx tsc --noEmit` in both root and `UI/` — zero errors required
3. Run `npm run build` (root) and `cd UI && npm run build` — both must pass
4. Open a PR targeting `main`
"# AIProductivityTool" 
