import { join } from 'node:path';
import { getConfig } from '../../BL/config/env.js';
import { readJsonCache, writeJsonCache } from './jsonFileCache.js';
import {
  getCommitsByAuthor,
  getMergedPullRequestsByAuthor,
  getPRActivities,
  getPRDiffStat,
  getPRCommitCount,
  getReposWorkedByUser,
  filterByUserActivity,
} from '../services/bitbucketService.js';
import type { RawCommit, RawPullRequest, RawActivity, RawDiffStat, RepoTarget } from '../../types/index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns 'YYYY-MM' for the current calendar month. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Returns 'YYYY-MM' from an epoch-ms timestamp. */
function epochToMonth(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Enumerates all YYYY-MM values in [startDate, endDate] (both inclusive). */
function monthsInRange(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.slice(0, 7).split('-').map(Number);
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number);
  const months: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/** A month is "closed" (immutable) when it is strictly before the current month. */
function isClosedMonth(month: string): boolean {
  return month < currentMonth();
}

function safeKey(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_');
}

function commitCachePath(cacheDir: string, month: string, projectKey: string, repoSlug: string, authorSlug: string): string {
  return join(cacheDir, month, 'commits', `${safeKey(projectKey)}__${safeKey(repoSlug)}__${safeKey(authorSlug)}.json`);
}

function mergedPrCachePath(cacheDir: string, month: string, projectKey: string, repoSlug: string, authorSlug: string): string {
  return join(cacheDir, month, 'merged-prs', `${safeKey(projectKey)}__${safeKey(repoSlug)}__${safeKey(authorSlug)}.json`);
}

function repoDiscoveryCachePath(cacheDir: string, month: string, authorSlug: string): string {
  return join(cacheDir, month, 'repo-discovery', `${safeKey(authorSlug)}.json`);
}

// ─── Repo discovery ───────────────────────────────────────────────────────────

interface RepoDiscoveryCacheEnvelope {
  repos:    RepoTarget[];
  cachedAt: number;
}

const REPO_DISCOVERY_TTL_MS = 60 * 60 * 1000; // 1 hour for current month

/**
 * Returns the repos a developer worked in during the given date range.
 * - Closed months: write-once (repos authored in that month never change).
 * - Current month: re-fetches after 1 hour to catch newly active repos.
 *
 * Avoids the O(repos × users) API storm on every request by caching the
 * filterByUserActivity result — the expensive part of Tier-3 discovery.
 */
export async function getCachedReposForUser(
  authorSlug: string,
  startDate: string,
  endDate: string,
): Promise<RepoTarget[]> {
  const { cacheDir } = getConfig();
  const months = monthsInRange(startDate, endDate);
  const repoSet = new Map<string, RepoTarget>();

  for (const month of months) {
    const path = repoDiscoveryCachePath(cacheDir, month, authorSlug);

    if (isClosedMonth(month)) {
      const cached = await readJsonCache<RepoDiscoveryCacheEnvelope>(path);
      if (cached) {
        for (const r of cached.repos) repoSet.set(`${r.projectKey}/${r.repoSlug}`, r);
        continue;
      }
    } else {
      const cached = await readJsonCache<RepoDiscoveryCacheEnvelope>(path);
      if (cached && Date.now() - cached.cachedAt < REPO_DISCOVERY_TTL_MS) {
        for (const r of cached.repos) repoSet.set(`${r.projectKey}/${r.repoSlug}`, r);
        continue;
      }
    }

    // Cache miss or stale — run live discovery for this month's window.
    const monthStart    = month + '-01';
    const monthEnd      = lastDayOfMonth(month);
    const effectiveStart = startDate > monthStart ? startDate : monthStart;
    const effectiveEnd   = endDate   < monthEnd   ? endDate   : monthEnd;

    const repos = await getReposWorkedByUser(authorSlug, effectiveStart, effectiveEnd);
    for (const r of repos) repoSet.set(`${r.projectKey}/${r.repoSlug}`, r);

    const envelope: RepoDiscoveryCacheEnvelope = { repos, cachedAt: Date.now() };
    if (isClosedMonth(month)) {
      await writeJsonCache(path, envelope);
    } else {
      await writeJsonCache(path, envelope);
    }
  }

  return [...repoSet.values()];
}

/**
 * Tier 2 variant of getCachedReposForUser: filters a known candidate repo list
 * by actual authored activity, cached per month to avoid re-running the expensive
 * filterByUserActivity scan on every scheduled sync run.
 *
 * Cache strategy:
 * - All months cached: serve entirely from disk (fast path).
 * - Any month missing: run filterByUserActivity ONCE across the full date range
 *   (same cost as the original uncached call), then write the result into every
 *   missed month's cache file so future runs are fully cached.
 * - Closed months: write-once. Current month: re-fetches after 1 hour.
 */
export async function getCachedFilteredReposForUser(
  authorSlug: string,
  candidates: RepoTarget[],
  startDate: string,
  endDate: string,
): Promise<RepoTarget[]> {
  const { cacheDir } = getConfig();
  const months = monthsInRange(startDate, endDate);
  const repoSet = new Map<string, RepoTarget>();
  const missMonths: string[] = [];

  for (const month of months) {
    const path = repoDiscoveryCachePath(cacheDir, month, authorSlug);
    const cached = await readJsonCache<RepoDiscoveryCacheEnvelope>(path);
    if (cached && (isClosedMonth(month) || Date.now() - cached.cachedAt < REPO_DISCOVERY_TTL_MS)) {
      for (const r of cached.repos) repoSet.set(`${r.projectKey}/${r.repoSlug}`, r);
    } else {
      missMonths.push(month);
    }
  }

  if (missMonths.length === 0) return [...repoSet.values()];

  // One API call covering the full span of all missed months — same cost as the
  // original uncached path, never more. The result is a union across the whole
  // range; we write it into every missed month's file so subsequent runs are cached.
  const liveRepos = await filterByUserActivity(candidates, authorSlug, startDate, endDate);
  for (const r of liveRepos) repoSet.set(`${r.projectKey}/${r.repoSlug}`, r);

  const nowMs = Date.now();
  for (const month of missMonths) {
    const path = repoDiscoveryCachePath(cacheDir, month, authorSlug);
    await writeJsonCache<RepoDiscoveryCacheEnvelope>(path, { repos: liveRepos, cachedAt: nowMs });
  }

  return [...repoSet.values()];
}

// ─── Commits ─────────────────────────────────────────────────────────────────

interface CommitCacheEnvelope {
  commits: RawCommit[];
  cachedAt: number;
}

const COMMIT_CURRENT_MONTH_TTL_MS = 15 * 60 * 1000; // 15 min

/**
 * Returns commits for the given author and date range.
 * - Closed months: served from write-once JSON cache (including empty results).
 * - Current month: served from cache if <15 min old; otherwise full live fetch
 *   and cache refreshed — avoids re-paginating large repos (e.g. monoliths with
 *   600+ commits/month) on every request.
 */
export async function getCachedCommitsByAuthor(
  projectKey: string,
  repoSlug: string,
  authorSlug: string,
  startDate: string,
  endDate: string,
): Promise<RawCommit[]> {
  const { cacheDir } = getConfig();
  const months = monthsInRange(startDate, endDate);
  const all: RawCommit[] = [];

  for (const month of months) {
    const path = commitCachePath(cacheDir, month, projectKey, repoSlug, authorSlug);

    if (isClosedMonth(month)) {
      const cached = await readJsonCache<RawCommit[]>(path);
      if (cached) {
        all.push(...cached);
        continue;
      }
    } else {
      // Current month — serve from cache if fresh enough
      const envelope = await readJsonCache<CommitCacheEnvelope>(path);
      if (envelope && Date.now() - envelope.cachedAt < COMMIT_CURRENT_MONTH_TTL_MS) {
        all.push(...envelope.commits);
        continue;
      }
    }

    // Live fetch — narrow the date range to this month to avoid over-fetching.
    const monthStart = month + '-01';
    const monthEnd   = lastDayOfMonth(month);
    const effectiveStart = startDate > monthStart ? startDate : monthStart;
    const effectiveEnd   = endDate   < monthEnd   ? endDate   : monthEnd;

    const commits = await getCommitsByAuthor(projectKey, repoSlug, authorSlug, effectiveStart, effectiveEnd);
    all.push(...commits);

    if (isClosedMonth(month)) {
      // Write-once for closed months (plain array for backwards compat with existing files).
      await writeJsonCache(path, commits);
    } else {
      // Refresh current-month envelope with new cachedAt timestamp.
      await writeJsonCache<CommitCacheEnvelope>(path, { commits, cachedAt: Date.now() });
    }
  }

  return all;
}

// ─── Merged PRs ──────────────────────────────────────────────────────────────

interface PrDetails {
  activities:  RawActivity[];
  diff:        RawDiffStat;
  commitCount: number;
}

interface EnrichedPR extends RawPullRequest {
  _details?: PrDetails;
}

interface MergedPrCacheEnvelope {
  prs: EnrichedPR[];
  cachedAt: number; // epoch ms — used as delta cursor for current-month re-fetches
}

/**
 * Returns merged PRs authored since startDate. Closed months are served from
 * cache. For the current month, uses cachedAt as a delta cursor so only new
 * PRs are fetched on subsequent calls.
 */
export async function getCachedMergedPRsByAuthor(
  projectKey: string,
  repoSlug: string,
  authorSlug: string,
  startDate: string,
): Promise<RawPullRequest[]> {
  const { cacheDir } = getConfig();
  const endMonth  = currentMonth();
  const months    = monthsInRange(startDate, endMonth + '-01');
  const all: RawPullRequest[] = [];

  for (const month of months) {
    const path = mergedPrCachePath(cacheDir, month, projectKey, repoSlug, authorSlug);

    if (isClosedMonth(month)) {
      const cached = await readJsonCache<MergedPrCacheEnvelope>(path);
      if (cached) {
        all.push(...cached.prs);
        continue;
      }
    }

    // Current month or uncached closed month — fetch live.
    const monthStart     = month + '-01';
    const effectiveStart = startDate > monthStart ? startDate : monthStart;

    // For current month: load existing cached PRs and the delta cursor.
    const existing = isClosedMonth(month)
      ? null
      : await readJsonCache<MergedPrCacheEnvelope>(path);

    // Skip the live delta fetch if the cache is <5 min old — avoids 13+ repo
    // API calls per request just to confirm no new PRs were merged in the last few minutes.
    const MERGED_PR_TTL_MS = 5 * 60 * 1000;
    if (existing && !isClosedMonth(month) && Date.now() - existing.cachedAt < MERGED_PR_TTL_MS) {
      all.push(...existing.prs);
      continue;
    }

    const deltaStart = existing
      ? new Date(existing.cachedAt).toISOString().slice(0, 10)
      : effectiveStart;

    const newPrs = await getMergedPullRequestsByAuthor(projectKey, repoSlug, authorSlug, deltaStart);

    // Merge: new PRs first (sorted newest), then existing (older), deduplicated by ID.
    const merged = dedupeById([...newPrs, ...(existing?.prs ?? [])]);

    // Filter to this month's window.
    const monthMs = { start: new Date(effectiveStart).getTime(), end: new Date(lastDayOfMonth(month) + 'T23:59:59Z').getTime() };
    const inWindow = merged.filter((pr) => {
      const ts = pr.closedDate ?? pr.createdDate;
      return ts >= monthMs.start && ts <= monthMs.end;
    });

    all.push(...inWindow);

    // Persist: always update the envelope (refreshes cachedAt cursor).
    await writeJsonCache<MergedPrCacheEnvelope>(path, { prs: inWindow, cachedAt: Date.now() });
  }

  return all;
}

// ─── PR details (activities + diff) ──────────────────────────────────────────

/**
 * Returns activities, diff, and commit count for a merged PR.
 * Details are stored inline on the PR's `_details` field inside the merged-prs
 * envelope (PROJECT__REPO__USER.json), eliminating the separate pr-details/
 * directory.
 *
 * Lookup order:
 *   1. In-memory: if pr._details is already populated, return it directly.
 *   2. Merged-prs envelope: load the file, find the PR by ID, return _details.
 *   3. Legacy pr-details file (backward compat): migrate into the envelope.
 *   4. Live API: fetch, write back into the envelope.
 *
 * For closed months the envelope is updated once and never re-fetched.
 * For the current month the envelope is refreshed on each merged-prs cache miss
 * (handled by getCachedMergedPRsByAuthor), so details written here persist until
 * the next delta fetch overwrites the file.
 */
export async function getCachedPRDetails(
  projectKey: string,
  repoSlug: string,
  pr: RawPullRequest,
): Promise<{ activities: RawActivity[]; diff: RawDiffStat; commitCount: number }> {
  // 1. Already populated on the in-memory PR object (e.g. just fetched).
  const enriched = pr as EnrichedPR;
  if (enriched._details) return enriched._details;

  const { cacheDir } = getConfig();
  const month = pr.closedDate ? epochToMonth(pr.closedDate) : currentMonth();

  // We need to know the author slug to locate the merged-prs envelope file.
  // RawPullRequest carries author.user.name — use that.
  const authorSlug = pr.author.user.name;
  const envPath    = mergedPrCachePath(cacheDir, month, projectKey, repoSlug, authorSlug);

  // 2. Check the merged-prs envelope for an already-stored _details entry.
  const envelope = await readJsonCache<MergedPrCacheEnvelope>(envPath);
  if (envelope) {
    const hit = envelope.prs.find((p) => p.id === pr.id);
    if (hit?._details) return hit._details;
  }

  // 3. Legacy backward-compat: check old pr-details/ file written by older code.
  const legacyPath = join(cacheDir, month, 'pr-details',
    `${safeKey(projectKey)}__${safeKey(repoSlug)}__${pr.id}.json`);
  interface LegacyEnvelope { activities: RawActivity[]; diff: RawDiffStat; commitCount: number }
  const legacy = await readJsonCache<LegacyEnvelope>(legacyPath);
  if (legacy && legacy.commitCount !== undefined) {
    const details: PrDetails = { activities: legacy.activities, diff: legacy.diff, commitCount: legacy.commitCount };
    // Backfill into the new envelope so subsequent calls skip the legacy file.
    if (envelope) await _writePrDetailsIntoEnvelope(envPath, envelope, pr.id, details);
    return details;
  }

  // 4. Live fetch.
  const [activities, diff, commitCount] = await Promise.all([
    getPRActivities(projectKey, repoSlug, pr.id),
    getPRDiffStat(projectKey, repoSlug, pr.id),
    getPRCommitCount(projectKey, repoSlug, pr.id),
  ]);
  const details: PrDetails = { activities, diff, commitCount };

  // Persist: write _details into the merged-prs envelope.
  if (envelope) {
    await _writePrDetailsIntoEnvelope(envPath, envelope, pr.id, details);
  }

  return details;
}

/** Writes _details onto a single PR entry in the envelope and saves the file. */
async function _writePrDetailsIntoEnvelope(
  envPath: string,
  envelope: MergedPrCacheEnvelope,
  prId: number,
  details: PrDetails,
): Promise<void> {
  const updated = envelope.prs.map((p) =>
    p.id === prId ? { ...p, _details: details } : p,
  );
  await writeJsonCache<MergedPrCacheEnvelope>(envPath, { ...envelope, prs: updated });
}

// ─── Internal utilities ───────────────────────────────────────────────────────

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  return `${month}-${String(last).padStart(2, '0')}`;
}

function dedupeById(prs: RawPullRequest[]): RawPullRequest[] {
  const seen = new Set<number>();
  return prs.filter((pr) => {
    if (seen.has(pr.id)) return false;
    seen.add(pr.id);
    return true;
  });
}
