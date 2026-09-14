# Quickstart Validation Guide: Delta Cache Strategy

**Feature**: `004-delta-cache-strategy`  
**Date**: 2026-06-10

Validate after all phases land. Builds on file-backed SQLite and month-partitioned JSON caches from `003-performance-resilience`.

---

## Prerequisites

- Server running: `npm run dev`
- Valid `.env` with Bitbucket and Jira credentials
- `METRICS_SQLITE_TTL_MS=0` (default) — metrics do not expire by age
- At least 3 developers configured in `data/sync-config.json`

---

## Scenario 1 — Durable SQLite (FR-004-001, FR-004-002, SC-004-001)

1. Run a full sync for configured developers (or `POST /api/dashboard/sync/trigger`).
2. Wait several hours or restart the server.
3. Request the same rolling 90-day window:
   ```
   POST /api/dashboard/metrics
   X-Api-Key: <key>
   { "developerIds": ["alice"], "startDate": "<90d-ago>", "endDate": "<today>" }
   ```
   **Expected**: `cacheStatus: "full"`, response under 500 ms, no Bitbucket/Jira pagination in server logs.

---

## Scenario 2 — Gap merge on new day (FR-004-004, FR-004-011)

1. With cache populated yesterday, request metrics with `endDate` = today (rolling 90-day preset).
2. **Expected**: `cacheStatus: "gap-merged"` or live merge; only gap date range aggregated upstream.

---

## Scenario 3 — Current-month refresh (FR-004-009)

```
POST /api/dashboard/sync/refresh
X-Api-Key: <key>
{ "scope": "current-month" }
```
**Expected**: HTTP 202, `{ "queued": N, "scope": "current-month" }`. Sync log shows `source: live` for refreshed users.

Force full rebuild:
```
POST /api/dashboard/sync/refresh
{ "scope": "full", "developerIds": ["alice"] }
```

---

## Scenario 4 — Delta upstream (FR-004-006–008, SC-004-002)

1. Run metrics twice within 15 minutes for the same developers.
2. **Expected**: Second run issues far fewer upstream calls; JSON envelopes under `data/cache/{YYYY-MM}/open-prs/`, `reviewed-prs/`, `jira-search/` updated with cursors.

---

## Verification gate

```bash
npm test
npm run build
```

Traceability checker must report zero untested REQ-004-FR-* items.
