import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import { getConfig } from '../BL/config/env.js';
import { aggregateMetrics } from '../BL/metrics/aggregator.js';
import { setCachedMetrics } from '../DB/cache/metricsCache.js';
import { readJsonCache, writeJsonCache, removeCacheDir } from '../DB/cache/jsonFileCache.js';

// ── Module-level state ────────────────────────────────────────────────────────

let running            = false;
let lastRunAt:   number | null = null;
let nextRunAt:   number | null = null;
let runStartedAt: number | null = null;
let currentUser:      string | null = null;
let completedUsers:   string[] = [];
let failedUsers:      string[] = [];
let totalSyncUsers:   number = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let configuredUsers:    string[] = [];
let configuredInterval: number   = 0;

const BATCH_SIZE = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncStatus {
  running:          boolean;
  lastRunAt:        number | null;
  nextRunAt:        number | null;
  runStartedAt:     number | null;
  currentUser:      string | null;
  completedUsers:   string[];
  failedUsers:      string[];
  totalSyncUsers:   number;
  configuredUsers:  string[];
  intervalMinutes:  number;
}

export interface SyncBatchLog {
  batchIndex:  number;
  userIds:     string[];
  startedAt:   string;
  finishedAt:  string;
  durationMs:  number;
  status:      'ok' | 'error';
  error?:      string;
}

export interface SyncRunLog {
  runId:      string;   // YYYY-MM-DD-HH-mm-ss slug
  startedAt:  string;
  finishedAt: string;
  durationMs: number;
  totalUsers: number;
  batches:    SyncBatchLog[];
}

interface SyncConfig {
  developerIds:    string[];
  intervalMinutes: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function dateRange(): { startDate: string; endDate: string } {
  const end   = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 90);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  };
}

function runIdFromDate(d: Date): string {
  return d.toISOString()
    .replace('T', '-')
    .replace(/:/g, '-')
    .slice(0, 19); // YYYY-MM-DD-HH-mm-ss
}

function syncConfigPath(): string {
  return 'data/sync-config.json';
}

function syncLogsDir(): string {
  return 'data/sync-logs';
}

async function readSyncConfig(): Promise<SyncConfig | null> {
  return readJsonCache<SyncConfig>(syncConfigPath());
}

async function writeRunLog(log: SyncRunLog): Promise<void> {
  const path = join(syncLogsDir(), `${log.runId}.json`);
  await writeJsonCache<SyncRunLog>(path, log);
}

// ── Core sync ─────────────────────────────────────────────────────────────────

