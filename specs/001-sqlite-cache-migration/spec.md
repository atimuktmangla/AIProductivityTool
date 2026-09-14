# Feature Specification: In-Memory SQLite Cache Migration

**Feature Branch**: `001-sqlite-cache-migration`

**Created**: 2026-06-07

**Status**: Draft

**Input**: Migrate the local cache storage layer from file-based JSON logging to an
in-memory SQLite database. Goal: eliminate file I/O latency bottlenecks during the
nightly sync job and handle rapid concurrent metric updates. The system must provision
an in-memory SQLite instance on startup, bootstrap the tables, and maintain identical
data contract integrity for the dashboard view.

**Constitution reference**: Principle VI (In-Memory SQLite Storage Law) mandates this
migration. Per-developer metrics cache and sync run logs are classified as transient
analytics and MUST NOT be written to the local file system.

---

## Clarifications

### Session 2026-06-07

- Q: What happens to existing JSON cache files on first startup after migration? → A: Delete both `data/cache/metrics-result/` and `data/sync-logs/` directories on first startup; log a one-time migration notice; non-blocking (warn on failure, never abort startup).
- Q: How does the system detect "first startup" to gate the one-time cleanup? → A: Sentinel file `data/.migrated-to-sqlite`; written after cleanup completes; absence triggers cleanup, presence skips it.
- Q: Should the sync job fire automatically on restart to warm the in-memory cache? → A: Preserve existing behaviour — 5 s startup warm-up when schedule is configured; explicitly document as a preserved requirement so it cannot be dropped during refactor.
- Q: What happens if the in-memory store fails to initialise on startup (e.g., rollback, ABI mismatch)? → A: Fail fast — abort startup with a structured diagnostic error; degraded silent operation is not permitted.
- Q: What is the rollback operational constraint for the sentinel file? → A: Document in deployment runbook — operator must delete `data/.migrated-to-sqlite` after rolling back to the JSON-based version, before re-deploying the new version.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sync Job Completes Without File I/O Errors (Priority: P1)

As a **sync job administrator**, I run a nightly sync for 50+ developers and need
the job to complete reliably without disk-contention errors (ENOENT, EBUSY, or
partial-write corruption) that currently occur when multiple batches write developer
cache files concurrently.

**Why this priority**: File-write contention is the primary reliability blocker for
large teams. Fixing it unlocks the core value of the background sync feature.

**Independent Test**: Trigger a sync for 50 developers with batch processing enabled.
The job must complete all batches, report accurate per-batch status, and make the
results available to the dashboard — without any file I/O errors in the logs.

**Acceptance Scenarios**:

1. **Given** a sync is triggered for 50 developers in 5 batches of 10,
   **When** all batches complete,
   **Then** metrics for all 50 developers are available for immediate dashboard reads,
   the run log records all 5 batch entries with correct status, and no file I/O error
   appears in the server log.

2. **Given** a sync run is in progress,
   **When** a dashboard query arrives for a developer whose batch has already completed,
   **Then** the dashboard returns that developer's cached metrics without waiting for
   the remaining batches to finish (partial cache hit behaviour preserved).

3. **Given** the server is restarted after a completed sync,
   **When** a dashboard query is made before the automatic startup warm-up sync
   completes (within the first ~5 seconds),
   **Then** the cache is empty (metrics are recomputed live) and no stale or corrupted
   data is served. Once the warm-up sync finishes, subsequent queries are served
   from cache. The admin UI shows no run history until the warm-up run completes.

---

### User Story 2 - Dashboard Loads from Cache in Under 500 ms (Priority: P1)

As a **dashboard user**, I want the contributor table and KPI cards to appear
instantly when my team's data has already been synced, regardless of team size.

**Why this priority**: Cache hit performance is the primary user-visible benefit of
the sync feature. If reads are slow the cache provides no value.

**Independent Test**: After a sync completes for 20 developers, submit a dashboard
query for all 20. Measure total response time from request to first byte of JSON.

**Acceptance Scenarios**:

1. **Given** all 20 developers are in the cache for the requested date range,
   **When** a dashboard query is submitted,
   **Then** the response arrives in under 500 ms and `cacheStatus` is `"full"`.

2. **Given** 15 of 20 developers are cached and 5 are not,
   **When** a dashboard query is submitted,
   **Then** the 15 cached developers' data is returned immediately as a partial hit,
   the 5 misses are computed live and merged, and `cacheStatus` is `"partial"`.

---

### User Story 3 - Sync Run History Visible in Admin UI (Priority: P2)

