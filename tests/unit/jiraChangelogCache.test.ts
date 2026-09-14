import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getCachedIssueChangelog } from '../../databaselayer/cache/jiraChangelogCache.js';
import type { JiraIssueWithChangelog } from '../../types/index.js';

const getIssueChangelogMock = vi.fn();
let cacheDir: string;

vi.mock('../../databaselayer/services/jiraService.js', () => ({
  getIssueChangelog: (...args: unknown[]) => getIssueChangelogMock(...args),
}));

vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({ cacheDir }),
}));

function sampleIssue(key: string, updated: string): JiraIssueWithChangelog {
  return {
    key,
    fields: {
      summary: key,
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      assignee: { name: 'dev1', displayName: 'Dev' },
      created: '2026-01-01T00:00:00.000Z',
      updated,
      resolutiondate: '2026-03-02T00:00:00.000Z',
      labels: [],
    },
    changelog: { histories: [] },
  };
}

describe('jiraChangelogCache', () => {
  beforeEach(() => {
    getIssueChangelogMock.mockReset();
    cacheDir = mkdtempSync(join(tmpdir(), 'jira-changelog-cache-'));
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  // @req REQ-003-FR-006
  it('returns cached changelog without second upstream call within TTL', async () => {
    getIssueChangelogMock.mockResolvedValue(sampleIssue('PROJ-1', '2026-06-01T00:00:00.000Z'));

    await getCachedIssueChangelog('PROJ-1');
    await getCachedIssueChangelog('PROJ-1');

    expect(getIssueChangelogMock).toHaveBeenCalledTimes(1);
  });

  // @req REQ-003-FR-009
  it('write-once for closed calendar month — second fetch does not call upstream', async () => {
    getIssueChangelogMock.mockResolvedValue(sampleIssue('PROJ-2', '2020-03-01T00:00:00.000Z'));

    await getCachedIssueChangelog('PROJ-2');
    await getCachedIssueChangelog('PROJ-2');

    expect(getIssueChangelogMock).toHaveBeenCalledTimes(1);
  });

  // @req REQ-003-FR-008
  it('returns null when upstream changelog fetch fails', async () => {
    getIssueChangelogMock.mockResolvedValue(null);
    const result = await getCachedIssueChangelog('PROJ-404');
    expect(result).toBeNull();
  });
});