async function runSync(overrideDevIds?: string[]): Promise<void> {
  if (running) {
    console.log('[sync] previous run still in progress — skipping');
    return;
  }

  // Resolve developer IDs: explicit override → config file → env
  let developerIds = overrideDevIds ?? [];
  if (developerIds.length === 0) {
    const fileConfig = await readSyncConfig();
    developerIds = fileConfig?.developerIds ?? getConfig().syncDeveloperIds;
  }
  if (developerIds.length === 0) return;

  running = true;
  const startedAt = Date.now();
  runStartedAt    = startedAt;
  currentUser     = null;
  completedUsers  = [];
  failedUsers     = [];
  totalSyncUsers  = developerIds.length;

  const startDate = dateRange().startDate;
  const endDate   = dateRange().endDate;
  const chunks    = chunkArray(developerIds, BATCH_SIZE);
  const runId     = runIdFromDate(new Date(startedAt));

  console.log(`[sync] starting run ${runId} — ${developerIds.length} users in ${chunks.length} batch(es), ${startDate} → ${endDate}`);

  const batchLogs: SyncBatchLog[] = [];

  try {
    // Process users one at a time so currentUser / completedUsers stay accurate.
    // Per-user API calls (commits, PRs, activities) remain internally parallel inside aggregateMetrics.
    for (let i = 0; i < chunks.length; i++) {
      const batch      = chunks[i];
      const batchStart = Date.now();
      const batchUserLogs: Array<{ userId: string; status: 'ok' | 'error'; error?: string }> = [];

      for (const userId of batch) {
        currentUser = userId;
        const userStart = Date.now();
        console.log(`[sync] user ${userId} (${completedUsers.length + failedUsers.length + 1}/${developerIds.length}) — start`);

        try {
          const result = await aggregateMetrics({ developerIds: [userId], startDate, endDate });
          await setCachedMetrics([userId], startDate, endDate, result.current);
          completedUsers = [...completedUsers, userId];
          console.log(`[sync] user ${userId} — done in ${((Date.now() - userStart) / 1000).toFixed(1)}s`);
          batchUserLogs.push({ userId, status: 'ok' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failedUsers = [...failedUsers, userId];
          console.error(`[sync] user ${userId} — failed in ${((Date.now() - userStart) / 1000).toFixed(1)}s:`, message);
          batchUserLogs.push({ userId, status: 'error', error: message });
        }
      }

      const durationMs    = Date.now() - batchStart;
      const batchHasError = batchUserLogs.some((u) => u.status === 'error');
      console.log(`[sync] batch ${i + 1}/${chunks.length} done in ${(durationMs / 1000).toFixed(1)}s`);
      batchLogs.push({
        batchIndex: i,
        userIds:    batch,
        startedAt:  new Date(batchStart).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs,
        status:     batchHasError ? 'error' : 'ok',
        error:      batchHasError
          ? batchUserLogs.filter((u) => u.status === 'error').map((u) => `${u.userId}: ${u.error}`).join('; ')
          : undefined,
      });
    }

    const finishedAt = Date.now();
    console.log(`[sync] run ${runId} done in ${((finishedAt - startedAt) / 1000).toFixed(1)}s`);

    const runLog: SyncRunLog = {
      runId,
      startedAt:  new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      totalUsers: developerIds.length,
      batches:    batchLogs,
    };
    await writeRunLog(runLog).catch((e) => console.warn('[sync] failed to write run log:', e));
    lastRunAt = finishedAt;
  } finally {
    running        = false;
    runStartedAt   = null;
    currentUser    = null;
  }
}

// ── Public exports ────────────────────────────────────────────────────────────

export function getSyncStatus(): SyncStatus {
  return {
    running,
    lastRunAt,
    nextRunAt,
    runStartedAt,
    currentUser,
    completedUsers:  [...completedUsers],
    failedUsers:     [...failedUsers],
    totalSyncUsers,
    configuredUsers,
    intervalMinutes: configuredInterval,
  };
}

/** Triggers a sync for the given developer IDs. Non-blocking — does not await. */
export function triggerSyncForUsers(developerIds: string[]): void {
  configuredUsers = developerIds;
  // Fire and forget; errors are logged inside runSync
  runSync(developerIds).catch((e) => console.error('[sync] trigger error:', e));
}

/** Replaces the running schedule. Pass intervalMinutes=0 to stop recurring syncs. */
export function rescheduleInterval(intervalMinutes: number, developerIds: string[]): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  configuredUsers    = developerIds;
  configuredInterval = intervalMinutes;
  nextRunAt          = null;

  if (intervalMinutes > 0 && developerIds.length > 0) {
    const ms = intervalMinutes * 60 * 1000;
    nextRunAt = Date.now() + ms;
    intervalHandle = setInterval(() => {
      nextRunAt = Date.now() + ms;
      runSync().catch((e) => console.error('[sync] interval error:', e));
    }, ms);
    console.log(`[sync] rescheduled every ${intervalMinutes} min for ${developerIds.length} users`);
  }
}

/**
 * Returns the list of run log files, newest first, up to maxCount.
 */
export async function listRunLogs(maxCount = 50): Promise<SyncRunLog[]> {
  const dir = syncLogsDir();
  let files: string[];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json'))
      .map((e) => e.name)
      .sort()
      .reverse()
      .slice(0, maxCount);
  } catch {
    return [];
  }

  const logs: SyncRunLog[] = [];
  for (const file of files) {
    const log = await readJsonCache<SyncRunLog>(join(dir, file));
    if (log) logs.push(log);
  }
  return logs;
}

/**
 * Deletes all run log files.
 */
export async function purgeRunLogs(): Promise<void> {
  await removeCacheDir(syncLogsDir());
}

/**
 * Starts the background metrics sync job.
 * Runs once immediately on startup (after 5 s), then every syncIntervalMinutes.
 * Reads data/sync-config.json on each tick to pick up runtime config changes.
 * No-op when both SYNC_DEVELOPER_IDS and sync-config.json are empty.
 */
export async function startMetricsSyncJob(): Promise<void> {
  // Prefer persisted config file; fall back to env
  const fileConfig  = await readSyncConfig();
  const envConfig   = getConfig();
  const devIds      = fileConfig?.developerIds ?? envConfig.syncDeveloperIds;
  const intervalMin = fileConfig?.intervalMinutes ?? envConfig.syncIntervalMinutes;

  configuredUsers    = devIds;
  configuredInterval = intervalMin;

  if (devIds.length === 0 || intervalMin <= 0) {
    console.log('[sync] disabled (no developer IDs or interval configured)');
    return;
  }

  console.log(`[sync] scheduled every ${intervalMin} min for ${devIds.length} users`);

  // Run once on startup after a short delay
  setTimeout(() => {
    runSync().catch((e) => console.error('[sync] startup error:', e));
  }, 5_000);

  // Recurring schedule
  const ms = intervalMin * 60 * 1000;
  nextRunAt = Date.now() + ms + 5_000;
  intervalHandle = setInterval(() => {
    nextRunAt = Date.now() + ms;
    runSync().catch((e) => console.error('[sync] interval error:', e));
  }, ms);
}
