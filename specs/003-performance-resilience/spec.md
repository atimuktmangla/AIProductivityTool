# Feature Specification: Performance & Resilience Remediation

**Feature Branch**: `003-performance-resilience`

**Created**: 2026-06-10

**Status**: Draft

**Input**: Remediate four documented known limitations of the AI Productivity Tool:
(1) Bitbucket commit history queries are slow on repositories with long histories because
the upstream API does not support date filtering;
(2) Jira issue linking for work-type and code-quality metrics requires the Jira–Bitbucket
DVCS connector, leaving teams without that integration with incomplete or empty issue data;
(3) the metrics and sync-run cache is lost on every server restart, forcing a full
re-sync before reports load instantly again;
(4) spec-driven metrics (when enabled) fetch issue change history once per linked ticket,
creating unacceptable latency on large teams.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Accurate Jira Metrics Without DVCS Connector (Priority: P1)

As an **engineering manager** running the dashboard against a Jira instance that is not
linked to Bitbucket via the DVCS connector, I need work-type breakdown and code-quality
scores to populate from the developer's assigned tickets and pull-request references,
so my team reports are not blank or misleading.

**Why this priority**: Work-type and code-quality panels are core dashboard value. Teams
without DVCS currently see under-counted or empty Jira data even when developers clearly
work from ticket keys in PR titles.

**Independent Test**: Point the tool at a Jira instance with no DVCS connector configured.
Run a report for developers who have assigned tickets updated in the date window and PR
titles containing ticket keys. Verify work-type counts and code-quality inputs reflect
those issues.

**Acceptance Scenarios**:

1. **Given** DVCS is not configured and a developer has assigned tickets updated in the
   selected date range,
   **When** a metrics report is run,
   **Then** those assigned tickets appear in the work-type breakdown even when no
   development-panel pull requests are linked in Jira.

2. **Given** DVCS is configured and working,
   **When** a metrics report is run,
   **Then** issue discovery behaviour is unchanged from today (no regression for
   connected environments).

3. **Given** DVCS is unavailable but PR titles reference ticket keys (e.g. `PROJ-1234`),
   **When** a metrics report is run,
   **Then** those ticket keys are resolved and merged with assignee-based issues,
   deduplicated by ticket key.

4. **Given** the administrator checks system readiness before a demo,
   **When** the readiness endpoint is queried,
   **Then** the response indicates whether issue linking is operating in full, fallback,
   or degraded mode so the operator knows what to expect.

---

### User Story 2 — Spec Metrics Without Per-Ticket Latency (Priority: P1)

As a **tech lead** with spec-driven metrics enabled for a 15-person team, I need phased
lead-time and spec-adherence panels to load in a reasonable time on repeat queries, so I
can use them in weekly reviews without waiting minutes for change-history fetches.

**Why this priority**: Spec metrics are the most API-intensive optional feature. Without
reuse of previously fetched change history, large teams cannot adopt the feature.

**Independent Test**: Enable spec metrics. Run a full report for 10 developers with 20+
linked tickets each. Run the same report again within one hour. The second run must
complete noticeably faster and must not re-fetch change history for tickets already
retrieved in the first run.

**Acceptance Scenarios**:

1. **Given** spec metrics are enabled and a ticket's change history was fetched within
   the freshness window,
   **When** a second report including that ticket is run,
   **Then** spec metrics for that ticket are computed from stored history without a
   new upstream fetch.

2. **Given** a background sync job completes for configured users with spec metrics
   enabled,
   **When** a dashboard query follows for the same users and date range,
   **Then** spec metric panels populate without per-ticket live fetches for tickets
   already warmed during sync.

3. **Given** change history for a ticket cannot be retrieved,
   **When** spec metrics are computed,
   **Then** that ticket is excluded silently and remaining tickets still produce a
   valid developer-level summary (existing non-blocking behaviour preserved).

4. **Given** a ticket's status changed after its history was cached,
   **When** the cache entry is older than the freshness window,
   **Then** the ticket's history is refreshed on the next report or sync run.

---

### User Story 3 — Commit Throughput on Large Repositories (Priority: P2)

As a **developer** whose team maintains a monolith repository with years of commit
history, I need commit-throughput numbers in my productivity report without the tool
scanning the entire history on every query, so ad-hoc reports finish within the same
time budget as teams on smaller repos.

**Why this priority**: Long repo histories cause slow or timing-out reports. The product
already derives most throughput from merged pull requests; this story formalises that
fast path and ensures any remaining commit scan is cache-friendly.

**Independent Test**: Run a 90-day report for a developer with merged PRs in a large
repository. Measure end-to-end report time. Repeat the same query within 15 minutes.
The second run must complete in under half the time of the first.

