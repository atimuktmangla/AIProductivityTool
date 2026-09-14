# Quickstart Validation Guide: Sync Cache Improvements

**Feature**: `002-sync-cache-improvements`
**Date**: 2026-06-08

Use this guide to validate each user story end-to-end after implementation.

---

## Prerequisites

- Server running: `npm run dev` (port 3000 by default)
- At least 5 users configured in `data/sync-config.json`
- `VITE_API_KEY` set in `.env` and matching the server's expected key

---

## Scenario 1 — Progress cap (FR-001, FR-002)

**Goal**: Verify the status payload never exceeds 50 completed users during a large run.

1. Trigger a sync for 80+ users:
   ```
   POST /api/dashboard/sync/trigger
   { "developerIds": ["u1","u2",...,"u80"] }
   ```
2. Poll `GET /api/dashboard/sync/status` while the run is in progress.
3. **Expected**: `completedUsers.length ≤ 50` on every response, even after 60+ users have completed.
4. **Expected**: `totalSyncUsers === 80` throughout.
5. Open the Sync Jobs admin panel and observe the progress chips — at most 50 completed chips visible, no overflow chip.

---

## Scenario 2 — Cache-skip on manual run (FR-003, FR-004)

**Goal**: Verify a repeat sync of already-cached users produces zero upstream API calls.

1. Run a full sync for 5 users and wait for it to complete.
2. Immediately trigger a second sync for the same 5 users.
3. **Expected**: The second run completes in < 5 seconds (no API calls).
4. Open Run History and expand the second run's batch row.
5. **Expected**: Each user entry in the batch shows `source: "cache"`.
6. Check the server log — no `[sync] user X — start` lines for the cached users in the second run.

To test the mixed-cache case:
1. Run a sync for users A, B, C.
2. Wait for cache to age out (> 1 h), or directly test by checking `staleUsers` in the coverage endpoint.
3. Trigger a sync for A, B, C, D, E (D and E never cached).
4. **Expected**: D and E show `source: "live"`, A/B/C show `source: "cache"`.

---

## Scenario 3 — Cache Coverage endpoint (FR-005)

**Goal**: Verify `GET /cache-coverage` returns accurate counts.

1. With 5 users configured and 3 recently synced (< 1 h ago):
   ```
   GET /api/dashboard/sync/cache-coverage
   X-Api-Key: <key>
   ```
2. **Expected**:
   ```json
   {
     "configuredUsers": 5,
     "cachedUsers": 3,
     "uncachedUsers": ["user4", "user5"],
     "staleUsers": []
   }
   ```
3. With no `sync-config.json` present (or empty file):
   ```json
   { "configuredUsers": 0, "cachedUsers": 0, "uncachedUsers": [], "staleUsers": [] }
   ```

---

## Scenario 4 — Warmup endpoint (FR-006)

**Goal**: Verify `POST /warmup` queues only uncached users.

1. With 3 of 5 users cached:
   ```
   POST /api/dashboard/sync/warmup
   X-Api-Key: <key>
   ```
2. **Expected HTTP 202**:
   ```json
   { "skipped": 3, "queued": 2, "queuedUsers": ["user4", "user5"] }
   ```
3. Observe the progress panel — only user4 and user5 appear in the active/completed chips.
4. With all 5 users cached:
   ```
   POST /api/dashboard/sync/warmup
   ```
5. **Expected HTTP 200**:
   ```json
   { "skipped": 5, "queued": 0, "queuedUsers": [] }
   ```
6. With a sync already running, POST again:
7. **Expected HTTP 409**:
   ```json
   { "error": "A sync is already running" }
   ```

---

## Scenario 5 — UI: Cache Coverage card + warmup button (FR-007, FR-008)

**Goal**: Verify the admin UI renders the coverage card and button correctly.

1. Open the Sync Jobs tab in the admin UI.
2. **Expected**: A "Cache Coverage" section shows `N / M users cached` and lists uncached user names (≤ 5 shown, overflow indicated).
3. With uncached users present: the "Warm Missing Cache" button is enabled.
4. Click "Warm Missing Cache" — button shows a loading/disabled state; the progress panel appears for the queued users.
5. With all users cached: the button is disabled with tooltip "All users are cached".
6. While a sync is running: the button is disabled with tooltip "A sync is already running".
7. Leave the panel open for 30 seconds — the coverage card auto-refreshes with updated counts.

---

## Scenario 6 — Scripts (FR-009, FR-010)

**Goal**: Verify `warm-cache.ps1` and `warm-cache.cmd` work correctly.

**Success case** (server running, users need warming):
```powershell
cd C:\path\to\AIProductivityTool
.\scripts\warm-cache.ps1
# Output: Skipped: 3 (cached). Queued: 2.
# Exit: 0
```

**Nothing to warm**:
```powershell
.\scripts\warm-cache.ps1
# Output: Skipped: 5 (cached). Queued: 0. Nothing to warm.
# Exit: 0
```

**Server unreachable**:
```powershell
# Stop the server first
.\scripts\warm-cache.ps1
# Output: Error: Unable to connect to http://localhost:3000. Is the server running?
# Exit: 1
```

**CMD wrapper**:
```cmd
scripts\warm-cache.cmd
REM Same output as PS1 above; exit code propagates
```

**Windows Task Scheduler registration** (manual verification):
1. Open Task Scheduler → Create Basic Task.
2. Action: Start a program → `cmd.exe` → Arguments: `/c "C:\path\to\scripts\warm-cache.cmd"`.
3. Run the task manually and verify it completes with "Last Run Result: 0x0".

---

## Running automated tests

```bash
npm test
```

Expected output:
- All pre-existing tests pass.
- New tests in `tests/unit/syncStatusCap.test.ts`, `syncCacheSkip.test.ts`, `cacheCoverageEndpoint.test.ts`, `warmupEndpoint.test.ts` pass.
- Traceability checker reports zero untested/orphaned/untagged items.
