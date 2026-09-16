# Demo walkthrough

Five real workflows this tool supports, in the order you'd exercise them after a
first run. Every step maps to behavior that exists in the code and is covered by
the test suite (see `docs/FUNCTIONAL_SPEC.md` for the `REQ-*` requirements and
`npm test` for the spec-to-test traceability gate).

Prerequisites: backend on `:3000` and frontend on `:5173` (see the README
"Getting started" section), a valid `.env` with Jira/Bitbucket PATs and an
`API_KEY`.

---

## 1. Pull a team's metrics for a date range

The core flow. Pick one or more developers and a start/end date; the dashboard
requests `POST /api/dashboard/metrics` and renders the aggregated result.

- Endpoint contract: a missing/malformed body returns `400`; a valid body
  (`developerIds` 1–50 entries, ISO `startDate`/`endDate`) returns `200`.
- What you see: Throughput Overview KPI cards (commits, lines +/-, avg cycle
  time), Workflow Cycle Track, Code Quality Score, Jira Category Allocation, and
  the Team Contributors table.

## 2. Read the Code Quality Score

The Code Quality panel shows a team-average gauge plus the four equally-weighted
sub-scores that compose it: Critical/Security resolution, Approval rate, PR
focus, and Low rework. The numeric score maps to a rating band — Good (≥75),
Fair (50–74), Needs work (<50). With more than one developer selected, a
per-developer bar chart appears; with a single developer it does not.

## 3. Inspect and export contributors

The Team Contributors table renders one row per developer, is sortable by any
column header, and flags an oversized average PR (>400 lines) with a ⚑ icon as a
review-focus signal. Click a developer to drill through. Use **Export CSV** to
download the currently displayed rows as `team-metrics.csv`.

## 4. Warm the cache with a sync job

Open the Sync Jobs tab. Choose a user-selection mode — All users, By project, or
Select manually — optionally schedule it, and run it. The job pre-computes and
caches metrics so later dashboard loads are served from cache (a green banner
indicates a cache hit). If a run is already in progress, the run button is
disabled and `POST /sync/trigger` returns `409 Conflict`.

## 5. Observe graceful failure

The tool degrades honestly when upstreams misbehave:

- Jira/Bitbucket `401/403` → `502` with a credential hint.
- Upstream `5xx` or unreachable → `502`.
- Upstream `429` → retried up to 3× with backoff, then surfaced as `429` with a
  `Retry-After` header.
- Any other error → `500`.

A `GET /health` liveness endpoint (no auth) returns `{ "status": "ok" }`.
