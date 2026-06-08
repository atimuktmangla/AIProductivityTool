# Feature Specification: Sync Cache Improvements

**Feature Branch**: `002-sync-cache-improvements`

**Created**: 2026-06-08

**Status**: Draft

**Input**: Three related improvements to the sync job and cache system:
(1) cap the progress panel to last 50 completed users + all failed users so large runs remain readable;
(2) skip users with a fresh SQLite cache entry during manual sync runs;
(3) add a background delta warm-up that can be triggered from a UI button or a scheduled script (PowerShell / CMD) to cache only the users who are currently missing from the SQLite store.

---

## Clarifications

### Session 2026-06-08

- Q: What TTL should the manual-run cache-skip and the warmup use to decide "fresh enough"? → A: Same 1-hour TTL as the dashboard (`METRICS_CACHE_TTL_MS`). A single shared constant avoids drift.
- Q: Where do cache-skipped users appear in the progress panel and run log? → A: They count as completed immediately (appear in the done chips); the batch log records them as `status: 'ok'` with a `source: 'cache'` note so they are distinguishable in history.
- Q: Should the PowerShell script read the API port from an environment variable or `.env` file? → A: Read from a `.env` file in the project root (same file the server uses); fall back to `localhost:3000` if the file is absent or the key is not set.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Progress Panel Stays Readable During Large Runs (Priority: P1)

As a **sync job administrator** watching a 200-user run in real time, I need the progress
panel to remain readable — showing only the users that matter (currently active, all
failures, and the most recent completions) — without the browser slowing down or the panel
becoming a wall of text.

**Why this priority**: Without this cap the panel renders hundreds of chips and the status
payload grows proportionally. This is a pure usability and performance regression for large
orgs that is trivially fixable.

**Independent Test**: Trigger a sync for 120 users and observe the progress panel. Verify
that the completed-users chip section never shows more than 50 entries and that all failed
users are always visible.

**Acceptance Scenarios**:

1. **Given** a sync is running for 120 users and 80 have completed,
   **When** the progress panel refreshes,
   **Then** it shows the 50 most recently completed users, all active users, and any failed
   users — with an overflow indicator (e.g., "+30 more") for the hidden completions.

2. **Given** a sync run where 10 users have failed and 70 have completed,
   **When** the progress panel refreshes,
   **Then** all 10 failed users are visible (failure list is never truncated), the 50 most
   recent completions are shown, and the status payload from the server contains at most
   50 completed users.

3. **Given** a sync run finishes and the run history table refreshes,
   **Then** the full `totalUsers` count is accurate regardless of how many were shown live.

---

### User Story 2 — Manual Sync Skips Already-Cached Users (Priority: P1)

As a **sync job administrator** who has just discovered 5 new team members and wants to
add them to the sync without re-fetching the 45 users who were synced an hour ago, I
need the manual trigger to detect fresh cache entries and skip re-fetching those users.

**Why this priority**: Without this, every manual run re-fetches all users unconditionally.
For 50 users that is ~10 minutes of unnecessary API calls; with cache-skip it completes in
seconds for only the new or stale users.

**Independent Test**: Run a full sync for 10 users. Immediately trigger a second manual
sync for the same 10 users. The second run should complete near-instantly (no Bitbucket
API calls made) and all 10 users should appear in the completed chips with a cache-source
indicator.

**Acceptance Scenarios**:

1. **Given** all 10 users have fresh cache entries (synced within the last hour),
   **When** a manual sync is triggered for those 10 users,
   **Then** the job completes without calling the upstream metrics API for any user,
   all 10 appear as completed, and the run log records them as cache-served.

2. **Given** 7 of 10 users have fresh cache entries and 3 do not,
   **When** a manual sync is triggered for those 10 users,
   **Then** only the 3 uncached users call the upstream metrics API; the 7 cached users
   are promoted to completed immediately; the run log records both sources accurately.

3. **Given** a user's cache entry is older than 1 hour (stale),
   **When** a manual sync is triggered,
   **Then** that user is treated as a cache miss and their metrics are re-fetched and
   written to the cache.

---

### User Story 3 — One-Click Delta Warm-Up from the Admin UI (Priority: P2)

As a **sync job administrator**, I want a single "Warm Missing Cache" button in the
Sync Jobs panel that kicks off a background sync for only the configured users who are
not yet cached — without me having to manually identify and select those users.

**Why this priority**: This is the primary interactive entry point for the delta warm-up.
It saves the administrator from opening the User Selection form and cross-referencing
cache coverage manually.

**Independent Test**: Configure 10 users in sync-config. Cache 6 of them via a partial
run. Open the Sync Jobs admin panel and click "Warm Missing Cache". Verify that the
running progress panel shows exactly 4 users being synced and that the Cache Coverage
card updates to 10/10 after completion.

**Acceptance Scenarios**:

1. **Given** 6 of 10 configured users are cached and 4 are not,
   **When** the administrator clicks "Warm Missing Cache",
   **Then** a sync runs for exactly the 4 uncached users, the progress panel shows those 4,
   and the Cache Coverage card updates to 10/10 when done.

