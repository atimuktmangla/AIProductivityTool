# Metrics Sync Job — Operations Guide

## What the job does

The background sync job pre-computes developer metrics for a configured list of users, covering the last 90 days of activity (commits, pull requests, Jira issues). Results are stored in **per-developer JSON files** (`data/cache/metrics-result/{devId}__{start}__{end}.json`) so that dashboard API calls return instantly without hitting Bitbucket or Jira APIs.

Processing order: users are worked through sequentially in groups of 10. Within each user, all API calls (commits, PRs, activities) run in parallel inside `aggregateMetrics()`. A run for 20 users with a ~30 s per-user average takes roughly 10 minutes end to end.

---

## Configuration persistence

Configuration is stored in `data/sync-config.json` — a plain JSON file on disk in the server working directory:

```json
{
  "developerIds": ["alice", "bob", "carol"],
  "intervalMinutes": 1440
}
```

`data/sync-config.json` is written atomically (temp file + rename via `DB/cache/jsonFileCache.ts`) so a crash mid-write cannot corrupt the saved config.

**Once you save a Daily or Weekly schedule from the UI, it survives server restarts.** On every boot `startMetricsSyncJob()` reads this file first and restores the schedule automatically — no manual re-configuration needed.

### Config priority order

| Priority | Source | How set |
|----------|--------|---------|
| 1 (highest) | `data/sync-config.json` | Written by the UI or a direct API call |
| 2 | `SYNC_DEVELOPER_IDS` + `SYNC_INTERVAL_MINUTES` env vars | `.env` file / deployment config |
| 3 (default) | None | Sync disabled (`intervalMinutes = 0`) |

When the file exists it overrides the env vars completely. Deleting the file reverts to env vars on the next restart.

---

## Configuring the schedule from the UI

Navigate to the **Sync Jobs** tab in the dashboard.

### Step-by-step

1. **Select users** — choose one of three modes:
   - *All users* — auto-fetches every Bitbucket user and selects them all
   - *By project* — pick a Bitbucket project key; users from that project appear for selection
   - *Select manually* — multi-select picker for specific usernames

2. **Choose a schedule**:

   | Option | Behaviour | Saved to file? |
   |--------|-----------|----------------|
   | Run once now | Immediate run only; no recurring schedule set | No |
   | Daily (every 24 h) | Runs immediately, then every 24 h | Yes (`intervalMinutes: 1440`) |
   | Weekly (every 7 d) | Runs immediately, then every 7 d | Yes (`intervalMinutes: 10080`) |

3. **Review the Job Summary** — check users, date range, schedule, and processing details.

4. Click **Confirm** to unlock the run button.

5. Click **Save & Run**.

### What happens when you click Save & Run

```
Save & Run clicked
  │
  ├── [Daily/Weekly only] POST /api/dashboard/sync/config
  │     body: { developerIds, intervalMinutes }
  │     → writes data/sync-config.json (persists across restarts)
  │     → calls rescheduleInterval() — replaces the live setInterval
  │
  └── POST /api/dashboard/sync/trigger
        body: { developerIds }
        → fires runSync() immediately (non-blocking)
        → status card updates to "Running"
        → UI polls every 5 s until idle
```

If *Run once now* is selected, only the trigger call is made — no config file is written, and any previously saved recurring schedule is left unchanged.

---

## Startup behaviour

`startMetricsSyncJob()` is called in `server.ts` at process start:

1. Reads `data/sync-config.json`; falls back to env vars if absent.
2. If `developerIds` is empty or `intervalMinutes` is 0, logs "disabled" and stops.
3. Otherwise, schedules a first run 5 seconds after startup (to allow the process to finish initialising), then sets a recurring `setInterval` for every `intervalMinutes` minutes.

This means: deploy, restart, or crash-recover the server — the previously saved daily/weekly schedule resumes automatically within 5 seconds of boot.

---

## Monitoring

### Status card (UI)

The top section of the Sync Jobs page shows the live job state, polling `GET /api/dashboard/sync/status`:

