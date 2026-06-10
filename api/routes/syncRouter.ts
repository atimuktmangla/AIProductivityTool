import { Router, type Request, type Response, type NextFunction } from 'express';
import { readJsonCache, writeJsonCache } from '../../databaselayer/cache/jsonFileCache.js';
import { getAllUsers } from '../../databaselayer/services/bitbucketService.js';
import {
  getSyncStatus,
  triggerSyncForUsers,
  triggerRefreshForUsers,
  cancelSync,
  rescheduleInterval,
  listRunLogs,
  purgeRunLogs,
  dateRange,
  METRICS_SQLITE_TTL_MS,
} from '../../jobs/metricsSync.js';
import { getCachedMetrics } from '../../databaselayer/cache/metricsCache.js';
import { getConfig } from '../../backend/config/env.js';

export const syncRouter = Router();

const SYNC_CONFIG_PATH  = 'data/sync-config.json';
const ALLOWED_INTERVALS = new Set([0, 1440, 10080]);

interface SyncConfigFile {
  developerIds:    string[];
  intervalMinutes: number;
  scheduledTime?:  string; // HH:MM (24h local); optional
}

// ── GET /status ───────────────────────────────────────────────────────────────

syncRouter.get('/status', (_req: Request, res: Response) => {
  res.json(getSyncStatus());
});

// ── POST /trigger ─────────────────────────────────────────────────────────────

syncRouter.post('/trigger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { developerIds } = req.body as { developerIds?: unknown };
    const err = validateDeveloperIds(developerIds);
    if (err) { res.status(400).json({ error: err }); return; }

    triggerSyncForUsers(developerIds as string[]);
    res.status(202).json({ queued: true });
  } catch (e) {
    next(e);
  }
});

// ── DELETE /run ───────────────────────────────────────────────────────────────

syncRouter.delete('/run', (_req: Request, res: Response) => {
  const status = getSyncStatus();
  if (!status.running) {
    res.status(404).json({ error: 'no_active_run', detail: 'No sync is currently running.' });
    return;
  }
  cancelSync();
  res.json({ cancelled: true, detail: 'Cancel requested. Current batch will complete; subsequent batches will be skipped.' });
});

// ── POST /trigger-all ─────────────────────────────────────────────────────────

syncRouter.post('/trigger-all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = getSyncStatus();
    if (status.running) {
      res.status(409).json({ error: 'sync_in_progress', runId: status.activeUsers });
      return;
    }

    const users = await getAllUsers();
    if (users.length === 0) {
      res.status(400).json({ error: 'no_users_found', detail: 'Bitbucket returned no users.' });
      return;
    }

    const developerIds = users.map((u) => u.name);
    triggerSyncForUsers(developerIds);
    res.status(202).json({ queued: true, total: developerIds.length });
  } catch (e) {
    next(e);
  }
});

// ── GET /config ───────────────────────────────────────────────────────────────

syncRouter.get('/config', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let file: SyncConfigFile | null = null;
    try {
      file = await readJsonCache<SyncConfigFile>(SYNC_CONFIG_PATH);
    } catch {
      // Unreadable or corrupt config — fall through to env fallback
    }
    if (file) {
      res.json(file);
      return;
    }
    // Env fallback
    const { syncDeveloperIds, syncIntervalMinutes } = getConfig();
    res.json({ developerIds: syncDeveloperIds, intervalMinutes: syncIntervalMinutes });
  } catch (e) {
    next(e);
  }
});

// ── POST /config ──────────────────────────────────────────────────────────────

syncRouter.post('/config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { developerIds?: unknown; intervalMinutes?: unknown; scheduledTime?: unknown };

    const idErr = validateDeveloperIds(body.developerIds);
    if (idErr) { res.status(400).json({ error: idErr }); return; }

    const intervalMinutes = Number(body.intervalMinutes);
    if (!Number.isInteger(intervalMinutes) || !ALLOWED_INTERVALS.has(intervalMinutes)) {
      res.status(400).json({ error: 'intervalMinutes must be 0, 1440 (daily), or 10080 (weekly)' });
      return;
    }

    const rawTime = typeof body.scheduledTime === 'string' ? body.scheduledTime.trim() : '';
    if (rawTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime)) {
      res.status(400).json({ error: 'scheduledTime must be HH:MM in 24-hour format (e.g. "02:00")' });
      return;
    }
    // scheduledTime only meaningful when interval is set
    const scheduledTime = intervalMinutes > 0 ? rawTime : '';

    const config: SyncConfigFile = {
      developerIds: body.developerIds as string[],
      intervalMinutes,
      ...(scheduledTime ? { scheduledTime } : {}),
    };

    await writeJsonCache<SyncConfigFile>(SYNC_CONFIG_PATH, config);
    rescheduleInterval(intervalMinutes, config.developerIds, scheduledTime);
    res.json(config);
  } catch (e) {
    next(e);
  }
});

