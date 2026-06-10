# Implementation Plan: Delta Cache Strategy

**Branch**: `004-delta-cache-strategy` | **Date**: 2026-06-10 | **Spec**: [spec.md](spec.md)

## Summary

Extend the metrics cache stack so repeat runs are cheap:

1. **Durable SQLite** — default no age expiry; rolling-90 stable cache key.
2. **Current-month refresh** — on rolling hit with advanced window end, merge delta slice only.
3. **Delta upstream** — open PRs, reviewed PRs, Jira search use monthly JSON cursors.

Builds on `003-performance-resilience` month JSON caches and file-backed `appStore`.

## Technical Context

**Stack**: TypeScript 5.5, Node 18+, Express, better-sqlite3, Vitest  
**Storage**: `app-store.sqlite` + `data/cache/{YYYY-MM}/` JSON envelopes  
**No new production dependencies**

## Constitution Check

| Principle | Status |
|-----------|--------|
| I Traceability | REQ-004-FR-* tags + `@req` tests |
| V Simplicity | Reuse bitbucketCache patterns for new envelopes |
| VI SQLite law | Single appStore; no metrics-result JSON |

## Project Structure

```text
backend/config/cacheTtl.ts          # TTL default 0
backend/metrics/windowKind.ts       # rolling-90 detection
backend/metrics/metricsMerge.ts     # merge partial aggregation
backend/metrics/monthSlice.ts       # calendar month helpers
databaselayer/cache/metricsCache.ts # resolve + refresh
databaselayer/cache/openPrCache.ts  # delta open PRs
databaselayer/cache/reviewedPrCache.ts
databaselayer/cache/jiraSearchCache.ts
databaselayer/store/appStore.ts     # window_kind column
jobs/metricsSync.ts                 # shared resolve
api/routes/metricsRouter.ts
api/routes/syncRouter.ts            # POST /refresh
```

## Phase Mapping

| Phase | User Story | Deliverables |
|-------|------------|--------------|
| 1 | US1 | TTL=0, rolling-90 lookup/write |
| 2 | US2 | Window-end merge, current month column |
| 3 | US3 | Delta caches + aggregator wiring |
| 4 | Polish | REQ tags, traceability, quickstart |
