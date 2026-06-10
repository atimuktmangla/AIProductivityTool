import { join } from 'node:path';
import { getConfig } from '../../backend/config/env.js';
import { readJsonCache, writeJsonCache } from './jsonFileCache.js';
import { getMergedPRsParticipatedByUser } from '../services/bitbucketService.js';
import type { RawPullRequest } from '../../types/index.js';

interface ReviewedPrEnvelope {
  prs: RawPullRequest[];
  cursorUpdatedMs: number;
  cachedAt: number;
}

const CURRENT_MONTH_TTL_MS = 5 * 60 * 1000;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isClosedMonth(month: string): boolean {
  return month < currentMonth();
}

function cachePath(cacheDir: string, month: string, projectKey: string, repoSlug: string, author: string): string {
  const safe = (s: string) => s.replace(/[/\\:*?"<>|]/g, '_');
  return join(cacheDir, month, 'reviewed-prs', `${safe(projectKey)}__${safe(repoSlug)}__${safe(author)}.json`);
}

function dedupeById(prs: RawPullRequest[]): RawPullRequest[] {
  const map = new Map<number, RawPullRequest>();
  for (const pr of prs) map.set(pr.id, pr);
  return [...map.values()];
}

export async function getCachedReviewedPRsByUser(
  projectKey: string,
  repoSlug: string,
  reviewerSlug: string,
  startDate: string,
): Promise<RawPullRequest[]> {
  const { cacheDir } = getConfig();
  const month = currentMonth();
  const path = cachePath(cacheDir, month, projectKey, repoSlug, reviewerSlug);

  const cached = await readJsonCache<ReviewedPrEnvelope>(path);
  if (cached) {
    if (isClosedMonth(month)) return cached.prs;
    if (Date.now() - cached.cachedAt < CURRENT_MONTH_TTL_MS) return cached.prs;
  }

  const deltaStart = cached
    ? new Date(cached.cursorUpdatedMs).toISOString().slice(0, 10)
    : startDate;

  const live = await getMergedPRsParticipatedByUser(projectKey, repoSlug, reviewerSlug, deltaStart);
  const merged = dedupeById([...live, ...(cached?.prs ?? [])]);
  const cursorUpdatedMs = merged.reduce(
    (max, pr) => Math.max(max, pr.updatedDate ?? pr.closedDate ?? pr.createdDate),
    cached?.cursorUpdatedMs ?? 0,
  );

  const envelope: ReviewedPrEnvelope = { prs: merged, cursorUpdatedMs, cachedAt: Date.now() };
  if (isClosedMonth(month)) {
    if (!cached) await writeJsonCache(path, envelope);
  } else {
    await writeJsonCache(path, envelope);
  }

  return merged;
}
