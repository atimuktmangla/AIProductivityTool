# API Use Cases — Developer Metrics Dashboard

Base URL: `http://localhost:3000`
Date range used in all examples: **last 30 days** (adjust `startDate` / `endDate` as needed)
Developers used in all examples: `jsmith`, `bjones`

---

## Repo targeting — how it works

The `POST /api/dashboard/metrics` request accepts two optional fields:

| Field         | Type                                         | Purpose                                                     |
| ------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `repoTargets` | `{ projectKey: string; repoSlug: string }[]` | Exact repo pairs to scope to (Tier 1)                       |
| `projectKeys` | `string[]`                                   | Bitbucket project keys — repos discovered per-user (Tier 2) |

Combined with the env vars `BITBUCKET_PROJECT_KEYS` and `BITBUCKET_PROJECTS`, the backend applies a three-tier priority to decide which repos to scan:

| Tier                   | Triggered when                                                                | Behaviour                                                                        |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **1 — Exact**          | `repoTargets` sent in request, or `BITBUCKET_PROJECTS` set in env             | Use listed `PROJECT/repo` pairs — no discovery                                   |
| **2 — Project-scoped** | `projectKeys` only (no `repoTargets`), or `BITBUCKET_PROJECT_KEYS` set in env | List all repos in those projects, filter to repos where the developer was active |
| **3 — Auto-discover**  | Nothing provided                                                              | Fetch each developer's recently-active repos from `/profile/recent/repos`        |

UI values always override env values. See [repo-resolution-flowcharts.md](repo-resolution-flowcharts.md) for decision flowcharts.

---

## Use Case 1 — Specific repos in specific projects (Tier 1, fully explicit)

Both env vars are set **and** the request also passes `projectKeys` + `repoSlugs`.

**When to use:** You know exactly which repos you care about. Fastest path — no discovery calls.

**.env**

```
BITBUCKET_PROJECT_KEYS=DOSC
BITBUCKET_PROJECTS=DOSC/react-Test
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27",
  "repoTargets": [{ "projectKey": "DOSC", "repoSlug": "react-Test" }]
}
```

**Resolved targets:** `DOSC/react-Test` only.

---

## Use Case 2 — Multiple repos in a single project (Tier 1)

Scan two specific repos inside the same project.

**.env**

```
BITBUCKET_PROJECT_KEYS=DOSC
BITBUCKET_PROJECTS=
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27",
  "repoTargets": [
    { "projectKey": "DOSC", "repoSlug": "react-Test" },
    { "projectKey": "DOSC", "repoSlug": "backend-api" }
  ]
}
```

**Resolved targets:** `DOSC/react-Test`, `DOSC/backend-api`.

---

## Use Case 3 — Multiple repos across multiple projects (Tier 1)

Scan the same repo slugs under more than one project key.

**.env**

```
BITBUCKET_PROJECT_KEYS=DOSC,PLATFORM
BITBUCKET_PROJECTS=
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27",
  "repoTargets": [
    { "projectKey": "DOSC", "repoSlug": "react-Test" },
    { "projectKey": "DOSC", "repoSlug": "backend-api" },
    { "projectKey": "PLATFORM", "repoSlug": "react-Test" },
    { "projectKey": "PLATFORM", "repoSlug": "backend-api" }
  ]
}
```

**Resolved targets:** `DOSC/react-Test`, `DOSC/backend-api`, `PLATFORM/react-Test`, `PLATFORM/backend-api`.

---

## Use Case 4 — All repos in specific projects (Tier 2, project-scoped discovery)

Projects selected but no specific repos — system discovers **all** repos under those projects, then filters to repos the developer actually worked in.

**.env**

```
BITBUCKET_PROJECT_KEYS=DOSC
BITBUCKET_PROJECTS=
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27",
  "projectKeys": ["DOSC"]
}
```

**Resolved targets:** Every repo inside `DOSC` where the developer has a commit or merged PR in the date window.

---

## Use Case 5 — Full auto-discover (Tier 3)

Nothing provided at all. The system fetches each developer's recently-active repos via `/profile/recent/repos`.

**.env**

```
BITBUCKET_PROJECT_KEYS=
BITBUCKET_PROJECTS=
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27"
}
```

**Resolved targets:** Repos the selected developers have recently contributed to, per Bitbucket's profile API.

---

## Use Case 6 — Env-pinned repos, no UI override (Tier 1 via env)

Repos are fixed via `.env` (e.g. for a CI/scheduled report). Request sends no `projectKeys` / `repoSlugs`.

**.env**

```
BITBUCKET_PROJECT_KEYS=DOSC
BITBUCKET_PROJECTS=DOSC/react-Test
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27"
}
```

**Resolved targets:** `DOSC/react-Test` (env wins; no API listing needed).

---

## Use Case 7 — UI overrides env (ad-hoc investigation)

`.env` has defaults, but the user picks different projects/repos in the UI for a one-off query.

**.env**

```
BITBUCKET_PROJECT_KEYS=DOSC
BITBUCKET_PROJECTS=DOSC/react-Test
```

**POST /api/dashboard/metrics**

```json
{
  "developerIds": ["jsmith", "bjones"],
  "startDate": "2026-04-27",
  "endDate": "2026-05-27",
  "repoTargets": [
    { "projectKey": "PLATFORM", "repoSlug": "infra-core" },
    { "projectKey": "PLATFORM", "repoSlug": "deploy-scripts" }
  ]
}
```

**Resolved targets:** `PLATFORM/infra-core`, `PLATFORM/deploy-scripts` — UI selection completely overrides env.

---

## Supporting endpoints

### List available projects

Used by the UI config panel to populate the project dropdown.

```
GET /api/dashboard/projects
```

**Response**

```json
["DOSC", "PLATFORM", "MOBILE"]
```

> Returns `BITBUCKET_PROJECT_KEYS` from env if set; otherwise pages the Bitbucket API for all visible projects.

---

### List repos for selected projects

Used by the UI to populate the repo checkboxes after projects are chosen.

```
GET /api/dashboard/repos?projectKeys=DOSC,PLATFORM
```

**Response**

```json
[
  { "projectKey": "DOSC", "repoSlug": "react-Test" },
  { "projectKey": "DOSC", "repoSlug": "backend-api" },
  { "projectKey": "PLATFORM", "repoSlug": "infra-core" }
]
```

---

### List all Bitbucket users

Used by the UI user-picker on page load.

```
GET /api/dashboard/users
```

**Response**

```json
[
  {
    "name": "jsmith",
    "displayName": "Jane Smith",
    "emailAddress": "jsmith@company.com"
  },
  {
    "name": "bjones",
    "displayName": "Bob Jones",
    "emailAddress": "bjones@company.com"
  }
]
```

---

## Priority rules (quick reference)

| `repoTargets` in request | `projectKeys` in request | `BITBUCKET_PROJECT_KEYS` (env) | `BITBUCKET_PROJECTS` (env) | Behaviour                                                           |
| :----------------------: | :----------------------: | :----------------------------: | :------------------------: | ------------------------------------------------------------------- |
|            ✓             |           any            |              any               |            any             | Tier 1 via UI — use exact repo pairs, no discovery                  |
|            —             |            ✓             |              any               |            any             | Tier 2 via UI — list all repos in UI projects, filter by activity   |
|            —             |            —             |              any               |             ✓              | Tier 1 via env — use env repo pairs, no discovery                   |
|            —             |            —             |               ✓                |             —              | Tier 2 via env — list all repos in env projects, filter by activity |
|            —             |            —             |               —                |             —              | Tier 3 — auto-discover from user profile                            |
