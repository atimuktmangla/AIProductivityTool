# API Contract — AI Productivity Tool

**Version:** 1.0  
**Date:** 2026-06-08

All `/api/*` routes require:
- `X-Api-Key: <token>` header matching `API_KEY` env var (constant-time comparison)
- Missing/invalid header → `401 { "error": "Unauthorized — provide a valid X-Api-Key header" }`

---

## Health

### `GET /health`

No auth required.

**Response 200**
```json
{ "status": "ok", "timestamp": "2026-06-08T10:00:00.000Z" }
```

### `GET /ready`

No auth required. Pings both Jira and Bitbucket.

**Response 200**
```json
{ "status": "ready" }
```

**Response 503** (either upstream unreachable)
```json
{ "status": "not ready", "detail": "..." }
```

---

## Dashboard

### `GET /api/dashboard/users`

Returns all Bitbucket users. Cached for 5 minutes.

**Response 200**
```json
[
  { "name": "jsmith", "displayName": "Jane Smith", "emailAddress": "jsmith@company.com" }
]
```

### `GET /api/dashboard/projects`

Returns all Bitbucket project keys.

**Response 200**
```json
["DOSC", "PLATFORM", "MOBILE"]
```

### `GET /api/dashboard/repos?projectKeys=DOSC,PLATFORM`

Returns repos for the requested project keys.

**Response 200**
```json
[
  { "projectKey": "DOSC", "repoSlug": "react-test" },
  { "projectKey": "PLATFORM", "repoSlug": "infra-core" }
]
```

### `POST /api/dashboard/metrics`

Aggregates developer metrics. Compare period is optional.

**Request body**
```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "projectKeys": ["DOSC"],
  "repoTargets": [{ "projectKey": "DOSC", "repoSlug": "backend-api" }],
  "compareStartDate": "2025-10-01",
  "compareEndDate": "2025-12-31"
}
```

`repoTargets`, `projectKeys`, `compareStartDate`, `compareEndDate` are all optional.

**Validation errors → 400**
- `developerIds` empty or > 50 entries
- `startDate` or `endDate` not valid `YYYY-MM-DD`
- `endDate` < `startDate`
- Date range > 366 days
- `projectKey` not matching `/^[A-Z][A-Z0-9_]{0,9}$/`
- `repoSlug` not matching `/^[a-z0-9_.\-]{1,128}$/`
- `projectKeys` array > 20 entries

**Response 200**
```json
{
  "current": [ /* AggregatedDeveloperMetric[] */ ],
  "previous": [ /* AggregatedDeveloperMetric[] — present when compareStartDate given */ ],
  "cacheStatus": "full",
  "cachedAt": 1748923643000
}
```

`cacheStatus` values: `"full"` (all cached), `"partial"` (some cached), `"none"` (live).

### `POST /api/dashboard/insights`

Same payload as `/metrics`. Returns metrics + AI-generated or rule-based team insights.

**Response 200**
```json
{
  "current": [ /* AggregatedDeveloperMetric[] */ ],
  "insights": {
    "topContributor": "Jane Smith",
    "bottleneck": "pickup",
    "bottleneckDetail": "Average pickup delay is 10.2 hrs (>8 h threshold).",
    "workTypeImbalance": false,
    "workTypeDetail": "Features 60% · Bugs 25% · Infra/Debt 15%.",
    "teamHealthScore": 72,
    "summary": "The team is shipping steadily but PRs are sitting unreviewed for over 10 hours on average...",
    "aiGenerated": true,
    "aiProvider": "anthropic"
  }
}
```

---

## Sync

### `GET /api/dashboard/sync/status`

**Response 200**
```json
{
  "running": true,
  "lastRunAt": 1748923643000,
  "nextRunAt": 1749010043000,
  "configuredUsers": ["jsmith", "bjones"],
  "intervalMinutes": 1440,
  "currentUser": "bjones",
  "completedUsers": ["jsmith"],
  "failedUsers": [],
  "totalSyncUsers": 2,
  "activeRunId": "2026-06-08-10-00-00"
}
```

`completedUsers` is capped at 50 (most recent). `totalSyncUsers` reflects the true total.

### `POST /api/dashboard/sync/trigger`

Triggers a non-blocking sync for the given users. Returns immediately.

**Request body**
```json
{ "developerIds": ["jsmith", "bjones"] }
```

**Response 202**
```json
{ "queued": true }
```

**Response 409** (sync already running)
```json
{ "error": "sync_in_progress", "runId": "2026-06-08-10-00-00" }
```

### `GET /api/dashboard/sync/config`

Returns the persisted sync configuration from `data/sync-config.json`, or env-var fallback.

**Response 200**
```json
{ "developerIds": ["jsmith", "bjones"], "intervalMinutes": 1440 }
```

### `POST /api/dashboard/sync/config`

Saves a new sync configuration and reschedules the interval immediately.

**Request body**
```json
{ "developerIds": ["jsmith", "bjones"], "intervalMinutes": 10080 }
```

Valid `intervalMinutes` values: `0`, `1440`, `10080`.

**Response 200** — same body as request.

### `GET /api/dashboard/sync/logs`

Returns the last 50 sync run logs, newest first.

**Response 200**
```json
[
  {
    "runId": "2026-06-08-10-00-00",
    "startedAt": 1748923643000,
    "finishedAt": 1748923761000,
    "durationMs": 118000,
    "totalUsers": 27,
    "batches": [
      {
        "batchIndex": 0,
        "userIds": ["jsmith", "bjones"],
        "status": "ok",
        "durationMs": 39000,
        "source": "live"
      }
    ]
  }
]
```

### `DELETE /api/dashboard/sync/logs`

Purges all sync run logs from SQLite.

**Response 204** (no body)

### `GET /api/dashboard/sync/cache-coverage`

Returns cache coverage for all configured users.

**Response 200**
```json
{
  "totalConfigured": 10,
  "cachedCount": 7,
  "uncachedUsers": ["alice", "bob", "carol"],
  "staleUsers": []
}
```

Returns all-zero counts when no `sync-config.json` exists.

### `POST /api/dashboard/sync/warmup`

Triggers a sync for uncached/stale configured users only.

**Response 200**
```json
{
  "skipped": 7,
  "queued": 3,
  "queuedUsers": ["alice", "bob", "carol"]
}
```

**Response 400** — no users configured
```json
{ "error": "no_users_configured" }
```

**Response 409** — sync already running
```json
{ "error": "sync_in_progress", "runId": "2026-06-08-10-00-00" }
```

---

## Error response shape

All error responses share the same shape:

```json
{ "error": "<code>", "detail": "<human-readable message>" }
```

| HTTP status | Cause |
|---|---|
| `400` | Validation failure |
| `401` | Missing or invalid `Authorization` header |
| `409` | Concurrent operation conflict (sync already running) |
| `429` | Upstream rate limit exhausted after retries; `Retry-After: 60` header present |
| `500` | Unhandled server error |
| `502` | Upstream Jira/Bitbucket error |

---

## Performance benchmarks (for WorkflowCycleTrack UI colour coding)

| Stage | Green (on track) | Amber (needs attention) | Red (at risk) |
|---|---|---|---|
| Pickup Delay | ≤ 4 hrs | ≤ 8 hrs | > 8 hrs |
| Review Lifecycle | ≤ 8 hrs | ≤ 16 hrs | > 16 hrs |
| Total Cycle Time | ≤ 24 hrs | ≤ 40 hrs | > 40 hrs |
