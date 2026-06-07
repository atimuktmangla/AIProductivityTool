# AI Productivity Tool

> Engineering productivity dashboard for on-premises Jira Server & Bitbucket Server

---

## Overview

A full-stack internal tool that gives engineering managers and tech leads a single view of developer throughput, code review health, and work allocation — pulling live data directly from your on-prem Atlassian stack with no cloud dependency.

---

## Key metrics

```
┌──────────────────┬──────────────────────────────────────────────────────────┐
│ Metric           │ What it tells you                                        │
├──────────────────┼──────────────────────────────────────────────────────────┤
│ Commits          │ Raw output volume per developer                          │
│ Lines changed    │ Code churn — added vs. deleted, with balance bar         │
│ PRs reviewed     │ Merged PRs authored by others where this dev participated│
│ Cycle time       │ How long PRs take end-to-end (leave-adjusted)            │
│ Pickup delay     │ How long PRs sit waiting for a first reviewer            │
│ Review lifecycle │ How long active review takes (first comment → merge)     │
│ Review depth     │ Average number of human review actions per PR            │
│ Work type        │ Features / Bugs / Infra breakdown from Jira issue types  │
│ Code quality     │ 0–100 composite: security resolution, approval rate,     │
│                  │ PR focus, and rework stability                           │
└──────────────────┴──────────────────────────────────────────────────────────┘
```

---

## Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| Backend      | Node.js 18 · Express · TypeScript (strict)                       |
| HTTP client  | Axios · `rejectUnauthorized: false` for on-prem TLS              |
| Data sources | Jira Server REST API v2 · Bitbucket Server (Stash) REST API v1.0 |
| Frontend     | React 18 · TypeScript · Vite                                     |
| Charts       | Recharts (PieChart, BarChart)                                    |
| State        | `useReducer` — fully typed `DashboardState`                      |

---

## Dashboard sections

### Throughput Overview

Four KPI stat cards showing total commits, lines added, lines deleted, and average cycle time across the selected team.

### Workflow Cycle Track

Sequential stage pipeline showing average hours at each SDLC stage with colour-coded performance ratings:

- **Green** — on track (pickup ≤ 4 h, review ≤ 8 h, cycle ≤ 24 h)
- **Amber** — needs attention
- **Red** — at risk

### Jira Category Allocation

Donut chart and percentage bars breaking down issues by work type (features, bugs, infra/debt).

### Team Contributors

Full-width sortable table. Click any column header to sort. Each row includes:

- Avatar initials + developer ID
- Commit count
- Lines added/deleted with inline balance bar
- All time metrics
- Mini work-type sparkline

---

## Getting started

```bash
# 1. Configure
cp .env.example .env
# edit .env with your Jira and Bitbucket credentials

# 2. Backend
npm install && npm run dev

# 3. Frontend (new terminal)
cd UI && npm install && npm run dev

# Open http://localhost:5173
```

---

## Configuration (`.env`)

```bash
JIRA_BASE_URL=https://jira.yourcompany.com
JIRA_TOKEN=<jira-personal-access-token>

BITBUCKET_BASE_URL=https://bitbucket.yourcompany.com
BITBUCKET_TOKEN=<bitbucket-personal-access-token>

# Option A — pin exact repos (fastest, no discovery)
BITBUCKET_PROJECTS=PROJ/backend-api,PROJ/frontend-app

# Option B — scope to project keys (repos discovered per-user)
BITBUCKET_PROJECT_KEYS=PROJ,PLATFORM

# Leave both empty for full auto-discovery from each user's profile

JIRA_PAGE_SIZE=500
PORT=3000
```

Personal Access Tokens (PATs) are used — no OAuth setup required. Jira PAT: **Profile → Personal Access Tokens**. Bitbucket PAT: **Account → Personal Access Tokens**.

---

## Project structure

```
server.ts                       ← Express app entry point
types/index.ts                  ← shared TypeScript interfaces

WEB/                            ← HTTP layer
├── routes/metricsRouter.ts     ← GET /users, /projects, /repos  POST /metrics
└── middleware/errorHandler.ts

BL/                             ← Business logic layer
├── config/env.ts               ← fail-fast env validation
└── metrics/
    ├── aggregator.ts           ← orchestration (Promise.all per dev) + repo resolution
    ├── cycleTime.ts            ← working hours + leave discount
    ├── reviewDepth.ts          ← human review action count
    └── workType.ts             ← Jira issue type classifier

DB/                             ← Data access layer
├── client/atlassianFetch.ts    ← axios + on-prem TLS
├── errors/AtlassianHttpError.ts
└── services/
    ├── jiraService.ts          ← JQL search with pagination
    └── bitbucketService.ts     ← commits, PRs, activities, diffs, projects, repos

UI/src/                         ← React frontend
├── hooks/useDashboard.ts       ← typed useReducer state machine
└── components/
    ├── Dashboard.tsx
    ├── FilterPanel.tsx
    ├── UserPicker.tsx          ← live user directory, searchable
    ├── DateRangePicker.tsx     ← presets: last 30d / quarter / 90d
    ├── RepoPicker.tsx          ← project pills + repo checkboxes
    ├── ThroughputOverview.tsx
    ├── WorkflowCycleTrack.tsx
    ├── WorkTypeChart.tsx
    └── ContributorTable.tsx    ← sortable, sparklines
```

---

## API

```
GET  /health
GET  /api/dashboard/users
GET  /api/dashboard/projects
GET  /api/dashboard/repos?projectKeys=DOSC,PLATFORM
POST /api/dashboard/metrics
     body: { developerIds: string[], startDate: string, endDate: string,
             repoTargets?: { projectKey: string; repoSlug: string }[],
             projectKeys?: string[] }
```

See [README.md](../README.md) for full request/response schemas.

---

## Docs

| Document                                                            | Description                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------ |
| [README.md](../README.md)                                           | Quick start, config reference, API reference           |
| [docs/FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md)                       | Product requirements, data flow, known limitations     |
| [docs/DETAILED_DESIGN.md](DETAILED_DESIGN.md)                       | Component design, algorithm details, extension guide   |
| [docs/SEQUENCE_DIAGRAM.md](SEQUENCE_DIAGRAM.md)                     | Mermaid sequence diagrams for all major flows          |
| [docs/api-usecases.md](api-usecases.md)                             | Concrete API examples for all repo-targeting scenarios |
| [docs/repo-resolution-flowcharts.md](repo-resolution-flowcharts.md) | Decision flowcharts for repo resolution tiers          |
| [docs/JQL_EXAMPLES.md](JQL_EXAMPLES.md)                             | JQL query library for Jira                             |
