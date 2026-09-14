# AI Developer Productivity Dashboard — Documentation

## Overview

This tool gives engineering managers and team leads a real-time, quantitative view of developer productivity by connecting directly to the team's on-premises **Jira Server** and **Bitbucket Server (Stash)**. No third-party SaaS, no data leaving the network, no manual data entry — every number is derived automatically from existing engineering activity.

---

## Why This Tool Exists — Value Proposition for Management

### Problems it solves

| Pain point | How the tool helps |
|---|---|
| "I don't know how productive the team actually is" | Objective output metrics (commits, PRs, lines changed) for any date window |
| Retros feel anecdotal | Cycle time and pickup delay are measured, not estimated |
| Bug spikes are hard to predict | Bug-ratio trend visible as a Code Quality sub-score over time |
| PR review bottlenecks are invisible | Pickup speed and review lifecycle pinpoint exactly where PRs stall |
| Engineering effort mix is unknown | Jira Category Allocation shows Feature vs. Bug vs. Debt percentage |
| Manual status reporting consumes time | Dashboard auto-refreshes from live data — no spreadsheets |
| Comparing sprints or quarters | Period-over-period comparison with delta indicators |

### What it is NOT

- It is not a surveillance or surveillance-adjacent tool. Numbers reflect team patterns, not individual performance scores.
- It does not replace code review judgment. Review depth counts actions, not quality of feedback.
- It is not a replacement for retros or 1:1s — it surfaces data to make those conversations more grounded.
- Spec-driven metrics measure process adherence, not developer competence. Regressions may reflect ambiguous specifications, not implementation errors.

### Management presentation talking points

1. **Zero new tooling cost** — runs on your existing Jira and Bitbucket infrastructure.
2. **No data leaves the network** — all API calls are inbound from the tool to your on-prem servers.
3. **Configurable scope** — works at the repo level, project level, or org-wide.
4. **Actionable signals** — each widget is designed around a question managers already ask.
5. **Export to CSV** — data can be pasted into existing sprint review decks.

---

## Role of Jira and Bitbucket

### Bitbucket (primary source)

Bitbucket provides every code-activity signal:

| Data fetched | Used for |
|---|---|
| Commits (author, timestamp, message) | Total commits count; Jira key extraction from commit messages |
| Merged PRs (created/closed dates, author) | Cycle time, pickup delay, review lifecycle, PR count |
| Open PRs (created date, author) | Stale PR detection |
| PR activities (COMMENTED, REVIEWED, APPROVED, RESCOPED events) | Review depth, rework rate, pickup delay timestamps |
| PR diffs (lines added/removed per file) | Lines changed, avg PR size |
| User list (admin API) | Populates the Team Members picker |
| Project list | Populates the Projects picker |
| Repo list per project | Populates the Repos picker; Tier 2 discovery |
| User profile / recent repos | Tier 3 auto-discovery of repos a developer has worked in |

### Jira (secondary source)

Jira provides context that Bitbucket alone cannot:

| Data fetched | Used for |
|---|---|
| Issues by key (from commit messages) | Maps commits to work types (Feature / Bug / Debt) |
| Issues assigned to developer in date range | Ensures issues not referenced in commits are still counted |
| Issue type (Story, Bug, Task, etc.) | Drives Jira Category Allocation pie chart |
| Labels | Used together with issue type to classify Infra & Debt |
| Issue changelog (`?expand=changelog`) | Spec-driven metrics only — status transition history for phased lead time and regression detection |

Jira and Bitbucket are joined on Jira issue keys embedded in commit messages (e.g. `SS-1234 fix login timeout`). Issues found via both paths are deduplicated.

---

## Dashboard Widgets

### 1. Filter Panel (left sidebar)

**Purpose:** Scopes every widget on the page to specific people, repos, and dates.

**Controls:**

| Control | What it does |
|---|---|
| Team Members | Multi-select developers by display name. Searches across all Bitbucket users. |
| Projects | Select one or more Bitbucket project keys (e.g. SS, ENT-LMS). All repos in those projects are included. |
| Repos | Pin specific PROJECT/repo-slug pairs. Takes priority over project-level selection. |
| Date range | Start and end date with presets: Last 30 days, Last 90 days, Current Quarter. |
| Run Report | Triggers the API call. Results are cached in session so re-opening the tab restores the last view. |

