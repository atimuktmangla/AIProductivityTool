import { getConfig } from '../backend/config/env.js';
import { aggregateMetrics } from '../backend/metrics/aggregator.js';
import { getCachedMetrics, setCachedMetrics } from '../databaselayer/cache/metricsCache.js';
import { readJsonCache } from '../databaselayer/cache/jsonFileCache.js';
import { getDb } from '../databaselayer/store/inMemoryDb.js';

export const METRICS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — matches dashboard TTL

// ── Module-level state ────────────────────────────────────────────────────────

let running            = false;
let cancelRequested    = false;
let lastRunAt:   number | null = null;
let nextRunAt:   number | null = null;
let runStartedAt: number | null = null;
let activeUsers:      string[] = [];
let completedUsers:   string[] = [];
let failedUsers:      string[] = [];
let totalSyncUsers:   number = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let timeoutHandle:  ReturnType<typeof setTimeout>  | null = null;
let configuredUsers:    string[] = [];
let configuredInterval: number   = 0;
let configuredTime:     string   = ''; // HH:MM (24h); empty = no wall-clock alignment

const BATCH_SIZE = 6;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SyncStatus {
  running:          boolean;
  lastRunAt:        number | null;
  nextRunAt:        number | null;
  runStartedAt:     number | null;
  activeUsers:      string[];
  completedUsers:   string[];
  failedUsers:      string[];
  totalSyncUsers:   number;
  configuredUsers:  string[];
  intervalMinutes:  number;
  scheduledTime:    string; // HH:MM (24h); empty = no wall-clock alignment
}

export interface SyncBatchLog {
  batchIndex:  number;
  userIds:     string[];
  startedAt:   string;
  finishedAt:  string;
  durationMs:  number;
  status:      'ok' | 'error';
  error?:      string;
  source?:     'live' | 'cache'; // present when runSync() processed this batch
}

export interface CacheCoverage {
  configuredUsers: number;
  cachedUsers:     number;
  uncachedUsers:   string[];
  staleUsers:      string[];
}