| Field | Meaning |
|-------|---------|
| Running / Idle badge | Whether a run is in progress |
| Last run | Timestamp of the most recent completed run |
| Next run | Estimated time until the next scheduled run |
| Users configured | Count from `configuredUsers` |
| Interval label | "Daily" or "Weekly" if a recurring schedule is active |

While a run is in progress the card also shows a progress bar, per-user chips (done / failed / active), and a live elapsed timer.

### Run history

The bottom of the page shows the last 50 run logs from `data/sync-logs/`. Each row expands to show per-batch detail including which users failed and the error message.

### API endpoints (for scripting or health checks)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/dashboard/sync/status` | Current running state, user lists, timestamps |
| `GET` | `/api/dashboard/sync/config` | Saved config (or env fallback) |
| `POST` | `/api/dashboard/sync/config` | Save config and reschedule |
| `POST` | `/api/dashboard/sync/trigger` | Trigger an immediate run |
| `GET` | `/api/dashboard/sync/logs` | Last 50 run logs |
| `DELETE` | `/api/dashboard/sync/logs` | Purge all run log files |

All endpoints require the `X-Api-Key` header.

`POST /api/dashboard/sync/config` validates that `intervalMinutes` is exactly `0`, `1440`, or `10080`. Any other value returns HTTP 400.

---

## Changing or stopping the schedule

- **Change schedule**: open Sync Jobs, select new users and/or interval, confirm, and click Save & Run. The new config overwrites `data/sync-config.json` and the `setInterval` is replaced immediately.

- **Stop recurring syncs**: the UI has no explicit "disable" button. Use the API directly:

  ```bash
  curl -X POST http://localhost:3000/api/dashboard/sync/config \
    -H "X-Api-Key: <your-key>" \
    -H "Content-Type: application/json" \
    -d '{ "developerIds": [], "intervalMinutes": 0 }'
  ```

  This writes `intervalMinutes: 0` to the file and stops the interval. Note: `developerIds` must be a non-empty array — to simply stop the schedule while keeping the user list, re-send the existing user list with `intervalMinutes: 0`. Alternatively, delete `data/sync-config.json` and set `SYNC_INTERVAL_MINUTES=0` in the env before restarting.

---

## Metrics validation

After each user's metrics are computed, `BL/evals/metricsValidator.ts` runs a sanity check on the output. It does not throw or block the sync — it logs console warnings for any anomalies:

| Check | Threshold |
|-------|-----------|
| `cycleTimeHrs` valid and non-negative | Must be a finite number ≥ 0 |
| `cycleTimeHrs` not unreasonably large | ≤ 2 000 h (~83 calendar days) |
| `pickupDelayHrs` ≤ `cycleTimeHrs` | Timestamps may be wrong if violated |
| `totalCommits` | ≤ 10 000 |
| Total lines changed (added + deleted) | ≤ 500 000 |
| `reviewDepth` | ≤ 200 |
| `codeQuality.score` | 0 – 100 |
| `codeQuality.bugRatio` | 0 – 1 |

If warnings appear in server logs (`[evals] Metric validation warnings: [...]`), investigate the source data for the flagged user — it usually indicates very old open PRs inflating cycle time, or bot accounts included in the user list.

---

## Key files

| File | Role |
|------|------|
| `jobs/metricsSync.ts` | Scheduler, state, batch runner, run log writer |
| `WEB/routes/syncRouter.ts` | API endpoints — config, trigger, status, logs |
| `server.ts` | Calls `startMetricsSyncJob()` at boot |
| `BL/config/env.ts` | Env var defaults (`SYNC_DEVELOPER_IDS`, `SYNC_INTERVAL_MINUTES`) |
| `DB/cache/jsonFileCache.ts` | Atomic file read/write for `data/sync-config.json` |
| `BL/evals/metricsValidator.ts` | Post-run data quality checks |
| `UI/src/components/SyncPage.tsx` | Admin UI page |
| `UI/src/hooks/useSync.ts` | Fetch/poll/save logic for the UI |
| `data/sync-config.json` | Persisted schedule config (created on first save) |
| `data/sync-logs/` | Per-run JSON log files |
