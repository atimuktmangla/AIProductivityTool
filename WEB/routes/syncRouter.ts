import { Router, type Request, type Response, type NextFunction } from 'express';
import { readJsonCache, writeJsonCache } from '../../DB/cache/jsonFileCache.js';
import {
  getSyncStatus,
  triggerSyncForUsers,
  rescheduleInterval,
  listRunLogs,
  purgeRunLogs,
} from '../../jobs/metricsSync.js';
import { getConfig } from '../../BL/config/env.js';

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
