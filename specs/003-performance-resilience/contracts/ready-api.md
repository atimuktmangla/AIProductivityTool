# API Contract: Readiness Extension

**Feature**: `003-performance-resilience`
**Date**: 2026-06-10

---

## GET /ready (extended)

Existing health check — pings Jira and Bitbucket. Response extended with issue-linking status.

### Request

```
GET /ready
```

No authentication required (unchanged).

### Response — 200 OK

```json
{
  "status": "ready",
  "jiraLinking": {
    "mode": "hybrid",
    "connectorAvailable": true,
    "fallbackEngaged": false
  }
}
```

### Response — 503 Service Unavailable

```json
{
  "status": "not ready",
  "detail": "<upstream error message>"
}
```

When upstream is unreachable, `jiraLinking` is omitted.

### Field definitions

| Field | Type | Description |
|---|---|---|
| `status` | `"ready" \| "not ready"` | Unchanged |
| `jiraLinking.mode` | `"connector" \| "assignee" \| "hybrid"` | Value of `JIRA_ISSUE_LINKING_MODE` |
| `jiraLinking.connectorAvailable` | `boolean` | Startup probe succeeded for DVCS JQL |
| `jiraLinking.fallbackEngaged` | `boolean` | `true` if the most recent metrics aggregation used assignee fallback |

### Backwards compatibility

Existing consumers that only read `status` are unaffected. New fields are additive.