2. **Given** all configured users are already cached (coverage 100%),
   **When** the administrator views the Sync Jobs panel,
   **Then** the "Warm Missing Cache" button is disabled with a tooltip "All users are cached".

3. **Given** a sync is already running,
   **When** the administrator clicks "Warm Missing Cache",
   **Then** the request is rejected with a message "A sync is already running — wait for
   it to finish" and no second sync is started.

4. **Given** no users are configured in sync-config,
   **When** the administrator views the Sync Jobs panel,
   **Then** the Cache Coverage card shows "No users configured" and the warm-up button
   is absent.

---

### User Story 4 — Scheduled Delta Warm-Up via Script (Priority: P2)

As a **server administrator** who wants the cache pre-warmed each morning before the
team arrives, I need a script I can register with Windows Task Scheduler (or a cron job
on Linux) that calls the warm-up endpoint and exits with a meaningful code so the
scheduler can detect failures.

**Why this priority**: Not every operator uses the UI. The script provides an
infrastructure-level entry point for the same warm-up logic, enabling automated
pre-warming without a human in the loop.

**Independent Test**: Run `scripts/warm-cache.ps1` (or `warm-cache.cmd`) from a terminal
with the server running. Verify that it prints the number of users skipped (cached) and
queued (warming), exits with code 0 on success, and exits with a non-zero code when the
server is unreachable.

**Acceptance Scenarios**:

1. **Given** the server is running and 4 users need warming,
   **When** `warm-cache.ps1` is executed,
   **Then** it prints "Skipped: 6 (cached). Queued: 4." and exits with code 0.

2. **Given** the server is running and all users are already cached,
   **When** `warm-cache.ps1` is executed,
   **Then** it prints "Skipped: 10 (cached). Queued: 0. Nothing to warm." and exits
   with code 0.

3. **Given** the server is unreachable,
   **When** `warm-cache.ps1` is executed,
   **Then** it prints an error message and exits with a non-zero code so the Task
   Scheduler marks the job as failed.

4. **Given** `warm-cache.cmd` is double-clicked or called from a batch pipeline,
   **Then** it invokes the PowerShell script with the correct execution policy and
   propagates the exit code.

---

### User Story 5 — Cache Coverage Card in Admin UI (Priority: P3)

As a **sync job administrator**, I want to see at a glance how many of my configured
users already have fresh cache entries versus how many still need warming, so I can
decide whether to trigger a warm-up before the team's morning stand-up.

**Why this priority**: This is a read-only status display. It informs the administrator's
decision but is not required for any workflow to function.

**Independent Test**: With some users cached and some not, open the Sync Jobs panel.
Verify the Cache Coverage card shows the correct counts, lists uncached user names (up
to 5 with overflow), and auto-refreshes every 30 seconds.

**Acceptance Scenarios**:

1. **Given** 7 of 10 configured users are cached,
   **When** the admin opens the Sync Jobs panel,
   **Then** the Cache Coverage card shows "7 / 10 users cached" and lists the 3 uncached
   user names.

2. **Given** more than 5 users are uncached,
   **When** the Cache Coverage card renders,
   **Then** it shows the first 5 user names and an overflow indicator (e.g., "+8 more").

3. **Given** the administrator leaves the panel open,
   **When** a warm-up run completes,
   **Then** the Cache Coverage card updates within 30 seconds to reflect the new counts.

---

### Edge Cases