**Acceptance Scenarios**:

1. **Given** a developer has merged pull requests in the selected date window,
   **When** commit throughput is calculated,
   **Then** the count reflects commits on those merged PRs without scanning the full
   repository commit log.

2. **Given** a prior report for the same developer, repository, and calendar month
   already retrieved commit data,
   **When** a subsequent report covers the same month,
   **Then** closed calendar months are served from stored results without re-paging
   the upstream commit history.

3. **Given** a date range spanning multiple calendar months where some months are in
   the past and one is the current month,
   **When** commit data is needed,
   **Then** past months use immutable stored results and the current month refreshes
   only when its short-lived freshness window expires.

---

### User Story 4 — Instant Reports After Server Restart (Priority: P2)

As a **sync job administrator** who runs nightly syncs for 40 developers, I need cached
report data to remain available after a server restart or deployment, so the team does
not wait 20+ minutes for a full re-sync every morning.

**Why this priority**: Restart-induced cache loss negates the primary benefit of the
background sync feature for operations teams that restart services during maintenance
windows.

**Independent Test**: Complete a sync for 10 developers. Restart the server process.
Query the dashboard for the same users and date range before any new sync runs. Cached
results must return in under one second.

**Acceptance Scenarios**:

1. **Given** a sync completed successfully and cache entries are within the freshness
   window,
   **When** the server process is restarted,
   **Then** a subsequent dashboard query for those developers returns cached results
   without upstream API calls.

2. **Given** the server restarts with no prior cache on first deployment,
   **When** a dashboard query is made,
   **Then** the system computes metrics live (existing behaviour) and does not error.

3. **Given** cache entries exist but are older than the freshness window,
   **When** a dashboard query is made after restart,
   **Then** stale entries are treated as cache misses and metrics are recomputed live
   (existing TTL semantics preserved).

4. **Given** the on-disk store file is corrupt or unreadable,
   **When** the server starts,
   **Then** startup fails with a clear diagnostic message rather than serving silent
   wrong data.

---

### Edge Cases

- What happens when hybrid Jira linking finds zero assignee issues and zero PR-title
  keys? Work-type and code-quality panels show empty state with zero counts; no error
  is thrown.
- What happens when DVCS JQL fails with an upstream error (not empty result)? The
  system falls back to assignee-only and PR-title linking and logs a single warning;
  the report completes.
- What happens when the same ticket is discovered via both assignee search and PR-title
  extraction? It appears once in aggregates (deduplicated by ticket key).
- What happens when spec metrics are disabled? No change-history storage or fetch occurs;
  existing behaviour unchanged.
- What happens when two sync batches write cache entries concurrently after restart?
  Writes remain consistent; no partial or corrupted developer records are served.
- What happens when disk space for the persistent store is exhausted? Startup or write
  fails with a structured error; the administrator is directed to free space or change
  the store location via configuration.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Jira issue linking (User Story 1)

- **FR-001**: The system MUST support a configurable issue-linking mode with at least
  three values: connector-dependent (current behaviour), assignee-only, and hybrid
  automatic fallback.
- **FR-002**: In hybrid mode, when connector-dependent discovery returns zero issues or
  fails with an upstream error, the system MUST automatically retry with assignee-only
  discovery for the same developers and date window.
- **FR-003**: Issue discovery MUST always merge PR-title-extracted ticket keys with
  assignee-based results, deduplicating by ticket key.
- **FR-004**: Work-type and code-quality metric shapes MUST be identical regardless of
  linking mode; no field may be omitted silently when switching modes.
- **FR-005**: The readiness check MUST report the active linking mode and whether
  connector-dependent discovery is available.

#### Spec metrics change-history cache (User Story 2)

- **FR-006**: When spec-driven metrics are enabled, change history for a ticket MUST be
  stored after the first successful fetch and reused within the same freshness window
  used for developer metrics cache (one hour).
- **FR-007**: The background sync job MUST pre-warm change history for all tickets
  linked to synced developers when spec-driven metrics are enabled.
- **FR-008**: Tickets whose change history cannot be fetched MUST be excluded from
  spec aggregates without failing the overall report (preserve existing behaviour).
- **FR-009**: Stored change history for tickets in closed calendar months MUST be
  treated as immutable (write-once); current-month entries MUST refresh when the
  short-lived freshness window expires.

#### Commit throughput performance (User Story 3)

- **FR-010**: Commit throughput for dashboard reports MUST be derived from commits on
  merged pull requests authored in the date window, not from a full repository commit
  log scan.
