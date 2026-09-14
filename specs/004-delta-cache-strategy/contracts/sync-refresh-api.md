# Contract: POST /sync/refresh

**Path**: `POST /sync/refresh`  
**Auth**: Same as other sync routes

## Request body

```json
{
  "developerIds": ["alice", "bob"],
  "scope": "current-month"
}
```

| Field | Required | Default |
|-------|----------|---------|
| developerIds | No | All configured sync users |
| scope | No | `current-month` |

## Responses

| Status | Body |
|--------|------|
| 202 | `{ "queued": N, "scope": "current-month" }` |
| 409 | Sync already running |
| 400 | No users configured |

## Behavior

- `current-month`: invalidate current month slice only; re-merge into SQLite.
- `full`: delete SQLite rows for given devs; queue live sync.