As a **sync job administrator**, I need to see the last 50 run logs in the Sync Jobs
admin panel — with per-batch detail rows, success/error indicators, and accurate
timestamps — after the migration.

**Why this priority**: Run history is a secondary operational concern; the sync job
must work first (P1). But history visibility is the primary debugging tool when a
sync partially fails.

**Independent Test**: Trigger three sync runs in sequence. Open the Sync Jobs tab
and verify that all three appear in the Run History table with correct batch counts,
durations, and status colours.

**Acceptance Scenarios**:

1. **Given** three sync runs have completed,
   **When** the Run History table loads,
   **Then** all three runs appear (newest first), each showing correct `startedAt`,
   `durationMs`, `totalUsers`, and expandable batch rows with `status` and optional
   `error` fields.

2. **Given** the administrator clicks "Purge run logs before starting",
   **When** a new sync is triggered,
   **Then** all previous run history is cleared before the new run begins, and after
   the run the history shows exactly one entry.

3. **Given** the server is restarted,
   **When** the admin opens the Run History table,
   **Then** the table is empty (run history is transient and does not persist across
   restarts — this is the documented behaviour per Principle VI).

---

### User Story 4 - Cache Freshness Banner Remains Accurate (Priority: P2)

As a **dashboard user**, I need the green "Served from sync cache · synced {date}"
banner to reflect the actual cache age accurately after the storage backend changes.

**Why this priority**: The banner drives trust in the data. If it shows a wrong date
the manager may act on stale data without knowing.

**Independent Test**: Run a sync, wait 2 minutes, then load the dashboard. Verify the
banner shows the correct `synced` timestamp matching the sync completion time.

**Acceptance Scenarios**:

1. **Given** a sync completed at 02:00,
   **When** the dashboard is loaded at 02:05,
   **Then** the banner reads "Served from sync cache · synced [02:00 timestamp]".

2. **Given** no sync has run since server startup,
   **When** the dashboard is loaded,
   **Then** no cache banner appears and metrics are computed live.

---

### Edge Cases

- What happens to existing JSON files after deployment? On first startup (detected
  by absence of `data/.migrated-to-sqlite`) the system deletes both legacy
  directories, writes the sentinel file, and continues even if deletion fails.
  Subsequent restarts skip cleanup entirely.
- What happens when the server process crashes mid-sync? All partial cache entries from
  that run are lost on restart; the next dashboard query computes metrics live. No
  corrupted partial data is served.
- What happens if two sync triggers arrive simultaneously? The second trigger receives
  HTTP 409 Conflict (REQ-4.8.7-1); only one run proceeds. The in-memory store is never
  written concurrently by two sync runs.
- What happens when a developer's metrics fail to compute during sync? That developer
  is recorded in `failedUsers`; no cache entry is written for them. Subsequent dashboard
  queries compute their metrics live.
- What is the maximum cache TTL? The existing `maxAgeMs` parameter (passed by the
  router) continues to govern staleness; entries older than `maxAgeMs` are treated as
  misses exactly as before.
- What happens if the in-memory store fails to initialise (e.g., after a rollback or
  Node ABI mismatch)? The server aborts startup with a structured diagnostic error
  message. Degraded silent operation is not permitted.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On server startup, the system MUST initialise a single in-memory
  storage instance and create all required tables before accepting any API requests.
  If initialisation fails for any reason, the server MUST abort startup immediately
  with a structured error message that names the likely cause (e.g., missing native
  binary, Node ABI mismatch). Degraded operation without a functional store is not
  permitted.
- **FR-002**: The system MUST store computed developer metrics (keyed by developer ID,
  start date, and end date) with a `cachedAt` timestamp in the in-memory store.
- **FR-003**: The system MUST retrieve cached metrics for a list of developer IDs,
  returning hits (entries within `maxAgeMs`) and misses (absent or stale entries)
  with the oldest `cachedAt` timestamp across all hits — identical contract to the
  current `getCachedMetrics` function.
- **FR-004**: The system MUST store sync run logs (run ID, start/finish timestamps,
  duration, total users, and per-batch detail) in the in-memory store immediately
  after each sync run completes.
- **FR-005**: The system MUST support listing the last N run logs ordered by start
  time descending — identical contract to the current `listRunLogs` function.
- **FR-006**: The system MUST support purging all run log entries from the in-memory
  store — identical contract to the current `purgeRunLogs` function.
- **FR-007**: The system MUST expose a single shared store instance; no second
  connection or parallel store instance may be created.
- **FR-008**: `data/sync-config.json` (operational schedule configuration) MUST
  remain file-based and is explicitly out of scope for this migration.
