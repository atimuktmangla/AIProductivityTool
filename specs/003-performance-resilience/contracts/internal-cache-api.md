# Internal Contract: Cache Modules

**Feature**: `003-performance-resilience`
**Date**: 2026-06-10

---

## Module: `databaselayer/cache/jiraChangelogCache.ts` (new)

### Export

```ts
export async function getCachedIssueChangelog(
  issueKey: string,
): Promise<JiraIssueWithChangelog | null>;
```

### Cache key layout

```
{cacheDir}/{YYYY-MM}/jira-changelog/{safeKey(issueKey)}.json
```

Month derived from issue `fields.updated` on write (or current month if unavailable).

### Freshness

| Month state | Behaviour |
|---|---|
| Closed (`month < currentMonth()`) | Write-once; always serve from file |
| Current month | Serve if `cachedAt` within `METRICS_CACHE_TTL_MS`; else refetch |

### Miss path

1. Call `getIssueChangelog(issueKey)` from `jiraService.ts`.
2. On success, write cache file atomically via `writeJsonCache`.
3. On failure, return `null` (unchanged semantics).

---

## Module: `backend/config/cacheTtl.ts` (new)

```ts
export const METRICS_CACHE_TTL_MS = 60 * 60 * 1000;
```

Single source of truth — replaces local constants in `metricsRouter.ts` and `metricsSync.ts`.

---

## Module: `databaselayer/store/appStore.ts` (Phase 4 — rename from inMemoryDb.ts)

### Export

```ts
export function initAppStore(): void;
export function getDb(): Database.Database;
export function _resetForTesting(): void;

/** @deprecated use initAppStore */
export const initInMemoryDb = initAppStore;
```

### Open sequence

1. Resolve path from `APP_STORE_PATH` (default `data/cache/app-store.sqlite`).
2. Ensure parent directory exists.
3. `new Database(path)` + `PRAGMA journal_mode = WAL`.
4. Run existing `SCHEMA` DDL.

### Failure

Throw structured error → `server.ts` logs and `process.exit(1)`.

---

## Aggregator commit path (US3 — documentation only)

`totalCommits` computed as:
```ts
totalCommits: prBundles.reduce((s, b) => s + b.commitCount, 0)
```

No import of `getCachedCommitsByAuthor` in `aggregator.ts`.
