# Quickstart Validation Guide: In-Memory SQLite Cache Migration

**Feature**: 001-sqlite-cache-migration  
**Date**: 2026-06-07

---

## Prerequisites

- Node.js v18.20.8 (project-locked version)
- `npm install` completed with `better-sqlite3` in `dependencies`
- `.env` file present (copy from `.env.example`)
- Bitbucket Server + Jira Server credentials configured in `.env` (for live sync scenarios)

---

## Setup: Install `better-sqlite3`

```bash
npm install better-sqlite3
# TypeScript types (confirm whether bundled types are sufficient first):
npm install --save-dev @types/better-sqlite3
npm run build   # must compile without errors
```

---

## Scenario 1: Store initialises on startup (FR-001, SC-007)

**Happy path:**

```bash
npm run dev
# Expected in logs:
# [store] in-memory SQLite initialised
# AIProductivityTool listening on port <PORT>
```

**Fail-fast path** (simulate missing native binary):

```bash
# Rename better-sqlite3 binding to simulate ABI mismatch
mv node_modules/better-sqlite3/build/Release/better_sqlite3.node \
   node_modules/better-sqlite3/build/Release/better_sqlite3.node.bak
npm run dev
# Expected: process exits with non-zero code within 5 seconds
# Expected in logs: structured error message naming the cause
# Restore:
mv node_modules/better-sqlite3/build/Release/better_sqlite3.node.bak \
   node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

---

## Scenario 2: First-startup migration cleanup (FR-009)

```bash
# Create legacy files to simulate pre-migration state
mkdir -p data/cache/metrics-result data/sync-logs
echo '{}' > data/cache/metrics-result/alice__2026-01-01__2026-03-31.json
echo '{}' > data/sync-logs/2026-06-01-10-00-00.json
# Ensure sentinel does NOT exist
rm -f data/.migrated-to-sqlite

npm run dev
# Expected in logs:
# [migration] legacy JSON directories removed
# [migration] sentinel written: data/.migrated-to-sqlite

# Verify cleanup
ls data/cache/metrics-result 2>/dev/null && echo "FAIL: directory still exists" || echo "PASS: directory removed"
ls data/sync-logs 2>/dev/null && echo "FAIL: directory still exists" || echo "PASS: directory removed"
ls data/.migrated-to-sqlite && echo "PASS: sentinel written" || echo "FAIL: sentinel missing"

# Restart — cleanup must NOT run again
npm run dev
# Expected: no migration log lines; sentinel skipped silently
```

---

## Scenario 3: Metrics cache round-trip (FR-002, FR-003, US2)

After a sync has run (see Scenario 5), validate cache hit:

```bash
# POST dashboard metrics request for a synced developer
curl -s -X POST http://localhost:<PORT>/api/dashboard/metrics \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{"developerIds":["<devId>"],"startDate":"<start>","endDate":"<end>"}' \
  | jq '{cacheStatus, cachedAt}'
# Expected: {"cacheStatus":"full","cachedAt":<non-zero timestamp>}
# Response must arrive in under 500 ms (p95 target)
```

---

## Scenario 4: Run log round-trip (FR-004, FR-005, FR-006, US3)

```bash
# Trigger a sync
curl -s -X POST http://localhost:<PORT>/api/dashboard/sync/trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <API_KEY>" \
  -d '{"developerIds":["<devId>"]}' | jq .
# Expected: {"queued":true}

# Wait for sync to complete, then list logs
sleep 30
curl -s http://localhost:<PORT>/api/dashboard/sync/logs \
  -H "Authorization: Bearer <API_KEY>" | jq '.[0] | {runId, totalUsers, batchCount: (.batches | length)}'
# Expected: run appears with correct runId, totalUsers, and at least 1 batch

# Verify no JSON log files were written
ls data/sync-logs/ 2>/dev/null && echo "FAIL: JSON log files found" || echo "PASS: no JSON files"

# Purge logs
curl -s -X DELETE http://localhost:<PORT>/api/dashboard/sync/logs \
  -H "Authorization: Bearer <API_KEY>"
# Expected: 204 No Content

curl -s http://localhost:<PORT>/api/dashboard/sync/logs \
  -H "Authorization: Bearer <API_KEY>" | jq 'length'
# Expected: 0
```

---

## Scenario 5: Startup warm-up repopulates cache (FR-008a, US1 scenario 3)

```bash
# Start server with sync configured
npm run dev
# Expected in logs within 5 seconds of startup:
# [sync] starting run ...

# Within first 5 seconds, cache should be empty → live compute
# After warm-up completes, cache should return hits
```

---

## Scenario 6: Run history is transient (US3 scenario 3)

```bash
# Trigger a sync, wait for completion
# Verify logs appear (see Scenario 4)
# Restart server
npm run dev
curl -s http://localhost:<PORT>/api/dashboard/sync/logs \
  -H "Authorization: Bearer <API_KEY>" | jq 'length'
# Expected: 0  (run history does not persist across restarts — intentional per Principle VI)
```

---

## Automated test suite

```bash
npm test
# Expected: all existing tests pass, traceability checker passes
# New tests added for FR-001 / SC-007 (store init fail-fast) and FR-009 (migration cleanup)
# must also pass
```

---

## No new JSON cache files after migration

```bash
# After any sync run:
ls data/cache/metrics-result/ 2>/dev/null && echo "FAIL: JSON metrics files written" || echo "PASS"
ls data/sync-logs/*.json 2>/dev/null && echo "FAIL: JSON run log files written" || echo "PASS"
```