**Repo resolution priority (Tier 1 → 2 → 3):**
- Tier 1: specific repos selected → use exactly those
- Tier 2: project keys selected → enumerate all repos in those projects
- Tier 3: nothing selected → use each developer's recently accessed repos from their Bitbucket profile

---

### 2. Throughput Overview

**Purpose:** Top-line team output summary — the "how much did we ship" answer.

**Metrics:**

| Metric | Definition | Data source |
|---|---|---|
| Total Commits | Sum of all commits by selected developers in scoped repos and date range | Bitbucket commits API |
| Lines Added | Sum of `+` diff lines across all merged PRs | Bitbucket PR diff API |
| Lines Deleted | Sum of `-` diff lines across all merged PRs | Bitbucket PR diff API |
| Avg Cycle Time | Mean PR working-hours from creation to merge, adjusted for weekends and ~2.75 leave days/month | Computed from PR timestamps |

**Delta indicators:** If a comparison date range is set in the filter panel, green/red deltas appear next to each metric showing change from the previous period. For Avg Cycle Time, a decrease (faster) is shown in green.

**How to read it:** A high commit count with a low cycle time indicates a healthy, fast-moving team. Rising cycle time alongside rising lines-added often indicates PRs are getting too large — cross-reference with Avg PR Size in the contributor table.

---

### 3. Workflow Cycle Track

**Purpose:** Breaks total cycle time into three stages so you can see where PRs stall.

**Stages:**

| Stage | Measured as | Green | Amber | Red |
|---|---|---|---|---|
| Pickup Speed | PR created → first reviewer action (Mon–Fri 09–17) | ≤ 4 hrs | 4–8 hrs | > 8 hrs |
| Review Quality | First reviewer comment → merge (Mon–Fri 09–17) | ≤ 8 hrs | 8–16 hrs | > 16 hrs |
| Total Cycle Time | PR created → merge, leave-adjusted (Mon–Fri 09–17) | ≤ 24 hrs | 24–40 hrs | > 40 hrs |

**Bar chart:** When multiple developers are selected, a bar chart compares the team average for all three stages side-by-side.

**How to diagnose problems:**
- High Pickup Speed + normal Review Quality → reviewers are slow to pick up, not slow to complete
- Normal Pickup Speed + high Review Quality → review conversations are long (many back-and-forth cycles, or infrequent re-reviews)
- High Total Cycle Time but normal sub-stages → PRs are being opened and sat on before anyone looks

---

### 4. Code Quality Score

**Purpose:** A single 0–100 score that proxies code quality using signals already present in Jira and Bitbucket — no static analysis tools required.

**Composite formula — four equal-weighted signals (25% each):**

| Signal | Weight | Definition |
|---|---|---|
| Critical / Security resolution | 25% | Effective resolution rate for Jira issues, with a **2.5× multiplier** for BlackDuck, CVE, customer-reported, RCA, or incident tickets. Null when no Jira issues exist (excluded from composite). |
| Approval rate | 25% | % of merged PRs approved by a human within a 24-hour SLA. Rubber-stamp approvals (< 5 min + zero reviewer comments) count as 50% credit. Null when no PRs exist. |
| PR focus | 25% | Sigmoid decay on average lines changed: `round(100 / (1 + e^((avgLines − 500) / 100)))`. ≤ 200 lines ≈ 100, 500 lines = 50, ≥ 800 lines ≈ 0. Null when no PRs exist. |
| Low rework & stability | 25% | Exponential penalty on RESCOPED events per PR: `round(100 × 2^(−avgRescopedPerPR))`. 0 rescopes = 100; penalty doubles per rescope. Defaults to 100 when no PRs. |

When a signal is null (no data), the remaining signals are re-normalised to sum to 100% so the composite always reflects only measurable dimensions.

**Bug ratio** (`bugs / totalIssues`) is returned as an informational field displayed alongside the score — it is not part of the composite.

**Thresholds:** ≥ 75 = Good (green), 50–74 = Fair (amber), < 50 = Needs work (red).

**Visualisations:**
- **Gauge** — team average composite score
- **Sub-score bars** — all four signal scores shown individually
- **Radar chart** — team average across all four axes
- **Horizontal bar chart** — per-developer composite scores (multi-developer view only)

**Limitations:** Critical resolution signal depends on Jira issues being linked to commits or assigned correctly. Teams with inconsistent Jira hygiene may see inflated scores.

---

### 5. Jira Category Allocation

**Purpose:** Shows what type of work the team is actually doing, as classified by Jira issue type.

