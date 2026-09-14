import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  jiraKeysFromPrTitles,
  prewarmChangelogCacheForMetric,
} from '../../jobs/metricsSync.js';

const getCachedIssueChangelogMock = vi.fn();

vi.mock('../../databaselayer/cache/jiraChangelogCache.js', () => ({
  getCachedIssueChangelog: (...args: unknown[]) => getCachedIssueChangelogMock(...args),
}));

vi.mock('../../backend/config/env.js', () => ({
  getConfig: vi.fn(() => ({ specMetricsEnabled: true })),
}));

describe('sync changelog pre-warm', () => {
  beforeEach(() => {
    getCachedIssueChangelogMock.mockReset();
    getCachedIssueChangelogMock.mockResolvedValue([]);
  });

  // @req REQ-003-FR-007
  it('prewarmChangelogCacheForMetric calls getCachedIssueChangelog for Jira keys in PR titles', async () => {
    await prewarmChangelogCacheForMetric({
      prs: [
        { title: 'PROJ-1: add feature' },
        { title: 'Fix PROJ-2 regression' },
        { title: 'no ticket here' },
      ],
    });
    expect(getCachedIssueChangelogMock).toHaveBeenCalledTimes(2);
    expect(getCachedIssueChangelogMock).toHaveBeenCalledWith('PROJ-1');
    expect(getCachedIssueChangelogMock).toHaveBeenCalledWith('PROJ-2');
  });

  // @req REQ-003-FR-007
  it('jiraKeysFromPrTitles extracts unique keys from PR titles', () => {
    expect(
      jiraKeysFromPrTitles([
        { title: 'PROJ-1 foo' },
        { title: 'PROJ-1 duplicate' },
        { title: 'PROJ-2 bar' },
      ]).sort(),
    ).toEqual(['PROJ-1', 'PROJ-2']);
  });
});