export interface WarmupResult {
  skipped:     number;
  queued:      number;
  queuedUsers: string[];
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
  scheduledTime?:  string; // HH:MM (24h local time); optional
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns ms until the next occurrence of HH:MM local time.
 * If that time has already passed today, returns ms until tomorrow's occurrence.
 */
function msUntilScheduledTime(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function clearHandles(): void {
  if (intervalHandle !== null) { clearInterval(intervalHandle); intervalHandle = null; }
  if (timeoutHandle  !== null) { clearTimeout(timeoutHandle);   timeoutHandle  = null; }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function dateRange(): { startDate: string; endDate: string } {
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

async function readSyncConfig(): Promise<SyncConfig | null> {
  return readJsonCache<SyncConfig>(syncConfigPath());
}

export async function writeRunLog(log: SyncRunLog): Promise<void> {
  const db = getDb();
  db.prepare(
    'INSERT OR REPLACE INTO sync_run_logs (run_id, started_at, finished_at, duration_ms, total_users, batches_json) VALUES (?,?,?,?,?,?)',
  ).run(log.runId, log.startedAt, log.finishedAt, log.durationMs, log.totalUsers, JSON.stringify(log.batches));
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
  activeUsers     = [];
  completedUsers  = [];
  failedUsers     = [];
  totalSyncUsers  = developerIds.length;

  const startDate = dateRange().startDate;
  const endDate   = dateRange().endDate;
  const chunks    = chunkArray(developerIds, BATCH_SIZE);
  const runId     = runIdFromDate(new Date(startedAt));

  console.log(`[sync] starting run ${runId} — ${developerIds.length} users in ${chunks.length} batch(es), ${startDate} → ${endDate}`);

  const batchLogs: SyncBatchLog[] = [];

  cancelRequested = false;

  try {
    // Process each batch of 6 users in parallel; batches run sequentially.
    for (let i = 0; i < chunks.length; i++) {
      if (cancelRequested) {
        console.log(`[sync] run ${runId} cancelled before batch ${i + 1}`);
        break;
      }
      const batch      = chunks[i];
      const batchStart = Date.now();

      activeUsers = [...batch];
      console.log(`[sync] batch ${i + 1}/${chunks.length} — ${batch.length} users in parallel`);

      const USER_TIMEOUT_MS = 5 * 60_000; // 5 minutes per user
      const results = await Promise.allSettled(
        batch.map(async (userId) => {
          // Cache-skip: promote fresh cache hits without calling the upstream API
          try {
            const { hits } = await getCachedMetrics([userId], startDate, endDate, METRICS_CACHE_TTL_MS);
            if (hits.length > 0) {
              console.log(`[sync] user ${userId} — cache hit, skipping fetch`);
              return { userId, source: 'cache' as const };
            }
          } catch {
            // Fail-open: if the cache check throws, fall through to a live fetch
          }

          const userStart = Date.now();
          console.log(`[sync] user ${userId} — start`);
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`timed out after ${USER_TIMEOUT_MS / 60_000} min`)), USER_TIMEOUT_MS),
          );
          const result = await Promise.race([
            aggregateMetrics({ developerIds: [userId], startDate, endDate }),
            timeout,
          ]);
          await setCachedMetrics([userId], startDate, endDate, result.current);
          console.log(`[sync] user ${userId} — done in ${((Date.now() - userStart) / 1000).toFixed(1)}s`);
          return { userId, source: 'live' as const };
        }),
      );

      activeUsers = [];
      const batchUserLogs: Array<{ userId: string; status: 'ok' | 'error'; source?: 'live' | 'cache'; error?: string }> = results.map((r, idx) => {
        const userId = batch[idx];
        if (r.status === 'fulfilled') {
          completedUsers = [...completedUsers, userId];
          return { userId, status: 'ok' as const, source: r.value.source };
        } else {
          const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
          failedUsers = [...failedUsers, userId];
          console.error(`[sync] user ${userId} — failed:`, message);
          return { userId, status: 'error' as const, error: message };
        }
      });

      const durationMs    = Date.now() - batchStart;
      const batchHasError = batchUserLogs.some((u) => u.status === 'error');
      const batchSource   = batchUserLogs.every((u) => u.source === 'cache') ? 'cache' : 'live';
      console.log(`[sync] batch ${i + 1}/${chunks.length} done in ${(durationMs / 1000).toFixed(1)}s`);
      batchLogs.push({
        batchIndex: i,
        userIds:    batch,
        startedAt:  new Date(batchStart).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs,
        status:     batchHasError ? 'error' : 'ok',
        source:     batchSource,
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
    running          = false;
    cancelRequested  = false;
    runStartedAt     = null;
    activeUsers      = [];
  }
}

// ── Public exports ────────────────────────────────────────────────────────────

export function getSyncStatus(): SyncStatus {
  return {
    running,
    lastRunAt,
    nextRunAt,
    runStartedAt,
    activeUsers:     [...activeUsers],
    completedUsers:  completedUsers.slice(-50),
    failedUsers:     [...failedUsers],
    totalSyncUsers,
    configuredUsers,
    intervalMinutes: configuredInterval,
    scheduledTime:   configuredTime,
  };
}

/**
 * Requests cancellation of the active sync run.
 * The current batch completes; the next batch is skipped.
 * No-op when no run is active.
 */
export function cancelSync(): void {
  if (running) cancelRequested = true;
}

/** Triggers a sync for the given developer IDs. Non-blocking — does not await. */
export function triggerSyncForUsers(developerIds: string[]): void {
  configuredUsers = developerIds;
  // Fire and forget; errors are logged inside runSync
  runSync(developerIds).catch((e) => console.error('[sync] trigger error:', e));
}

/**
 * Replaces the running schedule. Pass intervalMinutes=0 to stop recurring syncs.
 * When scheduledTime (HH:MM, 24h local) is provided the first run is delayed until
 * that wall-clock time; subsequent runs fire every intervalMinutes thereafter so they
 * stay aligned to the same time each day/week even after a server restart.
 */
export function rescheduleInterval(
  intervalMinutes: number,
  developerIds: string[],
  scheduledTime = '',
): void {
  clearHandles();
  configuredUsers    = developerIds;
  configuredInterval = intervalMinutes;
  configuredTime     = scheduledTime;
  nextRunAt          = null;

  if (intervalMinutes <= 0 || developerIds.length === 0) return;

  const ms = intervalMinutes * 60 * 1000;

  const startRecurring = () => {
    nextRunAt = Date.now() + ms;
    intervalHandle = setInterval(() => {
      nextRunAt = Date.now() + ms;
      runSync().catch((e) => console.error('[sync] interval error:', e));
    }, ms);
  };

  if (scheduledTime) {
    const delay = msUntilScheduledTime(scheduledTime);
    nextRunAt   = Date.now() + delay;
    console.log(`[sync] rescheduled every ${intervalMinutes} min at ${scheduledTime} for ${developerIds.length} users (first run in ${Math.round(delay / 60_000)} min)`);
    timeoutHandle = setTimeout(() => {
      timeoutHandle = null;
      runSync().catch((e) => console.error('[sync] scheduled error:', e));
      startRecurring();
    }, delay);
  } else {
    console.log(`[sync] rescheduled every ${intervalMinutes} min for ${developerIds.length} users`);
    startRecurring();
  }
}

/**
 * Returns the last maxCount run logs ordered by startedAt descending.
 */
export async function listRunLogs(maxCount = 50): Promise<SyncRunLog[]> {
  type Row = { run_id: string; started_at: string; finished_at: string; duration_ms: number; total_users: number; batches_json: string };
  const rows = getDb()
    .prepare<[number], Row>('SELECT * FROM sync_run_logs ORDER BY started_at DESC LIMIT ?')
    .all(maxCount);
  return rows.map((r) => ({
    runId:      r.run_id,
    startedAt:  r.started_at,
    finishedAt: r.finished_at,
    durationMs: r.duration_ms,
    totalUsers: r.total_users,
    batches:    JSON.parse(r.batches_json) as SyncBatchLog[],
  }));
}

/**
 * Removes all run log entries from the in-memory store.
 */
export async function purgeRunLogs(): Promise<void> {
  getDb().prepare('DELETE FROM sync_run_logs').run();
}

/**
 * Starts the background metrics sync job on server startup.
 * - When scheduledTime is set: waits until that wall-clock time for the first run,
 *   then repeats every intervalMinutes (stays aligned to the same time after restarts).
 * - When no scheduledTime: runs once after 5 s, then every intervalMinutes.
 * No-op when developer IDs or interval are not configured.
 */
export async function startMetricsSyncJob(): Promise<void> {
  const fileConfig  = await readSyncConfig();
  const envConfig   = getConfig();
  const devIds      = fileConfig?.developerIds    ?? envConfig.syncDeveloperIds;
  const intervalMin = fileConfig?.intervalMinutes ?? envConfig.syncIntervalMinutes;
  const schedTime   = fileConfig?.scheduledTime   ?? '';

  configuredUsers    = devIds;
  configuredInterval = intervalMin;
  configuredTime     = schedTime;

  if (devIds.length === 0 || intervalMin <= 0) {
    console.log('[sync] disabled (no developer IDs or interval configured)');
    return;
  }

  if (schedTime) {
    // Wall-clock alignment: no immediate startup run — wait for the scheduled time.
    rescheduleInterval(intervalMin, devIds, schedTime);
  } else {
    // Legacy behaviour: fire once after 5 s, then on the interval.
    console.log(`[sync] scheduled every ${intervalMin} min for ${devIds.length} users`);
    const ms = intervalMin * 60 * 1000;
    nextRunAt = Date.now() + ms + 5_000;
    setTimeout(() => {
      runSync().catch((e) => console.error('[sync] startup error:', e));
    }, 5_000);
    intervalHandle = setInterval(() => {
      nextRunAt = Date.now() + ms;
      runSync().catch((e) => console.error('[sync] interval error:', e));
    }, ms);
  }
}
