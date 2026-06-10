# Internal Contract: Jira Issue Linking

**Feature**: `003-performance-resilience`
**Date**: 2026-06-10

Internal module contract — not a public HTTP endpoint.

---

## Module: `databaselayer/services/jiraService.ts`

### New export

```ts
export type IssueLinkingMode = 'connector' | 'assignee' | 'hybrid';

export async function searchIssuesForDeveloper(
  developerId: string,
  startDate: string,
  endDate: string,
): Promise<RawJiraIssue[]>;

export async function probeConnectorAvailability(): Promise<boolean>;

export function getIssueLinkingStatus(): IssueLinkingStatus;

export function resetFallbackEngaged(): void;
```

### Behaviour by mode

| Mode | JQL used | Fallback |
|---|---|---|
| `connector` | `assignee = "slug" AND development[pullrequests].all > 0 AND updated >= start AND updated <= end` | None |
| `assignee` | `assignee = "slug" AND updated >= start AND updated <= end` | None |
| `hybrid` | Connector JQL first | Assignee JQL if connector returns 0 issues or throws |

### Aggregator integration

`backend/metrics/aggregator.ts` replaces:
```ts
searchIssuesByAssignees([devId], startDate, endDate)
```
with:
```ts
searchIssuesForDeveloper(devId, startDate, endDate)
```

PR-title key path unchanged:
```ts
const jiraKeySet = new Set<string>();
for (const pr of prResults.flat()) { /* extract keys */ }
const commitLinkedIssues = await getIssuesByKeys([...jiraKeySet]);
// merge + dedupe by issue.key
```

### Error handling

- Connector JQL upstream 4xx/5xx in hybrid mode → log warning once per aggregation, fall back to assignee.
- Assignee JQL failure → propagate as today (502 to client via error handler).

---

## Environment

| Variable | Default | Description |
|---|---|---|
| `JIRA_ISSUE_LINKING_MODE` | `hybrid` | Linking strategy |

Document in `.env.example` with comment explaining DVCS requirement for `connector` mode.
