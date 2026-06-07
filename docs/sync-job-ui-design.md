# Sync Job Scheduler — UI Design Document

## Overview

The background sync job (`jobs/metricsSync.ts`) pre-computes developer metrics on a schedule so the dashboard returns instantly from cache. Today the job is configured entirely via `.env` variables (`SYNC_DEVELOPER_IDS`, `SYNC_INTERVAL_MINUTES`), which requires a server restart to change. This design adds an admin UI page to manage, trigger, and monitor the sync job without touching the server.

---

## Goals

- Select which users to sync (three modes: all / by project / manual pick)
- Trigger an immediate ad-hoc sync run
- Configure a recurring schedule (daily / weekly) that persists across restarts
- View current job status: running/idle, last run timestamp, next run estimate, user count

## Non-goals

- Per-user granular scheduling (one global schedule only)
- Authentication/authorization — same `X-Api-Key` header as the rest of the API; no separate admin role in v1

---

## Architecture

```
Browser (SyncPage)
    │
    ├── GET  /api/dashboard/sync/status   → current running state, last/next run, users configured
    ├── POST /api/dashboard/sync/trigger  → body: { developerIds } → starts runSync() non-blocking
    ├── GET  /api/dashboard/sync/config   → current config (from data/sync-config.json or env fallback)
    └── POST /api/dashboard/sync/config   → body: { developerIds, intervalMinutes } → writes data/sync-config.json

Server (syncRouter.ts)
    │
    ├── getSyncStatus()       ← exported from jobs/metricsSync.ts
    └── triggerSyncForUsers() ← exported from jobs/metricsSync.ts

jobs/metricsSync.ts  (existing)
    ├── reads data/sync-config.json on each tick (overrides env vars)
    └── exposes getSyncStatus() and triggerSyncForUsers()
```

---

## Backend changes required

### `jobs/metricsSync.ts` — new exports

```typescript
interface SyncStatus {
  running:         boolean;
  lastRunAt:       number | null;   // epoch ms
  nextRunAt:       number | null;   // epoch ms
  configuredUsers: string[];
  intervalMinutes: number;
}

export function getSyncStatus(): SyncStatus

export async function triggerSyncForUsers(developerIds: string[]): Promise<void>
```

- `triggerSyncForUsers` runs `runSync()` with the given ids; non-blocking (does not await)
- On each interval tick, `runSync()` reads `data/sync-config.json` first; if present its `developerIds` and `intervalMinutes` override env values
- `lastRunAt` and `nextRunAt` are tracked in module-level variables

### `WEB/routes/syncRouter.ts` — new file

```
GET  /status   → getSyncStatus()
POST /trigger  → body: { developerIds: string[] } → triggerSyncForUsers(ids)
GET  /config   → read data/sync-config.json (or env fallback values)
POST /config   → body: { developerIds: string[], intervalMinutes: number }
               → write data/sync-config.json
               → reschedule interval if changed
```

All endpoints under `/api/dashboard/sync`, protected by existing `apiKeyAuth` middleware.

### `server.ts`

```typescript
import { syncRouter } from './WEB/routes/syncRouter.js';
app.use('/api/dashboard/sync', syncRouter);
```

---

## Frontend changes required

### Navigation

Add a two-tab nav bar above the existing Dashboard layout in `UI/src/main.tsx`:

```
[ Developer Metrics ]   [ Sync Jobs ]
```

No external router — a single `activePage` state variable in an `App` wrapper component switches between `<Dashboard />` and `<SyncPage />`.

### `UI/src/components/SyncPage.tsx` — layout

```
┌─────────────────────────────────────────────────────────────────┐
│  SYNC JOB STATUS                                                │
│  ● Idle  |  Last run: 2026-06-03 10:47  |  Next: in 47 min     │
│  7 users configured                                             │
├─────────────────────────────────────────────────────────────────┤
│  SELECT USERS TO SYNC                                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [All users]  [By project]  [Select manually]            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  < UserPicker or project dropdown rendered here >               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  SCHEDULE                                                       │
│  ○ Run once now   ○ Daily (every 24h)   ○ Weekly (every 7d)     │
├─────────────────────────────────────────────────────────────────┤
│                              [ Save & Run ]                     │
└─────────────────────────────────────────────────────────────────┘
```

#### User selection modes

| Mode | What it does |
|------|-------------|
| **All users** | Fetches `/api/dashboard/users`, auto-selects all; shows count chip |
| **By project** | Shows project dropdown (fetches `/api/dashboard/projects`); on selection shows UserPicker filtered to all users; passes `projectKeys` to trigger |
| **Select manually** | Standard multi-select UserPicker — same component as the dashboard sidebar |

#### Schedule options

| Option | `intervalMinutes` written to config |
|--------|--------------------------------------|
| Run once now | Not saved — immediate trigger only |
| Daily | 1440 |
| Weekly | 10080 |

"Save & Run" button:
- Always triggers an immediate sync for the selected users
- When Daily/Weekly is chosen: also POSTs to `/sync/config` before triggering
- When Run once: skips the config write

#### Status card

Polls `GET /api/dashboard/sync/status` every 5 seconds while running; reverts to 30-second poll when idle.

Fields displayed:
- Running badge (green pulsing dot) / Idle badge (grey dot)
- Last run: formatted date/time or "Never"
- Next run: relative time (e.g. "in 47 min") or "Not scheduled"
- "N users configured" (from `configuredUsers.length`)

---

## File list

| File | Change |
|------|--------|
| `jobs/metricsSync.ts` | Add `getSyncStatus()`, `triggerSyncForUsers()`, read `data/sync-config.json` |
| `WEB/routes/syncRouter.ts` | New — 4 endpoints |
| `server.ts` | Mount `syncRouter` |
| `UI/src/main.tsx` | Wrap in `App` with nav + `activePage` state |
| `UI/src/hooks/useSync.ts` | New — fetch status (polling), trigger, load/save config |
| `UI/src/components/SyncPage.tsx` | New — full admin page |
| `UI/src/styles.css` | New classes: `.app-nav`, `.sync-page`, `.sync-status-card`, `.sync-badge--running`, `.sync-badge--idle`, `.sync-mode-tabs`, `.sync-schedule` |

Reused without changes:
- `UI/src/components/UserPicker.tsx`
- `UI/src/components/RepoPicker.tsx` (project dropdown part only)

---

## Data flow — trigger a sync

```
User clicks "Save & Run"
  │
  ├── [if Daily/Weekly] POST /api/dashboard/sync/config
  │     { developerIds: [...], intervalMinutes: 1440 }
  │     → writes data/sync-config.json
  │     → reschedules setInterval
  │
  └── POST /api/dashboard/sync/trigger
        { developerIds: [...] }
        → calls triggerSyncForUsers(ids)  (non-blocking)
        → status card starts polling every 5s
        → running badge lights up
        → on completion: badge goes idle, lastRunAt updated
```

---

## Open questions

1. **Admin access control**: Should the Sync Jobs tab be hidden unless an `ADMIN_USERS` env var lists the current user? Not blocking for v1 since the API key gates all `/api` routes.
2. **Sync-config.json vs env**: When both exist, file wins. Should the UI show a warning when env vars are set but overridden by file?
3. **Batch size UI**: BATCH_SIZE is hardcoded to 10. Expose as configurable field in future?
4. **Run history**: Store last N run summaries (user count, duration, errors) for display in the status card?