- **FR-008a**: The sync job's existing startup warm-up behaviour MUST be preserved:
  when a schedule is configured, a sync run fires automatically 5 seconds after
  server startup to repopulate the in-memory cache. This is not a new requirement —
  it MUST NOT be accidentally dropped during the migration refactor.
- **FR-009**: The system MUST NOT write any new `data/cache/metrics-result/*.json`
  or `data/sync-logs/*.json` files after this migration. On first startup after
  deployment — detected by the absence of `data/.migrated-to-sqlite` — the system
  MUST attempt to delete both legacy directories, log a migration notice, write the
  sentinel file `data/.migrated-to-sqlite`, and continue normally regardless of
  whether the deletion succeeds (non-blocking; warn on failure). Subsequent startups
  skip the cleanup because the sentinel file is present.
- **FR-010**: All existing API response shapes (`cacheStatus`, `oldestCachedAt`,
  `SyncRunLog`, `SyncBatchLog`) MUST remain byte-for-byte identical to their current
  definitions. No client-side changes are required.

### Key Entities

- **MetricsCacheEntry**: A single developer's computed metrics for a specific date
  range, plus a `cachedAt` timestamp. Keyed by `(developerId, startDate, endDate)`.
- **SyncRunLog**: A top-level record for one complete sync run: `runId`, `startedAt`,
  `finishedAt`, `durationMs`, `totalUsers`, and an ordered list of `SyncBatchLog`
  entries.
- **SyncBatchLog**: A record for one batch within a run: `batchIndex`, `userIds`,
  `startedAt`, `finishedAt`, `durationMs`, `status` (`ok` | `error`), optional
  `error` string.
- **InMemoryStore**: The singleton storage instance provisioned at startup. Owns
  schema initialisation and all read/write operations for the two entity types above.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A 50-developer sync run completes with zero file I/O errors in the
  server log, measured across 10 consecutive nightly runs.
- **SC-002**: A full-cache dashboard response for any team size returns in under
  500 ms (p95), matching the existing non-functional target.
- **SC-003**: All existing automated tests pass without modification. The public
  function signatures of `getCachedMetrics`, `setCachedMetrics`, `listRunLogs`,
  `purgeRunLogs`, and `writeRunLog` remain unchanged.
- **SC-004**: The Run History table in the Sync Jobs admin UI displays correct run
  and batch data after migration, verified by the existing integration test suite.
- **SC-005**: No new production `npm` package is added beyond what the constitution
  permits as the minimal fallback dependency for the runtime Node version.
- **SC-006**: The cache freshness banner (`cacheStatus`, `oldestCachedAt`) shows
  correct values in 100% of dashboard responses served from cache.
- **SC-007**: When the in-memory store cannot be initialised, the server exits with
  a non-zero code and a log entry that includes the failure reason within 5 seconds
  of startup — never silently serving requests without a functional store.

---

## Assumptions

- The current Node.js runtime version in this project does not support the built-in
  `node:sqlite` module (confirmed: v18.20.8). The minimal external package designated
  by the project constitution is used as the fallback.
- `data/sync-config.json` is a durable operational configuration file, not an
  analytics store. It is explicitly out of scope and remains file-based.
- Historical cache files in `data/cache/metrics-result/` and historical run log files
  in `data/sync-logs/` do not need to be migrated. On first server startup after
  deployment, the cache is empty and the next sync repopulates it.
- **Rollback operational constraint**: if the deployment is rolled back to the
  JSON-based version, the operator MUST manually delete `data/.migrated-to-sqlite`
  before re-deploying the new version. Without this step, the re-deployment skips
  the one-time cleanup sweep and any legacy JSON files written during the rollback
  period remain on disk (they are never read but occupy disk space). This constraint
  MUST be documented in the deployment runbook.
- The user description references `lean_metrics_db.json` — no file by this name
  exists in the current codebase. The actual files being replaced are
  `data/cache/metrics-result/*.json` (per-developer metric envelopes) and
  `data/sync-logs/*.json` (sync run logs). This spec targets those actual files.
- The `databaselayer/cache/bitbucketCache.ts` and `databaselayer/cache/ttlCache.ts` modules use an
  in-process TTL map (not file I/O) and are out of scope for this migration.
- The `databaselayer/cache/jsonFileCache.ts` module must be retained for `data/sync-config.json`
  reads/writes and the `data/.migrated-to-sqlite` sentinel file write. Callers that
  previously used it for metrics cache or run log I/O will be migrated to the
  in-memory store; the module itself is not deleted.
- Run history is intentionally transient (per Principle VI). Administrators who need
  persistent run history across restarts must use an external log aggregator; that is
  out of scope.