**Categories:**

| Category | Colour | Issue types included |
|---|---|---|
| Features | Blue | Story, New Feature, Epic, Task, Sub-story |
| Bugs | Red | Bug |
| Infra & Debt | Amber | Improvement, Sub-task, Technical Debt, Infrastructure, Support, and any issue with an `infra` or `debt` label |

**Source:** Issues are collected two ways — Jira keys extracted from commit messages, and issues assigned to each developer in the date window — then deduplicated.

**How to read it:** A healthy team typically shows 60–70% Features, 10–20% Bugs, 15–25% Infra/Debt. A team consistently over 30% Bugs is carrying a quality problem. A team under 10% Infra/Debt is likely accumulating technical debt that will surface as a future quality problem.

---

### 6. Team Contributors Table

**Purpose:** Full per-developer breakdown, sortable by any column. The raw data behind every summary widget.

**Columns:**

| Column | Definition |
|---|---|
| Developer | Display name and Bitbucket slug. Click to open the detail drawer. |
| Commits | Total commits in date range across scoped repos. |
| Lines ± | Lines added (green) / deleted (red) with a mini proportional balance bar. |
| Cycle (hrs) | Avg leave-adjusted working hours from PR creation to merge. |
| Pickup (hrs) | Avg working hours until first reviewer action. |
| Review lifecycle (hrs) | Avg working hours from first comment to merge. |
| Review depth | Avg reviewer actions (comments/approvals/reviews) per PR. |
| Work type | Mini stacked bar — blue: Features, red: Bugs, amber: Infra/Debt. |
| Stale PRs | Count of open PRs older than the threshold (default: 3 business days). Shown amber when > 0. |
| Avg PR size | Mean total lines changed per PR. ⚑ flag when > 400 lines. |
| Quality | Composite code quality badge (0–100). |

**Sorting:** Click any column header to sort. Click again to reverse. Defaults to Commits descending.

**Export CSV:** Downloads all visible rows with all numeric columns as a CSV file (`team-metrics.csv`).

---

### 7. Contributor Detail Drawer

**Purpose:** Full drill-down for a single developer. Opens by clicking their name in the table.

**Sections:**

| Section | Contents |
|---|---|
| Quick stats | Commits, PRs merged, Lines added, Lines removed |
| Cycle time (avg) | Pickup delay, Review lifecycle, Total cycle, Review depth |
| Work type | Feature / Bug / Infra & Debt issue counts as chips |
| Code quality | Composite score badge + Bug ratio, Review depth, Rework rate bars |
| Pull requests | Full list of merged PRs with title (linked to Bitbucket), repo, state badge, created date, cycle time, and lines changed |

Close with the × button, click outside, or press Escape.

---

### 8. Spec-Driven Metrics Panel (when `SPEC_METRICS_ENABLED=true`)

**Purpose:** Measures how well the team builds to specification — phase-by-phase lead time, spec waste, and first-pass yield. Enabled by setting `SPEC_METRICS_ENABLED=true` in the backend `.env`.

**Phased Lead Time:**

| Phase | Measured as | What it reveals |
|---|---|---|
| Spec Definition | Ticket created → spec-approved status | Time spent writing and getting the spec signed off |
| Implementation | Spec approved → PR merged | Pure coding + review time against a locked spec |
| Verification | Verification entry → ticket done | Time spent validating the implementation against the spec |

**Spec Waste Signals:**

| Signal | Definition | What it reveals |
|---|---|---|
| Clarification Delay | Cumulative working hours spent in Blocked/Awaiting-Clarification status | How much time is lost to incomplete specifications upstream |
| Spec Regressions | Count of Verification → In Progress transitions | The spec was not met on first pass; implementation had to restart |
| Post-merge Rework | Commit messages after PR merge matching churn keywords (`fix spec`, `per feedback`, `scoping change`, etc.) | Rework that slipped through review before the spec failure was caught |

**Spec Adherence Score (0–100):**

The composite score applies an exponential penalty per regression (`100 × 2^−n`) plus a linear 5-point deduction per post-merge rework commit. A perfect score means the implementation reached QA on the first pass and no rework was needed after merge.

| Score | Rating |
|---|---|
| ≥ 90 | Excellent — spec was clear and implementation matched |
| 70–89 | Good — minor clarifications needed |
| 50–69 | Fair — one or more regressions indicate spec gaps |
| < 50 | Needs attention — recurring spec failures; review specification process |

