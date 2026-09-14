/** Jira changelog JSON cache TTL (1 hour). */
export const METRICS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * SQLite metrics result age-based expiry. Default 0 = never expire by age.
 * Set METRICS_SQLITE_TTL_MS env (ms) to re-enable time-based invalidation.
 */
export const METRICS_SQLITE_TTL_MS = parseTtlMs(process.env.METRICS_SQLITE_TTL_MS, 0);

function parseTtlMs(raw: string | undefined, defaultMs: number): number {
  if (raw === undefined || raw.trim() === '') return defaultMs;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultMs;
}
