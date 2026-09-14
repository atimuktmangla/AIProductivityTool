# JQL Examples & Reference

This document covers the JQL queries used by the AI Productivity Tool and provides additional examples for manual Jira searches.

---

## 1. Queries used internally by the tool

### 1.1 Primary assignee search

Fetches all issues assigned to the selected developers that have at least one linked pull request, within the selected date window.

```jql
assignee in ("jsmith","bjones")
AND development[pullrequests].all > 0
AND updated >= "2026-01-01"
AND updated <= "2026-03-31"
ORDER BY updated DESC
```

**Field notes:**
- `assignee in (...)` — accepts Jira username slugs (not display names)
- `development[pullrequests].all > 0` — requires the Jira DVCS / Bitbucket connector; filters to issues with at least one linked PR
- `updated >= / <=` — uses the issue's last-updated date, not created date

### 1.2 Issue key lookup (commit-linked)

Fetches specific issues whose keys were extracted from commit messages via the regex `/([A-Z]+-\d+)/g`.

```jql
key in ("PROJ-1234","PROJ-1235","PROJ-1300")
```

---

## 2. Useful manual JQL queries

### 2.1 All issues for a developer in a quarter

```jql
assignee = "jsmith"
AND updated >= "2026-01-01"
AND updated <= "2026-03-31"
ORDER BY updated DESC
```

### 2.2 Bugs assigned to a team in the last 30 days

```jql
assignee in ("jsmith","bjones")
AND issuetype = Bug
AND updated >= -30d
ORDER BY priority DESC, updated DESC
```

### 2.3 Unresolved issues with linked PRs

```jql
assignee in ("jsmith","bjones")
AND development[pullrequests].all > 0
AND resolution = Unresolved
ORDER BY updated DESC
```

### 2.4 Features delivered this sprint

```jql
assignee in ("jsmith","bjones")
AND issuetype in ("New Feature","Story","Feature")
AND sprint in openSprints()
AND status = Done
ORDER BY resolutiondate DESC
```

### 2.5 Tech-debt issues closed in a date range

```jql
issuetype in ("Technical Task","Task","Sub-task")
AND project = PROJ
AND status = Done
AND resolutiondate >= "2026-01-01"
AND resolutiondate <= "2026-03-31"
ORDER BY resolutiondate DESC
```

### 2.6 Issues resolved with no linked PR (manual deployments / hotfixes)

```jql
assignee in ("jsmith","bjones")
AND development[pullrequests].all = 0
AND status = Done
AND updated >= -90d
ORDER BY updated DESC
```

### 2.7 High-priority issues not yet started

```jql
assignee in ("jsmith","bjones")
AND priority in (Highest, High)
AND status not in (Done, "In Progress", "In Review")
ORDER BY priority ASC, created ASC
```

### 2.8 Issues created vs. resolved comparison (trend)

**Created this month:**
```jql
project = PROJ
AND created >= startOfMonth()
AND created <= endOfMonth()
```

**Resolved this month:**
```jql
project = PROJ
AND resolutiondate >= startOfMonth()
AND resolutiondate <= endOfMonth()
```

---

## 3. JQL operators quick reference

| Operator | Meaning | Example |
|---|---|---|
| `=` | Exact match | `assignee = "jsmith"` |
| `in (...)` | Any of the list | `issuetype in ("Bug","Defect")` |
| `not in (...)` | None of the list | `status not in (Done, Closed)` |
| `>= / <=` | Date comparison | `updated >= "2026-01-01"` |
| `-Nd` | Relative: N days ago | `updated >= -30d` |
| `startOfMonth()` | Start of current month | `created >= startOfMonth()` |
| `currentUser()` | Logged-in user | `assignee = currentUser()` |
| `openSprints()` | Active sprints | `sprint in openSprints()` |
| `AND / OR` | Combine conditions | |
| `ORDER BY f ASC/DESC` | Sort results | `ORDER BY updated DESC` |

---

## 4. Issue type names on this Jira instance

The tool's `workType.ts` classifier maps these exact strings (case-insensitive):

| Jira `issuetype.name` | Tool category |
|---|---|
| New Feature, Story, Feature, Epic, Improvement, Enhancement | `features` |
| Bug, Defect, Hotfix, Incident | `bugs` |
| Technical Task, Task, Sub-task, Tech Debt, Technical Debt, Maintenance, Infrastructure, Infra, Refactor, Chore | `infraOrDebt` |

If your Jira instance uses a different name, add it to `backend/metrics/workType.ts` in the `TYPE_MAP` object.

---

## 5. Finding the right developer slug

Jira slugs (username) differ from display names. Find them via:

1. **Jira UI:** go to **People** → click a user → check the URL: `.../jira/people/{slug}`
2. **Bitbucket:** the `name` field in the `/rest/api/1.0/admin/users` response is the slug
3. **Tool API:** call `GET /api/dashboard/users` — the `name` field in each object is the slug used for filtering
