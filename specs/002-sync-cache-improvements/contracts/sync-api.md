# API Contracts: Sync Cache Improvements

**Feature**: `002-sync-cache-improvements`
**Date**: 2026-06-08

All endpoints are under the `/api/dashboard/sync` prefix. Authentication via `X-Api-Key` header (existing requirement, unchanged).

---

## Existing endpoints (unchanged)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/status` | Returns `SyncStatus` — `completedUsers` now capped to 50 by server |
| `POST` | `/trigger` | Returns 202; unchanged |
| `GET` | `/config` | Unchanged |
| `POST` | `/config` | Unchanged |
| `GET` | `/logs` | Returns `SyncRunLog[]`; `SyncBatchLog.source` is now an optional field |
| `DELETE` | `/logs` | Unchanged |

---

## New endpoint: GET /api/dashboard/sync/cache-coverage

Returns the cache coverage snapshot for all users configured in `sync-config.json`.

### Request

```
GET /api/dashboard/sync/cache-coverage
X-Api-Key: <key>
```

No request body or query parameters.

### Response — 200 OK

```json
{
  "configuredUsers": 10,
  "cachedUsers": 7,
  "uncachedUsers": ["alice", "bob", "carol"],
  "staleUsers": []
}
```

### Response — 200 OK (no config file)

```json
{
  "configuredUsers": 0,
  "cachedUsers": 0,
  "uncachedUsers": [],
  "staleUsers": []
}
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `configuredUsers` | `number` | Total users in `sync-config.json`; 0 if absent |
| `cachedUsers` | `number` | Users with a fresh entry (< 1 h) for the current 90-day window |
| `uncachedUsers` | `string[]` | User IDs with no entry for the current date range |
| `staleUsers` | `string[]` | User IDs with an entry older than 1 h |

**Invariant**: `cachedUsers + uncachedUsers.length + staleUsers.length === configuredUsers`

---

## New endpoint: POST /api/dashboard/sync/warmup

Triggers a sync for only the configured users who lack a fresh cache entry. Non-blocking (fire-and-forget, same as `/trigger`).

### Request

```
POST /api/dashboard/sync/warmup
X-Api-Key: <key>
Content-Type: application/json
```

Empty body (`{}`) — no parameters. The endpoint reads users from `sync-config.json` internally.

### Response — 202 Accepted (users queued)

```json
{
  "skipped": 6,
  "queued": 4,
  "queuedUsers": ["alice", "bob", "carol", "dave"]
}
```

### Response — 200 OK (nothing to do)

```json
{
  "skipped": 10,
  "queued": 0,
  "queuedUsers": []
}
```

### Response — 409 Conflict (sync already running)

```json
{ "error": "A sync is already running" }
```

### Response — 400 Bad Request (no users configured)

```json
{ "error": "No users configured" }
```

### Field definitions

| Field | Type | Description |
|---|---|---|
| `skipped` | `number` | Users with fresh cache entries — not re-synced |
| `queued` | `number` | Users without fresh entries — sync triggered |
| `queuedUsers` | `string[]` | The queued user IDs |

---

## Modified response shape: SyncStatus

`GET /status` response now guarantees `completedUsers.length ≤ 50`.

```json
{
  "running": true,
  "lastRunAt": null,
  "nextRunAt": null,
  "runStartedAt": 1749369423000,
  "activeUsers": ["eve"],
  "completedUsers": ["alice", "bob", "...up to 50 most recent"],
  "failedUsers": [],
  "totalSyncUsers": 120,
  "configuredUsers": ["alice", "bob", "..."],
  "intervalMinutes": 1440,
  "scheduledTime": "02:00"
}
```

`totalSyncUsers` is always the true count (120 in the example above), even when `completedUsers` is capped at 50.

---

## Modified response shape: SyncBatchLog (inside SyncRunLog.batches)

`source` is a new optional field on each batch entry.

```json
{
  "batchIndex": 0,
  "userIds": ["alice", "bob"],
  "startedAt": "2026-06-08T02:00:00.000Z",
  "finishedAt": "2026-06-08T02:00:45.000Z",
  "durationMs": 45000,
  "status": "ok",
  "source": "cache"
}
```

`source` values:
- `"live"` — metrics were fetched from Bitbucket/Jira during this run
- `"cache"` — user was promoted from SQLite cache without an upstream call
- absent / `undefined` — run log written before this feature was deployed (legacy)