- What happens if `sync-config.json` is absent or corrupt when the warm-up endpoint is called? The endpoint returns HTTP 400 with "No users configured" and does not trigger a sync.
- What happens if a warm-up is triggered while a regular scheduled sync is already running? Returns HTTP 409 Conflict; the UI shows "A sync is already running".
- What happens if `getCachedMetrics` throws during the cache-skip check inside a manual run? The error is caught per-user; that user falls back to a full re-fetch (fail-open, not fail-closed).
- What happens if the PowerShell script cannot parse the `.env` file (e.g., malformed)? It falls back to `localhost:3000` and logs a warning line before proceeding.
- What happens if a user appears in both the cache-skip list and the active warmup batch? Not possible — the warmup filters to misses only before calling `triggerSyncForUsers`; the running check prevents a concurrent second trigger.
- What happens when `completedUsers` exceeds 50 in the status payload? The server slices to the last 50 completed users before serialising; `totalSyncUsers` is always the full count so the progress bar remains accurate.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The sync status endpoint MUST return at most 50 completed users (the most recent 50 by completion order) and ALL failed users. The `totalSyncUsers` field MUST always reflect the true total regardless of how many completed users are serialised.
- **FR-002**: The progress panel in the admin UI MUST display active users, all failed users, and at most 50 completed users. When completions exceed 50, an overflow indicator MUST show the count of hidden entries. The overflow indicator is driven by the server-side cap, not client-side slicing.
- **FR-003**: When a manual sync run is triggered, the system MUST check the SQLite metrics cache for each user before calling the upstream metrics API. Users with a cache entry younger than 1 hour MUST be promoted to completed immediately without any upstream API call.
- **FR-004**: Cache-skipped users MUST be recorded in the batch log with `status: 'ok'` and a `source: 'cache'` field so run history distinguishes them from freshly fetched users.
- **FR-005**: The system MUST expose a `GET /api/dashboard/sync/cache-coverage` endpoint that returns, for all users configured in `sync-config.json`, a count of cached users, a count and list of uncached users, and a count and list of stale users — evaluated against the same 1-hour TTL used by the dashboard.
- **FR-006**: The system MUST expose a `POST /api/dashboard/sync/warmup` endpoint that reads configured users from `sync-config.json`, identifies those without a fresh cache entry, triggers a sync for only those users, and returns the counts of skipped (cached) and queued (warming) users. If a sync is already running, it MUST return HTTP 409. If no users are configured, it MUST return HTTP 400.
- **FR-007**: The admin UI Sync Jobs panel MUST include a Cache Coverage card that displays the ratio of cached to total configured users, lists uncached user names (up to 5 with an overflow indicator), and refreshes automatically at the same polling interval as the status card.
- **FR-008**: The admin UI MUST include a "Warm Missing Cache" button that calls `POST /warmup`, is disabled when all configured users are cached or when a sync is already running, and shows a contextual tooltip explaining why it is disabled.
- **FR-009**: The project MUST include a `scripts/warm-cache.ps1` PowerShell script that reads the API base URL from the project-root `.env` file (key `VITE_API_KEY` for auth, `PORT` or `VITE_DEV_PORT` for port), calls `POST /api/dashboard/sync/warmup`, prints the skipped/queued summary, and exits with code 0 on HTTP 2xx or code 1 on any error.
- **FR-010**: The project MUST include a `scripts/warm-cache.cmd` CMD wrapper that invokes `warm-cache.ps1` with `-ExecutionPolicy Bypass` and propagates its exit code, enabling use from Windows Task Scheduler without PowerShell profile configuration.
- **FR-011**: All existing public function signatures (`getCachedMetrics`, `setCachedMetrics`, `triggerSyncForUsers`, `getSyncStatus`, `listRunLogs`) MUST remain unchanged. Callers outside the sync job require zero modification.

### Key Entities

- **SyncStatus** (extended): Adds `completedUsers` capped to 50 (last 50 by order) server-side; `totalSyncUsers` remains the true total.
- **SyncBatchLog** (extended): Adds an optional `source` field (`'live' | 'cache'`) to each user entry recorded in the run log.
- **CacheCoverage**: A read-only snapshot — `configuredUsers` count, `cachedUsers` count, `uncachedUsers` list, `staleUsers` list — produced on demand by `GET /cache-coverage`.
- **WarmupResult**: The response from `POST /warmup` — `skipped` count, `queued` count, `queuedUsers` list.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: During a 200-user sync run the status payload returned by `GET /sync/status` MUST contain no more than 50 entries in `completedUsers`, measured on every poll response during the run.
- **SC-002**: A manual sync triggered immediately after a full sync for the same user set completes in under 5 seconds for up to 50 users, with zero upstream Bitbucket API calls made (verified via server log).
- **SC-003**: `POST /warmup` correctly identifies and queues only the uncached users in 100% of test cases, verified across three states: all cached, all uncached, and partially cached.
- **SC-004**: `warm-cache.ps1` exits with code 0 on a successful warm-up response and with code 1 when the server is unreachable, verified in both conditions.
- **SC-005**: The Cache Coverage card in the UI reflects accurate counts within one polling cycle (≤ 30 seconds) after any sync run completes.
- **SC-006**: All existing automated tests pass without modification after these changes are applied. No previously passing test may be broken.
- **SC-007**: The `warm-cache.cmd` script can be registered as a Windows Task Scheduler action and execute successfully with no manual PowerShell profile setup required.

---

## Assumptions

- The 1-hour cache TTL (`METRICS_CACHE_TTL_MS = 3 600 000 ms`) defined in `metricsRouter.ts` is the single authoritative freshness threshold. No new constant is introduced; the sync job imports and reuses the same value.
- `sync-config.json` is the canonical source of configured users for both the coverage endpoint and the warm-up endpoint. Users not in this file are not the warm-up's concern.
- The progress panel cap (50 completed) applies only to the live progress display and the status API payload. The run log written to SQLite at end-of-run always records the full batch detail — the cap does not affect run history accuracy.
- `SyncBatchLog.source` is a new optional field and is backwards-compatible: existing consumers that do not read `source` are unaffected.
- The PowerShell script runs on Windows Server with PowerShell 5.1 or later. No third-party PowerShell modules are required.
- The CMD wrapper is a thin two-line file; no business logic lives there.
- A Linux/WSL `scripts/warm-cache.sh` is out of scope for this spec but the endpoint it calls is identical, so it can be added later without backend changes.
- The warm-up endpoint reuses `triggerSyncForUsers` internally. No new background execution mechanism is introduced.
- The `source: 'cache'` field in `SyncBatchLog` is stored as part of `batches_json` in the SQLite `sync_run_logs` table. The JSON column is schema-free so no migration is needed.
