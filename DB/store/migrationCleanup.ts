import { readJsonCache, writeJsonCache, removeCacheDir } from '../cache/jsonFileCache.js';

const SENTINEL = 'data/.migrated-to-sqlite';
const LEGACY_METRICS_DIR = 'data/cache/metrics-result';
const LEGACY_LOGS_DIR    = 'data/sync-logs';

/**
 * One-time cleanup of legacy JSON cache files on first startup after migration.
 * Gated by sentinel file data/.migrated-to-sqlite — present means already done.
 * Never throws: any deletion failure is logged as a warning and execution continues.
 */
export async function runMigrationCleanup(): Promise<void> {
  const existing = await readJsonCache<{ migratedAt: string }>(SENTINEL);
  if (existing !== null) return;

  try {
    await removeCacheDir(LEGACY_METRICS_DIR);
  } catch (err) {
    console.warn('[migration] failed to remove legacy metrics dir:', err instanceof Error ? err.message : String(err));
  }

  try {
    await removeCacheDir(LEGACY_LOGS_DIR);
  } catch (err) {
    console.warn('[migration] failed to remove legacy logs dir:', err instanceof Error ? err.message : String(err));
  }

  await writeJsonCache(SENTINEL, { migratedAt: new Date().toISOString() });
  console.log('[migration] legacy JSON cache directories removed; sentinel written');
}