**First-pass Yield (FPY):** `true` when `specRegressions === 0` and `postMergeReworkCommits === 0`. A team-level FPY rate of ≥ 80% is the LinearB-equivalent target for spec-driven environments.

**How to diagnose problems:**
- High Spec Definition Time → too much back-and-forth before specs are approved; consider a structured spec review process
- High Clarification Delay → specs are being approved before they are actually clear; engineers are unblocking themselves reactively
- Spec Regressions > 0 → a ticket was sent back from QA; the spec did not cover the tested requirement
- Post-merge Rework > 0 but Regressions = 0 → small spec misses caught in review or post-release, not in formal QA

**Note:** Spec-driven metrics require the Jira workflow to include the status names configured in `.env` (`SPEC_APPROVED_STATUS`, `SPEC_VERIFICATION_STATUS`, `SPEC_DONE_STATUS`, `SPEC_BLOCKED_STATUS`). Tickets that never reach a configured status record 0 for that phase — this does not mean the phase was fast.

---

## Known Gaps and Planned Enhancements

### Current limitations

| Gap | Impact | Notes |
|---|---|---|
| No trend / time-series view | Can't see if cycle time is improving week-over-week | Currently only point-in-time snapshots |
| Bug ratio relies on Jira discipline | Teams with inconsistent Jira hygiene get misleading Code Quality scores | No workaround without external static analysis |
| Leave adjustment is a fixed estimate | 2.75 leave/holiday days per month is a team average, not per-person | Does not account for individual vacation calendars |
| No reviewer-side metrics | Shows how fast the author's PRs are reviewed, not how fast each person reviews others' PRs | Reviewer analytics would require a separate query path |
| RESCOPED detection depends on Bitbucket activity events | Some Bitbucket Server versions may not emit RESCOPED for all scope-change scenarios | Low rework score may be understated |
| No sprint/milestone scoping | Date range is calendar-based; cannot scope to a specific Jira sprint | Would require Jira sprint API integration |
| Single-team scope | No cross-team or org-level aggregation | Multiple teams would require running separate reports |
| No alerting | Stale PR count is visible but no notification is sent | Would require a scheduled job or webhook integration |

### Planned enhancements (priority order)

1. **Trend charts** — line charts showing cycle time, code quality, and throughput across rolling weeks or sprint boundaries.
2. **Reviewer analytics** — track how quickly each developer reviews others' PRs; identify review bottlenecks by person.
3. **Sprint scoping** — integrate Jira sprint API so the date range can be replaced with a sprint selector.
4. **Threshold configuration UI** — let managers set custom thresholds for cycle time benchmarks and stale PR alerts directly in the UI (currently env-var only).
5. **Slack / Teams alerts** — daily digest or threshold-breach notification for stale PRs and quality score drops.
6. **Per-repo breakdown** — show which repos contribute the most to slow cycle times or bug volume.
7. **Team comparison view** — side-by-side metrics for two or more teams.
8. **Personal access token rotation UI** — currently requires editing the `.env` file; a settings page would simplify token management.
9. **AI-generated narrative summaries** — the `/api/dashboard/insights` endpoint already calls Claude to produce natural-language summaries; surfacing these in the UI would make reports more shareable with non-technical stakeholders.
10. **Spec-driven dashboard panel** — a dedicated UI section for phased lead time bars, team FPY rate, and per-developer spec adherence scores (metrics are already computed; UI panel is pending).
11. **Spec regression drill-down** — click a regression count to see the exact Jira status transitions and timestamps that triggered it.

---

## Architecture Summary (for technical stakeholders)

```
Browser (React + Recharts)
  └── Vite dev server :5173  (proxies /api/* → :3000)

Express API :3000
  ├── api layer            — routes, auth middleware, rate limiter, sanitiser
  ├── backend layer        — metric aggregation, cycle time, code quality, work classification
  └── databaselayer layer  — Bitbucket + Jira REST clients, TTL cache, retry logic

On-premises Bitbucket Server  ←→  On-premises Jira Server
```

- All credentials stored in `.env` (never committed).
- All API calls use PATs (Bearer tokens) over HTTPS; self-signed certificates are tolerated.
- Responses are cached in-process with a configurable TTL (default 5 min for user/project lists, 2 min for activity probes).
- Developer aggregations run with a configurable concurrency limit (default 4 parallel) to avoid overwhelming on-prem servers.
