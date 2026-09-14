import { join } from 'node:path';
import { getConfig } from '../../backend/config/env.js';
import { METRICS_CACHE_TTL_MS } from '../../backend/config/cacheTtl.js';
import { readJsonCache, writeJsonCache } from './jsonFileCache.js';
import { getIssueChangelog } from '../services/jiraService.js';
import type { JiraIssueWithChangelog } from '../../types/index.js';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function issueMonth(issue: JiraIssueWithChangelog): string {
  return (issue.fields.updated ?? issue.fields.created).slice(0, 7);
}

function isClosedMonth(month: string): boolean {
  return month < currentMonth();
}

function safeKey(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '_');
}

function changelogCachePath(cacheDir: string, issueKey: string): string {
  return join(cacheDir, 'jira-changelog', `${safeKey(issueKey)}.json`);
}

interface ChangelogCacheEnvelope {
  issue:    JiraIssueWithChangelog;
  cachedAt: number;
  month:    string;
}

export async function getCachedIssueChangelog(
  issueKey: string,
): Promise<JiraIssueWithChangelog | null> {
  const { cacheDir } = getConfig();
  const path = changelogCachePath(cacheDir, issueKey);

  const envelope = await readJsonCache<ChangelogCacheEnvelope>(path);
  if (envelope) {
    if (isClosedMonth(envelope.month)) return envelope.issue;
    if (Date.now() - envelope.cachedAt < METRICS_CACHE_TTL_MS) return envelope.issue;
  }

  const live = await getIssueChangelog(issueKey);
  if (!live) return null;

  const month = issueMonth(live);
  const toWrite: ChangelogCacheEnvelope = { issue: live, cachedAt: Date.now(), month };

  if (isClosedMonth(month)) {
    if (!envelope) await writeJsonCache(path, toWrite);
    return live;
  }

  await writeJsonCache(path, toWrite);
  return live;
}
