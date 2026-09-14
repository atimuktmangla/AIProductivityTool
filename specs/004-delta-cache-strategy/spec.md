# Feature Specification: Delta Cache Strategy

**Feature Branch**: `004-delta-cache-strategy`

**Created**: 2026-06-10

**Status**: Implemented

**Input**: Durable SQLite metrics cache (no default TTL expiry), rolling-90 cache key,
current-month-only invalidation, delta-only upstream for open PRs, reviewed PRs, and Jira search.

**Builds on**: `003-performance-resilience` (file-backed SQLite, month-partitioned JSON caches)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Durable Metrics Cache (Priority: P1)

As an **operator** who synced developer metrics days ago, I need repeat dashboard and sync
runs to reuse stored results without time-based expiry, so manual reruns do not re-hit
Bitbucket and Jira when nothing material changed.

**Why this priority**: The 1-hour SQLite TTL forces expensive re-aggregation after every
sync gap; this is the highest-impact cost and latency fix.

**Independent Test**: Sync 8 developers for a 90-day window. Wait 5+ days (or simulate
stale `cached_at`). Request the same 90-day preset. Verify cache hit and zero upstream
calls when month data is unchanged.

**Acceptance Scenarios**:

1. **Given** metrics were stored for a developer and age-based TTL is disabled (default),
   **When** a report is requested days later with the same rolling 90-day intent,
   **Then** the system serves from SQLite without age-based invalidation.

2. **Given** a rolling 90-day window whose calendar end date moved forward since last cache,
   **When** a report is requested,
   **Then** the system resolves the cache by stable rolling-window identity, not exact
   `(startDate, endDate)` string match alone.

3. **Given** an operator sets a positive `METRICS_CACHE_TTL_MS` override,
   **When** cache age exceeds that value,
   **Then** age-based expiry applies (opt-in backward compatibility).

---

### User Story 2 — Current-Month-Only Refresh (Priority: P1)

As a **tech lead**, I need only the open calendar month recomputed when data is stale,
so closed months remain frozen and API cost stays proportional to recent activity.

**Why this priority**: Month-partitioned JSON caches already treat closed months as
immutable; SQLite and aggregation should follow the same model.

**Independent Test**: Populate cache spanning multiple months. Trigger refresh when only
the current month changed. Verify upstream calls target current-month repos/PRs only.

**Acceptance Scenarios**:

1. **Given** closed calendar months are cached on disk,
   **When** aggregation runs,
   **Then** no upstream calls are made for closed months.

2. **Given** the calendar month rolled or the rolling window end advanced,
   **When** a cached metric row exists,
   **Then** only the current month slice is re-aggregated and merged into the stored result.

3. **Given** an operator requests force refresh with scope `current-month`,
   **When** refresh completes,
   **Then** closed-month contributions are unchanged.

---

### User Story 3 — Delta-Only Upstream Fetches (Priority: P2)

As a **platform owner**, I need repeat runs to fetch only deltas from Bitbucket and Jira,
so second and subsequent aggregations within a month cost far less than the first.

**Why this priority**: Open PRs, reviewed PRs, and Jira search still full-fetch on every
live run today; delta cursors complete the cache strategy.

**Independent Test**: Run aggregation twice for the same developers within 24 hours.
Second run upstream call count MUST be at most 20% of the first (mocked counters).

**Acceptance Scenarios**:

1. **Given** open PR data was fetched recently,
   **When** aggregation runs again within the current month,
   **Then** only PRs updated since the stored cursor are fetched.

2. **Given** reviewed PR data was fetched recently,
   **When** aggregation runs again,
   **Then** delta fetch applies with the same cursor semantics as merged PRs.

3. **Given** Jira assignee search ran recently,
   **When** aggregation runs again in the current month,
   **Then** JQL uses `updated >= cursor` and merges with cached issue keys.

---

### Edge Cases

- Compare-period requests bypass SQLite merge (unchanged from today).
- First run with no cache remains full fetch (cold start).
- Calendar month boundary at UTC vs local: use server local month consistent with existing caches.
- Force refresh scope `full` re-aggregates entire window (escape hatch for audits).
- Corrupt cache envelope: fail open to live fetch for affected slice only.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-004-001**: Default metrics cache MUST NOT expire by age (`METRICS_CACHE_TTL_MS` default `0` = infinite).
- **FR-004-002**: Rolling 90-day requests MUST resolve cache via `windowKind=rolling-90` plus developer id.
- **FR-004-003**: Fixed date-range requests MUST continue exact `(developerId, startDate, endDate)` lookup.
- **FR-004-004**: When rolling cache hit exists but window end advanced, system MUST refresh current month only and merge.
- **FR-004-005**: Closed calendar months MUST NOT trigger upstream calls when JSON month cache exists.
- **FR-004-006**: Open PR fetch MUST use per-repo monthly envelope with update cursor (delta).
- **FR-004-007**: Reviewed PR fetch MUST use per-repo monthly envelope with update cursor (delta).
- **FR-004-008**: Jira issue search MUST use per-developer monthly envelope with `updated` cursor (delta).
- **FR-004-009**: `POST /sync/refresh` MUST accept `scope: current-month | full` (default `current-month`).
- **FR-004-010**: Sync job and dashboard MUST share cache resolution and refresh logic.
- **FR-004-011**: Response MUST expose refined `cacheStatus` including current-month refresh when applicable.

### Key Entities

- **MetricsCacheRow**: developer id, window kind, anchor dates, serialized metric, cached at, current month id.
- **MonthCursorEnvelope**: JSON file with items array, cursor timestamp, cached at (open PRs, reviewed PRs, Jira).
- **RefreshScope**: `current-month` or `full` operator intent.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-004-001**: Repeat 90-day report 5 days after sync completes in under 500 ms with zero upstream calls when month data unchanged.
- **SC-004-002**: Second aggregation within 24 h uses at most 20% of first-run upstream calls (same devs/repos).
- **SC-004-003**: Current-month-only refresh uses at least 80% fewer upstream calls than full cold aggregation for typical 90-day windows.
- **SC-004-004**: Closed months never refetched after write-once JSON cache populated (verified by mock call counts).

---

## Assumptions

- Rolling 90-day preset is detected when `endDate` is today (local) and span is 89–91 days.
- Sync job continues to use rolling 90-day window; dashboard last-90 preset aligns with sync cache keys.
- Merged PR delta caching from 003 remains; this feature extends delta to open/reviewed/Jira.
- Positive TTL via env is supported for operators who want time-based expiry.

---

## Dependencies

- `003-performance-resilience`: file-backed `appStore`, month JSON caches, PR-based commits.
- Principle VI (SQLite storage law): single file-backed store; no per-developer JSON metrics files.
