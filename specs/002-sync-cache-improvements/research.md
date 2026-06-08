# Phase 0 Research: Sync Cache Improvements

**Feature**: `002-sync-cache-improvements`
**Date**: 2026-06-08

---

## Decision 1 — Cache TTL for cache-skip and warm-up

**Decision**: Use `METRICS_CACHE_TTL_MS = 60 * 60 * 1000` (1 hour) as the single freshness threshold for both the cache-skip path in `runSync()` and the warm-up endpoint's miss-detection.

**Rationale**: The dashboard already uses this 1-hour TTL in `metricsRouter.ts`. Reusing the same threshold means the warm-up endpoint and the dashboard agree on what "fresh" means — a user served from cache in the UI will not be re-fetched by a warm-up run triggered seconds later. A new, separate constant would create drift risk.

**Alternatives considered**:
- Configurable per-run TTL via the trigger request body — rejected (adds API surface; no stated requirement for it; YAGNI).
- Using a longer TTL for warm-up (e.g., 24 h) — rejected (would cause the warm-up to skip users that the dashboard would re-fetch live, defeating the purpose).

---

## Decision 2 — Where to define `METRICS_CACHE_TTL_MS`

**Decision**: Define `METRICS_CACHE_TTL_MS = 60 * 60 * 1000` as a module-level constant in `jobs/metricsSync.ts`. The router (`WEB/routes/metricsRouter.ts`) keeps its own local constant with the same value.

**Rationale**: Importing the constant from the router into `metricsSync.ts` would introduce a circular dependency chain (`metricsSync` → `metricsRouter` → `metricsSync`). Extracting it to `BL/config/env.ts` is the cleanest long-term solution but touches a shared module unnecessarily for a single numeric constant. Duplicating a well-named constant in two files is the simplest approach that avoids the cycle (Principle V).

**Alternatives considered**:
- Extract to `BL/config/env.ts` as a named export — technically correct but increases blast radius of this PR; deferred to a future cleanup.
- Import from router — rejected (circular import).

---

## Decision 3 — `source` field storage in SQLite

**Decision**: Add `source?: 'live' | 'cache'` to the `SyncBatchLog` interface as an optional field. Store it inside the existing `batches_json` column (no schema migration required).

**Rationale**: The `sync_run_logs` table stores `batches_json` as a free-form JSON string. Adding a new optional field to the serialised batch object is backwards-compatible: existing stored rows without `source` will deserialise with `source: undefined`, which is valid TypeScript. No `ALTER TABLE` statement is needed. This satisfies Principle V (simplest approach) and Principle VI (no new tables).

**Alternatives considered**:
- Add a separate `source` column to the `sync_run_logs` table — rejected (requires `ALTER TABLE` on a `:memory:` DB that resets on restart; no query benefit since source is batch-level, not run-level).
- Store source as a top-level run field — rejected (source varies per-user within a batch; run level is too coarse).

---

## Decision 4 — `dateRange()` reuse in syncRouter

**Decision**: Export `dateRange()` from `jobs/metricsSync.ts` and import it in `WEB/routes/syncRouter.ts` for use in `/cache-coverage` and `/warmup`.

**Rationale**: Both the coverage endpoint and the warm-up endpoint must compute the same 90-day window used by the sync job. Duplicating the 3-line helper would risk drift. Exporting it is the minimal change.

**Alternatives considered**:
- Duplicate the helper in `syncRouter.ts` — rejected (duplication risk; the date window is a business rule, not a utility).
- Move it to a shared `BL/utils/dateRange.ts` — rejected (over-engineering a 3-line function for one new caller).

---

## Decision 5 — PowerShell script `.env` parsing

**Decision**: The script reads the `.env` file from the project root using a simple line-by-line `KEY=VALUE` parser (ignoring comments and blank lines). Falls back to `localhost:3000` if the file is absent or the `PORT`/`VITE_DEV_PORT` key is not found.

**Rationale**: The existing `.env` file uses standard dotenv format. PowerShell 5.1 has no built-in dotenv parser, but a 5-line regex-based parser handles the common case. No third-party module is needed (Principle V).

**Alternatives considered**:
- Require the user to pass the base URL as a script argument — valid, but increases setup friction for Task Scheduler registration.
- Use `dotenv` npm package from Node — not applicable (pure PowerShell script).

---

## Decision 6 — Warmup endpoint returns 202 (not 200)

**Decision**: `POST /warmup` returns HTTP 202 Accepted when users are queued, and HTTP 200 OK when all users are already cached (nothing queued). Returns HTTP 409 when running, HTTP 400 when no config.

**Rationale**: 202 signals "accepted but not yet complete" — consistent with `POST /trigger` which also returns 202. The PowerShell script treats any 2xx as success (exit 0).

**Alternatives considered**:
- Always return 200 — less semantically accurate; 202 is the established pattern in this codebase.
