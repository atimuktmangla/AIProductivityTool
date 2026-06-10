# Quickstart Validation Guide: Performance & Resilience Remediation

**Feature**: `003-performance-resilience`
**Date**: 2026-06-10

Validate each user story after its phase lands. Phases 1–3 do not require the constitution amendment.

---

## Prerequisites

- Server running: `npm run dev`
- Valid `.env` with Jira and Bitbucket credentials
- `X-Api-Key` / `VITE_API_KEY` configured
- At least 3 Bitbucket users with merged PRs in the last 90 days

---

## Scenario 1 — Jira linking without DVCS (FR-001–FR-005, SC-001, SC-006)

**Setup**: Set `JIRA_ISSUE_LINKING_MODE=hybrid` (or `assignee` to force fallback).

1. Check readiness:
   ```
   GET /ready
   ```
   **Expected**: `jiraLinking.mode` reflects config; `connectorAvailable` true or false based on your Jira setup.

2. Run metrics for a developer with assigned Jira tickets (no DVCS):
   ```
   POST /api/dashboard/metrics
   X-Api-Key: <key>
   { "developerIds": ["jsmith"], "startDate": "2026-03-01", "endDate": "2026-06-01" }
   ```
   **Expected**: `workType` counts are non-zero when assignee tickets exist in window.

3. Set `JIRA_ISSUE_LINKING_MODE=connector` on a DVCS-connected instance and re-run.
   **Expected**: Same or superset of issues (no regression).

---

## Scenario 2 — Spec metrics changelog cache (FR-006–FR-009, SC-002)

**Setup**: `SPEC_METRICS_ENABLED=true`

1. Run metrics for 5 developers; note wall-clock time (T1).
2. Immediately re-run the same request (T2).
   **Expected**: T2 ≤ 0.5 × T1 (50% faster per SC-002).
3. Inspect `data/cache/{current-month}/jira-changelog/` — JSON files created for linked issue keys.
4. Disable spec metrics (`SPEC_METRICS_ENABLED=false`); re-run.
   **Expected**: No new changelog cache files written.

---

## Scenario 3 — PR-based commit throughput (FR-010–FR-012, SC-003)

1. Run a 90-day report for a developer active in a large monolith repo.
2. Note `totalCommits` in response — should equal sum of commits on merged PRs, not repo-wide scan.
3. Re-run within 15 minutes.
   **Expected**: Second run ≤ 50% of first run duration; server log shows no `/commits` pagination for aggregator path.

---

## Scenario 4 — Cache survives restart (FR-013–FR-017, SC-004)

**Requires Phase 4** (constitution amendment + `APP_STORE_PATH`).

1. Complete a sync for 10 users; confirm cache hit:
   ```
   POST /api/dashboard/metrics  → cacheStatus: "full"
   ```
2. Stop server (`Ctrl+C`); restart `npm run dev`.
3. Before any new sync, query the same metrics request.
   **Expected**: Response in < 500 ms; `cacheStatus: "full"`; no Bitbucket/Jira fetch lines in server log.

4. Corrupt-store test (optional): rename `app-store.sqlite` to invalid bytes; restart.
   **Expected**: Server exits with structured `[store]` error (FR-016).

---

## Scenario 5 — Regression gate (SC-005)

After each phase:

```bash
npm test
npx tsx scripts/check-traceability.ts
npm run build
cd frontend && npm run build
```

All must pass with zero errors.

---

## Scenario 6 — Baseline spec update (FR-019)

After all phases complete, verify `specs/000-project-baseline/spec.md` §8 Known limitations no longer lists the four remediated items (or marks them as resolved with pointer to 003).