// ── GET /logs ─────────────────────────────────────────────────────────────────

syncRouter.get('/logs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const logs = await listRunLogs(50);
    res.json(logs);
  } catch (e) {
    next(e);
  }
});

// ── DELETE /logs ──────────────────────────────────────────────────────────────

syncRouter.delete('/logs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await purgeRunLogs();
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

// ── GET /cache-coverage ───────────────────────────────────────────────────────

syncRouter.get('/cache-coverage', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let configuredUserIds: string[] = [];
    try {
      const file = await readJsonCache<{ developerIds: string[] }>(SYNC_CONFIG_PATH);
      configuredUserIds = file?.developerIds ?? [];
    } catch {
      // Unreadable config — treat as no users
    }

    if (configuredUserIds.length === 0) {
      res.json({ configuredUsers: 0, cachedUsers: 0, uncachedUsers: [], staleUsers: [] });
      return;
    }

    const { startDate, endDate } = dateRange();
    const { hits, misses } = await getCachedMetrics(configuredUserIds, startDate, endDate, METRICS_SQLITE_TTL_MS);

    let staleUsers: string[] = [];
    if (METRICS_SQLITE_TTL_MS > 0) {
      const VERY_OLD = Date.now();
      const { hits: allHits } = await getCachedMetrics(configuredUserIds, startDate, endDate, VERY_OLD);
      const anyIds = new Set(allHits.map((h) => h.developerId));
      staleUsers = misses.filter((id) => anyIds.has(id));
    }
    const uncachedUsers = misses.filter((id) => !staleUsers.includes(id));

    res.json({
      configuredUsers: configuredUserIds.length,
      cachedUsers:     hits.length,
      uncachedUsers,
      staleUsers,
    });
  } catch (e) {
    next(e);
  }
});

// ── POST /refresh ─────────────────────────────────────────────────────────────

syncRouter.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (getSyncStatus().running) {
      res.status(409).json({ error: 'A sync is already running' });
      return;
    }

    const body = req.body as { developerIds?: unknown; scope?: unknown };
    const scopeRaw = typeof body.scope === 'string' ? body.scope : 'current-month';
    if (scopeRaw !== 'current-month' && scopeRaw !== 'full') {
      res.status(400).json({ error: 'scope must be current-month or full' });
      return;
    }
    const scope = scopeRaw as 'current-month' | 'full';

    let developerIds: string[] = [];
    if (Array.isArray(body.developerIds) && body.developerIds.length > 0) {
      const err = validateDeveloperIds(body.developerIds);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
      developerIds = body.developerIds as string[];
    } else {
      try {
        const file = await readJsonCache<{ developerIds: string[] }>(SYNC_CONFIG_PATH);
        developerIds = file?.developerIds ?? [];
      } catch {
        // Unreadable config
      }
    }

    if (developerIds.length === 0) {
      res.status(400).json({ error: 'No users configured' });
      return;
    }

    triggerRefreshForUsers(developerIds, scope);
    res.status(202).json({ queued: developerIds.length, scope });
  } catch (e) {
    next(e);
  }
});

// ── POST /warmup ──────────────────────────────────────────────────────────────

syncRouter.post('/warmup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (getSyncStatus().running) {
      res.status(409).json({ error: 'A sync is already running' });
      return;
    }

    const body = req.body as { developerIds?: unknown };
    let configuredUserIds: string[] = [];

    if (Array.isArray(body.developerIds) && body.developerIds.length > 0) {
      const err = validateDeveloperIds(body.developerIds);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
      configuredUserIds = body.developerIds as string[];
    } else {
      try {
        const file = await readJsonCache<{ developerIds: string[] }>(SYNC_CONFIG_PATH);
        configuredUserIds = file?.developerIds ?? [];
      } catch {
        // Unreadable config — treat as no users
      }
    }

    if (configuredUserIds.length === 0) {
      res.status(400).json({ error: 'No users configured' });
      return;
    }

    const { startDate, endDate } = dateRange();
    const { hits, misses } = await getCachedMetrics(configuredUserIds, startDate, endDate, METRICS_SQLITE_TTL_MS);

    if (misses.length === 0) {
      res.status(200).json({ skipped: hits.length, queued: 0, queuedUsers: [] });
      return;
    }

    triggerSyncForUsers(misses);
    res.status(202).json({ skipped: hits.length, queued: misses.length, queuedUsers: misses });
  } catch (e) {
    next(e);
  }
});

// ── Validation ────────────────────────────────────────────────────────────────

function validateDeveloperIds(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return 'developerIds must be a non-empty array of strings';
  }
  if (value.some((id) => typeof id !== 'string' || !id.trim())) {
    return 'every entry in developerIds must be a non-empty string';
  }
  return null;
}