- **FR-011**: Any remaining repository-level commit fetch (e.g. for auxiliary scripts
  or future features) MUST partition results by calendar month and store closed months
  as immutable cached results.
- **FR-012**: The dashboard MUST NOT require more than one upstream commit-history
  page fetch per developer-repository pair per closed calendar month on cache hit.

#### Persistent metrics cache (User Story 4)

- **FR-013**: Developer metrics cache entries and sync run logs MUST survive server
  process restart when younger than the configured freshness window.
- **FR-014**: Persistent cache storage MUST use a single consolidated store location
  configurable by the administrator; default location MUST live under the existing
  git-ignored data directory.
- **FR-015**: Per-developer JSON metrics files (`data/cache/metrics-result/*.json`)
  MUST NOT be reintroduced; persistence MUST use the same consolidated store already
  used for in-process caching.
- **FR-016**: Startup MUST fail fast with a structured diagnostic if the persistent
  store cannot be opened or initialised; degraded operation with silent data loss is
  not permitted.
- **FR-017**: Cache TTL semantics (one-hour freshness, partial hit merging, sync
  cache-skip behaviour from feature 002) MUST remain unchanged after persistence is
  added.

#### Cross-cutting

- **FR-018**: All four remediations MUST be independently deployable; shipping Jira
  linking fallback MUST NOT require persistent cache to be enabled first.
- **FR-019**: Known-limitations section of the project baseline spec MUST be updated
  to remove or revise each limitation addressed by this feature once implemented.

### Key Entities

- **IssueLinkingMode**: Configuration value (`connector`, `assignee`, `hybrid`) governing
  how tickets are discovered for a developer in a date window.
- **IssueLinkingStatus**: Readiness snapshot — active mode, connector availability,
  fallback engaged indicator.
- **ChangeHistoryCacheEntry**: Stored ticket change history with ticket key, fetch
  timestamp, calendar month partition, and payload sufficient to compute spec metrics.
- **CommitMonthCacheEntry**: Stored commit list for a developer-repository-month
  partition with immutability flag for closed months.
- **PersistentMetricsStore**: Durable backing for developer metrics cache rows and
  sync run logs, replacing process-scoped-only storage.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Teams without a Jira–Bitbucket connector see non-zero work-type counts
  for at least 90% of developers who have assigned tickets updated in the selected
  window (measured over a pilot cohort of 10 developers).
- **SC-002**: A repeat spec-metrics report for the same 10-developer team within one
  hour completes at least 50% faster than the first run (median wall-clock time).
- **SC-003**: A 90-day report for a developer with activity in a large repository
  completes within 30 seconds on cache warm (same budget as baseline spec NFR).
- **SC-004**: After server restart, a dashboard query for 20 fully cached developers
  returns in under 500 ms without upstream API calls.
- **SC-005**: Zero regression: all existing automated tests pass; traceability checker
  reports zero untagged requirements after new REQ tags are added.
- **SC-006**: Administrators can determine linking mode and connector status from the
  readiness check without reading server logs.

---

## Assumptions

- Default issue-linking mode for new installations is **hybrid** (connector first,
  assignee fallback). Existing deployments that rely on connector-only behaviour can
  set mode to `connector` explicitly.
- Commit throughput is officially defined as the sum of commits on merged PRs in the
  date window. Standalone commits not associated with a merged PR are out of scope for
  v1 of this feature.
- Persistent cache requires a **constitution amendment** to Principle VI (In-Memory
  SQLite Storage Law) before implementation of User Story 4. The amendment will allow
  one file-backed consolidated store while retaining the prohibition on per-developer
  JSON metrics files and the single-connection rule.
- Change-history cache and commit-month cache follow the same calendar-month
  partitioning and retention policy as existing upstream API response caches (six-month
  rolling window unless configured otherwise).
- The one-hour metrics freshness window (`METRICS_CACHE_TTL_MS`) is the single
  authoritative threshold shared by developer metrics cache, sync cache-skip, change-
  history reuse, and post-restart staleness checks.
- Spec metrics remain opt-in (`SPEC_METRICS_ENABLED` defaults to false); this feature
  does not change that default (Principle IV preserved).
- User Story 4 (persistent store) may ship in a separate release after User Stories
  1–3 if the constitution amendment requires its own review cycle.

---

## Out of Scope

- Replacing or configuring the Jira DVCS connector itself (infrastructure task).
- Real-time sub-minute cache invalidation or webhook-driven refresh.
- Multi-tenant or per-user cache isolation within a single deployment.
- Linux warm-up shell script (endpoint-only; script can follow in a later spec).
- Changing working-hours or leave-adjustment formulas (Principle III untouched).
