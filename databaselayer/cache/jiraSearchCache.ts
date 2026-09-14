import { join } from 'node:path';
import { getConfig } from '../../backend/config/env.js';
import { readJsonCache, writeJsonCache } from './jsonFileCache.js';
import { mergeIssuesByKey, searchIssuesForDeveloper } from '../services/jiraService.js';
import type { RawJiraIssue } from '../../types/index.js';

interface JiraSearchEnvelope {
  issues: RawJiraIssue[];
  cursorUpdatedIso: string;
  cachedAt: number;
}

const CURRENT_MONTH_TTL_MS = 60 * 60 * 1000;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isClosedMonth(month: string): boolean {
  return month < currentMonth();
}

function cachePath(cacheDir: string, month: string, developerId: string): string {
  const safe = developerId.replace(/[/\\:*?"<>|]/g, '_');
  return join(cacheDir, month, 'jira-search', `${safe}.json`);
}

export async function getCachedIssuesForDeveloper(
  developerId: string,
  startDate: string,
  endDate: string,
): Promise<RawJiraIssue[]> {
  const { cacheDir } = getConfig();
  const month = currentMonth();
  const path = cachePath(cacheDir, month, developerId);

  const cached = await readJsonCache<JiraSearchEnvelope>(path);
  if (cached) {
    if (isClosedMonth(month)) return cached.issues;
    if (Date.now() - cached.cachedAt < CURRENT_MONTH_TTL_MS) return cached.issues;
  }

  const deltaStart =
    cached && cached.cursorUpdatedIso > startDate ? cached.cursorUpdatedIso : startDate;

  const live = await searchIssuesForDeveloper(developerId, deltaStart, endDate);
  const merged = mergeIssuesByKey(cached?.issues ?? [], live);

  const cursorUpdatedIso = merged.reduce((max, issue) => {
    const u = issue.fields.updated?.slice(0, 10) ?? startDate;
    return u > max ? u : max;
  }, cached?.cursorUpdatedIso ?? startDate);

  const envelope: JiraSearchEnvelope = {
    issues: merged,
    cursorUpdatedIso,
    cachedAt: Date.now(),
  };

  if (isClosedMonth(month)) {
    if (!cached) await writeJsonCache(path, envelope);
  } else {
    await writeJsonCache(path, envelope);
  }

  return merged;
}
