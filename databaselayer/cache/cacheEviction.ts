import { join } from 'node:path';
import { listCacheMonths, removeCacheDir } from './jsonFileCache.js';

export async function evictOldCacheMonths(
  cacheRoot: string,
  retentionMonths: number,
): Promise<void> {
  const months = await listCacheMonths(cacheRoot);
  if (months.length === 0) return;

  const cutoff = monthCutoff(retentionMonths);
  const toEvict = months.filter((m) => m < cutoff);

  for (const month of toEvict) {
    const dirPath = join(cacheRoot, month);
    await removeCacheDir(dirPath);
    console.info(`[cacheEviction] evicted ${dirPath}`);
  }
}

// Returns the earliest YYYY-MM that should be retained.
// e.g. today=2026-06, retentionMonths=6 → cutoff='2025-12'
function monthCutoff(retentionMonths: number): string {
  const now = new Date();
  const cutoffMs = new Date(now.getFullYear(), now.getMonth() - retentionMonths, 1);
  const y = cutoffMs.getFullYear();
  const m = String(cutoffMs.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
